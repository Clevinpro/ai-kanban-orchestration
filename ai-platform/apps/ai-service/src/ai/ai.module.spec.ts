import { KAFKA_TOPICS } from '@ai-platform/shared';
import { KillSwitch } from './safeguards/kill-switch';
import { KillSwitchTrippedError } from './safeguards/errors';
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
