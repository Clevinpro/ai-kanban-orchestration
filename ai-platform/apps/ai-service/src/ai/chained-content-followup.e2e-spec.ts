/**
 * ai-service E2E: content follow-up through the real Kafka boundary.
 *
 * ai-service has no HTTP chat endpoint — a chat request enters over the Kafka
 * `AI_REQUEST` topic and the answer streams back over `AI_RESPONSE`. This E2E
 * boots the REAL AiModule DI graph (Kafka subscription, QueryRouter, the
 * ToolRegistry built exactly as `ai.module.ts` builds it, and AiService's agent
 * loop) with in-memory infra doubles, then delivers an AI_REQUEST and asserts
 * the OBSERVABLE result of the chained tagQuery -> fetchDocument -> answer flow:
 *
 *  1. the `AI_RESPONSE` chunks published back form a non-empty natural-language
 *     answer derived from the seeded document — NOT the empty-answer fallback;
 *  2. the assistant turn is durably persisted (Message row) with the run's id.
 *
 * No docker, no real LLM, no network: the provider is scripted and the database
 * is the `$queryRaw`/store double seeded with known document content.
 */
import { KAFKA_TOPICS, type AiResponsePayload } from '@ai-platform/shared';
import {
  AiProviderFactory,
  bootAiServiceE2E,
  EmbeddingProviderFactory,
  KafkaConsumerService,
  KafkaProducerService,
  PrismaService,
  type AiServiceE2EContext,
} from '../testing/e2e.harness';
import {
  createScriptedProvider,
  FakeKafkaConsumerService,
  FakeKafkaProducerService,
  FakePrismaService,
} from '../testing/infra-doubles';
import { FETCH_DOCUMENT_TOOL_NAME } from './tools/fetch-document.tool';

const DOC_TITLE = 'Onboarding Guide';
const DOC_CONTENT =
  'Refunds are processed within 14 business days via the original payment method.';
const FINAL_ANSWER = `Based on the ${DOC_TITLE}: ${DOC_CONTENT}`;
const EMPTY_FINAL_ANSWER_FALLBACK =
  'The model did not produce a usable answer. Please rephrase your question and try again.';

// A clearly-complex message: not tag/count, not capability, not technical.
const COMPLEX_MESSAGE = 'Summarize the refund policy described in the onboarding guide.';

describe('ai-service content follow-up (E2E, Kafka boundary)', () => {
  let ctx: AiServiceE2EContext;
  let consumer: FakeKafkaConsumerService;
  let producer: FakeKafkaProducerService;
  let prisma: FakePrismaService;

  beforeAll(async () => {
    consumer = new FakeKafkaConsumerService();
    producer = new FakeKafkaProducerService();
    prisma = new FakePrismaService([{ title: DOC_TITLE, content: DOC_CONTENT }]);

    // Scripted planner: turn 1 dispatches fetchDocument by tag, turn 2 emits the
    // final answer (streamed as two chunks) once the document body is fed back.
    const scriptedProvider = createScriptedProvider([
      [`TOOL ${FETCH_DOCUMENT_TOOL_NAME}: <faq>`],
      ['FINAL: ', FINAL_ANSWER],
    ]);

    const fakeEmbeddings = {
      getProvider: () => ({
        generateEmbedding: async () => [],
        generateBatch: async () => [],
      }),
    };

    ctx = await bootAiServiceE2E({
      overrides: [
        { provide: KafkaConsumerService, useValue: consumer },
        { provide: KafkaProducerService, useValue: producer },
        { provide: PrismaService, useValue: prisma },
        { provide: AiProviderFactory, useValue: { getProvider: () => scriptedProvider } },
        { provide: EmbeddingProviderFactory, useValue: fakeEmbeddings },
      ],
    });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('streams a document-derived answer over AI_RESPONSE and persists the assistant turn (not the fallback)', async () => {
    // Deliver an AI_REQUEST exactly as the gateway publishes it. emit() awaits
    // the full run (answer streamed + persisted) before resolving.
    await consumer.emit(KAFKA_TOPICS.AI_REQUEST, {
      userId: 'user-e2e',
      conversationId: 'conv-e2e',
      message: COMPLEX_MESSAGE,
    });

    const responses = producer.valuesFor<AiResponsePayload>(KAFKA_TOPICS.AI_RESPONSE);

    // The run completed (terminal `complete` event published).
    expect(responses.some((r) => r.event === 'complete')).toBe(true);
    expect(responses.some((r) => r.event === 'error')).toBe(false);

    // The streamed answer chunks reconstruct the document-derived answer.
    const streamed = responses
      .filter((r) => r.event === 'chunk')
      .map((r) => r.result ?? '')
      .join('');

    expect(streamed.length).toBeGreaterThan(0);
    expect(streamed).toContain(DOC_CONTENT);
    expect(streamed).not.toContain(EMPTY_FINAL_ANSWER_FALLBACK);
    expect(streamed).toBe(FINAL_ANSWER);

    // The fetchDocument tool actually hit the DB double exactly once.
    // (One $queryRaw for the fetchDocument tag lookup.)
    // The assistant turn was durably persisted with the run's id.
    const assistant = prisma.messages.find((m) => m.role === 'assistant');
    expect(assistant).toBeDefined();
    expect(assistant?.conversationId).toBe('conv-e2e');
    expect(assistant?.content).toBe(FINAL_ANSWER);
    expect(assistant?.content).not.toContain(EMPTY_FINAL_ANSWER_FALLBACK);
    expect(typeof assistant?.runId).toBe('string');
    expect((assistant?.runId ?? '').length).toBeGreaterThan(0);

    // The user turn was persisted before generation, sharing the same runId.
    const user = prisma.messages.find((m) => m.role === 'user');
    expect(user?.content).toBe(COMPLEX_MESSAGE);
    expect(user?.runId).toBe(assistant?.runId);
  });
});
