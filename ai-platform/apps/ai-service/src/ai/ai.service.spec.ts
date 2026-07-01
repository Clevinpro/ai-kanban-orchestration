import type { AgentEvent, AiChatOptions } from '@ai-platform/shared';
import { Observable, of } from 'rxjs';
import { AiService } from './ai.service';
import { QueryRouterService } from './query-router.service';
import {
  IterationCapExceededError,
  TimeoutExceededError,
  TokenBudgetExceededError,
} from './safeguards/errors';
import { createRagSearchTool, RAG_SEARCH_TOOL_NAME } from './tools/rag-search.tool';
import { TAG_QUERY_TOOL_NAME } from './tools/tag-query.tool';
import { ToolRegistry } from './tools/tool-registry';

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
  type ChatMock = jest.Mock<Observable<string>, [unknown, AiChatOptions?]>;

  interface Mocks {
    service: AiService;
    chat: ChatMock;
    similaritySearch: jest.Mock;
    formatContext: jest.Mock;
    isCapabilityQuery: jest.Mock;
    loadHistory: jest.Mock;
    saveMessage: jest.Mock;
    createConversation: jest.Mock;
    registry: ToolRegistry;
    tagToolRun: jest.Mock;
    queryRouter: QueryRouterService;
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
    const createConversation = jest.fn().mockResolvedValue('conv-created');

    const searchService = { similaritySearch, formatContext };
    const factory = { getProvider: jest.fn().mockReturnValue({ chat }) };
    const conversationService = { loadHistory, saveMessage, createConversation };
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const capabilityDetector = { isCapabilityQuery };
    const queryRouter = new QueryRouterService(capabilityDetector as never);

    // Registry wired exactly like the module: RAG + tag-query tools.
    const registry = new ToolRegistry();
    registry.register(createRagSearchTool(searchService as never));
    const tagToolRun = jest.fn().mockResolvedValue('Tag count: 3');
    registry.register({
      name: TAG_QUERY_TOOL_NAME,
      description: 'List or count tags.',
      run: tagToolRun,
    });

    const service = new AiService(
      searchService as never,
      factory as never,
      conversationService as never,
      logger as never,
      registry,
      queryRouter,
    );

    return {
      service,
      chat,
      similaritySearch,
      formatContext,
      isCapabilityQuery,
      loadHistory,
      saveMessage,
      createConversation,
      registry,
      tagToolRun,
      queryRouter,
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

  it('empty final answer: streams a non-empty fallback notice so the client never hangs on a thinking bubble', async () => {
    const mocks = buildService();

    // The model emits the FINAL marker but no usable answer text (e.g. a
    // reasoning model whose stripped <think> block left nothing behind).
    mocks.chat.mockReturnValueOnce(of('FINAL:    '));

    const { text, events, error } = await collectRun(mocks.service, {
      message: 'say something',
      mode: 'agent',
    });

    expect(error).toBeUndefined();
    // A non-empty terminal answer was streamed instead of an empty string.
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).toContain('did not produce a usable answer');
    // The `final` event still fired so the client transitions out of planning.
    expect(events.map((e) => e.status)).toContain('final');
  });

  it('persists the fallback notice (not an empty string) when the final answer is empty', async () => {
    const mocks = buildService();
    mocks.chat.mockReturnValueOnce(of('FINAL: '));

    await collectRun(mocks.service, {
      message: 'say something',
      mode: 'agent',
      conversationId: 'conv-empty',
    });

    const assistantSave = mocks.saveMessage.mock.calls
      .map((call) => call[0] as { role: string; content: string })
      .find((arg) => arg.role === 'assistant');
    expect(assistantSave?.content.trim().length).toBeGreaterThan(0);
    expect(assistantSave?.content).toContain('did not produce a usable answer');
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

  it('safeguard abort mid-stream: best-effort persists the accumulated partial answer, once, with the run runId', async () => {
    const mocks = buildService();
    const conversationId = 'conv-salvage';

    // Stream partial FINAL tokens, then abort the in-flight provider stream with
    // a typed safeguard error (timeout) before the loop reaches the final-branch
    // persist. The already-forwarded answer text must be salvaged.
    mocks.chat.mockReturnValueOnce(
      new Observable<string>((subscriber) => {
        subscriber.next('FINAL: partial ');
        subscriber.next('answer');
        subscriber.error(new TimeoutExceededError());
      }),
    );

    const { text, error } = await collectRun(mocks.service, {
      message: 'salvage me',
      mode: 'agent',
      conversationId,
    });

    // The original safeguard error is still surfaced to the client.
    expect(error).toBeInstanceOf(TimeoutExceededError);
    expect(text).toBe('partial answer');

    // Exactly one assistant salvage write, keyed by the run's runId, carrying the
    // accumulated partial answer.
    const assistantWrites = mocks.saveMessage.mock.calls
      .map((call) => call[0] as { role: string; content: string; runId?: string })
      .filter((args) => args.role === 'assistant');
    expect(assistantWrites).toHaveLength(1);
    expect(assistantWrites[0].content).toBe('partial answer');
    expect(typeof assistantWrites[0].runId).toBe('string');
    expect(assistantWrites[0].runId).not.toHaveLength(0);
  });

  it('safeguard abort with no streamed answer: no salvage write is attempted', async () => {
    const mocks = buildService();
    const conversationId = 'conv-no-salvage';

    // Endless tool calls with a tiny cap: aborts via IterationCap before any
    // FINAL token is ever forwarded, so there is nothing to salvage.
    mocks.chat.mockReturnValue(of(`TOOL ${RAG_SEARCH_TOOL_NAME}: keep digging`));

    const { error } = await collectRun(mocks.service, {
      message: 'never answers',
      mode: 'agent',
      conversationId,
      maxIterations: 2,
    });

    expect(error).toBeInstanceOf(IterationCapExceededError);

    const assistantWrites = mocks.saveMessage.mock.calls
      .map((call) => call[0] as { role: string })
      .filter((args) => args.role === 'assistant');
    expect(assistantWrites).toHaveLength(0);
  });

  it('safeguard abort with a failing salvage write: the original error is still surfaced', async () => {
    const mocks = buildService();
    const conversationId = 'conv-salvage-fail';

    mocks.chat.mockReturnValueOnce(
      new Observable<string>((subscriber) => {
        subscriber.next('FINAL: partial answer');
        subscriber.error(new TimeoutExceededError());
      }),
    );
    // Salvage write fails; the loop must catch/log it and rethrow the original.
    mocks.saveMessage.mockImplementation(async (args: { role: string }) => {
      if (args.role === 'assistant') {
        throw new Error('db down');
      }
    });

    const { error } = await collectRun(mocks.service, {
      message: 'salvage fails',
      mode: 'agent',
      conversationId,
    });

    expect(error).toBeInstanceOf(TimeoutExceededError);
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

  it('planner calls pass bounded max_tokens and disableThinking to the provider', async () => {
    const mocks = buildService();
    mocks.chat.mockReturnValueOnce(of('FINAL: bounded'));

    await collectRun(mocks.service, {
      message: 'quick answer',
      mode: 'agent',
    });

    expect(mocks.chat).toHaveBeenCalledWith(expect.any(Array), {
      maxTokens: AiService.PLANNER_MAX_TOKENS,
      disableThinking: true,
    });
  });

  it('planner runaway: a reasoning stream cut by max_tokens terminates with a parseable decision', async () => {
    const mocks = buildService();
    // Simulate a reasoning model that would never emit FINAL: — the provider
    // enforces max_tokens and completes with truncated thinking text.
    mocks.chat.mockImplementation((_messages, options) => {
      expect(options).toEqual({
        maxTokens: AiService.PLANNER_MAX_TOKENS,
        disableThinking: true,
      });
      const maxTokens = options?.maxTokens ?? AiService.PLANNER_MAX_TOKENS;
      const runaway = 'Let me think step by step... '.repeat(200);
      const truncated = runaway.slice(0, maxTokens);
      return asyncStream(truncated);
    });

    const { text, error } = await collectRun(mocks.service, {
      message: 'stale history question',
      mode: 'agent',
    });

    expect(error).toBeUndefined();
    // No FINAL marker — parseAgentDecision falls back to the accumulated text.
    expect(text.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThanOrEqual(AiService.PLANNER_MAX_TOKENS);
    expect(mocks.chat).toHaveBeenCalledTimes(1);
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

    // The unified flow still consults the query router (which delegates to the
    // capability detector for non-structured queries).
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
      timeoutMs: 90_000,
    });
  });

  it('a capability query short-circuits to the capability answer and bypasses the loop', async () => {
    const mocks = buildService();
    mocks.isCapabilityQuery.mockResolvedValueOnce(true);
    mocks.chat.mockReturnValue(of('You can manage tags and search docs.'));

    const { events, error } = await collectRun(mocks.service, {
      message: 'what can you do?',
    });

    expect(error).toBeUndefined();
    // The capability pre-step answers directly, so no agent loop events fire.
    expect(events).toHaveLength(0);
    expect(mocks.isCapabilityQuery).toHaveBeenCalled();
    // Scoped retrieval only — capability-vault prefix, never whole-index RAG.
    expect(mocks.similaritySearch).toHaveBeenCalledTimes(1);
    expect(mocks.similaritySearch).toHaveBeenCalledWith(
      'what can you do?',
      6,
      AiService.CAPABILITY_VAULT_PREFIX,
    );
    expect(mocks.similaritySearch.mock.calls[0]).toHaveLength(3);
    for (const call of mocks.similaritySearch.mock.calls) {
      expect(call[2]).toBe(AiService.CAPABILITY_VAULT_PREFIX);
    }
    // Single LLM stream for the answer — not the bounded tool-use loop.
    expect(mocks.chat).toHaveBeenCalledTimes(1);
    // The answer call is reason-capped and bounded so a reasoning model cannot
    // run unbounded or burn the whole budget on hidden reasoning (empty content).
    expect(mocks.chat).toHaveBeenCalledWith(expect.any(Array), {
      maxTokens: AiService.ANSWER_MAX_TOKENS,
      disableThinking: true,
    });
  });

  describe('lane routing (TASK-006)', () => {
    it('structured lane: count/list queries answer with zero provider.chat() calls', async () => {
      const mocks = buildService();
      mocks.tagToolRun.mockResolvedValueOnce('Tag count: 5');

      const { text, events, error } = await collectRun(mocks.service, {
        message: 'count tags',
      });

      expect(error).toBeUndefined();
      expect(text).toBe('Tag count: 5');
      expect(mocks.chat).not.toHaveBeenCalled();
      expect(mocks.similaritySearch).not.toHaveBeenCalled();
      expect(mocks.tagToolRun).toHaveBeenCalledWith('count tags', expect.any(Object));
      expect(events).toHaveLength(0);
    });

    it('structured lane: list all tags resolves via tag-query.tool only', async () => {
      const mocks = buildService();
      mocks.tagToolRun.mockResolvedValueOnce('Tags (2):\n<faq>\n<note>');

      const { text, error } = await collectRun(mocks.service, {
        message: 'list all tags',
      });

      expect(error).toBeUndefined();
      expect(text).toBe('Tags (2):\n<faq>\n<note>');
      expect(mocks.chat).not.toHaveBeenCalled();
      expect(mocks.similaritySearch).not.toHaveBeenCalled();
      expect(mocks.tagToolRun).toHaveBeenCalledWith('list all tags', expect.any(Object));
    });

    it('meta lane: capability queries call similaritySearch with the capability-vault prefix only (TASK-007)', async () => {
      const mocks = buildService();
      mocks.isCapabilityQuery.mockResolvedValueOnce(true);
      mocks.chat.mockReturnValue(of('Here are the platform capabilities.'));

      const { events, error } = await collectRun(mocks.service, {
        message: 'what can I do here?',
      });

      expect(error).toBeUndefined();
      expect(mocks.similaritySearch).toHaveBeenCalledTimes(1);
      expect(mocks.similaritySearch).toHaveBeenCalledWith(
        'what can I do here?',
        6,
        AiService.CAPABILITY_VAULT_PREFIX,
      );
      expect(mocks.similaritySearch.mock.calls[0]).toHaveLength(3);
      expect(mocks.chat).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(0);
    });

    it('technical lane: API queries call similaritySearch with the technical-docs prefix only', async () => {
      const mocks = buildService();
      mocks.chat.mockReturnValue(asyncStream('The API supports REST endpoints.'));

      const { events, error } = await collectRun(mocks.service, {
        message: 'how does the API work?',
      });

      expect(error).toBeUndefined();
      expect(mocks.similaritySearch).toHaveBeenCalledTimes(1);
      expect(mocks.similaritySearch).toHaveBeenCalledWith(
        'how does the API work?',
        6,
        AiService.TECHNICAL_DOCS_PREFIX,
      );
      expect(mocks.similaritySearch.mock.calls[0]).toHaveLength(3);
      expect(mocks.chat).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(0);
    });

    it('complex lane: still runs runChatFlow with safeguards and agent events', async () => {
      const mocks = buildService();
      mocks.chat.mockReturnValueOnce(of('FINAL: complex answer'));

      const { text, events, error } = await collectRun(mocks.service, {
        message: 'explain the deployment architecture in detail',
      });

      expect(error).toBeUndefined();
      expect(text).toBe('complex answer');
      expect(mocks.chat).toHaveBeenCalledTimes(1);
      expect(events.map((e) => e.status)).toContain('planning');
      expect(events.map((e) => e.status)).toContain('final');
    });
  });

  /**
   * Final regression gate (TASK-009 / AC-08): the complex lane must still
   * construct and enforce all four safeguards, and every `AgentEvent` must
   * round-trip as plain JSON with the stable SSE field set.
   */
  describe('complex lane regression gate (TASK-009)', () => {
    const AGENT_EVENT_ALLOWED_KEYS = new Set(['iteration', 'status', 'tool', 'input', 'budget']);

    /** Assert an event matches the FE-facing `AgentEvent` contract. */
    function expectAgentEventContract(event: AgentEvent): void {
      for (const key of Object.keys(event)) {
        expect(AGENT_EVENT_ALLOWED_KEYS.has(key)).toBe(true);
      }
      expect(typeof event.iteration).toBe('number');
      expect(['planning', 'tool_call', 'tool_result', 'final']).toContain(event.status);
      if (event.tool !== undefined) {
        expect(typeof event.tool).toBe('string');
      }
      if (event.input !== undefined) {
        expect(typeof event.input).toBe('string');
      }
      if (event.budget !== undefined) {
        expect(event.budget).toEqual({
          iteration: expect.any(Number),
          tokensUsed: expect.any(Number),
          elapsedMs: expect.any(Number),
          maxIterations: expect.any(Number),
          tokenBudget: expect.any(Number),
          timeoutMs: expect.any(Number),
        });
      }
    }

    it('emits AgentEvents whose payload shape matches the SSE contract', async () => {
      const mocks = buildService();
      mocks.chat
        .mockReturnValueOnce(of(`TOOL ${RAG_SEARCH_TOOL_NAME}: policy details`))
        .mockReturnValueOnce(of('FINAL: summarized'));

      const { events, error } = await collectRun(mocks.service, {
        message: 'explain the deployment architecture in detail',
        maxIterations: 5,
        tokenBudget: 10_000,
        timeoutMs: 15_000,
      });

      expect(error).toBeUndefined();
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        expectAgentEventContract(event);
      }

      const toolCall = events.find((e) => e.status === 'tool_call');
      expect(toolCall).toMatchObject({
        iteration: expect.any(Number),
        status: 'tool_call',
        tool: RAG_SEARCH_TOOL_NAME,
        input: 'policy details',
        budget: expect.objectContaining({
          maxIterations: 5,
          tokenBudget: 10_000,
          timeoutMs: 15_000,
        }),
      });
    });

    it('token-budget-exceeded: a tiny token budget aborts the complex lane with the typed safeguard reason', async () => {
      const mocks = buildService();
      const longAnswer = 'x'.repeat(100);
      mocks.chat.mockReturnValueOnce(of(`FINAL: ${longAnswer}`));

      const { error } = await collectRun(mocks.service, {
        message: 'explain the deployment architecture in detail',
        tokenBudget: 10,
      });

      expect(error).toBeInstanceOf(TokenBudgetExceededError);
      expect((error as TokenBudgetExceededError).reason).toBe('token_budget');
    });
  });

  /**
   * No-conversationId lane (TASK-004 / SPEC US-03, AC-04): a complex chat
   * request that arrives without a `conversationId` must still durably persist
   * the user turn — carrying the run's `runId` — before generation begins, so a
   * mid-stream failure never drops the turn.
   */
  describe('no-conversationId durable user turn (TASK-004)', () => {
    /**
     * Run with an explicit `runId` (the boundary-minted id in production) so the
     * persisted user turn's id can be asserted, and capture the order of
     * `createConversation` / `saveMessage` / `provider.chat` calls.
     */
    function runWithRunId(
      service: AiService,
      request: unknown,
      runId: string,
    ): Promise<{ text: string; error: unknown }> {
      return new Promise((resolve) => {
        let text = '';
        service.processMessage(request, { runId }).subscribe({
          next: (chunk) => {
            text += chunk;
          },
          complete: () => resolve({ text, error: undefined }),
          error: (error: unknown) => resolve({ text, error }),
        });
      });
    }

    it('creates a conversation and persists the user turn with the runId before the model is called', async () => {
      const mocks = buildService();

      // Order tracking: persistence must happen before generation.
      const callOrder: string[] = [];
      mocks.createConversation.mockImplementation(async () => {
        callOrder.push('createConversation');
        return 'conv-new';
      });
      mocks.saveMessage.mockImplementation(async () => {
        callOrder.push('saveMessage');
      });
      mocks.chat.mockImplementationOnce(() => {
        callOrder.push('chat');
        return of('FINAL: answered');
      });

      const { text, error } = await runWithRunId(
        mocks.service,
        // No conversationId; userId present (forwarded from the AI_REQUEST
        // boundary) so a conversation can be created on the fly.
        { message: 'explain the deployment architecture in detail', userId: 'user-7' },
        'run-no-conv',
      );

      expect(error).toBeUndefined();
      expect(text).toBe('answered');

      // A conversation was created for the owner.
      expect(mocks.createConversation).toHaveBeenCalledTimes(1);
      expect(mocks.createConversation).toHaveBeenCalledWith('user-7');

      // The user turn was persisted against the new conversation, carrying the
      // run's runId, before any provider.chat call.
      const userSave = mocks.saveMessage.mock.calls.find((call) => call[0].role === 'user')?.[0];
      expect(userSave).toEqual({
        conversationId: 'conv-new',
        role: 'user',
        content: 'explain the deployment architecture in detail',
        runId: 'run-no-conv',
      });

      // Persistence strictly precedes generation: the first chat call happens
      // only after the conversation was created and the user turn saved.
      expect(callOrder.indexOf('createConversation')).toBeLessThan(callOrder.indexOf('chat'));
      expect(callOrder.indexOf('saveMessage')).toBeLessThan(callOrder.indexOf('chat'));
    });

    it('persists the assistant turn with the same runId against the created conversation', async () => {
      const mocks = buildService();
      mocks.chat.mockReturnValueOnce(of('FINAL: done'));

      await runWithRunId(
        mocks.service,
        { message: 'explain the deployment architecture in detail', userId: 'user-9' },
        'run-xyz',
      );

      const assistantSave = mocks.saveMessage.mock.calls.find(
        (call) => call[0].role === 'assistant',
      )?.[0];
      expect(assistantSave).toEqual({
        conversationId: 'conv-created',
        role: 'assistant',
        content: 'done',
        runId: 'run-xyz',
      });
    });

    it('does not drop the user turn when generation fails mid-stream', async () => {
      const mocks = buildService();
      // The provider errors out after the user turn was already persisted.
      mocks.chat.mockReturnValueOnce(
        new Observable<string>((subscriber) => {
          subscriber.error(new Error('provider exploded'));
        }),
      );

      const { error } = await runWithRunId(
        mocks.service,
        { message: 'explain the deployment architecture in detail', userId: 'user-3' },
        'run-fail',
      );

      expect(error).toBeDefined();

      // Even though generation failed, the user turn was durably persisted first.
      const userSave = mocks.saveMessage.mock.calls.find((call) => call[0].role === 'user')?.[0];
      expect(userSave).toMatchObject({
        role: 'user',
        content: 'explain the deployment architecture in detail',
        runId: 'run-fail',
      });
    });
  });
});
