import { PrismaService } from '@ai-platform/database';
import { LoggerService } from '@ai-platform/shared';
import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { stat } from 'fs/promises';
import { glob } from 'glob';
import { join, resolve } from 'path';
import { DocumentService } from '../document/document.service';

const VAULT_PREFIX = 'docs/obsidian-vault/';

// Sentinel used to protect digit-hyphen-digit sequences during title derivation
// so that date segments (e.g. "2026-05-26") survive the word split.
// Must not appear in any valid file-system path AND must not match [/_-]
// (the characters used in the split regex).  U+2060 WORD JOINER is invisible,
// printable-safe, and cannot appear in any OS file-system path.
const DIGIT_HYPHEN_PLACEHOLDER = '⁠';

interface VaultDocument {
  id: string;
  filePath: string;
  updatedAt: Date;
}

@Injectable()
export class VaultSyncService implements OnModuleInit {
  private indexed = 0;
  private lastSync: string | null = null;

  constructor(
    private readonly documentService: DocumentService,
    private readonly prismaService: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    // Non-blocking: do not await — ai-service boots even if Ollama is unavailable.
    void this.runStartupScan();
  }

  getStatus(): { indexed: number; lastSync: string } {
    return {
      indexed: this.indexed,
      lastSync: this.lastSync ?? 'never',
    };
  }

  /**
   * Upserts a single vault file into the documents table.
   * Called by VaultController on POST /vault/sync.
   *
   * The filePath must resolve within the vault directory. Paths that escape
   * the vault root (e.g. via "../..") are rejected with 400 Bad Request.
   */
  async syncFile(filePath: string): Promise<{ documentId: string; chunksCount: number }> {
    this.assertWithinVault(filePath);
    const result = await this.upsertFile(filePath);
    this.lastSync = new Date().toISOString();
    return result;
  }

  /**
   * Validates that the supplied path resolves within the vault directory.
   * Throws BadRequestException for any path that escapes the vault root.
   */
  /**
   * Returns the absolute path to the vault root.
   * Prefers VAULT_PATH env var (set in .env for sub-directory launches).
   * Falls back to process.cwd() + VAULT_PREFIX (works when cwd = monorepo root).
   * Read live from process.env so tests can override without module reload.
   */
  private get vaultRoot(): string {
    return process.env['VAULT_PATH'] ?? resolve(process.cwd(), VAULT_PREFIX);
  }

  private assertWithinVault(filePath: string): void {
    const vaultRoot = this.vaultRoot;
    // Resolve relative paths against vault root; absolute paths resolve as-is.
    const resolved = filePath.startsWith('/')
      ? resolve(filePath)
      : resolve(process.cwd(), filePath);

    if (!resolved.startsWith(vaultRoot + '/') && resolved !== vaultRoot) {
      throw new BadRequestException(
        `filePath must resolve within the vault directory (${vaultRoot})`,
      );
    }
  }

