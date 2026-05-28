import { PrismaService } from '@ai-platform/database';
import { LoggerService } from '@ai-platform/shared';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OllamaEmbeddingService } from '../embeddings/embeddings.service';
import { QueryNormalizer } from './query-normalizer';
import { rrfFuse } from './rrf';

export type SimilaritySearchResult = {
  id: string;
  content: string;
  title: string;
  similarity: number;
};

/** Rank metadata captured before slicing, used for top-3 logging. */
interface FusedRankEntry {
  id: string;
  vectorRank: number | null;
  lexicalRank: number | null;
  rrfScore: number;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly embeddingsService: OllamaEmbeddingService,
    private readonly prismaService: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async similaritySearch(
    query: string,
    limit = 6,
    filePathPrefix?: string,
  ): Promise<SimilaritySearchResult[]> {
    const { semantic, lexical } = QueryNormalizer.normalize(query);
    const isTag = QueryNormalizer.isTagQuery(query);

    const [vectorRows, lexicalRows] = await Promise.all([
      this.vectorSearch(semantic, 30, filePathPrefix),
      this.lexicalSearch(lexical, 30, filePathPrefix),
    ]);

    const fused = rrfFuse(vectorRows, lexicalRows, {
      k: 60,
      wVector: 1.0,
      wLexical: isTag ? 2.0 : 1.0,
    });

    this.logger.log(
      `Hybrid search: query="${lexical}", vectorRows=${vectorRows.length}, ` +
        `lexicalRows=${lexicalRows.length}, isTag=${isTag}, top3=${this.formatTop(fused, vectorRows, lexicalRows, 3)}`,
      'SearchService',
    );

    return fused.slice(0, limit);
  }

  private async vectorSearch(
    query: string,
    limit: number,
    filePathPrefix?: string,
  ): Promise<SimilaritySearchResult[]> {
    const embedding = await this.embeddingsService.generateEmbedding(query);
    const queryVector = `[${embedding.join(',')}]`;

    if (filePathPrefix) {
      return this.prismaService.$queryRaw<SimilaritySearchResult[]>(
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
          WHERE d.file_path LIKE ${filePathPrefix + '%'}
          ORDER BY c.embedding <=> params.query_vector::vector
          LIMIT ${limit}
        `,
      );
    }

    return this.prismaService.$queryRaw<SimilaritySearchResult[]>(
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
  }

  private async lexicalSearch(
    query: string,
    limit: number,
    filePathPrefix?: string,
  ): Promise<SimilaritySearchResult[]> {
    if (!query.trim()) return [];

    if (filePathPrefix) {
      return this.prismaService.$queryRaw<SimilaritySearchResult[]>(
        Prisma.sql`
          SELECT
            c.id,
            c.content,
            d.title,
            similarity(c.content, ${query}) AS similarity
          FROM chunks c
          JOIN documents d ON c.document_id = d.id
          WHERE c.content % ${query}
            AND d.file_path LIKE ${filePathPrefix + '%'}
          ORDER BY similarity(c.content, ${query}) DESC, c.id ASC
          LIMIT ${limit}
        `,
      );
    }

    return this.prismaService.$queryRaw<SimilaritySearchResult[]>(
      Prisma.sql`
        SELECT
          c.id,
          c.content,
          d.title,
          similarity(c.content, ${query}) AS similarity
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE c.content % ${query}
        ORDER BY similarity(c.content, ${query}) DESC, c.id ASC
        LIMIT ${limit}
      `,
    );
  }

  /**
   * Build a JSON-serialized array of the top-N fused entries including per-ranker
   * rank metadata. Used exclusively for INFO-level search observability logging.
   */
  private formatTop(
    fused: SimilaritySearchResult[],
    vectorRows: SimilaritySearchResult[],
    lexicalRows: SimilaritySearchResult[],
    n: number,
  ): string {
    const vectorRankMap = new Map<string, number>(vectorRows.map((r, i) => [r.id, i + 1]));
    const lexicalRankMap = new Map<string, number>(lexicalRows.map((r, i) => [r.id, i + 1]));

    const top: FusedRankEntry[] = fused.slice(0, n).map((r) => ({
      id: r.id,
      vectorRank: vectorRankMap.get(r.id) ?? null,
      lexicalRank: lexicalRankMap.get(r.id) ?? null,
      rrfScore: r.similarity,
    }));

    return JSON.stringify(top);
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
