import {
  AgentEventType,
  IAgentConfig,
  IAgentEvent,
  IBudgetState,
  IToolCall,
  LoggerService,
} from '@ai-platform/shared';
import { Injectable } from '@nestjs/common';
import { finalize, Observable, reduce, Subscription } from 'rxjs';
import { AiProviderFactory } from '../ai/providers/ai-provider.factory';
import { SearchService } from '../search/search.service';
import { IterationCap } from './safeguards/iteration-cap';
import { KillSwitch } from './safeguards/kill-switch';
import { Timeout } from './safeguards/timeout';
import { TokenBudget } from './safeguards/token-budget';

/**
 * Outcome of a single planning turn. Either the agent wants to call the search
 * tool, or it is ready to produce the final answer.
 */
type AgentPlan =
  | { kind: 'tool'; tokens: number; toolCall: IToolCall }
  | { kind: 'final'; tokens: number };

/** Rough token estimate from character count (~4 chars per token). */
const estimateTokens = (text: string): number => Math.max(1, Math.ceil(text.length / 4));

/**
 * Drives a bounded reason→act agent loop and surfaces it as a cold
 * `Observable<IAgentEvent>`.
 *
 * Each subscription runs an independent loop guarded by four pure safeguards
 * (kill-switch, timeout, iteration cap, token budget). The loop reuses the
 * existing provider (`ClaudeProvider.chat`) for planning/streaming and the
 * hybrid `SearchService` for the single `search` tool. Any thrown error is
 * caught and delivered as a terminal `AGENT_ERROR` event — the subscriber is
 * never errored out. Unsubscribing trips the kill-switch and aborts the
 * in-flight provider stream via the Observable teardown.
 */
