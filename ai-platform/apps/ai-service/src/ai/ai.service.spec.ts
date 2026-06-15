import type { AgentEvent } from '@ai-platform/shared';
import { Observable, of } from 'rxjs';
import { AiService } from './ai.service';
import { IterationCapExceededError } from './safeguards/errors';

/**
 * Emit the given chunks asynchronously (one per microtask), mirroring how a real
 * streaming provider delivers tokens after subscription. Synchronous `of(...)`
 * would race the chat flow's BehaviorSubject, which only replays its latest
 * value, so async emission is required for the chat-mode regression assertion.
 */
function asyncStream(...chunks: string[]): Observable<string> {
  return new Observable<string>((subscriber) => {
    let cancelled = false;
    void (async () => {
      for (const chunk of chunks) {
        await Promise.resolve();
        if (cancelled) return;
        subscriber.next(chunk);
      }
      if (!cancelled) subscriber.complete();
    })();
    return () => {
      cancelled = true;
    };
  });
}

/**
 * Integration-level tests for the assembled agent loop inside {@link AiService}
 * (AC-08). Per-safeguard unit specs live alongside each safeguard; this suite
 * exercises the loop end-to-end: a happy path (plan -> search -> final), a
 * budget breach (bounded, no unbounded looping), a cancel, the budget snapshot
 * shape, and the default chat-mode regression guard (AC-07).
 *
 * The service is constructed directly with mocked collaborators (no Nest DI
 * container) so the test stays fast and focused on loop behavior. The provider's
 * `chat` is scripted per planning turn; `SearchService.similaritySearch` is
 * mocked so no real retrieval runs.
 */
