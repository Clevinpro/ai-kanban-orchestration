import { AgentEventType } from '@ai-platform/shared';
import type { IAgentConfig, IAgentEvent } from '@ai-platform/shared';
import { Observable, of } from 'rxjs';
import { AgentRunnerService } from './agent-runner.service';

// ---------------------------------------------------------------------------
// Minimal stubs for injected dependencies
// ---------------------------------------------------------------------------

/**
 * Distinguish the two prompt phases the runner drives through a single
 * `provider.chat(...)` entry point: planning vs. final-answer streaming.
 */
const isPlanningPrompt = (message: unknown): boolean =>
  typeof message === 'string' && message.includes('planning agent');

/**
 * Build a fake provider whose `chat` returns a canned planning decision and a
 * final-answer token stream. The planning response is non-JSON so the runner's
 * `parseDecision` falls back to `final`, making the loop deterministic and
 * single-iteration.
 */
function buildProvider(finalTokens: string[]): { chat: jest.Mock } {
  return {
    chat: jest.fn((message: unknown): Observable<string> => {
      if (isPlanningPrompt(message)) {
        // Non-JSON planning text → runner finalizes on this turn.
        return of('I am ready to answer.');
      }
      return of(...finalTokens);
    }),
  };
}

function buildProviderFactory(provider: { chat: jest.Mock }): {
  getProvider: jest.Mock;
} {
  return { getProvider: jest.fn().mockReturnValue(provider) };
}

const buildSearchService = (): { similaritySearch: jest.Mock } => ({
  similaritySearch: jest.fn().mockResolvedValue([]),
});

const buildLogger = () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() }) as never;

function buildRunner(
  provider: { chat: jest.Mock },
  searchService: { similaritySearch: jest.Mock } = buildSearchService(),
): AgentRunnerService {
  const factory = buildProviderFactory(provider);
  return new AgentRunnerService(factory as never, searchService as never, buildLogger());
}

const CONFIG: IAgentConfig = {
  maxIterations: 5,
  tokenBudget: 100_000,
  timeoutMs: 60_000,
};

/**
 * Subscribe to a run, collecting every emitted event and resolving once the
 * Observable completes or errors. `errored` proves whether `subscriber.error`
 * was ever called (it must not be — terminal failures are typed events).
 */
function collectRun(
  service: AgentRunnerService,
  task: string,
  config: IAgentConfig,
): Promise<{ events: IAgentEvent[]; errored: boolean }> {
  return new Promise((resolve) => {
    const events: IAgentEvent[] = [];
    service.run(task, config).subscribe({
      next: (event) => events.push(event),
      error: () => resolve({ events, errored: true }),
      complete: () => resolve({ events, errored: false }),
    });
  });
}

const types = (events: IAgentEvent[]): AgentEventType[] => events.map((e) => e.type);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentRunnerService', () => {
  describe('happy path', () => {
    it('emits AGENT_START first and AGENT_DONE last, in order, and completes', async () => {
      const provider = buildProvider(['Hello', ' ', 'world']);
      const service = buildRunner(provider);

      const { events, errored } = await collectRun(service, 'say hello', CONFIG);
      const emitted = types(events);

      expect(errored).toBe(false);
      expect(emitted[0]).toBe(AgentEventType.AGENT_START);
      expect(emitted[emitted.length - 1]).toBe(AgentEventType.AGENT_DONE);
      expect(emitted).not.toContain(AgentEventType.AGENT_ERROR);

      // AGENT_START strictly precedes AGENT_DONE.
      expect(emitted.indexOf(AgentEventType.AGENT_START)).toBeLessThan(
        emitted.indexOf(AgentEventType.AGENT_DONE),
      );

      // Final-answer tokens were streamed as TOKEN events.
      const tokens = events.filter((e) => e.type === AgentEventType.TOKEN).map((e) => e.data);
      expect(tokens).toEqual(['Hello', ' ', 'world']);
    });
  });

  describe('over budget', () => {
    it('emits exactly one AGENT_ERROR with a reason then completes — never errors the subscriber', async () => {
      const provider = buildProvider(['unreachable']);
      const service = buildRunner(provider);

      // A tiny budget is blown by the first planning turn's estimated tokens.
      const { events, errored } = await collectRun(service, 'expensive task', {
        ...CONFIG,
        tokenBudget: 1,
      });
      const emitted = types(events);

      expect(errored).toBe(false);

      const errorEvents = events.filter((e) => e.type === AgentEventType.AGENT_ERROR);
      expect(errorEvents).toHaveLength(1);
      expect((errorEvents[0].data as { reason: string }).reason).toBeTruthy();

      // The error is terminal: it is the last event and no AGENT_DONE follows.
      expect(emitted[emitted.length - 1]).toBe(AgentEventType.AGENT_ERROR);
      expect(emitted).not.toContain(AgentEventType.AGENT_DONE);

      // The over-budget path is reached before any final-answer streaming.
      expect(emitted).not.toContain(AgentEventType.TOKEN);
    });
  });

  describe('unsubscribe', () => {
    it('trips the kill-switch mid-run so no AGENT_DONE arrives and the stream is torn down', async () => {
      const events: IAgentEvent[] = [];
      let teardown = false;

      // A provider whose planning stream never settles: the run parks awaiting
      // the planning response, giving us a deterministic window to unsubscribe.
      const provider = {
        chat: jest.fn(
          () =>
            new Observable<string>(() => {
              // Teardown fires when the runner aborts the in-flight stream.
              return () => {
                teardown = true;
              };
            }),
        ),
      };
      const service = buildRunner(provider);

      const subscription = service.run('long task', CONFIG).subscribe({
        next: (event) => events.push(event),
      });

      // Let the loop reach the parked planning call, then abort.
      await new Promise((resolve) => setTimeout(resolve, 10));
      subscription.unsubscribe();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Kill path reached: the in-flight provider stream was torn down...
      expect(teardown).toBe(true);
      // ...and no terminal completion event leaked after unsubscribe.
      expect(types(events)).not.toContain(AgentEventType.AGENT_DONE);
      expect(types(events)).not.toContain(AgentEventType.AGENT_ERROR);
    });
  });
});
