import { LoggerService } from '@ai-platform/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
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
    this.embeddingModel = rawModel?.trim() || 'nomic-embed-text';
  }

  async generateEmbedding(text: string): Promise<number[]> {
    this.logger.debug(
      `Request embedding: model=${this.embeddingModel}, textLength=${text.length}`,
      'OllamaEmbeddingProvider',
    );
    const { data } = await axios.post<OllamaEmbeddingResponse>(`${this.ollamaUrl}/api/embeddings`, {
      model: this.embeddingModel,
      prompt: text,
    });

    this.logger.debug(
      `Embedding received: dimensions=${data.embedding.length}`,
      'OllamaEmbeddingProvider',
    );
    return data.embedding;
  }

  async generateBatch(texts: string[]): Promise<number[][]> {
    this.logger.log(`Batch embeddings: count=${texts.length}`, 'OllamaEmbeddingProvider');
    return Promise.all(texts.map((text) => this.generateEmbeddingSilent(text)));
  }

  private async generateEmbeddingSilent(text: string): Promise<number[]> {
    const { data } = await axios.post<OllamaEmbeddingResponse>(`${this.ollamaUrl}/api/embeddings`, {
      model: this.embeddingModel,
      prompt: text,
    });
    return data.embedding;
  }
}