describe('AiService agent loop', () => {
  type ChatMock = jest.Mock<Observable<string>, [unknown]>;

  interface Mocks {
    service: AiService;
    chat: ChatMock;
    similaritySearch: jest.Mock;
    formatContext: jest.Mock;
    isCapabilityQuery: jest.Mock;
    loadHistory: jest.Mock;
    saveMessage: jest.Mock;
  }

  /**
   * Build an AiService wired to mocked collaborators. `chat` defaults to a
   * single FINAL turn; individual tests override it via `mockReturnValueOnce`.
   */
  function buildService(): Mocks {
    const chat: ChatMock = jest.fn().mockReturnValue(of('FINAL: default answer'));

    const similaritySearch = jest
      .fn()
      .mockResolvedValue([{ id: 'c1', content: 'evidence', title: 'Doc', similarity: 0.9 }]);
    const formatContext = jest.fn().mockReturnValue('Documentation context:\nevidence');
    const isCapabilityQuery = jest.fn().mockResolvedValue(false);
    const loadHistory = jest.fn().mockResolvedValue([]);
    const saveMessage = jest.fn().mockResolvedValue(undefined);

    const searchService = { similaritySearch, formatContext };
    const factory = { getProvider: jest.fn().mockReturnValue({ chat }) };
    const conversationService = { loadHistory, saveMessage };
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const capabilityDetector = { isCapabilityQuery };

    const service = new AiService(
      searchService as never,
      factory as never,
      conversationService as never,
      logger as never,
      capabilityDetector as never,
    );

    return {
      service,
      chat,
      similaritySearch,
      formatContext,
      isCapabilityQuery,
      loadHistory,
      saveMessage,
    };
  }

  /**
   * Subscribe to the run Observable and resolve with the concatenated tokens,
   * the collected agent events, and the terminal error (if any).
   */
  function collectRun(
    service: AiService,
    request: unknown,
  ): Promise<{ text: string; events: AgentEvent[]; error: unknown }> {
    const events: AgentEvent[] = [];
    return new Promise((resolve) => {
      let text = '';
      service.processMessage(request, { onAgentEvent: (event) => events.push(event) }).subscribe({
        next: (chunk) => {
          text += chunk;
        },
        complete: () => resolve({ text, events, error: undefined }),
        error: (error: unknown) => resolve({ text, events, error }),
      });
    });
  }

  it('happy path: plans, calls similaritySearch, feeds the observation back, then streams the final answer', async () => {
    const mocks = buildService();

    // Turn 1: search the KB. Turn 2: final answer streamed token-by-token.
    mocks.chat
      .mockReturnValueOnce(of('SEARCH: what is the policy'))
      .mockReturnValueOnce(of('FINAL: ', 'the ', 'answer'));

    const { text, events, error } = await collectRun(mocks.service, {
      message: 'explain the policy',
      mode: 'agent',
    });

    expect(error).toBeUndefined();
    expect(text).toBe('the answer');

    // The tool was invoked with the planned query.
    expect(mocks.similaritySearch).toHaveBeenCalledWith('what is the policy');

    // The observation was fed back into the second planning turn: the second
    // chat call's message transcript must contain the formatted observation.
    const secondCallMessages = mocks.chat.mock.calls[1][0] as Array<{
      role: string;
      content: string;
    }>;
    expect(
      secondCallMessages.some((m) => m.content.includes('Documentation context:\nevidence')),
    ).toBe(true);

    // A `final` event is emitted before completion.
    const statuses = events.map((e) => e.status);
    expect(statuses).toContain('planning');
    expect(statuses).toContain('tool_call');
    expect(statuses).toContain('tool_result');
    expect(statuses).toContain('final');
  });

  it('budget-exceeded: a tiny iteration cap aborts the run with the typed safeguard reason and no unbounded looping', async () => {
    const mocks = buildService();

    // Endless tool calls: without the cap this loops forever.
    mocks.chat.mockReturnValue(of('SEARCH: keep digging'));

    const { error } = await collectRun(mocks.service, {
      message: 'never resolves',
      mode: 'agent',
      maxIterations: 2,
    });

    expect(error).toBeInstanceOf(IterationCapExceededError);
    expect((error as IterationCapExceededError).reason).toBe('iteration_cap');

    // Bounded: exactly `maxIterations` planning turns ran, then the next
    // increment tripped the cap (no unbounded looping).
    expect(mocks.chat).toHaveBeenCalledTimes(2);
  });

  it('cancel: tripping the run kill switch aborts the next checkpoint with KillSwitchTrippedError', async () => {
    const mocks = buildService();
    const conversationId = 'conv-cancel';

    // After the first search turn, trip the kill switch registered for this run
    // (simulating an AI_CANCEL) so the next iteration's checkpoint aborts.
    mocks.chat.mockImplementation(() => {
      const killSwitch = mocks.service.getKillSwitch(conversationId);
      killSwitch?.kill();
      return of('SEARCH: anything');
    });

    const { error } = await collectRun(mocks.service, {
      message: 'cancel me',
      mode: 'agent',
      conversationId,
    });

    expect(error).toBeDefined();
    expect((error as { reason?: string }).reason).toBe('kill_switch');
    expect((error as Error).name).toBe('KillSwitchTrippedError');
  });

  it('emits a well-formed budget snapshot on agent events', async () => {
    const mocks = buildService();
    mocks.chat.mockReturnValueOnce(of('FINAL: done'));

    const { events } = await collectRun(mocks.service, {
      message: 'quick answer',
      mode: 'agent',
      maxIterations: 7,
      tokenBudget: 5000,
      timeoutMs: 30000,
    });

    const planning = events.find((e) => e.status === 'planning');
    expect(planning?.budget).toBeDefined();
    const budget = planning?.budget;
    expect(budget).toEqual({
      iteration: 1,
      tokensUsed: expect.any(Number),
      elapsedMs: expect.any(Number),
      maxIterations: 7,
      tokenBudget: 5000,
      timeoutMs: 30000,
    });
  });

  it('default chat-mode path stays green and emits no agent events (AC-07 regression guard)', async () => {
    const mocks = buildService();
    mocks.chat.mockReturnValue(asyncStream('plain ', 'chat ', 'reply'));

    const { text, events, error } = await collectRun(mocks.service, {
      message: 'hello',
      // No mode -> defaults to chat.
    });

    expect(error).toBeUndefined();
    expect(text).toBe('plain chat reply');
    expect(events).toHaveLength(0);
    // Chat mode consults the capability detector; agent mode never does.
    expect(mocks.isCapabilityQuery).toHaveBeenCalled();
  });
});
