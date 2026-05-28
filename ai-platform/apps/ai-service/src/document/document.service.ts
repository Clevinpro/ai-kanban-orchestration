import { PrismaService } from '@ai-platform/database';
import { LoggerService } from '@ai-platform/shared';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import { OllamaEmbeddingService } from '../embeddings/embeddings.service';

export const DOCUMENT_TYPE = {
  GUIDE: 'GUIDE',
  DOCUMENTATION: 'DOCUMENTATION',
} as const;

export type DocumentTypeValue = (typeof DOCUMENT_TYPE)[keyof typeof DOCUMENT_TYPE];

export type DocumentNotes = {
  id: string;
  title: string;
  notes: string | null;
  createdAt: Date;
  filePath: string | null;
};

@Injectable()
export class DocumentService {
  private static readonly CHUNK_SIZE = 500;
  private static readonly CHUNK_OVERLAP = 100;

  constructor(
    private readonly embeddingsService: OllamaEmbeddingService,
    private readonly prismaService: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async uploadDocument(
    filePath: string,
    title: string,
    filename = title,
  ): Promise<{ documentId: string; chunksCount: number; type: DocumentTypeValue }> {
    this.assertSupportedFile(filePath);

    this.logger.log(`Reading document: title="${title}"`, 'DocumentService');
    const text = await readFile(filePath, 'utf-8');
    const chunks = this.splitIntoChunks(text);
    const type = this.getDocumentType(filename);
    this.logger.log(`Split into ${chunks.length} chunk(s), storing document`, 'DocumentService');

    const documentId = await this.upsertDocument(filePath, title, text, type);
    this.logger.log(`Document row stored: id=${documentId}, type=${type}`, 'DocumentService');

    let chunkIndex = 0;
    for (const chunk of chunks) {
      chunkIndex += 1;
      this.logger.debug(`Embedding chunk ${chunkIndex}/${chunks.length}`, 'DocumentService');
      const embedding = await this.embeddingsService.generateEmbedding(chunk);

      await this.prismaService.$executeRaw(
        Prisma.sql`
          INSERT INTO "chunks" ("id", "content", "embedding", "document_id")
          VALUES (
            gen_random_uuid()::text,
            ${chunk},
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

    return { documentId, chunksCount: chunks.length, type };
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
        WHERE "type" = ${DOCUMENT_TYPE.DOCUMENTATION}::"DocumentType"
        ORDER BY "created_at" DESC
      `,
    );
  }

  splitIntoChunks(text: string): string[] {
    const normalized = text.trim();
    if (!normalized) {
      return [];
    }

    const chunks: string[] = [];
    const textLength = normalized.length;
    let start = 0;

    while (start < textLength) {
      let end = Math.min(start + DocumentService.CHUNK_SIZE, textLength);

      if (end < textLength) {
        const lastWhitespaceIndex = normalized.lastIndexOf(' ', end);
        if (lastWhitespaceIndex > start) {
          end = lastWhitespaceIndex;
        }
      }

      const chunk = normalized.slice(start, end).trim();
      if (chunk) {
        chunks.push(chunk);
      }

      if (end >= textLength) {
        break;
      }

      start = this.calculateNextStart(normalized, end);
    }

    return chunks;
  }

  private getDocumentType(filename: string): DocumentTypeValue {
    return filename === 'guide.md' ? DOCUMENT_TYPE.GUIDE : DOCUMENT_TYPE.DOCUMENTATION;
  }

  private async upsertDocument(
    filePath: string | null,
    title: string,
    text: string,
    type: DocumentTypeValue,
  ): Promise<string> {
    if (type !== DOCUMENT_TYPE.GUIDE) {
      const documentId = randomUUID();
      // Pass filePath as-is: vault files supply an absolute path; manual uploads
      // supply a temp path (which is deleted post-upload but harmless to store).
      await this.insertDocument(documentId, filePath, title, text, type);
      return documentId;
    }

    return this.prismaService.$transaction(async (transaction) => {
      const existingGuide = await transaction.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          SELECT "id"
          FROM "documents"
          WHERE "type" = ${DOCUMENT_TYPE.GUIDE}::"DocumentType"
          ORDER BY "created_at" ASC
          LIMIT 1
          FOR UPDATE
        `,
      );
      const existingGuideId = existingGuide[0]?.id;

      if (existingGuideId) {
        await transaction.$executeRaw(
          Prisma.sql`
            UPDATE "documents"
            SET
              "title" = ${title},
              "content" = ${text},
              "file_path" = ${filePath},
              "updated_at" = NOW()
            WHERE "id" = ${existingGuideId}
          `,
        );
        await transaction.$executeRaw(
          Prisma.sql`
            DELETE FROM "chunks"
            WHERE "document_id" = ${existingGuideId}
          `,
        );
        return existingGuideId;
      }

      const documentId = randomUUID();
      await this.insertDocument(documentId, filePath, title, text, type, transaction);
      return documentId;
    });
  }

  private async insertDocument(
    documentId: string,
    filePath: string | null,
    title: string,
    text: string,
    type: DocumentTypeValue,
    client: Prisma.TransactionClient | PrismaService = this.prismaService,
  ): Promise<void> {
    await client.$executeRaw(
      Prisma.sql`
        INSERT INTO "documents" ("id", "title", "content", "file_path", "type", "created_at", "updated_at")
        VALUES (${documentId}, ${title}, ${text}, ${filePath}, ${type}::"DocumentType", NOW(), NOW())
      `,
    );
  }

  private calculateNextStart(text: string, end: number): number {
    const overlapStart = Math.max(0, end - DocumentService.CHUNK_OVERLAP);

    if (!/\S/.test(text.charAt(overlapStart))) {
      return overlapStart;
    }

    const nextWhitespace = text.indexOf(' ', overlapStart);
    if (nextWhitespace === -1 || nextWhitespace >= end) {
      return overlapStart;
    }

    return nextWhitespace + 1;
  }

  private assertSupportedFile(filePath: string): void {
    const extension = extname(filePath).toLowerCase();
    const supportedExtensions = new Set(['.txt', '.md']);

    if (!supportedExtensions.has(extension)) {
      throw new Error(`Unsupported file extension "${extension}". Supported: .txt, .md`);
    }
  }
}
