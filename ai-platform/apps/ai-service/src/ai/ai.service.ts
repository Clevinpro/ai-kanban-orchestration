import {
  AgentBudget,
  AgentEvent,
  AiStatusStage,
  ChatMessage,
  LoggerService,
} from '@ai-platform/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';
import { ConversationService } from '../conversation/conversation.service';
import { SearchService, SimilaritySearchResult } from '../search/search.service';
import { CapabilityDetectorService } from './capability-detector.service';
import { AiProviderFactory } from './providers/ai-provider.factory';
import { IterationCap } from './safeguards/iteration-cap';
import { KillSwitch } from './safeguards/kill-switch';
import { Timeout } from './safeguards/timeout';
import { TokenBudget } from './safeguards/token-budget';
import { ToolRegistry } from './tools/tool-registry';
import { TimeoutExceededError } from './safeguards/errors';

/**
 * Default safeguard limits for the unified chat flow. Applied whenever the
 * request omits the corresponding limit so plain questions run within sensible
 * bounds and behave exactly as before the tool-use loop unification.
 */
const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_TOKEN_BUDGET = 100_000;
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Sentinel markers the planner must use so the loop can deterministically
 * decide between dispatching a registered tool and emitting the final answer.
 *
 * - `TOOL <name>: <input>` — dispatch the registered tool `<name>` with `<input>`.
 * - `FINAL: <answer>` — terminate the loop; `<answer>` is streamed to the user.
 */
const TOOL_MARKER = 'TOOL';
const FINAL_MARKER = 'FINAL:';

/**
 * Matches a `TOOL <name>: <input>` line, capturing the tool name and its input.
 * The name is a contiguous run of non-whitespace/non-colon characters; the input
 * is everything after the first colon. Anchored to the marker prefix only.
 */
const TOOL_DECISION_PATTERN = new RegExp(`${TOOL_MARKER}\\s+([^\\s:]+)\\s*:\\s*([\\s\\S]*)`);

type AiRequestPayload = {
  message: string;
  conversationId?: string;
  maxIterations: number;
  tokenBudget: number;
  timeoutMs: number;
};

