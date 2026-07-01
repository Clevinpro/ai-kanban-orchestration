/**
 * E2E example for the api-gateway AI chat endpoint.
 *
 * This is the TEMPLATE future BE E2E tasks copy. It boots the real AppModule
 * through the supertest harness — real routing, DI, the `/api` prefix and the
 * global ValidationPipe — while swapping Kafka/Prisma for in-memory doubles, so
 * it runs with zero docker. It asserts the real HTTP response body AND the
 * side effect that the request persisted (the exact Kafka payload published),
 * not just an HTTP 200.
 */
import { PrismaService } from '@ai-platform/database';
import { KafkaConsumerService, KafkaProducerService } from '@ai-platform/kafka';
import { KAFKA_TOPICS } from '@ai-platform/shared';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { JwtAuthGuard } from '../auth/auth.guard';
import {
  FakeKafkaConsumerService,
  FakeKafkaProducerService,
  FakePrismaService,
} from '../testing/infra-doubles';
import type { E2EContext } from '../testing/e2e.harness';
import { bootE2EApp } from '../testing/e2e.harness';

const TEST_USER_ID = 'user-e2e';

/** Guard double that authenticates every request as a fixed test user. */
class AllowGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = { id: TEST_USER_ID };
    return true;
  }
}

describe('api-gateway AI chat (E2E)', () => {
  let ctx: E2EContext;
  let producer: FakeKafkaProducerService;

  beforeAll(async () => {
    producer = new FakeKafkaProducerService();

    ctx = await bootE2EApp({
      module: AppModule,
      overrides: [
        { provide: KafkaProducerService, useValue: producer },
        { provide: KafkaConsumerService, useValue: new FakeKafkaConsumerService() },
        { provide: PrismaService, useValue: new FakePrismaService() },
      ],
      guards: [{ guard: JwtAuthGuard, useValue: new AllowGuard() }],
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('mints a conversation, returns 201 + processing status, and publishes AI_REQUEST', async () => {
    const response = await request(ctx.httpServer)
      .post('/api/ai/chat')
      .send({ message: '  what is RAG?  ' })
      .expect(201);

    // Real HTTP response body — conversationId was minted by the (fake) Prisma layer.
    expect(response.body).toEqual({
      status: 'processing',
      conversationId: 'conv-1',
    });

    // Persisted side effect: the exact payload forwarded to Kafka. The message
    // was trimmed by the DTO @Transform before being published.
    expect(producer.lastValueFor(KAFKA_TOPICS.AI_REQUEST)).toEqual({
      userId: TEST_USER_ID,
      message: 'what is RAG?',
      conversationId: 'conv-1',
    });
  });

  it('reuses a provided conversationId without minting a new one', async () => {
    const response = await request(ctx.httpServer)
      .post('/api/ai/chat')
      .send({ message: 'follow up', conversationId: 'existing-conv' })
      .expect(201);

    expect(response.body).toEqual({
      status: 'processing',
      conversationId: 'existing-conv',
    });
    expect(producer.lastValueFor(KAFKA_TOPICS.AI_REQUEST)).toMatchObject({
      conversationId: 'existing-conv',
    });
  });

  it('rejects an empty message with 400 via the global ValidationPipe', async () => {
    const before = producer.published.length;

    await request(ctx.httpServer).post('/api/ai/chat').send({ message: '   ' }).expect(400);

    // Validation short-circuited the handler: nothing was published.
    expect(producer.published.length).toBe(before);
  });
});
