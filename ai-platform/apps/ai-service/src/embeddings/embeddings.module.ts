import { LoggerService } from '@ai-platform/shared';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OPENAI_EMBEDDING_PROVIDER } from './embeddings.constants';
import { OllamaEmbeddingService } from './embeddings.service';
import { EmbeddingProviderFactory } from './providers/embedding-provider.factory';
import { OllamaEmbeddingProvider } from './providers/ollama-embedding.provider';
import { OpenAiEmbeddingProvider } from './providers/openai-embedding.provider';

export { OPENAI_EMBEDDING_PROVIDER } from './embeddings.constants';

@Module({
  imports: [ConfigModule],
  providers: [
    OllamaEmbeddingService,
    OllamaEmbeddingProvider,
    {
      provide: OPENAI_EMBEDDING_PROVIDER,
      useFactory: (
        configService: ConfigService,
        logger: LoggerService,
      ): OpenAiEmbeddingProvider | null => {
        const isOpenAi =
          configService.get<string>('EMBEDDING_PROVIDER')?.toLowerCase() === 'openai';
        if (!isOpenAi) {
          return null;
        }
        return new OpenAiEmbeddingProvider(configService, logger);
      },
      inject: [ConfigService, LoggerService],
    },
    EmbeddingProviderFactory,
  ],
  exports: [
    OllamaEmbeddingService,
    OllamaEmbeddingProvider,
    OPENAI_EMBEDDING_PROVIDER,
    EmbeddingProviderFactory,
  ],
})
export class EmbeddingsModule {}