@Injectable()
export class AgentRunnerService {
  constructor(
    private readonly providerFactory: AiProviderFactory,
    private readonly searchService: SearchService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Run a bounded agent loop for `task`. Returns a cold Observable: the loop
   * starts on subscribe and aborts on unsubscribe.
   */
  run(task: string, config: IAgentConfig): Observable<IAgentEvent> {
    return new Observable<IAgentEvent>((subscriber) => {
      const emit = <T>(type: AgentEventType, data: T): void => {
        subscriber.next({ type, data, timestamp: Date.now() });
      };

      const budget = new TokenBudget(config.tokenBudget);
      const cap = new IterationCap(config.maxIterations);
      const timeout = new Timeout(config.timeoutMs);
      const kill = new KillSwitch();

      // Tracks the in-flight provider subscription so teardown can abort the
      // active Claude stream immediately (not just at the next checkpoint).
      let activeSubscription: Subscription | null = null;
      const setActive = (sub: Subscription | null): void => {
        activeSubscription = sub;
      };

      void (async () => {
        try {
          emit(AgentEventType.AGENT_START, config);

          // Accumulated tool observations fed back into planning so the agent
          // can decide it has enough context (and so the final answer can use
          // what it retrieved). Without this the planner re-decides from the
          // bare task every turn and may loop until the iteration cap.
          const observations: string[] = [];

          let done = false;
          while (!done) {
            kill.checkpoint();
            timeout.check();
            cap.increment();
            emit(AgentEventType.STEP, { iteration: cap.current, status: 'planning' });

            // On the final permitted iteration, stop searching and answer now —
            // a happy run terminates with AGENT_DONE instead of hitting the cap.
            const lastIteration = cap.current >= config.maxIterations;
            const plan = await this.planNextAction(task, observations, lastIteration, setActive);
            budget.track(plan.tokens);
            emit(AgentEventType.BUDGET, {
              iteration: cap.current,
              tokensUsed: budget.getState().used,
              elapsedMs: timeout.elapsed,
            } satisfies IBudgetState);

            if (plan.kind === 'tool') {
              emit(AgentEventType.TOOL_CALL, plan.toolCall satisfies IToolCall);
              const query = String(plan.toolCall.input.query ?? task);
              const result = await this.searchService.similaritySearch(query);
              emit(AgentEventType.TOOL_RESULT, { tool: plan.toolCall.tool, result });
              observations.push(this.summarizeObservation(query, result));
            } else {
              for await (const token of this.streamFinal(task, observations, setActive)) {
                emit(AgentEventType.TOKEN, token);
              }
              done = true;
            }
          }

          emit(AgentEventType.AGENT_DONE, {});
          subscriber.complete();
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Agent run terminated: ${reason}`, 'AgentRunnerService');
          // Terminal event is always delivered; never error out the subscriber
          // so the client only ever sees typed events (AC-15).
          emit(AgentEventType.AGENT_ERROR, { reason });
          subscriber.complete();
        }
      })();

      // Teardown on unsubscribe (AC-16): trip the kill-switch so the loop bails
      // at the next checkpoint, and abort any in-flight provider stream now.
      return () => {
        kill.kill();
        activeSubscription?.unsubscribe();
        activeSubscription = null;
      };
    });
  }

  /**
   * Ask the provider whether to invoke the `search` tool or finalize. Returns a
   * structured plan plus an estimated token cost for the planning call.
   *
   * The provider is asked for a strict JSON decision; if the response cannot be
   * parsed the loop conservatively falls back to producing the final answer.
   */
  private async planNextAction(
    task: string,
    observations: string[],
    lastIteration: boolean,
    setActive: (sub: Subscription | null) => void,
  ): Promise<AgentPlan> {
    // No iterations left to act on a tool result — answer with what we have.
    if (lastIteration) {
      return { kind: 'final', tokens: 0 };
    }

    const provider = this.providerFactory.getProvider();
    const history = observations.length
      ? `\n\nObservations so far:\n${observations.join('\n')}\n\n` +
        'If the observations already let you answer, choose final.'
      : '';
    const prompt =
      'You are a planning agent. Decide the next action for the task below. ' +
      'Respond with a single JSON object and nothing else. ' +
      'To look up knowledge-base context use {"action":"search","query":"<search terms>"}. ' +
      'When you have enough information to answer use {"action":"final"}.\n\n' +
      `Task: ${task}${history}`;

    const text = await this.collect(provider.chat(prompt), setActive);
    const tokens = estimateTokens(prompt) + estimateTokens(text);
    const decision = this.parseDecision(text);

    if (decision.action === 'search') {
      return {
        kind: 'tool',
        tokens,
        toolCall: { tool: 'search', input: { query: decision.query } },
      };
    }

    return { kind: 'final', tokens };
  }

  /**
   * Stream the final answer token-by-token. Yields each provider chunk so the
   * caller can emit a `TOKEN` event per chunk.
   */
  private async *streamFinal(
    task: string,
    observations: string[],
    setActive: (sub: Subscription | null) => void,
  ): AsyncGenerator<string> {
    const provider = this.providerFactory.getProvider();
    const context = observations.length
      ? `\n\nUse this retrieved context:\n${observations.join('\n')}`
      : '';
    const prompt = `Provide the final answer to the task.${context}\n\nTask: ${task}`;

    for await (const token of this.toAsyncIterable(provider.chat(prompt), setActive)) {
      yield token;
    }
  }

  /**
   * Compress a search tool result into a short observation line for the
   * planner's history. Truncated so long results do not balloon the prompt.
   */
  private summarizeObservation(query: string, result: unknown): string {
    let text: string;
    try {
      text = JSON.stringify(result);
    } catch {
      text = String(result);
    }
    if (text.length > 800) {
      text = `${text.slice(0, 800)}…`;
    }
    return `Search "${query}" returned: ${text}`;
  }

  /**
   * Parse a provider planning response into a decision. Falls back to `final`
   * when the response is not valid JSON or omits a usable search query.
   */
  private parseDecision(text: string): { action: 'search'; query: string } | { action: 'final' } {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        return { action: 'final' };
      }

      const parsed = JSON.parse(match[0]) as { action?: string; query?: string };
      if (parsed.action === 'search' && parsed.query?.trim()) {
        return { action: 'search', query: parsed.query.trim() };
      }
    } catch {
      // Non-JSON or malformed response — treat as a final answer.
    }

    return { action: 'final' };
  }

  /**
   * Collect a provider stream into a single string, registering the active
   * subscription so teardown can abort it.
   */
  private collect(
    stream$: Observable<string>,
    setActive: (sub: Subscription | null) => void,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      // `finalize` runs on complete, error, AND unsubscribe. On teardown the
      // subscription is unsubscribed without next/error/complete, so this guards
      // against the promise hanging forever by rejecting it as aborted.
      const collected$ = stream$.pipe(
        reduce((acc, chunk) => acc + chunk, ''),
        finalize(() => {
          if (!settled) {
            settled = true;
            reject(new Error('Agent provider stream aborted'));
          }
        }),
      );

      const subscription = collected$.subscribe({
        next: (value) => {
          settled = true;
          resolve(value);
        },
        error: (error) => {
          settled = true;
          reject(error);
        },
        complete: () => {
          if (!settled) {
            settled = true;
            resolve('');
          }
        },
      });
      setActive(subscription);
    }).finally(() => setActive(null));
  }

  /**
   * Bridge an rxjs `Observable<string>` to an async iterable, registering the
   * active subscription for teardown. Backpressure is naive (an in-memory queue)
   * which is sufficient for short token streams.
   */
  private toAsyncIterable(
    stream$: Observable<string>,
    setActive: (sub: Subscription | null) => void,
  ): AsyncIterable<string> {
    const queue: string[] = [];
    let resolveNext: (() => void) | null = null;
    let finished = false;
    let failure: unknown = null;

    const wake = (): void => {
      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = null;
        resolve();
      }
    };

    const subscription = stream$.subscribe({
      next: (chunk) => {
        queue.push(chunk);
        wake();
      },
      error: (error) => {
        failure = error;
        finished = true;
        wake();
      },
      complete: () => {
        finished = true;
        wake();
      },
    });
    setActive(subscription);

    return {
      async *[Symbol.asyncIterator](): AsyncGenerator<string> {
        try {
          while (true) {
            if (queue.length > 0) {
              yield queue.shift() as string;
              continue;
            }
            if (failure) {
              throw failure;
            }
            if (finished) {
              return;
            }
            await new Promise<void>((resolve) => {
              resolveNext = resolve;
            });
          }
        } finally {
          subscription.unsubscribe();
          setActive(null);
        }
      },
    };
  }
}
