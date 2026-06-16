import { KAFKA_TOPICS } from '@ai-platform/shared';
import { AiController } from './ai.controller';
import type { CancelChatRequestDto, ChatRequestDto } from './ai.dto';

describe('AiController.chat (AI_REQUEST forwarding)', () => {
  let controller: AiController;
  let publish: jest.Mock;

  const req = { user: { id: 'user-1' } } as never;

  const buildDto = (overrides: Partial<ChatRequestDto> = {}): ChatRequestDto => ({
    message: 'hello',
    conversationId: 'conv-1',
    ...overrides,
  });

  const lastPublishedValue = (): Record<string, unknown> =>
    publish.mock.calls[publish.mock.calls.length - 1][1].value;

  beforeEach(() => {
    publish = jest.fn().mockResolvedValue(undefined);
    const kafkaProducer = { publish } as never;
    const kafkaConsumer = {} as never;
    const logger = { log: jest.fn() } as never;
    const prisma = {
      conversation: { create: jest.fn().mockResolvedValue({ id: 'conv-new' }) },
    } as never;

    controller = new AiController(kafkaProducer, kafkaConsumer, logger, prisma);
  });

  it('publishes the unchanged payload when no agent fields are provided', async () => {
    await controller.chat(req, buildDto());

    expect(publish).toHaveBeenCalledWith(KAFKA_TOPICS.AI_REQUEST, {
      topic: KAFKA_TOPICS.AI_REQUEST,
      value: {
        userId: 'user-1',
        message: 'hello',
        conversationId: 'conv-1',
      },
    });
    expect(lastPublishedValue()).not.toHaveProperty('mode');
  });

  it('forwards mode when present', async () => {
    await controller.chat(req, buildDto({ mode: 'agent' }));

    expect(lastPublishedValue()).toEqual({
      userId: 'user-1',
      message: 'hello',
      conversationId: 'conv-1',
      mode: 'agent',
    });
  });

  it('forwards all limit fields when present', async () => {
    await controller.chat(
      req,
      buildDto({ mode: 'agent', maxIterations: 5, tokenBudget: 1000, timeoutMs: 30000 }),
    );

    expect(lastPublishedValue()).toEqual({
      userId: 'user-1',
      message: 'hello',
      conversationId: 'conv-1',
      mode: 'agent',
      maxIterations: 5,
      tokenBudget: 1000,
      timeoutMs: 30000,
    });
  });

  it('forwards limit fields even when no mode is provided', async () => {
    await controller.chat(req, buildDto({ maxIterations: 3, tokenBudget: 800, timeoutMs: 15000 }));

    const value = lastPublishedValue();
    expect(value).not.toHaveProperty('mode');
    expect(value).toMatchObject({
      maxIterations: 3,
      tokenBudget: 800,
      timeoutMs: 15000,
    });
  });

  it('omits individual limit fields that are not provided', async () => {
    await controller.chat(req, buildDto({ mode: 'chat', tokenBudget: 500 }));

    const value = lastPublishedValue();
    expect(value).toHaveProperty('tokenBudget', 500);
    expect(value).not.toHaveProperty('maxIterations');
    expect(value).not.toHaveProperty('timeoutMs');
  });
});

describe('AiController.cancel (AI_CANCEL forwarding)', () => {
  let controller: AiController;
  let publish: jest.Mock;

  const req = { user: { id: 'user-1' } } as never;

  const buildDto = (overrides: Partial<CancelChatRequestDto> = {}): CancelChatRequestDto => ({
    conversationId: 'conv-1',
    ...overrides,
  });

  beforeEach(() => {
    publish = jest.fn().mockResolvedValue(undefined);
    const kafkaProducer = { publish } as never;
    const kafkaConsumer = {} as never;
    const logger = { log: jest.fn() } as never;
    const prisma = {} as never;

    controller = new AiController(kafkaProducer, kafkaConsumer, logger, prisma);
  });

  it('publishes AI_CANCEL keyed by conversationId with { conversationId, userId }', async () => {
    const result = await controller.cancel(req, buildDto());

    expect(publish).toHaveBeenCalledWith(KAFKA_TOPICS.AI_CANCEL, {
      topic: KAFKA_TOPICS.AI_CANCEL,
      key: 'conv-1',
      value: {
        conversationId: 'conv-1',
        userId: 'user-1',
      },
    });
    expect(result).toEqual({ status: 'cancelling' });
  });

  it('uses the authed userId from req.user.sub when id is absent', async () => {
    const subReq = { user: { sub: 'user-2' } } as never;

    await controller.cancel(subReq, buildDto({ conversationId: 'conv-2' }));

    expect(publish).toHaveBeenCalledWith(KAFKA_TOPICS.AI_CANCEL, {
      topic: KAFKA_TOPICS.AI_CANCEL,
      key: 'conv-2',
      value: {
        conversationId: 'conv-2',
        userId: 'user-2',
      },
    });
  });
});
