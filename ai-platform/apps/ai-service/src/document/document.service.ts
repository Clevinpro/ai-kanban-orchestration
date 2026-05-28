import { PrismaService } from '@ai-platform/database';
import { LoggerService } from '@ai-platform/shared';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import { OllamaEmbeddingService } from '../embeddings/embeddings.service';

export type DocumentNotes = {
  id: string;
  title: string;
  notes: string | null;
  createdAt: Date;
  filePath: string | null;
};

export type ChunkResult = {
  content: string;
  section: string;
};

@Injectable()
export class DocumentService {
  private static readonly MAX_CHUNK_SIZE = 1200;
  private static readonly OVERLAP = 100;

  constructor(
    private readonly embeddingsService: OllamaEmbeddingService,
    private readonly prismaService: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async uploadDocument(
    filePath: string,
    title: string,
  ): Promise<{ documentId: string; chunksCount: number }> {
    this.assertSupportedFile(filePath);

    this.logger.log(`Reading document: title="${title}"`, 'DocumentService');
    const text = await readFile(filePath, 'utf-8');
    const chunks = this.splitIntoChunks(text);
    this.logger.log(`Split into ${chunks.length} chunk(s), storing document`, 'DocumentService');

    const documentId = await this.upsertDocument(filePath, title, text);
    this.logger.log(`Document row stored: id=${documentId}`, 'DocumentService');

    let chunkIndex = 0;
    for (const chunk of chunks) {
      chunkIndex += 1;
      this.logger.debug(`Embedding chunk ${chunkIndex}/${chunks.length}`, 'DocumentService');
      const prefixed = chunk.section
        ? `Section: ${chunk.section}\n${chunk.content}`
        : chunk.content;
      const embedding = await this.embeddingsService.generateEmbedding(prefixed.toLowerCase());

      await this.prismaService.$executeRaw(
        Prisma.sql`
          INSERT INTO "chunks" ("id", "content", "embedding", "document_id")
          VALUES (
            gen_random_uuid()::text,
            ${prefixed},
            ${`[${embedding.join(',')}]`}::vector,
            ${documentId}
          )
        `,
      );
    }

    this.logger.log(
      `Document indexed: id=${documentId}, chunks=${chunks.length}`,
      'DocumentService',
    );

    return { documentId, chunksCount: chunks.length };
  }

  async reindexAll(): Promise<{ documents: number; chunks: number; failed: number }> {
    const rows = await this.prismaService.$queryRaw<{ id: string; content: string }[]>(
      Prisma.sql`SELECT "id", "content" FROM "documents" ORDER BY "created_at" ASC`,
    );

    this.logger.log(`Reindex start: total=${rows.length}`, 'DocumentService');

    let totalChunks = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const { chunksCount } = await this.reindexDocument(row.id, row.content);
        totalChunks += chunksCount;
      } catch (err) {
        failed += 1;
        this.logger.error(
          `Reindex failed for document id=${row.id}: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
          'DocumentService',
        );
      }
    }

    this.logger.log(
      `Reindex done: documents=${rows.length}, chunks=${totalChunks}, failed=${failed}`,
      'DocumentService',
    );

    return { documents: rows.length, chunks: totalChunks, failed };
  }

  private async reindexDocument(
    documentId: string,
    content: string,
  ): Promise<{ chunksCount: number }> {
    const chunks = this.splitIntoChunks(content);

    // Build embeddings first (outside the transaction) to avoid holding a
    // transaction open across multiple Ollama HTTP calls.
    const embeddedChunks: { content: string; embedding: number[] }[] = [];
    for (let i = 0; i < chunks.length; i++) {
      this.logger.debug(
        `Reindex embedding chunk ${i + 1}/${chunks.length} for document id=${documentId}`,
        'DocumentService',
      );
      const { content, section } = chunks[i];
      const storedContent = section ? `Section: ${section}\n${content}` : content;
      const embedding = await this.embeddingsService.generateEmbedding(storedContent.toLowerCase());
      embeddedChunks.push({ content: storedContent, embedding });
    }

    // Atomic delete + insert using the interactive transaction form so that
    // if any insert fails after the delete, Prisma rolls back and old chunks survive.
    await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`DELETE FROM "chunks" WHERE "document_id" = ${documentId}`);
      for (const { content, embedding } of embeddedChunks) {
        await tx.$executeRaw(
          Prisma.sql`
            INSERT INTO "chunks" ("id", "content", "embedding", "document_id")
            VALUES (
              gen_random_uuid()::text,
              ${content},
              ${`[${embedding.join(',')}]`}::vector,
              ${documentId}
            )
          `,
        );
      }
    });

    return { chunksCount: embeddedChunks.length };
  }

  async getDocumentationNotes(): Promise<DocumentNotes[]> {
    return this.prismaService.$queryRaw<DocumentNotes[]>(
      Prisma.sql`
        SELECT
          "id",
          "title",
          "notes",
          "created_at" AS "createdAt",
          "file_path" AS "filePath"
        FROM "documents"
        ORDER BY "created_at" DESC
      `,
    );
  }

  splitIntoChunks(text: string): ChunkResult[] {
    const normalized = text.trim();
    if (!normalized) {
      return [];
    }

    const lines = normalized.split('\n');
    const HEADING_RE = /^#{1,6}\s+(.+)$/;
    const NUMBERED_RE = /^\d+\.\s+/;

    const blocks: { header: string; body: string[] }[] = [];
    let currentHeader = '';
    let currentBody: string[] = [];

    for (const line of lines) {
      const headingMatch = HEADING_RE.exec(line);
      const isNumbered = NUMBERED_RE.test(line);

      if (headingMatch || isNumbered) {
        // Flush the current block before opening a new one.
        if (currentBody.length > 0 || currentHeader) {
          blocks.push({ header: currentHeader, body: currentBody });
        }
        if (headingMatch) {
          // Heading opens a new section; the heading line is NOT included in the body.
          currentHeader = headingMatch[1].trim();
          currentBody = [];
        } else {
          // Numbered-list item: the first line becomes the section; body starts with that line.
          currentHeader = line.trim();
          currentBody = [line];
        }
      } else {
        currentBody.push(line);
      }
    }

    // Flush the final block.
    if (currentBody.length > 0 || currentHeader) {
      blocks.push({ header: currentHeader, body: currentBody });
    }

    return this.normalizeBlocks(blocks);
  }

  /**
   * Coalesces undersized adjacent blocks and splits oversized blocks at whitespace
   * boundaries with OVERLAP chars carried over to the next split chunk.
   */
  private normalizeBlocks(blocks: { header: string; body: string[] }[]): ChunkResult[] {
    const MAX = DocumentService.MAX_CHUNK_SIZE;
    const OVERLAP = DocumentService.OVERLAP;

    // Convert each block to a { content, section } pair.
    const raw: ChunkResult[] = blocks
      .map((b) => ({
        content: b.body.join('\n').trim(),
        section: b.header,
      }))
      .filter((c) => c.content.length > 0);

    if (raw.length === 0) {
      return [];
    }

    // Phase 1: split oversized chunks at whitespace boundaries.
    const afterSplit: ChunkResult[] = [];
    for (const chunk of raw) {
      if (chunk.content.length <= MAX) {
        afterSplit.push(chunk);
        continue;
      }
      // Split at whitespace with overlap.
      let start = 0;
      const text = chunk.content;
      while (start < text.length) {
        let end = Math.min(start + MAX, text.length);
        if (end < text.length) {
          const lastWs = text.lastIndexOf(' ', end);
          if (lastWs > start) {
            end = lastWs;
          }
        }
        const piece = text.slice(start, end).trim();
        if (piece) {
          afterSplit.push({ content: piece, section: chunk.section });
        }
        if (end >= text.length) {
          break;
        }
        // Overlap: step back by OVERLAP chars, then advance past any leading whitespace.
        const overlapStart = Math.max(0, end - OVERLAP);
        const nextWs = text.indexOf(' ', overlapStart);
        start = nextWs !== -1 && nextWs < end ? nextWs + 1 : overlapStart;
      }
    }

    // Phase 2: coalesce adjacent undersized chunks that share the same section
    // (or where the earlier chunk has no section yet).
    const result: ChunkResult[] = [];
    let pending: ChunkResult | null = null;

    for (const chunk of afterSplit) {
      if (!pending) {
        pending = { ...chunk };
        continue;
      }

      const combined: string = pending.content + '\n' + chunk.content;
      const sameSection = pending.section === chunk.section || !pending.section || !chunk.section;
      if (combined.length <= MAX && sameSection) {
        // Merge: keep the first non-empty section.
        pending = {
          content: combined,
          section: pending.section || chunk.section,
        };
      } else {
        result.push(pending);
        pending = { ...chunk };
      }
    }

    if (pending) {
      result.push(pending);
    }

    // Final filter: remove whitespace-only content.
    return result.filter((c) => c.content.trim().length > 0);
  }

  private async upsertDocument(
    filePath: string | null,
    title: string,
    text: string,
  ): Promise<string> {
    const documentId = randomUUID();
    // Pass filePath as-is: vault files supply an absolute path; manual uploads
    // supply a temp path (which is deleted post-upload but harmless to store).
    await this.insertDocument(documentId, filePath, title, text);
    return documentId;
  }

  private async insertDocument(
    documentId: string,
    filePath: string | null,
    title: string,
    text: string,
    client: Prisma.TransactionClient | PrismaService = this.prismaService,
  ): Promise<void> {
    await client.$executeRaw(
      Prisma.sql`
        INSERT INTO "documents" ("id", "title", "content", "file_path", "created_at", "updated_at")
        VALUES (${documentId}, ${title}, ${text}, ${filePath}, NOW(), NOW())
      `,
    );
  }

  private assertSupportedFile(filePath: string): void {
    const extension = extname(filePath).toLowerCase();
    const supportedExtensions = new Set(['.txt', '.md']);

    if (!supportedExtensions.has(extension)) {
      throw new Error(`Unsupported file extension "${extension}". Supported: .txt, .md`);
    }
  }
}
