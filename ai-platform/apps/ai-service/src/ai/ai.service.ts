import {
  AgentBudget,
  AgentEvent,
  AiStatusStage,
  ChatMessage,
  LoggerService,
} from '@ai-platform/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { ConversationService } from '../conversation/conversation.service';
import { SearchService, SimilaritySearchResult } from '../search/search.service';
import { AiProviderFactory } from './providers/ai-provider.factory';
import { QueryRouterService } from './query-router.service';
import { TimeoutExceededError } from './safeguards/errors';
import { IterationCap } from './safeguards/iteration-cap';
import { KillSwitch } from './safeguards/kill-switch';
import { Timeout } from './safeguards/timeout';
import { TokenBudget } from './safeguards/token-budget';
import { createRagSearchTool } from './tools/rag-search.tool';
import { TAG_QUERY_TOOL_NAME } from './tools/tag-query.tool';
import { ToolRegistry } from './tools/tool-registry';

/**
 * Default safeguard limits for the unified chat flow. Applied whenever the
 * request omits the corresponding limit so plain questions run within sensible
 * bounds and behave exactly as before the tool-use loop unification.
 */
const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_TOKEN_BUDGET = 100_000;
const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * Hard cap on tokens the planner may generate per planning turn. The planner
 * emits a single `TOOL …` or `FINAL: …` line and does not need deep reasoning;
 * without this bound a reasoning model can spin indefinitely on stale history.
 * The run's wall-clock timeout and stream stall-timer remain the outer backstop.
 *
 * NOTE: reasoning models (e.g. qwen3 MLX builds) ignore `enable_thinking:false`
 * and spend tokens on a hidden reasoning channel before emitting visible
 * `content`. Raising this cap only buys the model more room to reason and makes
 * each planning turn slower (on a large agent prompt it can exceed the run
 * timeout), while a cap too small truncates the reasoning and yields an empty
 * answer. There is no good value for a slow reasoning model here — the real fix
 * is to serve a non-reasoning chat model (see LMSTUDIO_CHAT_MODEL). The cap is
 * kept tight for fast termination; an empty answer is handled downstream by
 * {@link EMPTY_FINAL_ANSWER_FALLBACK} so the client still gets a prompt reply.
 */
const PLANNER_MAX_TOKENS = 512;

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
 * Streamed/persisted in place of an empty final answer so a misbehaving model
 * (e.g. one that returns only a stripped reasoning block) never leaves the
 * client hanging on a perpetual "thinking" bubble.
 */
const EMPTY_FINAL_ANSWER_FALLBACK =
  'The model did not produce a usable answer. Please rephrase your question and try again.';

/**
 * Matches a `TOOL <name>: <input>` line, capturing the tool name and its input.
 * The name is a contiguous run of non-whitespace/non-colon characters; the input
 * is everything after the first colon. Anchored to the marker prefix only.
 */
const TOOL_DECISION_PATTERN = new RegExp(`${TOOL_MARKER}\\s+([^\\s:]+)\\s*:\\s*([\\s\\S]*)`);

type AiRequestPayload = {
  message: string;
  conversationId?: string;
  // Owner of the request, forwarded from the AI_REQUEST boundary. Used to
  // create a conversation on-the-fly in the no-conversationId lane so the user
  // turn can be durably persisted before generation begins (TASK-004).
  userId?: string;
  maxIterations: number;
  tokenBudget: number;
  timeoutMs: number;
};

