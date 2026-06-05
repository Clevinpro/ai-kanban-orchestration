import { LoggerService } from '@ai-platform/shared';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LMSTUDIO_EMBEDDING_PROVIDER, OPENAI_EMBEDDING_PROVIDER } from '../embeddings.constants';
import { EmbeddingProvider } from './embedding-provider.interface';
import { LmStudioEmbeddingProvider } from './lmstudio-embedding.provider';
import { OllamaEmbeddingProvider } from './ollama-embedding.provider';
import { OpenAiEmbeddingProvider } from './openai-embedding.provider';

@Injectable()
export class EmbeddingProviderFactory {
  private readonly providerName: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly ollamaEmbeddingProvider: OllamaEmbeddingProvider,
    @Optional()
    @Inject(OPENAI_EMBEDDING_PROVIDER)
    private readonly openAiEmbeddingProvider: OpenAiEmbeddingProvider | null,
    @Optional()
    @Inject(LMSTUDIO_EMBEDDING_PROVIDER)
    private readonly lmStudioEmbeddingProvider: LmStudioEmbeddingProvider | null,
    private readonly logger: LoggerService,
  ) {
    this.providerName = (
      this.configService.get<string>('EMBEDDING_PROVIDER') ?? 'ollama'
    ).toLowerCase();
    this.logger.log(`EMBEDDING_PROVIDER=${this.providerName}`, 'EmbeddingProviderFactory');
  }

  getProvider(): EmbeddingProvider {
    if (this.providerName === 'ollama') {
      return this.ollamaEmbeddingProvider;
    }

    if (this.providerName === 'openai') {
      if (!this.openAiEmbeddingProvider) {
        throw new Error('OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai');
      }
      return this.openAiEmbeddingProvider;
    }

    if (this.providerName === 'lmstudio') {
      if (!this.lmStudioEmbeddingProvider) {
        throw new Error('LM Studio provider not initialised (EMBEDDING_PROVIDER=lmstudio)');
      }
      return this.lmStudioEmbeddingProvider;
    }

    throw new Error(`Unsupported EMBEDDING_PROVIDER: ${this.providerName}`);
  }
}
