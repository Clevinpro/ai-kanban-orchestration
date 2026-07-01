import { KAFKA_TOPICS } from '@ai-platform/shared';
import type { MessageRole } from '@ai-platform/shared';
import { Subject } from 'rxjs';
import { KillSwitch } from './safeguards/kill-switch';
import { KillSwitchTrippedError } from './safeguards/errors';
import { ConversationService } from '../conversation/conversation.service';
import { AiModule } from './ai.module';

/**
 * Unit tests for the `AI_CANCEL` consumer wiring in {@link AiModule}.
 *
 * The module is exercised directly (not via the Nest DI container) so the test
 * stays fast and focused on the cancel seam: subscription to the `AI_CANCEL`
 * topic and the kill-switch lookup/trip behaviour.
 */
describe('AiModule AI_CANCEL consumer', () => {
  type KafkaHandler = (msg: { topic: string; value: unknown }) => Promise<void> | void;

  function buildModule() {
    const handlers = new Map<string, KafkaHandler>();

    const kafkaConsumer = {
      subscribe: jest.fn(async (topic: string, handler: KafkaHandler) => {
        handlers.set(topic, handler);
      }),
    };
    const kafkaProducer = { publish: jest.fn() };
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const aiService = { getKillSwitch: jest.fn(), processMessage: jest.fn() };
    const conversationService = { createConversation: jest.fn() };

    const module = new AiModule(
      aiService as never,
      kafkaConsumer as never,
      kafkaProducer as never,
      logger as never,
      conversationService as never,
    );

    return { module, handlers, kafkaConsumer, logger, aiService };
  }

  it('subscribes to the AI_CANCEL topic on init', async () => {
    const { module, kafkaConsumer, handlers } = buildModule();

    await module.onModuleInit();

    expect(kafkaConsumer.subscribe).toHaveBeenCalledWith(
      KAFKA_TOPICS.AI_CANCEL,
      expect.any(Function),
    );
    expect(handlers.has(KAFKA_TOPICS.AI_CANCEL)).toBe(true);
  });

  it('trips the active run kill switch so the next checkpoint throws', async () => {
    const { module, handlers, aiService } = buildModule();
    const killSwitch = new KillSwitch();
    aiService.getKillSwitch.mockReturnValue(killSwitch);

    await module.onModuleInit();
    const cancelHandler = handlers.get(KAFKA_TOPICS.AI_CANCEL) as KafkaHandler;

    await cancelHandler({
      topic: KAFKA_TOPICS.AI_CANCEL,
      value: { conversationId: 'conv-1', userId: 'user-1' },
    });

    expect(aiService.getKillSwitch).toHaveBeenCalledWith('conv-1');
    expect(killSwitch.isKilled).toBe(true);
    expect(() => killSwitch.checkpoint()).toThrow(KillSwitchTrippedError);
  });

  it('is a safe no-op for an unknown/finished conversationId', async () => {
    const { module, handlers, aiService, logger } = buildModule();
    aiService.getKillSwitch.mockReturnValue(undefined);

    await module.onModuleInit();
    const cancelHandler = handlers.get(KAFKA_TOPICS.AI_CANCEL) as KafkaHandler;

    await expect(
      cancelHandler({
        topic: KAFKA_TOPICS.AI_CANCEL,
        value: { conversationId: 'missing' },
      }),
    ).resolves.toBeUndefined();

    expect(aiService.getKillSwitch).toHaveBeenCalledWith('missing');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('is a safe no-op when conversationId is missing', async () => {
    const { module, handlers, aiService, logger } = buildModule();

    await module.onModuleInit();
    const cancelHandler = handlers.get(KAFKA_TOPICS.AI_CANCEL) as KafkaHandler;

    await expect(
      cancelHandler({ topic: KAFKA_TOPICS.AI_CANCEL, value: {} }),
    ).resolves.toBeUndefined();

    expect(aiService.getKillSwitch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});

/**
 * Tests for partial-text salvage on the AI_REQUEST stream `error` path
 * (TASK-004). The module is driven through its real `streamAiResponse` (via the
 * AI_REQUEST handler) over a real {@link ConversationService} backed by a fake
 * Prisma client that emulates the `(runId, role)` unique constraint. This proves
 * the end-to-end idempotency AC: partial generation + abort writes exactly one
 * assistant row, and a later success for the same `runId` does not add a second.
 */
describe('AiModule AI_REQUEST partial-text salvage on abort', () => {
  const ASSISTANT: MessageRole = 'assistant';

  type KafkaHandler = (msg: { topic: string; value: unknown }) => Promise<void> | void;

  interface StoredMessage {
    conversationId: string;
    role: MessageRole;
    content: string;
    runId: string | null;
  }

  function makeFakePrisma() {
    const rows: StoredMessage[] = [];
    return {
      rows,
      message: {
        findMany: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(
          async (args: {
            where: { runId_role: { runId: string; role: MessageRole } };
            create: { conversationId: string; role: MessageRole; content: string; runId: string };
            update: Record<string, never>;
          }) => {
            const { runId, role } = args.where.runId_role;
            const existing = rows.find((r) => r.runId === runId && r.role === role);
            if (existing) {
              return existing;
            }
            const { conversationId, content } = args.create;
            const created: StoredMessage = { conversationId, role, content, runId };
            rows.push(created);
            return created;
          },
        ),
      },
      conversation: { create: jest.fn() },
    };
  }

  function buildModule() {
    const handlers = new Map<string, KafkaHandler>();
    const kafkaConsumer = {
      subscribe: jest.fn(async (topic: string, handler: KafkaHandler) => {
        handlers.set(topic, handler);
      }),
    };
    const kafkaProducer = { publish: jest.fn().mockResolvedValue(undefined) };
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    // Controllable stream the fake AiService hands back to the module so the
    // test can emit partial chunks then drive the run to error or complete.
    const stream = new Subject<string>();
    const aiService = {
      getKillSwitch: jest.fn(),
      processMessage: jest.fn(() => stream.asObservable()),
    };

    const prisma = makeFakePrisma();
    const conversationService = new ConversationService(prisma as never, logger as never);

    const module = new AiModule(
      aiService as never,
      kafkaConsumer as never,
      kafkaProducer as never,
      logger as never,
      conversationService as never,
    );

    return { module, handlers, kafkaProducer, logger, prisma, stream };
  }

  // The AI_REQUEST handler swallows the run rejection (logs it, never rethrows),
  // so the kafka consumer keeps running. These tests therefore assert on the
  // persisted rows + an error-event publish rather than on a handler rejection.
  function getAiService(module: AiModule): { processMessage: jest.Mock } {
    return (module as unknown as { aiService: { processMessage: jest.Mock } }).aiService;
  }

  function getConversationService(module: AiModule): ConversationService {
    return (module as unknown as { conversationService: ConversationService }).conversationService;
  }

  function errorPublishCalls(kafkaProducer: { publish: jest.Mock }): unknown[] {
    // publish is called as publish(topic, { topic, value: payload }); the event
    // discriminator lives on the second argument's `value`.
    return kafkaProducer.publish.mock.calls.filter(
      (call) => (call[1] as { value?: { event?: string } })?.value?.event === 'error',
    );
  }

  it('salvages exactly one assistant row on abort; a later success for the same runId adds no second row', async () => {
    const { module, handlers, prisma, kafkaProducer } = buildModule();
    await module.onModuleInit();
    const requestHandler = handlers.get(KAFKA_TOPICS.AI_REQUEST) as KafkaHandler;

    // First delivery: stream partial text, then abort with a kill-switch error.
    const firstStream = new Subject<string>();
    let capturedRunId: string | undefined;
    getAiService(module).processMessage.mockImplementationOnce(
      (_req: unknown, opts: { runId: string }) => {
        capturedRunId = opts.runId;
        return firstStream.asObservable();
      },
    );

    const firstRun = requestHandler({
      topic: KAFKA_TOPICS.AI_REQUEST,
      value: { userId: 'u1', conversationId: 'conv-1', message: 'hi' },
    });

    firstStream.next('partial ');
    firstStream.next('answer');
    firstStream.error(new KillSwitchTrippedError());

    // Handler swallows the rejection; awaiting it lets the salvage + error
    // publish chain settle.
    await firstRun;

    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0]).toMatchObject({
      conversationId: 'conv-1',
      role: ASSISTANT,
      content: 'partial answer',
      runId: capturedRunId,
    });
    // The original error is still surfaced as an `error` event to the client.
    expect(errorPublishCalls(kafkaProducer)).toHaveLength(1);

    // Redelivery / retry reuses the SAME runId and completes successfully. The
    // idempotent upsert must keep a single row (no second assistant row).
    await getConversationService(module).saveMessage({
      conversationId: 'conv-1',
      role: ASSISTANT,
      content: 'partial answer (final)',
      runId: capturedRunId as string,
    });

    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0].runId).toBe(capturedRunId);
  });

  it('does not write a salvage row when no text was accumulated before the abort', async () => {
    const { module, handlers, prisma } = buildModule();
    await module.onModuleInit();
    const requestHandler = handlers.get(KAFKA_TOPICS.AI_REQUEST) as KafkaHandler;

    const emptyStream = new Subject<string>();
    getAiService(module).processMessage.mockImplementationOnce(() => emptyStream.asObservable());

    const run = requestHandler({
      topic: KAFKA_TOPICS.AI_REQUEST,
      value: { userId: 'u1', conversationId: 'conv-1', message: 'hi' },
    });

    emptyStream.error(new KillSwitchTrippedError());
    await run;

    expect(prisma.rows).toHaveLength(0);
    expect(prisma.message.upsert).not.toHaveBeenCalled();
  });

  it('still surfaces the original error when the salvage write fails', async () => {
    const { module, handlers, prisma, logger, kafkaProducer } = buildModule();
    await module.onModuleInit();
    const requestHandler = handlers.get(KAFKA_TOPICS.AI_REQUEST) as KafkaHandler;

    // Make the salvage write reject; the original error must still propagate as
    // an `error` event and the failure must be logged, not masked.
    prisma.message.upsert.mockRejectedValueOnce(new Error('db down'));

    const stream = new Subject<string>();
    getAiService(module).processMessage.mockImplementationOnce(() => stream.asObservable());

    const run = requestHandler({
      topic: KAFKA_TOPICS.AI_REQUEST,
      value: { userId: 'u1', conversationId: 'conv-1', message: 'hi' },
    });

    stream.next('some text');
    stream.error(new KillSwitchTrippedError());
    await run;

    expect(logger.error).toHaveBeenCalled();
    expect(errorPublishCalls(kafkaProducer)).toHaveLength(1);
  });
});
