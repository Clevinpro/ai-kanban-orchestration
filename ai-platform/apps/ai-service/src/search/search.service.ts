import { PrismaService } from '@ai-platform/database';
import { LoggerService } from '@ai-platform/shared';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OllamaEmbeddingService } from '../embeddings/embeddings.service';

export type SimilaritySearchResult = {
  id: string;
  content: string;
  title: string;
  similarity: number;
};

@Injectable()
export class SearchService {
  constructor(
    private readonly embeddingsService: OllamaEmbeddingService,
    private readonly prismaService: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async similaritySearch(query: string, limit = 6): Promise<SimilaritySearchResult[]> {
    this.logger.log(
      `Similarity search: queryLength=${query.length}, limit=${limit}`,
      'SearchService',
    );
    const embedding = await this.embeddingsService.generateEmbedding(query);
    const queryVector = `[${embedding.join(',')}]`;

    const rows = await this.prismaService.$queryRaw<SimilaritySearchResult[]>(
      Prisma.sql`
        WITH params AS (
          SELECT ${queryVector}::vector AS query_vector
        )
        SELECT
          c.id,
          c.content,
          d.title,
          1 - (c.embedding <=> params.query_vector::vector) AS similarity
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        CROSS JOIN params
        ORDER BY c.embedding <=> params.query_vector::vector
        LIMIT ${limit}
      `,
    );
    this.logger.log(`Similarity search done: rows=${rows.length}`, 'SearchService');
    return rows;
  }

  formatContext(chunks: SimilaritySearchResult[]): string {
    if (chunks.length === 0) {
      return 'Documentation context:';
    }

    const formattedChunks = chunks
      .map((chunk) => `[${chunk.title}]\n${chunk.content}\n---`)
      .join('\n');

    return `Documentation context:\n${formattedChunks}`;
  }
}
