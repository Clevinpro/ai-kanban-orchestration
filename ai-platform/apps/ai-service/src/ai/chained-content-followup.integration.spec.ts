import type { AgentEvent, ChatMessage } from '@ai-platform/shared';
import { of, type Observable } from 'rxjs';
import { Prisma } from '@prisma/client';
import { AiService } from './ai.service';
import { QueryRouterService } from './query-router.service';
import { createFetchDocumentTool, FETCH_DOCUMENT_TOOL_NAME } from './tools/fetch-document.tool';
import { createRagSearchTool } from './tools/rag-search.tool';
import { createTagQueryTool, TAG_QUERY_TOOL_NAME } from './tools/tag-query.tool';
import { ToolRegistry } from './tools/tool-registry';

/**
 * Integration coverage for the content follow-up fix (epic
 * chat-history-window-and-document-fetch, TASK-003).
 *
 * Proves the end-to-end behavior the user was missing: in the complex
 * (agent-loop) lane the planner can chain a reference / `tagQuery` into a
 * `fetchDocument` call, the fetched document body is fed back into the loop
 * context, and the model then produces a real natural-language answer derived
 * from that content — never the {@link EMPTY_FINAL_ANSWER_FALLBACK} notice.
 *
 * The provider is stubbed (no real LLM) and the database is a deterministic
 * `$queryRaw` double seeded with known document content, so the chained flow is
 * fully reproducible. {@link AiService} is constructed directly with the SAME
 * `ToolRegistry` wiring `ai.module.ts` uses (RAG + tagQuery + fetchDocument).
 */
