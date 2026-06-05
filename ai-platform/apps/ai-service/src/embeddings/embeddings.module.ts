import { LoggerService } from '@ai-platform/shared';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LMSTUDIO_EMBEDDING_PROVIDER, OPENAI_EMBEDDING_PROVIDER } from './embeddings.constants';
import { OllamaEmbeddingService } from './embeddings.service';
import { EmbeddingProviderFactory } from './providers/embedding-provider.factory';
import { LmStudioEmbeddingProvider } from './providers/lmstudio-embedding.provider';
import { OllamaEmbeddingProvider } from './providers/ollama-embedding.provider';
import { OpenAiEmbeddingProvider } from './providers/openai-embedding.provider';

export { LMSTUDIO_EMBEDDING_PROVIDER, OPENAI_EMBEDDING_PROVIDER } from './embeddings.constants';

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
    {
      provide: LMSTUDIO_EMBEDDING_PROVIDER,
      useFactory: (
        configService: ConfigService,
        logger: LoggerService,
      ): LmStudioEmbeddingProvider | null => {
        const isLmStudio =
          configService.get<string>('EMBEDDING_PROVIDER')?.toLowerCase() === 'lmstudio';
        if (!isLmStudio) {
          return null;
        }
        return new LmStudioEmbeddingProvider(configService, logger);
      },
      inject: [ConfigService, LoggerService],
    },
    EmbeddingProviderFactory,
  ],
  exports: [
    OllamaEmbeddingService,
    OllamaEmbeddingProvider,
    OPENAI_EMBEDDING_PROVIDER,
    LMSTUDIO_EMBEDDING_PROVIDER,
    EmbeddingProviderFactory,
  ],
})
export class EmbeddingsModule {}
