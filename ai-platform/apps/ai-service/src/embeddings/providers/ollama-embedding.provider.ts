import { LoggerService } from '@ai-platform/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  assertEmbeddingDimension,
  DEFAULT_MULTILINGUAL_EMBEDDING_MODEL,
} from '../embeddings.constants';
import { EmbeddingProvider } from './embedding-provider.interface';

type OllamaEmbeddingResponse = {
  embedding: number[];
};

@Injectable()
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private readonly ollamaUrl: string;
  private readonly embeddingModel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.ollamaUrl = this.configService.get<string>('OLLAMA_URL') ?? 'http://localhost:11434';
    const rawModel = this.configService.get<string>('OLLAMA_EMBEDDING_MODEL');
    this.embeddingModel = rawModel?.trim() || DEFAULT_MULTILINGUAL_EMBEDDING_MODEL;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    this.logger.debug(
      `Request embedding: model=${this.embeddingModel}, textLength=${text.length}`,
      'OllamaEmbeddingProvider',
    );
    const start = Date.now();
    const { data } = await axios.post<OllamaEmbeddingResponse>(`${this.ollamaUrl}/api/embeddings`, {
      model: this.embeddingModel,
      prompt: text,
    });
    const duration = Date.now() - start;

    this.logger.debug(
      `Embedding received: dimensions=${data.embedding.length}`,
      'OllamaEmbeddingProvider',
    );
    this.logger.debug(`Ollama embed: ${duration}ms`, 'OllamaEmbeddingProvider');
    return assertEmbeddingDimension(data.embedding, this.embeddingModel);
  }

  async generateBatch(texts: string[]): Promise<number[][]> {
    this.logger.log(`Batch embeddings: count=${texts.length}`, 'OllamaEmbeddingProvider');
    const start = Date.now();
    const embeddings = await Promise.all(texts.map((text) => this.generateEmbeddingSilent(text)));
    const duration = Date.now() - start;
    this.logger.debug(`Ollama embed: ${duration}ms`, 'OllamaEmbeddingProvider');
    return embeddings;
  }

  private async generateEmbeddingSilent(text: string): Promise<number[]> {
    const { data } = await axios.post<OllamaEmbeddingResponse>(`${this.ollamaUrl}/api/embeddings`, {
      model: this.embeddingModel,
      prompt: text,
    });
    return assertEmbeddingDimension(data.embedding, this.embeddingModel);
  }
}
