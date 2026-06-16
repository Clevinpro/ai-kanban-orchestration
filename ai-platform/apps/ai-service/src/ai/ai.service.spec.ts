import type { AgentEvent } from '@ai-platform/shared';
import { Observable, of } from 'rxjs';
import { AiService } from './ai.service';
import { IterationCapExceededError } from './safeguards/errors';
import { ToolRegistry } from './tools/tool-registry';
import { createRagSearchTool, RAG_SEARCH_TOOL_NAME } from './tools/rag-search.tool';

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
    registry: ToolRegistry;
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

    // Registry wired exactly like the module: the RAG tool is the only tool
    // registered, so the loop dispatches it by name through the registry.
    const registry = new ToolRegistry();
    registry.register(createRagSearchTool(searchService as never));

    const service = new AiService(
      searchService as never,
      factory as never,
      conversationService as never,
      logger as never,
      capabilityDetector as never,
      registry,
    );

    return {
      service,
      chat,
      similaritySearch,
      formatContext,
      isCapabilityQuery,
      loadHistory,
      saveMessage,
      registry,
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

    // Turn 1: dispatch the RAG tool. Turn 2: final answer streamed token-by-token.
    mocks.chat
      .mockReturnValueOnce(of(`TOOL ${RAG_SEARCH_TOOL_NAME}: what is the policy`))
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

    // The tool_call / tool_result events both carry the dynamic tool name.
    const toolCall = events.find((e) => e.status === 'tool_call');
    expect(toolCall?.tool).toBe(RAG_SEARCH_TOOL_NAME);
    expect(toolCall?.input).toBe('what is the policy');
    const toolResult = events.find((e) => e.status === 'tool_result');
    expect(toolResult?.tool).toBe(RAG_SEARCH_TOOL_NAME);
    expect(toolResult?.input).toBe('what is the policy');
  });

  it('dispatches an arbitrary registered tool by name with no loop-body edits', async () => {
    const mocks = buildService();

    // Register a second, fake tool. The loop must dispatch it purely by name.
    const fakeRun = jest.fn().mockResolvedValue('fake observation');
    mocks.registry.register({
      name: 'fakeTool',
      description: 'A fake tool for testing dynamic dispatch.',
      run: fakeRun,
    });

    mocks.chat
      .mockReturnValueOnce(of('TOOL fakeTool: do the thing'))
      .mockReturnValueOnce(of('FINAL: done'));

    const { text, events, error } = await collectRun(mocks.service, {
      message: 'use the fake tool',
      mode: 'agent',
    });

    expect(error).toBeUndefined();
    expect(text).toBe('done');
    expect(fakeRun).toHaveBeenCalledWith('do the thing', expect.any(Object));
    // The RAG tool was never touched; only the fake tool ran.
    expect(mocks.similaritySearch).not.toHaveBeenCalled();

    const toolCall = events.find((e) => e.status === 'tool_call');
    expect(toolCall?.tool).toBe('fakeTool');
  });

  it('unknown tool name is fed back as an observation so the loop self-corrects', async () => {
    const mocks = buildService();

    // Turn 1: an unknown tool. Turn 2: a valid final answer once the error
    // observation is fed back. The run must not crash.
    mocks.chat
      .mockReturnValueOnce(of('TOOL nopeTool: anything'))
      .mockReturnValueOnce(of('FINAL: recovered'));

    const { text, error } = await collectRun(mocks.service, {
      message: 'trigger unknown tool',
      mode: 'agent',
    });

    expect(error).toBeUndefined();
    expect(text).toBe('recovered');

    // The error observation was fed back into the second planning turn.
    const secondCallMessages = mocks.chat.mock.calls[1][0] as Array<{
      role: string;
      content: string;
    }>;
    expect(secondCallMessages.some((m) => m.content.includes('unknown tool "nopeTool"'))).toBe(
      true,
    );
  });

  it('budget-exceeded: a tiny iteration cap aborts the run with the typed safeguard reason and no unbounded looping', async () => {
    const mocks = buildService();

    // Endless tool calls: without the cap this loops forever.
    mocks.chat.mockReturnValue(of(`TOOL ${RAG_SEARCH_TOOL_NAME}: keep digging`));

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
      return of(`TOOL ${RAG_SEARCH_TOOL_NAME}: anything`);
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

  it('aborts the in-flight stream and rejects with timeout when the provider stalls past the run budget', async () => {
    const mocks = buildService();
    let unsubscribed = false;
    // A stream that emits nothing and never completes, mirroring an LLM that
    // ingested the prompt but stalled before emitting a token. Without the
    // wall-clock bound on the stream the loop would await this forever.
    mocks.chat.mockReturnValue(
      new Observable<string>(() => () => {
        unsubscribed = true;
      }),
    );

    const { text, error } = await collectRun(mocks.service, {
      message: 'hello',
      timeoutMs: 20,
    });

    expect(text).toBe('');
    expect((error as { reason?: string }).reason).toBe('timeout');
    expect((error as Error).name).toBe('TimeoutExceededError');
    // The stalled provider subscription is torn down rather than left hanging.
    expect(unsubscribed).toBe(true);
  });

  it('a plain question with no mode and no limits answers directly within defaults (behavior parity)', async () => {
    const mocks = buildService();
    // The model answers directly with a FINAL on the first turn (zero tool
    // calls), streamed token-by-token.
    mocks.chat.mockReturnValue(asyncStream('FINAL: ', 'plain ', 'chat ', 'reply'));

    const { text, events, error } = await collectRun(mocks.service, {
      message: 'hello',
      // No mode and no limits -> unified loop runs with default safeguards.
    });

    expect(error).toBeUndefined();
    expect(text).toBe('plain chat reply');

    // The unified flow still consults the capability detector as a pre-step.
    expect(mocks.isCapabilityQuery).toHaveBeenCalled();

    // The model answered directly: exactly one planning turn, no tool dispatch.
    expect(mocks.chat).toHaveBeenCalledTimes(1);
    expect(mocks.similaritySearch).not.toHaveBeenCalled();
    expect(events.map((e) => e.status)).not.toContain('tool_call');

    // Defaults are applied to the budget snapshot when limits are omitted.
    const planning = events.find((e) => e.status === 'planning');
    expect(planning?.budget).toEqual({
      iteration: 1,
      tokensUsed: expect.any(Number),
      elapsedMs: expect.any(Number),
      maxIterations: 10,
      tokenBudget: 100_000,
      timeoutMs: 120_000,
    });
  });

  it('a capability query short-circuits to the capability answer and bypasses the loop', async () => {
    const mocks = buildService();
    mocks.isCapabilityQuery.mockResolvedValueOnce(true);
    mocks.chat.mockReturnValue(of('capability answer'));

    const { events, error } = await collectRun(mocks.service, {
      message: 'what can you do?',
    });

    expect(error).toBeUndefined();
    // The capability pre-step answers directly, so no agent loop events fire.
    expect(events).toHaveLength(0);
    expect(mocks.isCapabilityQuery).toHaveBeenCalled();
    // It runs a scoped similarity search, not the tool-use loop.
    expect(mocks.similaritySearch).toHaveBeenCalled();
  });
});
