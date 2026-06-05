import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiProviderFactory } from './providers/ai-provider.factory';
import { ClaudeProvider } from './providers/claude.provider';
import { OllamaProvider } from './providers/ollama.provider';

/**
 * LLM provider wiring with no Kafka / messaging coupling.
 *
 * Split out from `AiModule` so consumers that only need the provider factory
 * (e.g. the agent runtime running inside the ai-service HTTP server) can import
 * it without pulling in `AiModule`'s Kafka `OnModuleInit` subscription, which
 * would otherwise force `KafkaModule` into a Kafka-free HTTP module graph.
 */
@Module({
  imports: [ConfigModule],
  providers: [AiProviderFactory, ClaudeProvider, OllamaProvider],
  exports: [AiProviderFactory, ClaudeProvider, OllamaProvider],
})
export class AiProvidersModule {}
