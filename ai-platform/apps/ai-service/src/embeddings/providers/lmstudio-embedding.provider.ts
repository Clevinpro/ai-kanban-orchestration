import { LoggerService } from '@ai-platform/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { AxiosError } from 'axios';
import {
  assertEmbeddingDimension,
  DEFAULT_MULTILINGUAL_EMBEDDING_MODEL,
} from '../embeddings.constants';
import { EmbeddingProvider } from './embedding-provider.interface';

const DEFAULT_LMSTUDIO_URL = 'http://localhost:1234/v1';
const DEFAULT_LMSTUDIO_MODEL = DEFAULT_MULTILINGUAL_EMBEDDING_MODEL;

type LmStudioEmbeddingObject = {
  embedding: number[];
  index: number;
  object: string;
};

type LmStudioEmbeddingResponse = {
  data: LmStudioEmbeddingObject[];
};

function isAxiosLike(
  err: unknown,
): err is Pick<AxiosError, 'response' | 'message' | 'config' | 'request' | 'code'> {
  return (
    typeof err === 'object' &&
    err !== null &&
    'isAxiosError' in err &&
    (err as Record<string, unknown>)['isAxiosError'] === true
  );
}

function sanitizeAxiosError(err: unknown): Error {
  if (isAxiosLike(err)) {
    const status = err.response?.status ?? 'unknown';
    // Connection-level failures (e.g. ECONNREFUSED when the LM Studio server is
    // not running) surface as an AggregateError with an empty message on Node
    // >= 17 — fall back to the axios error code so the cause is never blank.
    const message =
      (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message ||
      err.message ||
      err.code ||
      'connection failed (is the LM Studio server running?)';
    return new Error(`LM Studio API request failed: status=${status}, message=${message}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

@Injectable()
export class LmStudioEmbeddingProvider implements EmbeddingProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.baseUrl = this.configService.get<string>('LMSTUDIO_URL') ?? DEFAULT_LMSTUDIO_URL;
    this.model =
      this.configService.get<string>('LMSTUDIO_EMBEDDING_MODEL') ?? DEFAULT_LMSTUDIO_MODEL;
  }

  // LM Studio is OpenAI-compatible and requires no API key. No `dimensions` field is sent —
  // the llama.cpp backend ignores it and dimensionality is fixed by the loaded model.
  async generateEmbedding(text: string): Promise<number[]> {
    const start = Date.now();
    let data: LmStudioEmbeddingResponse;
    try {
      const response = await axios.post<LmStudioEmbeddingResponse>(`${this.baseUrl}/embeddings`, {
        input: text,
        model: this.model,
      });
      data = response.data;
    } catch (err) {
      throw sanitizeAxiosError(err);
    }
    if (!data.data || data.data.length === 0 || data.data[0] === undefined) {
      throw new Error('LM Studio embeddings API returned no data');
    }
    const duration = Date.now() - start;
    this.logger.debug(`LM Studio embed: ${duration}ms`, 'LmStudioEmbeddingProvider');
    return assertEmbeddingDimension(data.data[0].embedding, this.model);
  }

  async generateBatch(texts: string[]): Promise<number[][]> {
    const start = Date.now();
    let data: LmStudioEmbeddingResponse;
    try {
      const response = await axios.post<LmStudioEmbeddingResponse>(`${this.baseUrl}/embeddings`, {
        input: texts,
        model: this.model,
      });
      data = response.data;
    } catch (err) {
      throw sanitizeAxiosError(err);
    }
    if (!data.data || data.data.length === 0) {
      throw new Error('LM Studio embeddings API returned no data');
    }
    const duration = Date.now() - start;
    this.logger.debug(`LM Studio embed: ${duration}ms`, 'LmStudioEmbeddingProvider');
    return data.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => assertEmbeddingDimension(d.embedding, this.model));
  }
}