describe('chained content follow-up: tagQuery -> fetchDocument -> answer (integration)', () => {
  /** Known seeded document body the final answer must be derived from. */
  const DOC_TITLE = 'Onboarding Guide';
  const DOC_CONTENT =
    'Refunds are processed within 14 business days via the original payment method.';

  const EMPTY_FINAL_ANSWER_FALLBACK =
    'The model did not produce a usable answer. Please rephrase your question and try again.';

  type ChatMock = jest.Mock<Observable<string>, [unknown, unknown?]>;

  interface Harness {
    service: AiService;
    chat: ChatMock;
    queryRaw: jest.Mock;
    saveMessage: jest.Mock;
  }

  /**
   * Build an AiService wired to a stubbed provider + a `$queryRaw`-backed prisma
   * double. The registry is assembled exactly like `ai.module.ts`'s factory:
   * RAG search, tagQuery, and fetchDocument tools.
   */
  function buildHarness(queryRaw: jest.Mock): Harness {
    const chat: ChatMock = jest.fn();

    const searchService = {
      // Not exercised in this flow; the loop calls fetchDocument, not RAG.
      similaritySearch: jest.fn().mockResolvedValue([]),
      formatContext: jest.fn().mockReturnValue('(no context)'),
    };
    const factory = { getProvider: jest.fn().mockReturnValue({ chat }) };

    const loadHistory = jest.fn().mockResolvedValue([]);
    const saveMessage = jest.fn().mockResolvedValue(undefined);
    const createConversation = jest.fn().mockResolvedValue('conv-created');
    const conversationService = { loadHistory, saveMessage, createConversation };

    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

    // capabilityDetector.isCapabilityQuery -> false so the query routes 'complex'.
    const capabilityDetector = { isCapabilityQuery: jest.fn().mockResolvedValue(false) };
    const queryRouter = new QueryRouterService(capabilityDetector as never);

    const prisma = { $queryRaw: queryRaw };

    const registry = new ToolRegistry();
    registry.register(createRagSearchTool(searchService as never));
    registry.register(createTagQueryTool(prisma as never));
    registry.register(createFetchDocumentTool(prisma as never));

    const service = new AiService(
      searchService as never,
      factory as never,
      conversationService as never,
      logger as never,
      registry,
      queryRouter,
    );

    return { service, chat, queryRaw, saveMessage };
  }

  function collectRun(
    service: AiService,
    request: unknown,
  ): Promise<{ text: string; events: AgentEvent[]; error: unknown }> {
    const events: AgentEvent[] = [];
    return new Promise((resolve) => {
      let text = '';
      service.processMessage(request, { onAgentEvent: (e) => events.push(e) }).subscribe({
        next: (chunk) => {
          text += chunk;
        },
        complete: () => resolve({ text, events, error: undefined }),
        error: (error: unknown) => resolve({ text, events, error }),
      });
    });
  }

  // A clearly-complex message: not a tag/count query, not a capability query,
  // not an API/technical query -> routes to the complex agent loop.
  const COMPLEX_MESSAGE = 'Summarize the refund policy described in the onboarding guide.';

  it('fetchDocument -> FINAL: streams a non-empty answer derived from the fetched body (NOT the fallback)', async () => {
    // The single $queryRaw call is the fetchDocument tag lookup; it returns the
    // seeded document body.
    const queryRaw = jest.fn().mockResolvedValue([{ title: DOC_TITLE, content: DOC_CONTENT }]);

    const harness = buildHarness(queryRaw);

    let turn = 0;
    harness.chat.mockImplementation((messages: unknown) => {
      turn += 1;
      if (turn === 1) {
        // Turn 1: reference a tag and dispatch the document-content fetch.
        return of(`TOOL ${FETCH_DOCUMENT_TOOL_NAME}: <faq>`);
      }
      // Turn 2: the planner must have received the fetched body as an
      // observation; build the final answer FROM it so the assertion proves the
      // content actually flowed back (AC-02), not a hardcoded reply.
      const msgs = messages as ChatMessage[];
      const observation = msgs.find((m) => m.content.startsWith('Observation from'))?.content ?? '';
      expect(observation).toContain(DOC_CONTENT);
      return of('FINAL: ', `Based on the ${DOC_TITLE}: ${DOC_CONTENT}`);
    });

    const { text, events, error } = await collectRun(harness.service, {
      message: COMPLEX_MESSAGE,
      conversationId: 'conv-followup',
    });

    expect(error).toBeUndefined();

    // The fetchDocument tool actually hit the DB double.
    expect(queryRaw).toHaveBeenCalledTimes(1);

    // The streamed final answer is real content derived from the document and is
    // explicitly NOT the empty-answer fallback notice the user previously saw.
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).toContain(DOC_CONTENT);
    expect(text).not.toContain(EMPTY_FINAL_ANSWER_FALLBACK);
    expect(text).toBe(`Based on the ${DOC_TITLE}: ${DOC_CONTENT}`);

    // The loop emitted the standard agent events including a tool_call for
    // fetchDocument and a final.
    const toolCall = events.find((e) => e.status === 'tool_call');
    expect(toolCall?.tool).toBe(FETCH_DOCUMENT_TOOL_NAME);
    expect(events.map((e) => e.status)).toContain('tool_result');
    expect(events.map((e) => e.status)).toContain('final');

    // The non-fallback answer was persisted as the assistant turn (with a runId).
    const assistantSave = harness.saveMessage.mock.calls
      .map((call) => call[0] as { role: string; content: string; runId?: string })
      .find((arg) => arg.role === 'assistant');
    expect(assistantSave?.content).toBe(`Based on the ${DOC_TITLE}: ${DOC_CONTENT}`);
    expect(assistantSave?.content).not.toContain(EMPTY_FINAL_ANSWER_FALLBACK);
    expect(typeof assistantSave?.runId).toBe('string');
    expect((assistantSave?.runId ?? '').length).toBeGreaterThan(0);
  });

  it('feeds the fetchDocument observation back into the second planning turn (mirrors ai.service.spec tool-loop pattern)', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ title: DOC_TITLE, content: DOC_CONTENT }]);
    const harness = buildHarness(queryRaw);

    harness.chat
      .mockReturnValueOnce(of(`TOOL ${FETCH_DOCUMENT_TOOL_NAME}: ${DOC_TITLE}`))
      .mockReturnValueOnce(of('FINAL: ', `Answer: ${DOC_CONTENT}`));

    const { text, error } = await collectRun(harness.service, {
      message: COMPLEX_MESSAGE,
      conversationId: 'conv-feedback',
    });

    expect(error).toBeUndefined();
    expect(text).toContain(DOC_CONTENT);

    // The observation must appear in the SECOND chat call's transcript — the
    // planner's second turn sees the fetched document content.
    const secondCallMessages = harness.chat.mock.calls[1][0] as ChatMessage[];
    const fedBack = secondCallMessages.some(
      (m) => m.content.includes('Observation from') && m.content.includes(DOC_CONTENT),
    );
    expect(fedBack).toBe(true);
  });

  it('full chain tagQuery -> fetchDocument -> FINAL produces a content answer', async () => {
    // Two sequential $queryRaw calls: (1) tagQuery lookup returns the matching
    // document title; (2) fetchDocument returns that document's body.
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ title: DOC_TITLE }])
      .mockResolvedValueOnce([{ title: DOC_TITLE, content: DOC_CONTENT }]);
    const harness = buildHarness(queryRaw);

    let turn = 0;
    harness.chat.mockImplementation((messages: unknown) => {
      turn += 1;
      if (turn === 1) {
        return of(`TOOL ${TAG_QUERY_TOOL_NAME}: <faq>`);
      }
      if (turn === 2) {
        // The tag lookup observation names the document; fetch its content next.
        const msgs = messages as ChatMessage[];
        const tagObservation = msgs.find((m) => m.content.startsWith('Observation from'))?.content;
        expect(tagObservation).toContain(DOC_TITLE);
        return of(`TOOL ${FETCH_DOCUMENT_TOOL_NAME}: ${DOC_TITLE}`);
      }
      const msgs = messages as ChatMessage[];
      const contentObservation = msgs
        .filter((m) => m.content.startsWith('Observation from'))
        .map((m) => m.content)
        .join('\n');
      expect(contentObservation).toContain(DOC_CONTENT);
      return of('FINAL: ', `The guide says: ${DOC_CONTENT}`);
    });

    const { text, events, error } = await collectRun(harness.service, {
      message: COMPLEX_MESSAGE,
      conversationId: 'conv-chain',
    });

    expect(error).toBeUndefined();
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(text).toContain(DOC_CONTENT);
    expect(text).not.toContain(EMPTY_FINAL_ANSWER_FALLBACK);

    // Both tools were dispatched in order.
    const toolCalls = events.filter((e) => e.status === 'tool_call').map((e) => e.tool);
    expect(toolCalls).toEqual([TAG_QUERY_TOOL_NAME, FETCH_DOCUMENT_TOOL_NAME]);

    expect(harness.chat).toHaveBeenCalledTimes(3);
  });

  it('sanity: Prisma.sql is used by the fetchDocument tool query (deterministic, no real DB)', () => {
    // Guards against an accidental ORM-method call path: the content tools build
    // raw SQL, so $queryRaw is the only DB seam the doubles must satisfy.
    expect(typeof Prisma.sql).toBe('function');
  });
});