  private async runStartupScan(): Promise<void> {
    try {
      this.logger.log('VaultSyncService: starting vault scan', 'VaultSyncService');

      const pattern = join(this.vaultRoot, '**/*.md').replace(/\\/g, '/');

      const files = await glob(pattern);
      this.logger.log(
        `VaultSyncService: found ${files.length} markdown file(s)`,
        'VaultSyncService',
      );

      for (const absolutePath of files) {
        try {
          await this.upsertFile(absolutePath);
          // Result discarded during startup scan — indexed counter is maintained inside upsertFile.
        } catch (fileError) {
          this.logger.error(
            fileError instanceof Error ? fileError.message : String(fileError),
            fileError instanceof Error ? fileError.stack : undefined,
            'VaultSyncService',
          );
        }
      }

      this.lastSync = new Date().toISOString();
      this.logger.log(
        `VaultSyncService: scan complete — indexed=${this.indexed}, lastSync=${this.lastSync}`,
        'VaultSyncService',
      );
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error.stack : undefined,
        'VaultSyncService',
      );
    }
  }

  private async upsertFile(
    absolutePath: string,
  ): Promise<{ documentId: string; chunksCount: number }> {
    const fileStat = await stat(absolutePath);
    const mtime = fileStat.mtime;

    // Normalise the stored filePath to use forward slashes for consistent DB lookups.
    const storedPath = absolutePath.replace(/\\/g, '/');

    const existing = await this.findDocumentByFilePath(storedPath);

    if (!existing) {
      // New file — index it.
      const title = this.deriveTitle(storedPath);
      this.logger.log(
        `VaultSyncService: indexing new file "${title}" (${storedPath})`,
        'VaultSyncService',
      );
      const result = await this.documentService.uploadDocument(storedPath, title);
      // Only count genuinely new documents toward the indexed total.
      this.indexed += 1;
      return { documentId: result.documentId, chunksCount: result.chunksCount };
    }

    if (mtime > existing.updatedAt) {
      // Stale file — upload the new version first so that if uploadDocument
      // fails, the existing record remains intact (no data loss).
      const title = this.deriveTitle(storedPath);
      this.logger.log(
        `VaultSyncService: re-indexing stale file id=${existing.id} (${storedPath})`,
        'VaultSyncService',
      );

      const result = await this.documentService.uploadDocument(storedPath, title);

      // Upload succeeded — now atomically delete the old chunks and document row.
      await this.prismaService.$transaction([
        this.prismaService.$executeRaw(
          Prisma.sql`DELETE FROM "chunks" WHERE "document_id" = ${existing.id}`,
        ),
        this.prismaService.$executeRaw(
          Prisma.sql`DELETE FROM "documents" WHERE "id" = ${existing.id}`,
        ),
      ]);

      // Do NOT increment this.indexed — the document was already counted on
      // first-time indexing and re-indexing does not add a net new document.
      return { documentId: result.documentId, chunksCount: result.chunksCount };
    }

    // File is already up-to-date — return existing document info.
    return { documentId: existing.id, chunksCount: 0 };
  }

  private async findDocumentByFilePath(filePath: string): Promise<VaultDocument | null> {
    const rows = await this.prismaService.$queryRaw<VaultDocument[]>(
      Prisma.sql`
        SELECT "id", "file_path" AS "filePath", "updated_at" AS "updatedAt"
        FROM "documents"
        WHERE "file_path" = ${filePath}
        LIMIT 1
      `,
    );
    return rows[0] ?? null;
  }

  /**
   * Derives a human-readable title from a vault file path.
   *
   * Example: "…/docs/obsidian-vault/commits/2026-05-26-abc1234.md"
   *   → relative "commits/2026-05-26-abc1234"
   *   → title    "Commit 2026-05-26 abc1234"
   *
   * Rules:
   *  - Strip the vault prefix and ".md" extension.
   *  - Replace "/" and "_" with spaces.
   *  - Replace hyphens with spaces UNLESS the hyphen is between two digit
   *    characters (i.e. inside a date segment like "2026-05-26").
   *  - Title-case each space-separated word.
   */
  private deriveTitle(filePath: string): string {
    const prefixIndex = filePath.indexOf(VAULT_PREFIX);
    const relative =
      prefixIndex !== -1
        ? filePath.slice(prefixIndex + VAULT_PREFIX.length)
        : (filePath.split('/').pop() ?? filePath);

    // Remove .md extension.
    const withoutExt = relative.endsWith('.md') ? relative.slice(0, -3) : relative;

    // Protect digit-digit hyphens (date separators) with a printable ASCII
    // placeholder that cannot appear in file paths so they survive the split.
    const protected_ = withoutExt.replace(/(\d)-(\d)/g, `$1${DIGIT_HYPHEN_PLACEHOLDER}$2`);

    // Split on slashes, remaining hyphens, and underscores.
    const words = protected_.split(/[/_-]+/).filter(Boolean);

    return words
      .map((word) => {
        // Restore protected hyphens before title-casing.
        const restored = word.replace(new RegExp(DIGIT_HYPHEN_PLACEHOLDER, 'g'), '-');
        return restored.charAt(0).toUpperCase() + restored.slice(1);
      })
      .join(' ');
  }
}