type ProcessMessageOptions = {
  onStatus?: (stage: AiStatusStage, message: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
};

/** A registered kill switch owned by a single agent run. */
type KillSwitchEntry = {
  runId: string;
  killSwitch: KillSwitch;
};

/**
 * A parsed planner decision: either dispatch a named tool with an input, or
 * emit the final answer to the user.
 */
type ParsedDecision =
  | { kind: 'tool'; tool: string; input: string }
  | { kind: 'final'; answer: string };

/**
 * A parsed planner decision plus the full planning text it was derived from.
 * `planText` is retained for token accounting and transcript bookkeeping.
 */
type AgentDecision = ParsedDecision & {
  planText: string;
};

@Injectable()
export class AiService {
  private static readonly CAPABILITY_VAULT_PREFIX = 'docs/obsidian-vault/project/';

  /**
   * Active per-run kill switches keyed by `conversationId`. The `AI_CANCEL`
   * consumer (TASK-010) looks up the active run here and trips it.
   *
   * The value is a stack of entries so concurrent runs that share a
   * `conversationId` do not clobber each other: each run registers its own
   * `{ runId, killSwitch }` and only removes the entry it owns on settle.
   * {@link getKillSwitch} resolves the most recently registered (active) run.
   */
  private readonly killSwitches = new Map<string, KillSwitchEntry[]>();

  constructor(
    private readonly searchService: SearchService,
    private readonly factory: AiProviderFactory,
    private readonly conversationService: ConversationService,
    private readonly logger: LoggerService,
    private readonly capabilityDetector: CapabilityDetectorService,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  processMessage(request: unknown, options?: ProcessMessageOptions): Observable<string> {
    const payload = this.parseRequest(request);
    const emitStatus = (stage: AiStatusStage, message: string) =>
      options?.onStatus?.(stage, message);

    emitStatus('init', 'Preparing request...');
    this.logger.log(
      `Process message: conversationId=${payload.conversationId}, length=${payload.message.length}`,
      'AiService',
    );

    // Unified chat path: there is no chat-vs-agent mode duality. The capability
    // detector stays as an optional pre-step that short-circuits to the
    // capability answer; every other request runs the single bounded tool-use
    // loop (`runChatFlow`), which may answer directly or call the RAG tool.
    return from(this.capabilityDetector.isCapabilityQuery(payload.message)).pipe(
      switchMap((isCapability) => {
        if (isCapability) {
          return from(this.answerCapabilityQuery(payload, emitStatus)).pipe(
            switchMap((obs) => obs),
          );
        }
        return this.runChatFlow(payload, emitStatus, options?.onAgentEvent);
      }),
    );
  }

  /**
   * Register a fresh kill switch for a run so an external `AI_CANCEL` consumer
   * (TASK-010) can trip the active agent run. Exposed as the registry seam: the
   * consumer resolves the switch via {@link getKillSwitch} keyed by
   * `conversationId` and calls `kill()`.
   *
   * Each call creates a distinct switch identified by `runId`. Concurrent runs
   * sharing a `conversationId` are stacked, so one run's cleanup never strands
   * another's switch (see {@link releaseKillSwitch}).
   */
  private registerKillSwitch(conversationId: string, runId: string): KillSwitch {
    const killSwitch = new KillSwitch();
    const entries = this.killSwitches.get(conversationId);
    if (entries) {
      entries.push({ runId, killSwitch });
    } else {
      this.killSwitches.set(conversationId, [{ runId, killSwitch }]);
    }
    return killSwitch;
  }

  /**
   * Remove the registry entry a run owns once it settles. Only the entry whose
   * `runId` matches is removed, so a concurrent run sharing the same
   * `conversationId` keeps its own switch tripping-capable.
   */
  private releaseKillSwitch(conversationId: string, runId: string): void {
    const entries = this.killSwitches.get(conversationId);
    if (!entries) {
      return;
    }
    const remaining = entries.filter((entry) => entry.runId !== runId);
    if (remaining.length === 0) {
      this.killSwitches.delete(conversationId);
    } else {
      this.killSwitches.set(conversationId, remaining);
    }
  }

  /**
   * Resolve the active kill switch for a conversation, if any. Returns the most
   * recently registered run's switch. Used by the `AI_CANCEL` consumer to trip a
   * running agent loop.
   */
  getKillSwitch(conversationId: string): KillSwitch | undefined {
    const entries = this.killSwitches.get(conversationId);
    if (!entries || entries.length === 0) {
      return undefined;
    }
    return entries[entries.length - 1].killSwitch;
  }

  /**
   * Unified chat entry point. Runs a bounded reason→act loop: the provider
   * plans, optionally calls a registered tool (e.g. the RAG similarity search),
   * observations are fed back, and the loop repeats until the model emits a
   * final answer or a safeguard fires. There is no separate agent mode — every
   * non-capability chat request flows through this loop, and the model is free
   * to answer directly (zero tool calls) or call a tool.
   *
   * Final-answer tokens stream as the returned Observable; typed `AgentEvent`s
   * stream via `onAgentEvent`. All four safeguards are constructed per run and
   * checked outside the loop body; any safeguard breach aborts the run and
   * surfaces as the Observable's `error`.
   */
  private runChatFlow(
    payload: AiRequestPayload,
    emitStatus: (stage: AiStatusStage, message: string) => void,
    onAgentEvent?: (event: AgentEvent) => void,
  ): Observable<string> {
    const provider = this.factory.getProvider();

    // Identifies this run so its registry entry is removed on settle without
    // disturbing a concurrent run that shares the same conversationId.
    const runId = randomUUID();

    // Per-run safeguards. Checked outside the loop body so a runaway loop is
    // structurally impossible.
    const iterationCap = new IterationCap(payload.maxIterations);
    const timeout = new Timeout(payload.timeoutMs);
    const tokenBudget = new TokenBudget(payload.tokenBudget);
    const killSwitch = payload.conversationId
      ? this.registerKillSwitch(payload.conversationId, runId)
      : new KillSwitch();

    const subject = new BehaviorSubject<string>('');

    void this.executeAgentLoop(
      provider,
      payload,
      emitStatus,
      onAgentEvent,
      { iterationCap, timeout, tokenBudget, killSwitch },
      subject,
    )
      .catch((err: unknown) => {
        subject.error(err);
      })
      .finally(() => {
        if (payload.conversationId) {
          this.releaseKillSwitch(payload.conversationId, runId);
        }
      });

    return subject.asObservable();
  }

  /**
   * Drive the reason→act loop to completion. Resolves once the final answer has
   * been streamed and the run settled; rejects with a typed safeguard error (or
   * provider error) so the caller surfaces an `error` event.
   */
  private async executeAgentLoop(
    provider: ReturnType<AiProviderFactory['getProvider']>,
    payload: AiRequestPayload,
    emitStatus: (stage: AiStatusStage, message: string) => void,
    onAgentEvent: ((event: AgentEvent) => void) | undefined,
    safeguards: {
      iterationCap: IterationCap;
      timeout: Timeout;
      tokenBudget: TokenBudget;
      killSwitch: KillSwitch;
    },
    subject: BehaviorSubject<string>,
  ): Promise<void> {
    const { iterationCap, timeout, tokenBudget, killSwitch } = safeguards;

    emitStatus('llm_start', 'Starting agent run...');

    // Conversation transcript shared across planning steps. Observations from
    // the search tool are appended back as `user` turns so the next plan sees
    // them.
    const messages: ChatMessage[] = [{ role: 'system', content: this.buildAgentSystemPrompt() }];

    if (payload.conversationId) {
      const history = await this.conversationService.loadHistory(payload.conversationId);
      for (const msg of history) {
        messages.push(msg);
      }
      await this.conversationService.saveMessage({
        conversationId: payload.conversationId,
        role: 'user',
        content: payload.message,
      });
    }

    messages.push({ role: 'user', content: payload.message });

    // Unbounded loop is safe: every iteration calls the safeguards, which throw
    // once any limit is breached, terminating the loop.
    for (;;) {
      // Safeguard order per AC: cap → timeout → kill switch.
      const iteration = iterationCap.increment();
      timeout.check();
      killSwitch.checkpoint();

      onAgentEvent?.({
        iteration,
        status: 'planning',
        budget: this.snapshotBudget(payload, iterationCap, tokenBudget, timeout),
      });

      // Stream the planning response. Marker detection happens on a buffered
      // prefix; once a FINAL answer is recognized its tokens are forwarded
      // incrementally to the subject so the final answer streams (AC6) rather
      // than arriving as a single chunk. The full text is also accumulated to
      // account against the token budget and to parse a tool-dispatch line.
      let finalStreamingStarted = false;
      const decision = await this.streamAgentDecision(
        provider,
        messages,
        timeout,
        (answerToken) => {
          if (!finalStreamingStarted) {
            finalStreamingStarted = true;
            onAgentEvent?.({
              iteration,
              status: 'final',
              budget: this.snapshotBudget(payload, iterationCap, tokenBudget, timeout),
            });
            emitStatus('llm_generating', 'Model is generating a response...');
          }
          // Forward each final-answer token as it arrives.
          subject.next(answerToken);
        },
      );

      tokenBudget.track({ text: decision.planText });

      if (decision.kind === 'final') {
        // Cover the edge case where the answer was empty or arrived before the
        // first forwarded token (e.g. no-marker fallback): ensure the final
        // event/status are still emitted.
        if (!finalStreamingStarted) {
          onAgentEvent?.({
            iteration,
            status: 'final',
            budget: this.snapshotBudget(payload, iterationCap, tokenBudget, timeout),
          });
          emitStatus('llm_generating', 'Model is generating a response...');
          subject.next(decision.answer);
        }

        if (payload.conversationId) {
          emitStatus('save_response', 'Saving assistant response...');
          await this.persistAssistantMessage(payload.conversationId, decision.answer);
        }

        subject.complete();
        return;
      }

      // Tool branch: resolve and dispatch the planned tool through the registry.
      // An unknown tool name is fed back as an error observation so the planner
      // self-corrects on the next turn rather than crashing the run.
      const tool = this.toolRegistry.get(decision.tool);

      onAgentEvent?.({
        iteration,
        status: 'tool_call',
        tool: decision.tool,
        input: decision.input,
        budget: this.snapshotBudget(payload, iterationCap, tokenBudget, timeout),
      });
      emitStatus('rag_search', 'Searching relevant context...');

      let observation: string;
      if (!tool) {
        observation =
          `Error: unknown tool "${decision.tool}". Available tools:\n` +
          this.toolRegistry.describe();
        this.logger.warn(
          `Planner requested unknown tool "${decision.tool}"; feeding error back as observation`,
          'AiService',
        );
      } else {
        observation = await tool.run(decision.input, { conversationId: payload.conversationId });
      }
      tokenBudget.track({ text: observation });

      onAgentEvent?.({
        iteration,
        status: 'tool_result',
        tool: decision.tool,
        input: decision.input,
        budget: this.snapshotBudget(payload, iterationCap, tokenBudget, timeout),
      });

      // Record the planner's tool request and the observation so the next
      // planning step reasons over fresh evidence.
      messages.push({ role: 'assistant', content: decision.planText });
      messages.push({
        role: 'user',
        content: `Observation from ${TOOL_MARKER} ${decision.tool}: "${decision.input}":\n${observation}`,
      });
    }
  }

  /**
   * System prompt for the agent planner. Constrains the model to a deterministic
   * decision protocol the loop can parse: dispatch one of the registered tools
   * (`TOOL <name>: <input>`) or emit a final answer (`FINAL: <answer>`). The
   * available tools are enumerated from the {@link ToolRegistry} so registered
   * tools are self-describing and no tool name is hardcoded here.
   */
  private buildAgentSystemPrompt(): string {
    return [
      'You are an autonomous research agent answering questions from a knowledge base.',
      'You may call the following tools:',
      this.toolRegistry.describe(),
      'On every turn respond with exactly ONE line, choosing one of:',
      `- "${TOOL_MARKER} <name>: <input>" to call the tool <name> with <input>.`,
      `- "${FINAL_MARKER} <answer>" to give your final answer to the user.`,
      'Use a tool to gather evidence before answering. When you have enough',
      `evidence, respond with ${FINAL_MARKER} and the complete answer for the user.`,
    ].join('\n');
  }

  /**
   * Parse a planning response into a structured decision. Prefers an explicit
   * `FINAL:` marker; falls back to a `TOOL <name>: <input>` dispatch. When no
   * marker is present, or the tool dispatch is malformed, the text is treated as
   * the final answer so the loop always terminates cleanly.
   */
  private parseAgentDecision(planText: string): ParsedDecision {
    const text = planText.trim();

    const finalIdx = text.indexOf(FINAL_MARKER);
    if (finalIdx !== -1) {
      return { kind: 'final', answer: text.slice(finalIdx + FINAL_MARKER.length).trim() };
    }

    const match = TOOL_DECISION_PATTERN.exec(text);
    if (match) {
      const tool = match[1].trim();
      const input = match[2].trim();
      if (tool && input) {
        return { kind: 'tool', tool, input };
      }
    }

    return { kind: 'final', answer: text };
  }

  /**
   * Stream a planning response from the provider and resolve it into a
   * structured decision.
   *
   * While streaming, marker detection runs on the accumulated prefix. As soon as
   * a `FINAL:` answer is recognized, each subsequent answer token is forwarded
   * via `onFinalToken` so the final answer streams to the user incrementally
   * (AC6) instead of arriving as one chunk. `TOOL <name>:` decisions are not
   * forwarded (the tool input is not user-facing). The full text is returned as
   * `planText` for token accounting and transcript bookkeeping; the decision is
   * reconciled with {@link parseAgentDecision} on completion so the deterministic
   * sentinel semantics stay identical to the non-streaming parse.
   */
  private streamAgentDecision(
    provider: ReturnType<AiProviderFactory['getProvider']>,
    messages: ChatMessage[],
    timeout: Timeout,
    onFinalToken: (token: string) => void,
  ): Promise<AgentDecision> {
    return new Promise<AgentDecision>((resolve, reject) => {
      let accumulated = '';
      // Once a FINAL marker is detected mid-stream, this tracks how many
      // characters of the post-marker answer have already been forwarded so each
      // chunk only emits its new suffix.
      let finalForwardedLen = -1;
      // Guards against double-settle when the stall timer and a late
      // complete/error race each other.
      let settled = false;
      let stallTimer: ReturnType<typeof setTimeout> | undefined;

      const finish = (settle: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        if (stallTimer) {
          clearTimeout(stallTimer);
        }
        settle();
      };

      const subscription = provider.chat(messages).subscribe({
        next: (chunk: string) => {
          accumulated += chunk;

          if (finalForwardedLen === -1) {
            const finalIdx = accumulated.indexOf(FINAL_MARKER);
            if (finalIdx !== -1) {
              // Begin incremental forwarding of the answer that follows the
              // marker (left-trimmed once, mirroring parseAgentDecision).
              finalForwardedLen = 0;
            }
          }

          if (finalForwardedLen !== -1) {
            const answerSoFar = this.extractFinalAnswer(accumulated);
            if (answerSoFar.length > finalForwardedLen) {
              onFinalToken(answerSoFar.slice(finalForwardedLen));
              finalForwardedLen = answerSoFar.length;
            }
          }
        },
        error: (err: unknown) => finish(() => reject(err)),
        complete: () =>
          finish(() => {
            const parsed = this.parseAgentDecision(accumulated);
            resolve({ ...parsed, planText: accumulated });
          }),
      });

      // Bound the in-flight stream by the run's remaining wall-clock budget. The
      // loop's between-iteration `timeout.check()` cannot fire while awaiting a
      // stalled provider stream (e.g. an LLM that ingested the prompt but never
      // emits a token), so without this an awaited stream could hang well past
      // the configured timeout. On expiry the subscription is torn down and the
      // run rejects with the standard timeout error.
      if (!settled) {
        stallTimer = setTimeout(() => {
          finish(() => {
            subscription.unsubscribe();
            reject(
              new TimeoutExceededError(
                'Timeout exceeded: provider stream did not complete within the run budget',
              ),
            );
          });
        }, timeout.remainingMs);
      }
    });
  }

  /**
   * Extract the final-answer text following the first `FINAL:` marker, left
   * trimmed so leading whitespace after the marker is not forwarded. Returns an
   * empty string when the marker is absent.
   */
  private extractFinalAnswer(text: string): string {
    const finalIdx = text.indexOf(FINAL_MARKER);
    if (finalIdx === -1) {
      return '';
    }
    return text.slice(finalIdx + FINAL_MARKER.length).replace(/^\s+/, '');
  }

  /**
   * Build a plain-JSON budget snapshot for an `AgentEvent`, combining live
   * safeguard counters with the run's configured maxima.
   */
  private snapshotBudget(
    payload: AiRequestPayload,
    iterationCap: IterationCap,
    tokenBudget: TokenBudget,
    timeout: Timeout,
  ): AgentBudget {
    return {
      iteration: iterationCap.current,
      tokensUsed: tokenBudget.tokensUsed,
      elapsedMs: timeout.elapsedMs,
      maxIterations: payload.maxIterations,
      tokenBudget: payload.tokenBudget,
      timeoutMs: payload.timeoutMs,
    };
  }

  private async answerCapabilityQuery(
    payload: AiRequestPayload,
    emitStatus: (stage: AiStatusStage, message: string) => void,
  ): Promise<Observable<string>> {
    const provider = this.factory.getProvider();

    emitStatus('rag_search', 'Searching relevant context...');
    const chunks = await this.searchService.similaritySearch(
      payload.message,
      6,
      AiService.CAPABILITY_VAULT_PREFIX,
    );

    this.logger.log(
      `Capability query chunks: count=${chunks.length}, prefix=${AiService.CAPABILITY_VAULT_PREFIX}`,
      'AiService',
    );
    emitStatus(
      'rag_found',
      chunks.length > 0 ? `Found ${chunks.length} context chunks` : 'No relevant context found',
    );

    const systemPrompt = await this.loadSystemPrompt(chunks);
    emitStatus('prompt_build', 'Preparing prompt...');

    return this.buildAndStream(
      provider,
      payload.message,
      systemPrompt,
      payload.conversationId,
      emitStatus,
    );
  }

  private async loadSystemPrompt(chunks: SimilaritySearchResult[]): Promise<string> {
    this.logger.log(`Loading system prompt: chunksCount=${chunks.length}`, 'AiService');
    if (chunks.length === 0) {
      return `You are the platform’s AI assistant. Respond clearly and helpfully. If the question concerns specific platform data or documents, inform the user that the relevant information was not found in the knowledge base.`;
    }
    const contextText = this.searchService.formatContext(chunks);
    return `Context (single source of facts):
      ${contextText}

      Response rules:
      - Use only wording from context above;
      - Respond literally from it, no paraphrasing or extra explanations;
      - Do not add information not in context.
      - Response format: tag number in docs, full text from docs.
      - If context has no answer — state it explicitly.`;
  }

  private async buildAndStream(
    provider: ReturnType<AiProviderFactory['getProvider']>,
    userMessage: string,
    systemPrompt: string | undefined,
    conversationId: string | undefined,
    emitStatus: (stage: AiStatusStage, message: string) => void,
  ): Promise<Observable<string>> {
    const messages: ChatMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    if (conversationId) {
      emitStatus('history_load', 'Loading conversation history...');
      const history = await this.conversationService.loadHistory(conversationId);
      for (const msg of history) {
        messages.push(msg);
      }
    }

    messages.push({ role: 'user', content: userMessage });

    if (conversationId) {
      emitStatus('save_message', 'Saving user message...');
      await this.conversationService.saveMessage({
        conversationId,
        role: 'user',
        content: userMessage,
      });
    }

    this.logger.log(
      `Sending to LLM: system=${systemPrompt ? 'yes' : 'no'}, history=${messages.length - 1}, userMsgLen=${userMessage.length}`,
      'AiService',
    );

    emitStatus('llm_start', 'Sending request to the model...');
    const stream = provider.chat(messages);

    const subject = new BehaviorSubject<string>('');
    let collected = '';
    let firstChunkReceived = false;

    const subscription = stream.subscribe({
      next: (chunk) => {
        if (!firstChunkReceived) {
          firstChunkReceived = true;
          emitStatus('llm_generating', 'Model is generating a response...');
        }
        collected += chunk;
        subject.next(chunk);
      },
      complete: () => {
        emitStatus('save_response', 'Saving assistant response...');
        void this.persistAssistantMessage(conversationId, collected)
          .then(() => subject.complete())
          .catch((err: unknown) => subject.error(err));
      },
      error: (err) => {
        subject.error(err);
      },
    });

    const result = subject.asObservable().pipe(
      tap({
        unsubscribe: () => subscription.unsubscribe(),
      }),
    );

    return result;
  }

  private async persistAssistantMessage(
    conversationId: string | undefined,
    content: string,
  ): Promise<void> {
    if (!conversationId) return;
    await this.conversationService.saveMessage({
      conversationId,
      role: 'assistant',
      content,
    });
    this.logger.log(
      `Saved assistant message: conversationId=${conversationId}, len=${content.length}`,
      'AiService',
    );
  }

  private parseRequest(request: unknown): AiRequestPayload {
    if (!request || typeof request !== 'object') {
      this.logger.warn('Invalid AI request: not an object', 'AiService');
      throw new BadRequestException('Request message must be a non-empty string.');
    }

    const r = request as Record<string, unknown>;
    const raw =
      typeof r.message === 'string' ? r.message : typeof r.text === 'string' ? r.text : undefined;
    const message = typeof raw === 'string' ? raw.trim() : '';

    if (!message) {
      this.logger.warn('Invalid AI request: missing, empty, or non-string message', 'AiService');
      throw new BadRequestException('Request message must be a non-empty string.');
    }

    // `mode` is accepted but ignored: the unified tool-use flow runs the same
    // way regardless of an omitted / 'chat' / 'agent' value. We do not read or
    // throw on it — kept only for back-compat with already-deployed clients.

    return {
      message,
      conversationId: typeof r.conversationId === 'string' ? r.conversationId : undefined,
      maxIterations: this.clampPositiveInt(r.maxIterations, DEFAULT_MAX_ITERATIONS),
      tokenBudget: this.clampPositiveInt(r.tokenBudget, DEFAULT_TOKEN_BUDGET),
      timeoutMs: this.clampPositiveInt(r.timeoutMs, DEFAULT_TIMEOUT_MS),
    };
  }

  /**
   * Returns a positive integer from an unknown input, or the provided default
   * when the value is missing, non-numeric, non-finite, or not positive.
   */
  private clampPositiveInt(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return Math.floor(value);
  }
}
