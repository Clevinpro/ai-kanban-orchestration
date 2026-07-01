/**
 * ai-service E2E harness.
 *
 * Boots a focused Nest module graph around {@link AiModule} via
 * `Test.createTestingModule`, replacing the external-infra providers
 * (Kafka / Prisma / embeddings / LLM provider) with in-memory doubles, so an
 * E2E exercises the REAL DI graph (AiModule's Kafka subscription, the
 * QueryRouter, the ToolRegistry, AiService's agent loop) without docker or any
 * network. Mirrors `apps/api-gateway/src/testing/e2e.harness.ts`.
 */
import { DatabaseModule, PrismaService } from '@ai-platform/database';
import { KafkaConsumerService, KafkaModule, KafkaProducerService } from '@ai-platform/kafka';
import { LoggerModule } from '@ai-platform/shared';
import { INestApplication, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { AiModule } from '../ai/ai.module';
import { AiProviderFactory } from '../ai/providers/ai-provider.factory';
import { EmbeddingProviderFactory } from '../embeddings/providers/embedding-provider.factory';

/** One provider replacement applied via `.overrideProvider(provide).useValue(useValue)`. */
export interface ProviderOverride {
  provide: unknown;
  useValue: unknown;
}

export interface BootAiServiceOptions {
  /** External-infra doubles to swap in for the real providers. */
  overrides?: ProviderOverride[];
}

export interface AiServiceE2EContext {
  app: INestApplication;
  close: () => Promise<void>;
}

/**
 * Minimal root module reproducing the ai-service wiring AiModule needs
 * (Config + Logger + Kafka + Database globals + AiModule) WITHOUT the
 * vault/knowledge modules whose `onModuleInit` would scan the filesystem.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule,
    KafkaModule.forRoot({
      clientId: 'ai-service-e2e',
      brokers: ['localhost:9092'],
      groupId: 'ai-service-e2e',
    }),
    DatabaseModule,
    AiModule,
  ],
})
class AiServiceE2EModule {}

export async function bootAiServiceE2E(
  options: BootAiServiceOptions = {},
): Promise<AiServiceE2EContext> {
  const { overrides = [] } = options;

  let builder: TestingModuleBuilder = Test.createTestingModule({
    imports: [AiServiceE2EModule],
  });

  for (const override of overrides) {
    builder = builder.overrideProvider(override.provide).useValue(override.useValue);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return {
    app,
    close: () => app.close(),
  };
}

/** Re-export the tokens specs override so they import them from one place. */
export {
  AiProviderFactory,
  EmbeddingProviderFactory,
  KafkaConsumerService,
  KafkaProducerService,
  PrismaService,
};
