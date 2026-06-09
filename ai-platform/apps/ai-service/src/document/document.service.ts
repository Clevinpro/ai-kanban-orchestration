import { PrismaService } from '@ai-platform/database';
import { IAIProvider, LoggerService } from '@ai-platform/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import { lastValueFrom, timeout, toArray } from 'rxjs';
import { AiProviderFactory } from '../ai/providers/ai-provider.factory';
import { EmbeddingProviderFactory } from '../embeddings/providers/embedding-provider.factory';
import { EmbeddingProvider } from '../embeddings/providers/embedding-provider.interface';

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

/** Document indexing lifecycle status. */
export type DocumentStatus = 'pending' | 'indexing' | 'ready' | 'failed';

@Injectable()
export class DocumentService {
  private static readonly MAX_CHUNK_SIZE = 1200;
  private static readonly OVERLAP = 100;
  private static readonly DEFAULT_CONTEXT_CONCURRENCY = 4;
  private static readonly DEFAULT_BACKGROUND_INDEX_CONCURRENCY = 2;
  private static readonly DEFAULT_CONTEXT_WINDOW_CHARS = 2000;
  private static readonly DEFAULT_CONTEXT_LLM_TIMEOUT_MS = 15000;

  /**
   * In-process gate bounding how many background indexing jobs run at once.
   * Simultaneous uploads (or a full reindex) queue here instead of flooding the
   * LLM / DB. Sized lazily from config on first use.
   */
  private backgroundSlots: number | null = null;
  private activeBackgroundJobs = 0;
  private readonly backgroundQueue: Array<() => void> = [];

  constructor(
    private readonly embeddingProviderFactory: EmbeddingProviderFactory,
    private readonly prismaService: PrismaService,
    private readonly logger: LoggerService,
    private readonly aiProviderFactory: AiProviderFactory,
    private readonly configService: ConfigService,
  ) {}

  private get embeddings(): EmbeddingProvider {
    return this.embeddingProviderFactory.getProvider();
  }

  /**
   * Whether Contextual Retrieval is enabled. Defaults to `true`; only the literal
   * string `false` disables it so a misconfigured value keeps the safer behaviour.
   */
  private get contextualRetrievalEnabled(): boolean {
    const raw = this.configService.get<string>('CONTEXTUAL_RETRIEVAL_ENABLED');
    return String(raw ?? 'true').toLowerCase() !== 'false';
  }