type ProcessMessageOptions = {
  // Stable run identity minted once at the AI_REQUEST boundary and threaded
  // into every streaming lane so each lane's persistAssistantMessage shares the
  // same runId. Optional for back-compat callers; falls back to a freshly minted
  // id when absent.
  runId?: string;
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
  /** Token cap applied to each planner LLM call in the agent loop. */
  static readonly PLANNER_MAX_TOKENS = PLANNER_MAX_TOKENS;

  static readonly CAPABILITY_VAULT_PREFIX = 'docs/obsidian-vault/project/';

  /**
   * Document path prefix for API / technical documentation retrieval.
   * Scoped to `docs/obsidian-vault/codebase/` — the vault folder that holds
   * architecture, stack, conventions, and integration docs (analogous to the
   * capability prefix under `project/`).
   */
  static readonly TECHNICAL_DOCS_PREFIX = 'docs/obsidian-vault/codebase/';

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
    private readonly toolRegistry: ToolRegistry,
    private readonly queryRouter: QueryRouterService,
  ) {}

  processMessage(request: unknown, options?: ProcessMessageOptions): Observable<string> {
    const payload = this.parseRequest(request);
    const emitStatus = (stage: AiStatusStage, message: string) =>
      options?.onStatus?.(stage, message);

    // Reuse the runId minted at the AI_REQUEST boundary so every lane shares one
    // run identity; mint a fallback only for callers that omit it.
    const runId = options?.runId ?? randomUUID();

    emitStatus('init', 'Preparing request...');
    this.logger.log(
      `Process message: conversationId=${payload.conversationId}, length=${payload.message.length}`,
      'AiService',
    );

    // Route each query into the cheapest correct lane (meta / structured /
    // technical / complex). Structured answers with zero LLM calls; technical
    // scopes RAG to API docs; complex runs the bounded tool-use loop.
    return from(this.queryRouter.classify(payload.message)).pipe(
      switchMap((lane) => {
        switch (lane) {
          case 'meta':
            return from(this.answerCapabilityQuery(payload, runId, emitStatus)).pipe(
              switchMap((obs) => obs),
            );
          case 'structured':
            return this.runStructuredLane(payload, runId, emitStatus);
          case 'technical':
            return from(this.answerTechnicalQuery(payload, runId, emitStatus)).pipe(
              switchMap((obs) => obs),
            );
          case 'complex':
          default:
            return this.runChatFlow(payload, runId, emitStatus, options?.onAgentEvent);
        }
      }),
    );
  }

  /**
   * Structured lane: resolve tag list/count queries via the direct DB-backed
   * {@link TAG_QUERY_TOOL_NAME} tool with zero LLM invocations.
   */
  private runStructuredLane(
    payload: AiRequestPayload,
    runId: string,
    emitStatus: (stage: AiStatusStage, message: string) => void,
  ): Observable<string> {
    const subject = new BehaviorSubject<string>('');

    void (async () => {
      try {
        const tool = this.toolRegistry.get(TAG_QUERY_TOOL_NAME);
        if (!tool) {
          subject.error(
            new Error(`Structured lane: tool "${TAG_QUERY_TOOL_NAME}" is not registered`),
          );
          return;
        }

        if (payload.conversationId) {
          emitStatus('save_message', 'Saving user message...');
          await this.conversationService.saveMessage({
            conversationId: payload.conversationId,
            role: 'user',
            content: payload.message,
            runId,
          });
        }

        const observation = await tool.run(payload.message, {
          conversationId: payload.conversationId,
        });

        subject.next(observation);

        if (payload.conversationId) {
          emitStatus('save_response', 'Saving assistant response...');
          await this.persistAssistantMessage(payload.conversationId, runId, observation);
        }

        subject.complete();
      } catch (err: unknown) {
        subject.error(err);
      }
    })();

    return subject.asObservable();
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
    runId: string,
    emitStatus: (stage: AiStatusStage, message: string) => void,
    onAgentEvent?: (event: AgentEvent) => void,
  ): Observable<string> {
    const provider = this.factory.getProvider();

    // runId is minted once at the AI_REQUEST boundary and threaded in. It
    // identifies this run so its registry entry is removed on settle without
    // disturbing a concurrent run that shares the same conversationId.

    // Per-run safeguards. Checked outside the loop body so a runaway loop is
    // structurally impossible.
    const iterationCap = new IterationCap(payload.maxIterations);
    const timeout = new Timeout(payload.timeoutMs);
    const tokenBudget = new TokenBudget(payload.tokenBudget);

    const subject = new BehaviorSubject<string>('');

    // Resolve the conversation and durably persist the user turn before any
    // generation begins, then run the loop. The conversationId may be minted
    // here for the no-conversationId lane (TASK-004), so the kill-switch
    // registration and the loop both bind to the resolved id rather than the
    // incoming (possibly absent) payload value.
    void (async () => {
      let resolvedConversationId: string | undefined;
      try {
        resolvedConversationId = await this.ensurePersistedUserTurn(payload, runId, emitStatus);
      } catch (err: unknown) {
        subject.error(err);
        return;
      }

      const killSwitch = resolvedConversationId
        ? this.registerKillSwitch(resolvedConversationId, runId)
        : new KillSwitch();

      // Run the loop against the resolved conversationId so history load and
      // assistant persistence use the durable conversation, and the user turn
      // is not re-persisted (it was already written above).
      const loopPayload: AiRequestPayload = {
        ...payload,
        conversationId: resolvedConversationId,
      };

      await this.executeAgentLoop(
        provider,
        loopPayload,
        runId,
        emitStatus,
        onAgentEvent,
        { iterationCap, timeout, tokenBudget, killSwitch },
        subject,
      )
        .catch((err: unknown) => {
          subject.error(err);
        })
        .finally(() => {
          if (resolvedConversationId) {
            this.releaseKillSwitch(resolvedConversationId, runId);
          }
        });
    })();

    return subject.asObservable();
  }

  /**
   * Durably persist the user turn before generation begins and return the
   * conversationId the run should use.
   *
   * Closes the no-`conversationId` gap (TASK-004 / SPEC US-03): when the request
   * carries no `conversationId` but does carry a `userId`, a conversation is
   * created up-front so the user turn can be written with the run's `runId`. A
   * `Message` row requires a `conversationId` foreign key, so creating the
   * conversation first is what makes the durable user-turn write possible at
   * all. The write goes through the idempotent {@link ConversationService.saveMessage}
   * (TASK-003), so a redelivered run re-uses the same `runId` without
   * duplicating the turn.
   *
   * Returns `undefined` only when neither a `conversationId` nor a `userId` is
   * available (e.g. legacy test callers); in that degenerate case there is no
   * conversation to attach the turn to and the run proceeds without persistence,
   * exactly as before.
   */
  private async ensurePersistedUserTurn(
    payload: AiRequestPayload,
    runId: string,
    emitStatus: (stage: AiStatusStage, message: string) => void,
  ): Promise<string | undefined> {
    let conversationId = payload.conversationId;

    if (!conversationId) {
      if (!payload.userId) {
        // No conversation and no owner to create one for: nothing durable can
        // be written. Proceed without persistence (back-compat).
        return undefined;
      }
      conversationId = await this.conversationService.createConversation(payload.userId);
      this.logger.log(
        `Created conversation for no-conversationId chat: conversationId=${conversationId}, runId=${runId}`,
        'AiService',
      );
    }

    emitStatus('save_message', 'Saving user message...');
    await this.conversationService.saveMessage({
      conversationId,
      role: 'user',
      content: payload.message,
      runId,
    });

    return conversationId;
  }

  /**
   * Drive the reason→act loop to completion. Resolves once the final answer has
   * been streamed and the run settled; rejects with a typed safeguard error (or
   * provider error) so the caller surfaces an `error` event.
   */
  private async executeAgentLoop(
    provider: ReturnType<AiProviderFactory['getProvider']>,
    payload: AiRequestPayload,
    runId: string,
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
      // The user turn is persisted before the loop starts (see
      // runChatFlow -> ensurePersistedUserTurn), so the loaded history already
      // includes it. Slice it off the tail so it is not duplicated when the
      // current message is pushed below.
      const history = await this.conversationService.loadHistory(payload.conversationId);
      const withoutCurrentTurn =
        history.length > 0 &&
        history[history.length - 1].role === 'user' &&
        history[history.length - 1].content === payload.message
          ? history.slice(0, -1)
          : history;
      for (const msg of withoutCurrentTurn) {
        messages.push(msg);
      }
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
        // Guard against an empty/whitespace answer. A reasoning model can emit
        // only a stripped <think> block and no usable FINAL text, which would
        // otherwise stream nothing and leave the client stuck on a perpetual
        // "thinking" bubble. Substitute a fixed notice so the run always ends
        // with visible terminal text.
        const finalAnswer =
          decision.answer.trim().length > 0 ? decision.answer : EMPTY_FINAL_ANSWER_FALLBACK;

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
          subject.next(finalAnswer);
        }

        if (payload.conversationId) {
          emitStatus('save_response', 'Saving assistant response...');
          await this.persistAssistantMessage(payload.conversationId, runId, finalAnswer);
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

      const subscription = provider
        .chat(messages, {
          maxTokens: PLANNER_MAX_TOKENS,
          disableThinking: true,
        })
        .subscribe({
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

  /**
   * Technical lane: scoped RAG over API/technical docs, then a single LLM answer.
   * Uses a prefixed {@link createRagSearchTool} instance so retrieval never
   * searches the whole index.
   */
  private async answerTechnicalQuery(
    payload: AiRequestPayload,
    runId: string,
    emitStatus: (stage: AiStatusStage, message: string) => void,
  ): Promise<Observable<string>> {
    const provider = this.factory.getProvider();
    const technicalRag = createRagSearchTool(this.searchService, AiService.TECHNICAL_DOCS_PREFIX);

    emitStatus('rag_search', 'Searching technical documentation...');
    const context = await technicalRag.run(payload.message, {
      conversationId: payload.conversationId,
    });

    this.logger.log(
      `Technical query context: prefix=${AiService.TECHNICAL_DOCS_PREFIX}, contextLen=${context.length}`,
      'AiService',
    );
    emitStatus(
      'rag_found',
      context.length > 0 ? 'Found technical documentation context' : 'No relevant context found',
    );

    const systemPrompt =
      context.length > 0
        ? `Context (technical documentation — single source of facts):\n${context}\n\nResponse rules:\n- Use only wording from context above;\n- Respond literally from it, no paraphrasing or extra explanations;\n- Do not add information not in context.\n- If context has no answer — state it explicitly.`
        : `You are the platform's AI assistant. The user asked a technical/API question but no matching documentation was found in the technical docs index. Inform them clearly that the relevant technical information was not found.`;

    emitStatus('prompt_build', 'Preparing prompt...');

    return this.buildAndStream(
      provider,
      payload.message,
      systemPrompt,
      payload.conversationId,
      runId,
      emitStatus,
    );
  }

  private async answerCapabilityQuery(
    payload: AiRequestPayload,
    runId: string,
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
      runId,
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
    runId: string,
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
        runId,
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
        void this.persistAssistantMessage(conversationId, runId, collected)
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

  /**
   * Persist the assistant turn for a run. `runId` is the stable id minted once
   * at the AI_REQUEST boundary and threaded through every lane, so the same run
   * identity reaches this method regardless of which lane produced the answer.
   * It is forwarded to {@link ConversationService.saveMessage}, which upserts on
   * `runId`, making the write idempotent under Kafka redelivery (TASK-003).
   */
  private async persistAssistantMessage(
    conversationId: string | undefined,
    runId: string,
    content: string,
  ): Promise<void> {
    if (!conversationId) return;
    await this.conversationService.saveMessage({
      conversationId,
      role: 'assistant',
      content,
      runId,
    });
    this.logger.log(
      `Saved assistant message: conversationId=${conversationId}, runId=${runId}, len=${content.length}`,
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
      userId: typeof r.userId === 'string' ? r.userId : undefined,
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