  /**
   * Max number of concurrent context-generation LLM calls. Bounded so a local
   * LLM is not overwhelmed during a full vault reindex. Defaults to 4.
   */
  private get contextConcurrency(): number {
    const raw = this.configService.get<string>('CONTEXTUAL_RETRIEVAL_CONCURRENCY');
    const parsed = Number.parseInt(String(raw ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DocumentService.DEFAULT_CONTEXT_CONCURRENCY;
  }

  /**
   * Size (in characters) of the context-prompt window built around each chunk.
   * Instead of embedding the whole document in every per-chunk context prompt
   * (cost `O(chunks × documentLength)`), a window of this many chars centred on
   * the chunk is used (cost `O(chunks × window)`). When the whole document
   * already fits within this budget, the whole document is used unchanged.
   * Reads `CONTEXT_WINDOW_CHARS`; defaults to 2000.
   */
  private get contextWindowChars(): number {
    const raw = this.configService.get<string>('CONTEXT_WINDOW_CHARS');
    const parsed = Number.parseInt(String(raw ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DocumentService.DEFAULT_CONTEXT_WINDOW_CHARS;
  }

  /**
   * Per-chunk timeout (in milliseconds) for the context-generation LLM call. A
   * single slow / looping generation is aborted at this bound so it falls back
   * to heading-context (logged `warn`) instead of stalling the whole document's
   * indexing. Reads `CONTEXT_LLM_TIMEOUT_MS`; defaults to 15000.
   */
  private get contextLlmTimeoutMs(): number {
    const raw = this.configService.get<string>('CONTEXT_LLM_TIMEOUT_MS');
    const parsed = Number.parseInt(String(raw ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DocumentService.DEFAULT_CONTEXT_LLM_TIMEOUT_MS;
  }

  /**
   * Max number of background indexing jobs allowed to run concurrently. Bounds
   * the in-process runner so simultaneous uploads / a full reindex do not flood
   * the LLM or DB. Reads `BACKGROUND_INDEX_CONCURRENCY`, falling back to the
   * existing `CONTEXTUAL_RETRIEVAL_CONCURRENCY`, then to the default (2).
   */
  private get backgroundIndexConcurrency(): number {
    const raw =
      this.configService.get<string>('BACKGROUND_INDEX_CONCURRENCY') ??
      this.configService.get<string>('CONTEXTUAL_RETRIEVAL_CONCURRENCY');
    const parsed = Number.parseInt(String(raw ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DocumentService.DEFAULT_BACKGROUND_INDEX_CONCURRENCY;
  }

  /** Active embedding provider name (best-effort, for log correlation only). */
  private get embedProviderName(): string {
    return (this.configService.get<string>('EMBEDDING_PROVIDER') ?? 'ollama').toLowerCase();
  }

  /** Active embedding model id (best-effort, for log correlation only). */
  private get embedModelName(): string | undefined {
    const provider = this.embedProviderName;
    if (provider === 'openai') {
      return this.configService.get<string>('OPENAI_EMBEDDING_MODEL');
    }
    if (provider === 'lmstudio') {
      return this.configService.get<string>('LMSTUDIO_EMBEDDING_MODEL');
    }
    return this.configService.get<string>('OLLAMA_EMBEDDING_MODEL');
  }

  /** Active chat (context-generation) provider name (best-effort, for logs). */
  private get chatProviderName(): string {
    return (this.configService.get<string>('AI_PROVIDER') ?? 'ollama').toLowerCase();
  }

  /** Active chat (context-generation) model id (best-effort, for logs). */
  private get chatModelName(): string | undefined {
    const provider = this.chatProviderName;
    if (provider === 'claude') {
      return this.configService.get<string>('CLAUDE_MODEL');
    }
    if (provider === 'lmstudio') {
      return this.configService.get<string>('LMSTUDIO_CHAT_MODEL');
    }
    return this.configService.get<string>('OLLAMA_CHAT_MODEL');
  }

  /**
   * Emits a `STEP {n}/{total}: {label}` log line with the step parameters in the
   * structured `meta` arg (never string-concatenated). High-level steps use
   * `log`; per-chunk detail uses `debug`. `meta` carries lengths/counts only.
   */
  private logStep(
    n: number,
    total: number,
    label: string,
    meta: Record<string, unknown>,
    level: 'log' | 'debug' = 'log',
  ): void {
    this.logger[level](`STEP ${n}/${total}: ${label}`, 'DocumentService', meta);
  }

  /**
   * Fast path: validate the file and store the `Document` row with
   * `status='pending'`. No chunking / context-gen / embedding happens here, so
   * this returns in well under a second and the controller can reply `202`
   * immediately. The heavy work is run separately by {@link indexDocument}.
   */
  async registerDocument(
    filePath: string,
    title: string,
  ): Promise<{ documentId: string; status: DocumentStatus }> {
    const operation = 'upload';

    // STEP 1/7 — validate file (no documentId yet; correlate by filePath).
    this.logStep(1, 7, 'validate file', {
      operation,
      filePath,
      ext: extname(filePath).toLowerCase(),
    });
    this.assertSupportedFile(filePath);

    const text = await readFile(filePath, 'utf-8');
    // STEP 2/7 — read file (existing message kept, STEP prefix + meta added).
    this.logger.log(`STEP 2/7: Reading document: title="${title}"`, 'DocumentService', {
      operation,
      title,
      textLength: text.length,
    });

    const documentId = await this.upsertDocument(filePath, title, text);
    // STEP 4/7 — store document row (existing message kept).
    this.logger.log(`STEP 4/7: Document row stored: id=${documentId}`, 'DocumentService', {
      documentId,
      operation,
      title,
      status: 'pending',
    });

    return { documentId, status: 'pending' };
  }

  /**
   * Heavy path: chunk + context-gen + embed + insert for an already-registered
   * document. Drives the status lifecycle: `indexing` on start, `ready` on
   * success, `failed` (logged at `error`) on an unrecoverable error (embed /
   * insert). A per-chunk context fallback is NOT a failure — only embed/insert
   * errors mark the document `failed`.
   *
   * Reads the stored document content by id so the background runner needs only
   * the id; throws when the document row no longer exists.
   */
  async indexDocument(documentId: string): Promise<{ documentId: string; chunksCount: number }> {
    const operation = 'upload';
    const startedAt = Date.now();

    try {
      await this.setStatus(documentId, 'indexing');

      const text = await this.getDocumentContent(documentId);
      const chunks = this.splitIntoChunks(text);
      // STEP 3/7 — split into chunks (existing message kept).
      this.logger.log(`STEP 3/7: Split into ${chunks.length} chunk(s)`, 'DocumentService', {
        documentId,
        operation,
        textLength: text.length,
        chunkCount: chunks.length,
      });

      // STEP 5/7 — generate the per-chunk contextual prefix (bounded concurrency,
      // graceful fallback) BEFORE embedding so both the stored content and the
      // embedded text are the contextualized text. Per-chunk detail logs at debug.
      const contextualized = await this.contextualizeChunks(chunks, text, documentId, operation);

      // STEP 6/7 — embed all contextualized chunks in a single batch call.
      // Contextualization is already complete for the whole document at this
      // point, so batching the embeddings keeps the heavier index path fast.
      this.logger.debug(
        `STEP 6/7: Batch embedding ${contextualized.length} chunk(s)`,
        'DocumentService',
        {
          documentId,
          operation,
          embedProvider: this.embedProviderName,
          embedModel: this.embedModelName,
          batchSize: contextualized.length,
        },
      );
      const embeddings = await this.embeddings.generateBatch(contextualized);

      let insertedCount = 0;
      for (let i = 0; i < contextualized.length; i++) {
        const stored = contextualized[i];
        const embedding = embeddings[i];

        await this.prismaService.$executeRaw(
          Prisma.sql`
            INSERT INTO "chunks" ("id", "content", "embedding", "document_id")
            VALUES (
              gen_random_uuid()::text,
              ${stored},
              ${`[${embedding.join(',')}]`}::vector,
              ${documentId}
            )
          `,
        );
        insertedCount += 1;
      }

      await this.setStatus(documentId, 'ready');

      // STEP 7/7 — insert + done (existing message kept, STEP prefix + meta added).
      this.logger.log(
        `STEP 7/7: Document indexed: id=${documentId}, chunks=${chunks.length}`,
        'DocumentService',
        {
          documentId,
          operation,
          count: insertedCount,
          chunksCount: chunks.length,
          status: 'ready',
          durationMs: Date.now() - startedAt,
        },
      );

      return { documentId, chunksCount: chunks.length };
    } catch (err) {
      // Unrecoverable failure (embed / insert / missing row) — mark failed and
      // log at error. The per-chunk context fallback never reaches here.
      await this.setStatusSafe(documentId, 'failed');
      this.logger.error(
        `Indexing failed for document id=${documentId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
        'DocumentService',
      );
      throw err;
    }
  }

  /**
   * Synchronous register + index in one await chain. Kept for callers that must
   * know the final `chunksCount` before proceeding (e.g. `VaultSyncService`,
   * which deletes the previous document only after the new one is fully indexed).
   * The async upload path (controller) uses {@link registerDocument} +
   * {@link scheduleIndexing} instead so the request returns before indexing runs.
   */
  async uploadDocument(
    filePath: string,
    title: string,
  ): Promise<{ documentId: string; chunksCount: number }> {
    const { documentId } = await this.registerDocument(filePath, title);
    return this.indexDocument(documentId);
  }

  /**
   * Schedules background indexing for an already-registered document, bounded by
   * {@link backgroundIndexConcurrency}. Returns immediately; the returned promise
   * resolves when the job (eventually) completes and is intended for tests — the
   * request handler MUST NOT await it. Errors are swallowed here (already logged
   * at `error` and reflected as `status='failed'` inside {@link indexDocument}).
   */
  scheduleIndexing(documentId: string): Promise<void> {
    return this.runBackground(async () => {
      try {
        await this.indexDocument(documentId);
      } catch {
        // Already logged + status='failed' in indexDocument; swallow so an
        // unhandled rejection never escapes the detached background job.
      }
    });
  }

  /**
   * Bounded background runner: acquires a slot (queuing when all are taken),
   * runs the task, then releases the slot to the next queued task. Keeps at most
   * {@link backgroundIndexConcurrency} tasks in flight across all uploads.
   */
  private async runBackground(task: () => Promise<void>): Promise<void> {
    await this.acquireSlot();
    try {
      await task();
    } finally {
      this.releaseSlot();
    }
  }

  private acquireSlot(): Promise<void> {
    if (this.backgroundSlots === null) {
      this.backgroundSlots = this.backgroundIndexConcurrency;
    }
    if (this.activeBackgroundJobs < this.backgroundSlots) {
      this.activeBackgroundJobs += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.backgroundQueue.push(() => {
        this.activeBackgroundJobs += 1;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.activeBackgroundJobs -= 1;
    const next = this.backgroundQueue.shift();
    if (next) {
      next();
    }
  }

  async reindexAll(): Promise<{ documents: number; chunks: number; failed: number }> {
    const rows = await this.prismaService.$queryRaw<{ id: string; content: string }[]>(
      Prisma.sql`SELECT "id", "content" FROM "documents" ORDER BY "created_at" ASC`,
    );

    this.logger.log(`Reindex start: total=${rows.length}`, 'DocumentService', {
      operation: 'reindex',
      total: rows.length,
    });

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
      {
        operation: 'reindex',
        documents: rows.length,
        chunksCount: totalChunks,
        failed,
      },
    );

    return { documents: rows.length, chunks: totalChunks, failed };
  }

  private async reindexDocument(
    documentId: string,
    content: string,
  ): Promise<{ chunksCount: number }> {
    const operation = 'reindex';
    const startedAt = Date.now();

    const chunks = this.splitIntoChunks(content);
    // STEP 3/7 — split into chunks (reindex skips read (2) + store row (4)).
    this.logger.log(`STEP 3/7: Split into ${chunks.length} chunk(s)`, 'DocumentService', {
      documentId,
      operation,
      textLength: content.length,
      chunkCount: chunks.length,
    });

    // STEP 5/7 — generate the contextual prefix per chunk (bounded concurrency,
    // graceful fallback) so the stored + embedded text is the contextualized
    // text. Per-chunk detail logs at debug.
    const contextualized = await this.contextualizeChunks(chunks, content, documentId, operation);

    // STEP 6/7 — build embeddings first (outside the transaction) to avoid
    // holding a transaction open across the embedding HTTP call.
    // Contextualization is already complete, so embed every chunk in one batch.
    this.logger.debug(
      `STEP 6/7: Reindex batch embedding ${contextualized.length} chunk(s) for document id=${documentId}`,
      'DocumentService',
      {
        documentId,
        operation,
        embedProvider: this.embedProviderName,
        embedModel: this.embedModelName,
        batchSize: contextualized.length,
      },
    );
    const embeddings = await this.embeddings.generateBatch(contextualized);
    const embeddedChunks: { content: string; embedding: number[] }[] = contextualized.map(
      (content, i) => ({ content, embedding: embeddings[i] }),
    );

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

    // STEP 7/7 — insert + done.
    this.logStep(7, 7, 'insert + done', {
      documentId,
      operation,
      count: embeddedChunks.length,
      chunksCount: embeddedChunks.length,
      durationMs: Date.now() - startedAt,
    });

    return { chunksCount: embeddedChunks.length };
  }

  /**
   * Builds the contextualized text for every chunk (the string that is BOTH
   * stored as `content` and fed to the embedder).
   *
   * When `CONTEXTUAL_RETRIEVAL_ENABLED` is on, an LLM writes a ≤2-sentence
   * context per chunk (prompted with the WHOLE document + the chunk), bounded by
   * `CONTEXTUAL_RETRIEVAL_CONCURRENCY`. The result is `"{context}\n\n{chunkBody}"`.
   *
   * When disabled (or when context generation fails for a chunk), the heading is
   * used as the context — `"{heading}\n{chunkBody}"` — or, when there is no
   * heading, the raw chunk body. The upload/reindex never fails on a context error.
   */
  private async contextualizeChunks(
    chunks: ChunkResult[],
    wholeDocument: string,
    documentId: string,
    operation: 'upload' | 'reindex',
  ): Promise<string[]> {
    if (!this.contextualRetrievalEnabled) {
      return chunks.map((chunk) => this.headingFallback(chunk));
    }

    let provider: IAIProvider;
    try {
      provider = this.aiProviderFactory.getProvider();
    } catch (err) {
      // Provider misconfigured / unavailable — fall back to heading-as-context
      // for every chunk rather than failing the whole operation.
      this.logger.warn(
        `Contextual retrieval disabled for document id=${documentId}: provider unavailable (${err instanceof Error ? err.message : String(err)})`,
        'DocumentService',
      );
      return chunks.map((chunk) => this.headingFallback(chunk));
    }

    const chunkTotal = chunks.length;
    return this.mapWithConcurrency(chunks, this.contextConcurrency, async (chunk, index) => {
      // STEP 5/7 — per-chunk context generation (debug; lengths/counts only).
      this.logStep(
        5,
        7,
        'generate context',
        {
          documentId,
          operation,
          chunkIndex: index,
          chunkTotal,
          section: chunk.section,
          contentLength: chunk.content.length,
          llmProvider: this.chatProviderName,
          llmModel: this.chatModelName,
        },
        'debug',
      );
      const context = await this.generateContext(provider, wholeDocument, chunk, documentId, index);
      if (context) {
        return `${context}\n\n${chunk.content}`;
      }
      // No usable context (empty result or failure) → heading fallback.
      return this.headingFallback(chunk);
    });
  }

  /**
   * Heading-as-context fallback: `"{heading}\n{body}"`, or the bare body when the
   * chunk has no heading. No English literal is injected (see SPEC AC-11).
   */
  private headingFallback(chunk: ChunkResult): string {
    return chunk.section ? `${chunk.section}\n${chunk.content}` : chunk.content;
  }

  /**
   * Generates a ≤2-sentence context for one chunk via the chat LLM. The chat
   * stream is FULLY accumulated into one string before use. Returns an empty
   * string (and logs at `warn`) on any error so the caller falls back gracefully.
   */
  private async generateContext(
    provider: IAIProvider,
    wholeDocument: string,
    chunk: ChunkResult,
    documentId: string,
    index: number,
  ): Promise<string> {
    try {
      const promptDoc = this.windowAroundChunk(wholeDocument, chunk.content);
      const prompt = this.buildContextPrompt(promptDoc, chunk.content);
      // Bound the per-chunk LLM call: a hung / looping provider emits a
      // `TimeoutError`, which the surrounding catch turns into the heading
      // fallback (warn) so one slow chunk never stalls the whole document.
      const parts = await lastValueFrom(
        provider.chat(prompt).pipe(timeout(this.contextLlmTimeoutMs), toArray()),
      );
      return parts.join('').trim();
    } catch (err) {
      this.logger.warn(
        `Context generation failed for document id=${documentId} chunk ${index + 1}; indexing without context: ${err instanceof Error ? err.message : String(err)}`,
        'DocumentService',
      );
      return '';
    }
  }

  /**
   * Builds the bounded context window fed into the context prompt for one chunk.
   *
   * When the whole document fits within `CONTEXT_WINDOW_CHARS`, the whole
   * document is returned unchanged (behaviour identical to the pre-window code).
   * Otherwise a window of `CONTEXT_WINDOW_CHARS` characters centred on the
   * chunk's location in the document is returned, clamped to document bounds, so
   * context cost is `O(chunks × window)` rather than `O(chunks × documentLength)`.
   *
   * The chunk's offset is located via `indexOf(chunkBody)`; if the chunk body is
   * not found verbatim (e.g. trimmed/overlapped), the window is taken from the
   * start of the document so a window is always produced.
   */
  private windowAroundChunk(wholeDocument: string, chunkBody: string): string {
    const window = this.contextWindowChars;
    if (wholeDocument.length <= window) {
      return wholeDocument;
    }

    const chunkStart = wholeDocument.indexOf(chunkBody);
    // Centre the window on the middle of the chunk when locatable; otherwise
    // anchor at the document start.
    const centre =
      chunkStart >= 0 ? chunkStart + Math.floor(chunkBody.length / 2) : Math.floor(window / 2);

    const half = Math.floor(window / 2);
    let start = centre - half;
    let end = start + window;

    // Clamp to document bounds, preserving the full window size when possible.
    if (start < 0) {
      start = 0;
      end = window;
    }
    if (end > wholeDocument.length) {
      end = wholeDocument.length;
      start = Math.max(0, end - window);
    }

    return wholeDocument.slice(start, end);
  }

  /**
   * Anthropic Contextual Retrieval prompt: the context window (whole document
   * when it fits within `CONTEXT_WINDOW_CHARS`, otherwise a bounded window
   * around the chunk) plus the chunk, instructed to answer in the document's own
   * language, situate the chunk, add no new facts, and output only the context
   * sentences.
   */
  private buildContextPrompt(wholeDocument: string, chunkBody: string): string {
    return [
      'Here is a document:',
      `<document>${this.escapeForPrompt(wholeDocument)}</document>`,
      '',
      'Here is a chunk from it:',
      `<chunk>${this.escapeForPrompt(chunkBody)}</chunk>`,
      '',
      'Write 1-2 short sentences, in the same language as the document, that situate this',
      'chunk within the document so it can be understood on its own. Add no new facts.',
      'Output only the context sentences.',
    ].join('\n');
  }

  /**
   * Neutralizes angle brackets in content interpolated into the tag-delimited
   * context prompt so tag-shaped text (e.g. `<highlight>`, `<note>`, or a stray
   * `</document>`) cannot close or inject the `<document>` / `<chunk>`
   * delimiters. Only `<` and `>` are escaped (to their HTML entities), leaving
   * the rest of the text — and therefore the meaning the LLM reasons over —
   * unchanged.
   */
  private escapeForPrompt(text: string): string {
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Maps `items` through `worker` with at most `limit` in-flight calls at once,
   * preserving input order in the result array. Used to bound concurrent
   * context-generation LLM calls during a full vault reindex.
   */
  private async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;

    const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      while (cursor < items.length) {
        const current = cursor;
        cursor += 1;
        results[current] = await worker(items[current], current);
      }
    });

    await Promise.all(runners);
    return results;
  }

  /**
   * Reads the indexing status for a document by id. `chunksCount` is the number
   * of `chunks` rows for the document. A NULL `status` (a row written before the
   * status column existed) is reported as `ready` per the nullable-safe contract.
   * Throws {@link NotFoundException} when the id does not exist (→ 404).
   */
  async getDocumentStatus(
    documentId: string,
  ): Promise<{ documentId: string; status: DocumentStatus; chunksCount: number }> {
    const rows = await this.prismaService.$queryRaw<
      { status: string | null; chunksCount: number }[]
    >(
      Prisma.sql`
        SELECT
          d."status" AS "status",
          COUNT(c."id")::int AS "chunksCount"
        FROM "documents" d
        LEFT JOIN "chunks" c ON c."document_id" = d."id"
        WHERE d."id" = ${documentId}
        GROUP BY d."id", d."status"
        LIMIT 1
      `,
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException(`Document not found: id=${documentId}`);
    }

    return {
      documentId,
      status: (row.status as DocumentStatus | null) ?? 'ready',
      chunksCount: row.chunksCount,
    };
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

    // Unstructured input: no markdown headings / numbered items anywhere in the
    // document. Block it by paragraph (blank-line boundaries) and pack paragraphs
    // up to MAX_CHUNK_SIZE instead of treating the whole document as one block.
    const hasStructure = lines.some((line) => HEADING_RE.test(line) || NUMBERED_RE.test(line));
    if (!hasStructure) {
      return this.normalizeBlocks(this.blockByParagraph(normalized));
    }

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
   * Blocks unstructured (heading-less, non-numbered) text by paragraph using
   * blank-line (`\n\n`) boundaries, packing consecutive paragraphs into a single
   * block until adding the next paragraph would exceed MAX_CHUNK_SIZE. Oversized
   * single paragraphs are left as one block here and split later by normalizeBlocks.
   * All blocks are header-less; the unstructured path carries no section context.
   */
  private blockByParagraph(text: string): { header: string; body: string[] }[] {
    const MAX = DocumentService.MAX_CHUNK_SIZE;
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const blocks: { header: string; body: string[] }[] = [];
    let current = '';

    for (const paragraph of paragraphs) {
      if (!current) {
        current = paragraph;
        continue;
      }
      const combined = `${current}\n\n${paragraph}`;
      if (combined.length <= MAX) {
        current = combined;
      } else {
        blocks.push({ header: '', body: [current] });
        current = paragraph;
      }
    }

    if (current) {
      blocks.push({ header: '', body: [current] });
    }

    return blocks;
  }

  /**
   * Finds the preferred split index at or before `end` within `text`, searching
   * the window after `start`. Preference cascade: paragraph break (`\n\n`) →
   * sentence terminator (`.`/`!`/`?`/`…` followed by whitespace) → word boundary
   * (whitespace) → hard cut at `end`. Returns an index in `(start, end]`.
   */
  private findSplitBoundary(text: string, start: number, end: number): number {
    // 1) Paragraph break: last blank-line boundary before `end`.
    const paraMatch = this.lastBoundaryBefore(text, start, end, /\n\s*\n/g);
    if (paraMatch > start) {
      return paraMatch;
    }

    // 2) Sentence terminator followed by whitespace.
    const sentenceMatch = this.lastBoundaryBefore(text, start, end, /[.!?…]\s/g);
    if (sentenceMatch > start) {
      return sentenceMatch;
    }

    // 3) Word boundary: last whitespace before `end`.
    const lastWs = text.lastIndexOf(' ', end);
    if (lastWs > start) {
      return lastWs;
    }

    // 4) Hard cut.
    return end;
  }

  /**
   * Returns the end index (exclusive) of the last regex match whose match end
   * falls within `(start, end]`, or -1 when none is found. Used to locate the
   * latest paragraph / sentence boundary that fits inside the current window.
   */
  private lastBoundaryBefore(text: string, start: number, end: number, pattern: RegExp): number {
    const re = new RegExp(pattern.source, 'g');
    let best = -1;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const boundary = match.index + match[0].length;
      if (boundary > end) {
        break;
      }
      if (boundary > start) {
        best = boundary;
      }
      // Guard against zero-length matches advancing indefinitely.
      if (match.index === re.lastIndex) {
        re.lastIndex += 1;
      }
    }
    return best;
  }

  /**
   * Coalesces undersized adjacent blocks and splits oversized blocks at the
   * preferred boundary (paragraph → sentence → word → hard cut) with OVERLAP
   * chars carried over to the next split chunk.
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
      // Split at the preferred boundary (paragraph → sentence → word → hard cut)
      // with overlap.
      let start = 0;
      const text = chunk.content;
      while (start < text.length) {
        let end = Math.min(start + MAX, text.length);
        if (end < text.length) {
          end = this.findSplitBoundary(text, start, end);
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
        const next = nextWs !== -1 && nextWs < end ? nextWs + 1 : overlapStart;
        // Guarantee forward progress: when a near-start split boundary makes the
        // overlap step-back rewind to/behind the current `start`, drop the overlap
        // for this step and resume at `end`. Without this the loop can stall on the
        // same slice forever (unbounded `afterSplit` growth → OOM).
        start = next > start ? next : end;
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

  /**
   * Reads the stored content for a document by id. Throws when the row is gone
   * so the background indexer fails loudly (and marks the doc `failed`) rather
   * than silently indexing an empty document.
   */
  private async getDocumentContent(documentId: string): Promise<string> {
    const rows = await this.prismaService.$queryRaw<{ content: string }[]>(
      Prisma.sql`SELECT "content" FROM "documents" WHERE "id" = ${documentId} LIMIT 1`,
    );
    const row = rows[0];
    if (!row) {
      throw new Error(`Document not found: id=${documentId}`);
    }
    return row.content;
  }

  /** Sets the indexing lifecycle status for a document. */
  private async setStatus(documentId: string, status: DocumentStatus): Promise<void> {
    await this.prismaService.$executeRaw(
      Prisma.sql`UPDATE "documents" SET "status" = ${status}, "updated_at" = NOW() WHERE "id" = ${documentId}`,
    );
  }

  /**
   * Best-effort status write used on the failure path so a secondary DB error
   * while marking `failed` cannot mask the original indexing error.
   */
  private async setStatusSafe(documentId: string, status: DocumentStatus): Promise<void> {
    try {
      await this.setStatus(documentId, status);
    } catch (err) {
      this.logger.error(
        `Failed to set status=${status} for document id=${documentId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
        'DocumentService',
      );
    }
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
