import { NotFoundException } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import type { Subscriber } from 'rxjs';
import { DocumentService } from './document.service';
import type { ChunkResult } from './document.service';

jest.mock('fs/promises', () => ({ readFile: jest.fn() }));
const { readFile } = jest.requireMock('fs/promises') as { readFile: jest.Mock };

// ---------------------------------------------------------------------------
// Stubs — splitIntoChunks is synchronous and does not touch injected deps
// ---------------------------------------------------------------------------

const mockEmbeddingProvider = { generateEmbedding: jest.fn(), generateBatch: jest.fn() };
const stubEmbeddingProviderFactory = {
  getProvider: jest.fn().mockReturnValue(mockEmbeddingProvider),
} as never;
const stubPrisma = {} as never;
const stubLogger = {} as never;
const stubAiProviderFactory = { getProvider: jest.fn() } as never;
const stubConfigService = { get: jest.fn() } as never;

function makeService(): DocumentService {
  return new DocumentService(
    stubEmbeddingProviderFactory,
    stubPrisma,
    stubLogger,
    stubAiProviderFactory,
    stubConfigService,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a paragraph of exactly `targetLength` characters using repeated words
 * with spaces, so whitespace-boundary splitting and overlap logic work correctly.
 */
function buildParagraph(targetLength: number): string {
  const word = 'lorem ';
  let body = '';
  while (body.length < targetLength) {
    body += word;
  }
  return body.slice(0, targetLength).trim();
}

/**
 * Build a doc with the given headings, each followed by a body paragraph of
 * `bodyLength` characters — large enough to prevent inter-section coalescing.
 * Minimum safe size: bodyLength > 600 means any two adjacent sections already
 * exceed MAX_CHUNK_SIZE (1200) when combined, preventing the coalescer from
 * merging them.
 */
function buildHeadingDoc(headings: string[], bodyLength = 650): string {
  return headings.map((h) => `## ${h}\n\n${buildParagraph(bodyLength)}\n`).join('\n');
}

// ---------------------------------------------------------------------------
// splitIntoChunks — empty input
// ---------------------------------------------------------------------------

describe('DocumentService.splitIntoChunks — empty input', () => {
  it('returns [] for empty string', () => {
    const service = makeService();
    expect(service.splitIntoChunks('')).toEqual([]);
  });

  it('returns [] for whitespace-only string', () => {
    const service = makeService();
    expect(service.splitIntoChunks('   \n  \t  \n')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// splitIntoChunks — heading boundaries
// ---------------------------------------------------------------------------

describe('DocumentService.splitIntoChunks — heading boundaries', () => {
  it('produces ≥ 3 chunks for a doc with three ## headings and enough content per section', () => {
    const service = makeService();
    // Each section body is 650 chars; any two adjacent sections combined exceed
    // MAX_CHUNK_SIZE (1200), so the coalescer keeps them as separate chunks.
    const doc = buildHeadingDoc(['Introduction', 'Architecture', 'Conclusion']);
    const chunks = service.splitIntoChunks(doc);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });

  it('each chunk carries the section field matching one of the ## headings', () => {
    const service = makeService();
    const headings = ['Introduction', 'Architecture', 'Conclusion'];
    const doc = buildHeadingDoc(headings);
    const chunks = service.splitIntoChunks(doc);

    // Every expected heading should appear as a section in at least one chunk
    for (const heading of headings) {
      expect(chunks.some((c) => c.section === heading)).toBe(true);
    }
  });

  it.each([
    ['# H1', 'H1'],
    ['## H2', 'H2'],
    ['### H3', 'H3'],
  ])('recognises %s as a heading boundary with section = %s', (headingLine, expectedSection) => {
    const service = makeService();
    const doc = `${headingLine}\n\n${buildParagraph(200)}\n`;
    const chunks = service.splitIntoChunks(doc);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].section).toBe(expectedSection);
  });
});

// ---------------------------------------------------------------------------
// splitIntoChunks — numbered-list boundaries
// ---------------------------------------------------------------------------

describe('DocumentService.splitIntoChunks — numbered-list boundaries', () => {
  // Each numbered item needs enough body text so the coalescer cannot combine
  // both items into a single chunk (combined > 1200 chars).
  const body1 = buildParagraph(650);
  const body2 = buildParagraph(650);
  const numberedListDoc = [
    '1. What is the project?',
    body1,
    '',
    '2. How does the table work?',
    body2,
  ].join('\n');

  it('produces ≥ 2 chunks for a doc with two numbered-list items of sufficient size', () => {
    const service = makeService();
    const chunks = service.splitIntoChunks(numberedListDoc);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('first chunk content starts with the first numbered-list line', () => {
    const service = makeService();
    const chunks = service.splitIntoChunks(numberedListDoc);
    expect(chunks[0].content).toMatch(/^1\.\s+What is the project\?/);
  });

  it('first chunk section equals the first numbered-list line (trimmed)', () => {
    const service = makeService();
    const chunks = service.splitIntoChunks(numberedListDoc);
    expect(chunks[0].section).toBe('1. What is the project?');
  });

  it('a chunk whose section starts with "2." exists', () => {
    const service = makeService();
    const chunks = service.splitIntoChunks(numberedListDoc);
    const item2 = chunks.find((c) => c.section.startsWith('2.'));
    expect(item2).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// splitIntoChunks — oversize splitting with overlap
// ---------------------------------------------------------------------------

describe('DocumentService.splitIntoChunks — oversize splitting', () => {
  /**
   * Build a document with a single heading and a body that is clearly longer
   * than 3 × MAX_CHUNK_SIZE (1200) = 3600 chars to guarantee at least 3 split
   * pieces.
   */
  function buildLongDoc(targetBodyLength: number): string {
    return `## Long Section\n\n${buildParagraph(targetBodyLength)}\n`;
  }

  it('a 3 000-char paragraph under one heading produces ≥ 3 chunks', () => {
    const service = makeService();
    const doc = buildLongDoc(3000);
    const chunks = service.splitIntoChunks(doc);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });

  it('every chunk is ≤ 1 200 chars', () => {
    const service = makeService();
    const doc = buildLongDoc(3000);
    const chunks = service.splitIntoChunks(doc);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(1200);
    }
  });

  it('consecutive chunk pairs share an overlapping substring of 50–150 chars', () => {
    const service = makeService();
    const doc = buildLongDoc(3000);
    const chunks = service.splitIntoChunks(doc);

    // With overlap the start of chunk[i+1] should appear somewhere near the
    // end of chunk[i].  We search for a prefix of chunk[i+1] (up to 150 chars)
    // within the last 250 chars of chunk[i].
    let foundOverlap = false;
    for (let i = 0; i + 1 < chunks.length && !foundOverlap; i++) {
      const a = chunks[i].content;
      const b = chunks[i + 1].content;
      const tail = a.slice(-250);

      // Try decreasing prefix lengths until we find a match or exhaust options
      for (let prefixLen = 150; prefixLen >= 50; prefixLen--) {
        const prefix = b.slice(0, prefixLen);
        if (prefix.trim().length > 0 && tail.includes(prefix)) {
          foundOverlap = true;
          break;
        }
      }
    }

    expect(foundOverlap).toBe(true);
  });

  // Regression: an oversized block whose only split boundary sits within OVERLAP
  // (100) chars of `start`, followed by a long boundaryless run, used to make the
  // overlap step-back rewind `start` to/behind its previous value — an infinite
  // loop that grew `afterSplit` until the process OOM'd. The forward-progress
  // guard must terminate and still chunk the doc.
  it('terminates on a near-start boundary followed by a boundaryless run (no infinite loop / OOM)', () => {
    const service = makeService();
    // "x. " gives a sentence boundary at offset 3 (≤ OVERLAP); the rest is one
    // long run with no spaces/sentence/paragraph boundaries to fall back to.
    const doc = `x. ${'a'.repeat(5000)}`;

    const chunks = service.splitIntoChunks(doc);

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(1200);
    }
  });
});

// ---------------------------------------------------------------------------
// splitIntoChunks — undersize coalescing
// ---------------------------------------------------------------------------

describe('DocumentService.splitIntoChunks — undersize coalescing', () => {
  it('200 tiny lines coalesce into chunks ≤ 1 200 chars', () => {
    const service = makeService();
    // Each line is ~20 chars; 200 × ~20 = ~4 000 chars total.
    const lines = Array.from({ length: 200 }, (_, i) => `Line number ${i + 1} here.`);
    const doc = lines.join('\n');
    const chunks = service.splitIntoChunks(doc);

    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(1200);
    }
  });

  it('no chunk under 300 chars except possibly the final remainder', () => {
    const service = makeService();
    const lines = Array.from({ length: 200 }, (_, i) => `Line number ${i + 1} here.`);
    const doc = lines.join('\n');
    const chunks = service.splitIntoChunks(doc);

    // All chunks except the last should be ≥ 300 chars after coalescing
    const allButLast = chunks.slice(0, -1);
    for (const chunk of allButLast) {
      expect(chunk.content.length).toBeGreaterThanOrEqual(300);
    }
  });
});

// ---------------------------------------------------------------------------
// splitIntoChunks — unstructured (paragraph) blocking
// ---------------------------------------------------------------------------

describe('DocumentService.splitIntoChunks — unstructured paragraph blocking', () => {
  it('blocks heading-less text by paragraph rather than one monolithic chunk', () => {
    const service = makeService();
    // Four ~500-char paragraphs separated by blank lines; no headings/numbers.
    // Packed up to MAX_CHUNK_SIZE (1200) → more than one chunk, none oversized.
    const paragraphs = Array.from({ length: 4 }, () => buildParagraph(500));
    const doc = paragraphs.join('\n\n');
    const chunks = service.splitIntoChunks(doc);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(1200);
    }
  });

  it('packs small paragraphs together up to MAX_CHUNK_SIZE', () => {
    const service = makeService();
    // Two ~300-char paragraphs combine (with the \n\n joiner) well under 1200,
    // so they should land in a single packed chunk.
    const doc = `${buildParagraph(300)}\n\n${buildParagraph(300)}`;
    const chunks = service.splitIntoChunks(doc);
    expect(chunks.length).toBe(1);
  });

  it('carries no section for unstructured input', () => {
    const service = makeService();
    const doc = `${buildParagraph(400)}\n\n${buildParagraph(400)}`;
    const chunks = service.splitIntoChunks(doc);
    for (const chunk of chunks) {
      expect(chunk.section).toBe('');
    }
  });

  it('splits an oversized heading-less paragraph at a sentence boundary, not mid-sentence', () => {
    const service = makeService();
    // One paragraph well over MAX (1200) made of complete sentences ending in
    // ". " so the boundary cascade can split between sentences.
    const sentence = 'This is a complete sentence that carries some words. ';
    let body = '';
    while (body.length < 2600) {
      body += sentence;
    }
    const chunks = service.splitIntoChunks(body.trim());

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(1200);
    }
    // Every non-final chunk should end on a sentence terminator (no mid-sentence cut).
    const allButLast = chunks.slice(0, -1);
    for (const chunk of allButLast) {
      expect(chunk.content.trim()).toMatch(/[.!?…]$/);
    }
  });
});

// ---------------------------------------------------------------------------
// splitIntoChunks — section context shape (no English literal)
// ---------------------------------------------------------------------------

describe('DocumentService.splitIntoChunks — section as plain context', () => {
  it('does not inject a "Section:" literal anywhere in chunk content', () => {
    const service = makeService();
    const doc = buildHeadingDoc(['Alpha', 'Beta', 'Gamma']);
    const chunks = service.splitIntoChunks(doc);
    for (const chunk of chunks) {
      expect(chunk.content).not.toMatch(/Section:/);
    }
  });
});

// ---------------------------------------------------------------------------
// splitIntoChunks — return shape
// ---------------------------------------------------------------------------

describe('DocumentService.splitIntoChunks — return shape', () => {
  it('every chunk has non-empty content (no whitespace-only chunks)', () => {
    const service = makeService();
    const doc = buildHeadingDoc(['Alpha', 'Beta', 'Gamma']);
    const chunks = service.splitIntoChunks(doc);

    for (const chunk of chunks) {
      expect(chunk.content.trim().length).toBeGreaterThan(0);
    }
  });

  it('every chunk has a content property of type string', () => {
    const service = makeService();
    const doc = buildHeadingDoc(['Alpha', 'Beta']);
    const chunks = service.splitIntoChunks(doc);

    for (const chunk of chunks) {
      expect(typeof chunk.content).toBe('string');
    }
  });

  it('every chunk has a section property of type string', () => {
    const service = makeService();
    const doc = buildHeadingDoc(['Alpha', 'Beta']);
    const chunks: ChunkResult[] = service.splitIntoChunks(doc);

    for (const chunk of chunks) {
      expect(typeof chunk.section).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// Contextual Retrieval — per-chunk LLM context, flag, concurrency, fallback
// ---------------------------------------------------------------------------

describe('DocumentService — contextual retrieval', () => {
  /**
   * Builds a service whose prisma/embedding/ai/config stubs are wired so that
   * `uploadDocument` can run end to end without touching IO. Returns the service
   * plus the stubs so each test can assert on the captured stored content.
   */
  function makeUploadHarness(opts: {
    enabled?: boolean;
    concurrency?: string;
    chat?: () => Observable<string>;
    providerThrows?: boolean;
    windowChars?: string;
    timeoutMs?: string;
  }) {
    const embeddedTexts: string[] = [];
    const storedContents: string[] = [];

    const embeddingProvider = {
      generateEmbedding: jest.fn(async (text: string) => {
        embeddedTexts.push(text);
        return [0.1, 0.2, 0.3];
      }),
      generateBatch: jest.fn(async (texts: string[]) => {
        embeddedTexts.push(...texts);
        return texts.map(() => [0.1, 0.2, 0.3]);
      }),
    };
    const embeddingFactory = { getProvider: jest.fn().mockReturnValue(embeddingProvider) } as never;

    // Capture the document INSERT content so the background indexer's content
    // read (`SELECT content FROM documents WHERE id = ...`) returns it. The
    // document INSERT shape is [id, title, content, filePath].
    const storedDocuments = new Map<string, string>();

    const prisma = {
      // Capture the chunk INSERT content (2nd interpolated value of the chunk
      // insert template). The document INSERT has a different shape; we detect
      // the chunk insert by its values list length.
      $executeRaw: jest.fn(async (query: { values?: unknown[] }) => {
        const values = query.values ?? [];
        // chunk insert: [content, vectorLiteral, documentId]
        if (values.length === 3 && typeof values[1] === 'string' && values[1].startsWith('[')) {
          storedContents.push(values[0] as string);
          return 1;
        }
        // document insert: [id, title, content, filePath]
        if (values.length === 4 && typeof values[0] === 'string') {
          storedDocuments.set(values[0] as string, values[2] as string);
        }
        return 1;
      }),
      // Serve the stored document content back to the background indexer.
      $queryRaw: jest.fn(async (query: { values?: unknown[] }) => {
        const values = query.values ?? [];
        const id = values[0] as string;
        const content = storedDocuments.get(id);
        return content === undefined ? [] : [{ content }];
      }),
    } as never;

    const logger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const chatImpl: () => Observable<string> =
      opts.chat ?? (() => of('Generated context sentence about the chunk.'));
    const aiProvider = { chat: jest.fn<Observable<string>, [unknown]>(chatImpl) };
    const aiFactory = {
      getProvider: jest.fn(() => {
        if (opts.providerThrows) {
          throw new Error('provider unavailable');
        }
        return aiProvider;
      }),
    } as never;

    const config = {
      get: jest.fn((key: string) => {
        if (key === 'CONTEXTUAL_RETRIEVAL_ENABLED') {
          return opts.enabled === false ? 'false' : 'true';
        }
        if (key === 'CONTEXTUAL_RETRIEVAL_CONCURRENCY') {
          return opts.concurrency;
        }
        if (key === 'CONTEXT_WINDOW_CHARS') {
          return opts.windowChars;
        }
        if (key === 'CONTEXT_LLM_TIMEOUT_MS') {
          return opts.timeoutMs;
        }
        return undefined;
      }),
    } as never;

    const service = new DocumentService(
      embeddingFactory,
      prisma,
      logger as never,
      aiFactory,
      config,
    );
    return { service, embeddedTexts, storedContents, embeddingProvider, aiProvider, logger };
  }

  const singleChunkDoc = `## Heading\n\n${buildParagraph(300)}`;

  beforeEach(() => {
    readFile.mockReset();
    readFile.mockResolvedValue(singleChunkDoc);
  });

  it('AC-03: prepends generated context so stored content === embedded text === "{context}\\n\\n{body}"', async () => {
    const h = makeUploadHarness({ enabled: true });
    await h.service.uploadDocument('/tmp/doc.md', 'Doc');

    expect(h.storedContents).toHaveLength(1);
    expect(h.storedContents[0]).toMatch(/^Generated context sentence about the chunk\.\n\n/);
    // The embedded text is identical to the stored content.
    expect(h.embeddedTexts).toEqual(h.storedContents);
  });

  it('AC-02: fully accumulates a multi-emission chat stream into one context string', async () => {
    const h = makeUploadHarness({
      enabled: true,
      chat: () =>
        new Observable<string>((sub: Subscriber<string>) => {
          sub.next('Part one. ');
          sub.next('Part two.');
          sub.complete();
        }),
    });
    await h.service.uploadDocument('/tmp/doc.md', 'Doc');

    expect(h.storedContents[0]).toMatch(/^Part one\. Part two\.\n\n/);
  });

  it('AC-04: when disabled, no LLM call is made and the heading is the context', async () => {
    const h = makeUploadHarness({ enabled: false });
    await h.service.uploadDocument('/tmp/doc.md', 'Doc');

    expect(h.aiProvider.chat).not.toHaveBeenCalled();
    expect(h.storedContents[0]).toMatch(/^Heading\n/);
    expect(h.storedContents[0]).not.toMatch(/^Heading\n\n/);
  });

  it('AC-05: a chat error falls back to heading-as-context, logs warn, upload does not fail', async () => {
    const h = makeUploadHarness({
      enabled: true,
      chat: () =>
        new Observable<string>((sub: Subscriber<string>) => {
          sub.error(new Error('LLM timeout'));
        }),
    });

    await expect(h.service.uploadDocument('/tmp/doc.md', 'Doc')).resolves.toEqual({
      documentId: expect.any(String),
      chunksCount: 1,
    });
    expect(h.storedContents[0]).toMatch(/^Heading\n/);
    expect(h.logger.warn).toHaveBeenCalled();
  });

  it('AC-05: an unavailable provider falls back to heading-as-context without failing', async () => {
    const h = makeUploadHarness({ enabled: true, providerThrows: true });

    await expect(h.service.uploadDocument('/tmp/doc.md', 'Doc')).resolves.toEqual({
      documentId: expect.any(String),
      chunksCount: 1,
    });
    expect(h.aiProvider.chat).not.toHaveBeenCalled();
    expect(h.storedContents[0]).toMatch(/^Heading\n/);
    expect(h.logger.warn).toHaveBeenCalled();
  });

  it('AC-06: bounds concurrent context-generation calls to the configured limit', async () => {
    // A multi-chunk doc so concurrency is observable.
    const multiDoc = buildHeadingDoc(['One', 'Two', 'Three', 'Four', 'Five', 'Six']);
    readFile.mockResolvedValue(multiDoc);

    let inFlight = 0;
    let maxInFlight = 0;

    const h = makeUploadHarness({
      enabled: true,
      concurrency: '2',
      chat: () =>
        new Observable<string>((sub: Subscriber<string>) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          setTimeout(() => {
            inFlight -= 1;
            sub.next('ctx');
            sub.complete();
          }, 5);
        }),
    });

    await h.service.uploadDocument('/tmp/doc.md', 'Doc');

    expect(h.aiProvider.chat.mock.calls.length).toBeGreaterThan(2);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('AC-20: embeds chunks via generateBatch (batched), not one-by-one', async () => {
    const multiDoc = buildHeadingDoc(['One', 'Two', 'Three']);
    readFile.mockResolvedValue(multiDoc);

    const h = makeUploadHarness({ enabled: true });
    await h.service.uploadDocument('/tmp/doc.md', 'Doc');

    // A single batch call carrying every contextualized chunk; no per-chunk calls.
    expect(h.embeddingProvider.generateBatch).toHaveBeenCalledTimes(1);
    expect(h.embeddingProvider.generateEmbedding).not.toHaveBeenCalled();
    const batchArg = h.embeddingProvider.generateBatch.mock.calls[0][0] as string[];
    expect(batchArg).toHaveLength(h.storedContents.length);
    // The batched input is exactly the stored (contextualized) content.
    expect(batchArg).toEqual(h.storedContents);
  });

  it('AC-01: the prompt includes the whole document and the chunk in their tags', async () => {
    const h = makeUploadHarness({ enabled: true });
    await h.service.uploadDocument('/tmp/doc.md', 'Doc');

    const prompt = h.aiProvider.chat.mock.calls[0][0] as string;
    expect(prompt).toContain('<document>');
    expect(prompt).toContain('<chunk>');
    expect(prompt).toContain('in the same language as the document');
    expect(prompt).toContain('Add no new facts.');
  });

  // -------------------------------------------------------------------------
  // Windowed context prompt (TASK-004 — AC-07/AC-08/AC-09)
  // -------------------------------------------------------------------------

  /** Extracts the text between <document> and </document> in a context prompt. */
  function extractPromptDoc(prompt: string): string {
    const match = /<document>([\s\S]*)<\/document>/.exec(prompt);
    return match ? match[1] : '';
  }

  it('AC-08: a document that fits within CONTEXT_WINDOW_CHARS uses the whole doc unchanged', async () => {
    // Whole doc is well under the 2000-char window: behaviour is unchanged.
    readFile.mockResolvedValue(singleChunkDoc);
    const h = makeUploadHarness({ enabled: true, windowChars: '2000' });
    await h.service.uploadDocument('/tmp/doc.md', 'Doc');

    expect(singleChunkDoc.length).toBeLessThanOrEqual(2000);
    const prompt = h.aiProvider.chat.mock.calls[0][0] as string;
    // The whole document is embedded verbatim in the prompt.
    expect(extractPromptDoc(prompt)).toBe(singleChunkDoc);
  });

  it('AC-07/AC-09: a large document uses a bounded window — every prompt doc ≤ CONTEXT_WINDOW_CHARS', async () => {
    // A 12+ KB multi-chunk doc, far larger than the window.
    const bigDoc = buildHeadingDoc([
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
    ]);
    expect(bigDoc.length).toBeGreaterThan(2000);
    readFile.mockResolvedValue(bigDoc);

    const windowChars = 2000;
    const h = makeUploadHarness({ enabled: true, windowChars: String(windowChars) });
    await h.service.uploadDocument('/tmp/doc.md', 'Doc');

    const prompts = h.aiProvider.chat.mock.calls.map((c) => c[0] as string);
    expect(prompts.length).toBeGreaterThan(1);
    for (const prompt of prompts) {
      const promptDoc = extractPromptDoc(prompt);
      // Window is bounded — never the whole document.
      expect(promptDoc.length).toBeLessThanOrEqual(windowChars);
      expect(promptDoc.length).toBeLessThan(bigDoc.length);
    }
  });

  it('AC-09: prompt-doc length is bounded by the window, independent of document size (O(chunks × window))', async () => {
    const windowChars = 1500;

    // Index a small-but-over-window doc and a much larger doc; the per-prompt
    // document budget is the same window for both — cost does not scale with
    // total document length.
    const smallOver = buildHeadingDoc(['A', 'B', 'C']);
    const large = buildHeadingDoc(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
    expect(large.length).toBeGreaterThan(smallOver.length);
    expect(smallOver.length).toBeGreaterThan(windowChars);

    readFile.mockResolvedValue(smallOver);
    const hSmall = makeUploadHarness({ enabled: true, windowChars: String(windowChars) });
    await hSmall.service.uploadDocument('/tmp/small.md', 'Small');
    const smallMax = Math.max(
      ...hSmall.aiProvider.chat.mock.calls.map((c) => extractPromptDoc(c[0] as string).length),
    );

    readFile.mockResolvedValue(large);
    const hLarge = makeUploadHarness({ enabled: true, windowChars: String(windowChars) });
    await hLarge.service.uploadDocument('/tmp/large.md', 'Large');
    const largeMax = Math.max(
      ...hLarge.aiProvider.chat.mock.calls.map((c) => extractPromptDoc(c[0] as string).length),
    );

    // Both bounded by the same window despite very different document sizes.
    expect(smallMax).toBeLessThanOrEqual(windowChars);
    expect(largeMax).toBeLessThanOrEqual(windowChars);
  });

  it('AC-07: the windowed prompt contains the chunk body (window is centred on the chunk)', async () => {
    const bigDoc = buildHeadingDoc(['One', 'Two', 'Three', 'Four', 'Five', 'Six']);
    readFile.mockResolvedValue(bigDoc);

    const h = makeUploadHarness({ enabled: true, windowChars: '2000' });
    await h.service.uploadDocument('/tmp/doc.md', 'Doc');

    // Every prompt's <chunk> body should appear inside that prompt's window,
    // confirming the window surrounds the chunk rather than being arbitrary text.
    for (const call of h.aiProvider.chat.mock.calls) {
      const prompt = call[0] as string;
      const chunkBody = /<chunk>([\s\S]*)<\/chunk>/.exec(prompt)?.[1] ?? '';
      const promptDoc = extractPromptDoc(prompt);
      expect(chunkBody.length).toBeGreaterThan(0);
      expect(promptDoc).toContain(chunkBody);
    }
  });

  // -------------------------------------------------------------------------
  // Prompt-safe content escaping + per-chunk LLM timeout (TASK-005)
  // -------------------------------------------------------------------------

  it('AC-10: tag-shaped content cannot close/inject the <document>/<chunk> delimiters', async () => {
    // A document literally full of tag-shaped text, including a stray closing
    // </document> that would otherwise terminate the prompt's document tag.
    const tagBody = [
      '<highlight>important</highlight> see <note>this</note> and',
      '<warning>that</warning>. A stray </document> and </chunk> here too.',
    ].join(' ');
    const tagDoc = `## Tags\n\n${tagBody}`;
    readFile.mockResolvedValue(tagDoc);

    const h = makeUploadHarness({ enabled: true });
    await h.service.uploadDocument('/tmp/doc.md', 'Doc');

    const prompt = h.aiProvider.chat.mock.calls[0][0] as string;
    // Exactly one opening + one closing delimiter for each tag survive — the
    // content's own angle brackets are neutralized, so the structure holds.
    expect(prompt.match(/<document>/g)).toHaveLength(1);
    expect(prompt.match(/<\/document>/g)).toHaveLength(1);
    expect(prompt.match(/<chunk>/g)).toHaveLength(1);
    expect(prompt.match(/<\/chunk>/g)).toHaveLength(1);
    // Interpolated content carries no raw angle brackets.
    expect(extractPromptDoc(prompt)).not.toMatch(/[<>]/);
  });

  it('AC-10: escaping preserves the text meaning (only < and > are entity-encoded)', async () => {
    const tagDoc = `## Tags\n\n${buildParagraph(200)} <note>keep words</note> tail`;
    readFile.mockResolvedValue(tagDoc);

    const h = makeUploadHarness({ enabled: true });
    await h.service.uploadDocument('/tmp/doc.md', 'Doc');

    const promptDoc = extractPromptDoc(h.aiProvider.chat.mock.calls[0][0] as string);
    // The words are untouched; only the angle brackets become entities.
    expect(promptDoc).toContain('&lt;note&gt;keep words&lt;/note&gt; tail');
    // Decoding the entities recovers the original interpolated text exactly.
    const decoded = promptDoc.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    expect(decoded).toContain('<note>keep words</note> tail');
  });

  it('AC-11/AC-12: a per-chunk timeout falls back to heading-context, warns, and does not fail the doc', async () => {
    // A chat stream that never emits/completes — only the configured timeout
    // ends it, producing a TimeoutError caught by the existing fallback.
    const h = makeUploadHarness({
      enabled: true,
      timeoutMs: '20',
      chat: () => new Observable<string>(() => undefined),
    });

    await expect(h.service.uploadDocument('/tmp/doc.md', 'Doc')).resolves.toEqual({
      documentId: expect.any(String),
      chunksCount: 1,
    });
    // Heading-as-context fallback, exactly as the chat-error path (AC-05).
    expect(h.storedContents[0]).toMatch(/^Heading\n/);
    expect(h.storedContents[0]).not.toMatch(/^Heading\n\n/);
    expect(h.logger.warn).toHaveBeenCalled();
  });

  it('AC-11: a chat that completes within the timeout still produces generated context', async () => {
    const h = makeUploadHarness({
      enabled: true,
      timeoutMs: '1000',
      chat: () => of('Generated context sentence about the chunk.'),
    });
    await h.service.uploadDocument('/tmp/doc.md', 'Doc');

    expect(h.storedContents[0]).toMatch(/^Generated context sentence about the chunk\.\n\n/);
    expect(h.logger.warn).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Stepped operation logging (AC-15..AC-19)
  // -------------------------------------------------------------------------

  type LogCall = [string, string, Record<string, unknown>?];

  /** Returns the [message, context, meta] log/debug call whose message starts with the STEP prefix. */
  function findStep(
    logger: { log: jest.Mock; debug: jest.Mock },
    n: number,
    total: number,
  ): LogCall | undefined {
    const prefix = `STEP ${n}/${total}:`;
    const all = [...logger.log.mock.calls, ...logger.debug.mock.calls] as LogCall[];
    return all.find((c) => typeof c[0] === 'string' && c[0].startsWith(prefix));
  }

  it('AC-15/AC-16: every upload stage logs "STEP n/total:" with the existing context, params in meta (3rd arg)', async () => {
    const h = makeUploadHarness({ enabled: true });
    await h.service.uploadDocument('/tmp/doc.md', 'Doc');

    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      const call = findStep(h.logger, n, 7);
      expect(call).toBeDefined();
      // Existing 'DocumentService' context is kept as the 2nd arg.
      expect(call?.[1]).toBe('DocumentService');
      // Params live in the structured meta object (3rd arg), not concatenated.
      expect(typeof call?.[2]).toBe('object');
    }
  });

  it('AC-17/AC-18: per-step meta carries the documentId + operation tag and the documented params', async () => {
    const h = makeUploadHarness({ enabled: true });
    const { documentId } = await h.service.uploadDocument('/tmp/doc.md', 'Doc');

    // STEP 2/7 read: title + textLength.
    const read = findStep(h.logger, 2, 7);
    expect(read?.[2]).toMatchObject({ operation: 'upload', title: 'Doc' });
    expect(typeof read?.[2]?.['textLength']).toBe('number');

    // STEP 3/7 split: chunkCount.
    const split = findStep(h.logger, 3, 7);
    expect(split?.[2]).toMatchObject({ operation: 'upload' });
    expect(typeof split?.[2]?.['chunkCount']).toBe('number');

    // STEP 4/7 store row: documentId correlation.
    const store = findStep(h.logger, 4, 7);
    expect(store?.[2]).toMatchObject({ documentId, operation: 'upload', title: 'Doc' });

    // STEP 5/7 context (per chunk): chunkIndex + chunkTotal + section + provider/model.
    const ctx = findStep(h.logger, 5, 7);
    expect(ctx?.[2]).toMatchObject({ documentId, chunkIndex: 0 });
    expect(typeof ctx?.[2]?.['chunkTotal']).toBe('number');
    expect(typeof ctx?.[2]?.['contentLength']).toBe('number');
    expect(ctx?.[2]).toHaveProperty('section');
    expect(ctx?.[2]).toHaveProperty('llmProvider');

    // STEP 6/7 embed: embedProvider + batchSize.
    const embed = findStep(h.logger, 6, 7);
    expect(embed?.[2]).toMatchObject({ documentId, operation: 'upload' });
    expect(typeof embed?.[2]?.['batchSize']).toBe('number');
    expect(embed?.[2]).toHaveProperty('embedProvider');

    // STEP 7/7 done: chunksCount + durationMs.
    const done = findStep(h.logger, 7, 7);
    expect(done?.[2]).toMatchObject({ documentId, operation: 'upload' });
    expect(typeof done?.[2]?.['chunksCount']).toBe('number');
    expect(typeof done?.[2]?.['durationMs']).toBe('number');
    expect(typeof done?.[2]?.['count']).toBe('number');
  });

  it('AC-19: per-chunk detail (STEP 5/6) logs at debug; high-level steps log at info; no raw content in meta', async () => {
    const h = makeUploadHarness({ enabled: true });
    await h.service.uploadDocument('/tmp/doc.md', 'Doc');

    // STEP 5/7 (per-chunk context) routed through debug, not log.
    const debugStep = (h.logger.debug.mock.calls as LogCall[]).find((c) =>
      c[0].startsWith('STEP 5/7:'),
    );
    expect(debugStep).toBeDefined();
    expect((h.logger.log.mock.calls as LogCall[]).some((c) => c[0].startsWith('STEP 5/7:'))).toBe(
      false,
    );

    // STEP 6/7 (per-chunk embed detail) also at debug, matching the existing level.
    expect((h.logger.debug.mock.calls as LogCall[]).some((c) => c[0].startsWith('STEP 6/7:'))).toBe(
      true,
    );

    // High-level steps (1-4, 7) log at info, never debug.
    for (const n of [1, 2, 3, 4, 7]) {
      const prefix = `STEP ${n}/7:`;
      expect((h.logger.log.mock.calls as LogCall[]).some((c) => c[0].startsWith(prefix))).toBe(
        true,
      );
      expect((h.logger.debug.mock.calls as LogCall[]).some((c) => c[0].startsWith(prefix))).toBe(
        false,
      );
    }

    // No meta value carries the raw chunk/file body — only lengths/counts/ids.
    const allMeta = [...h.logger.log.mock.calls, ...h.logger.debug.mock.calls]
      .map((c) => (c as LogCall)[2] ?? {})
      .flatMap((m) => Object.values(m));
    for (const v of allMeta) {
      if (typeof v === 'string') {
        // Document body paragraph is 'lorem '-repeated and ≥ 200 chars; ids/titles are short.
        expect(v).not.toMatch(/lorem lorem/);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Reindex stepped logging (AC-15..AC-19 for the reindex path)
  // -------------------------------------------------------------------------

  /**
   * Builds a service whose stubs let `reindexAll` run a single document end to
   * end (read rows via $queryRaw, atomic delete+insert via the interactive
   * $transaction) without touching IO. Returns the service plus the logger so
   * each test can assert on the captured STEP calls.
   */
  function makeReindexHarness(content: string) {
    const embeddingProvider = {
      generateEmbedding: jest.fn(async () => [0.1, 0.2, 0.3]),
      generateBatch: jest.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
    };
    const embeddingFactory = { getProvider: jest.fn().mockReturnValue(embeddingProvider) } as never;

    const tx = { $executeRaw: jest.fn(async () => 1) };
    const prisma = {
      $queryRaw: jest.fn(async () => [{ id: 'doc-1', content }]),
      $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<void>) => cb(tx)),
    } as never;

    const logger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const aiProvider = {
      chat: jest.fn(() => of('Generated context sentence about the chunk.')),
    };
    const aiFactory = { getProvider: jest.fn(() => aiProvider) } as never;

    const config = {
      get: jest.fn((key: string) => (key === 'CONTEXTUAL_RETRIEVAL_ENABLED' ? 'true' : undefined)),
    } as never;

    const service = new DocumentService(
      embeddingFactory,
      prisma,
      logger as never,
      aiFactory,
      config,
    );
    return { service, logger };
  }

  it('AC-15/AC-16: every reindex stage (3,5,6,7) logs "STEP n/total:" with the existing context, params in meta', async () => {
    const h = makeReindexHarness(singleChunkDoc);
    await h.service.reindexAll();

    // Reindex skips read (2) + store row (4); steps 3, 5, 6, 7 must carry the prefix.
    for (const n of [3, 5, 6, 7]) {
      const call = findStep(h.logger, n, 7);
      expect(call).toBeDefined();
      expect(call?.[1]).toBe('DocumentService');
      expect(typeof call?.[2]).toBe('object');
    }
  });

  it('AC-17/AC-18: reindex per-step meta carries documentId + operation:reindex and the documented params', async () => {
    const h = makeReindexHarness(singleChunkDoc);
    await h.service.reindexAll();

    // STEP 3/7 split: documentId + chunkCount, tagged operation:reindex.
    const split = findStep(h.logger, 3, 7);
    expect(split?.[2]).toMatchObject({ documentId: 'doc-1', operation: 'reindex' });
    expect(typeof split?.[2]?.['chunkCount']).toBe('number');

    // STEP 6/7 embed: provider/model/batchSize.
    const embed = findStep(h.logger, 6, 7);
    expect(embed?.[2]).toMatchObject({ documentId: 'doc-1', operation: 'reindex' });
    expect(typeof embed?.[2]?.['batchSize']).toBe('number');
    expect(embed?.[2]).toHaveProperty('embedProvider');

    // STEP 7/7 done: chunksCount + durationMs.
    const done = findStep(h.logger, 7, 7);
    expect(done?.[2]).toMatchObject({ documentId: 'doc-1', operation: 'reindex' });
    expect(typeof done?.[2]?.['chunksCount']).toBe('number');
    expect(typeof done?.[2]?.['durationMs']).toBe('number');
  });

  it('AC-19: reindex per-chunk steps (5,6) log at debug; high-level steps (3,7) at info', async () => {
    const h = makeReindexHarness(singleChunkDoc);
    await h.service.reindexAll();

    for (const n of [5, 6]) {
      const prefix = `STEP ${n}/7:`;
      expect((h.logger.debug.mock.calls as LogCall[]).some((c) => c[0].startsWith(prefix))).toBe(
        true,
      );
      expect((h.logger.log.mock.calls as LogCall[]).some((c) => c[0].startsWith(prefix))).toBe(
        false,
      );
    }

    for (const n of [3, 7]) {
      const prefix = `STEP ${n}/7:`;
      expect((h.logger.log.mock.calls as LogCall[]).some((c) => c[0].startsWith(prefix))).toBe(
        true,
      );
      expect((h.logger.debug.mock.calls as LogCall[]).some((c) => c[0].startsWith(prefix))).toBe(
        false,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Async indexing — register/index split, status transitions, background runner
// ---------------------------------------------------------------------------

describe('DocumentService — async indexing', () => {
  type StatusWrite = { documentId: string; status: string };

  /**
   * Builds a service wired for the async path. Captures status writes (the
   * `UPDATE documents SET status = ...` calls) and lets each test force the
   * embed step to throw so the `failed` transition is observable.
   */
  function makeAsyncHarness(opts: { embedThrows?: boolean } = {}) {
    const docContent = `## Heading\n\n${buildParagraph(300)}`;
    const statusWrites: StatusWrite[] = [];
    const storedDocuments = new Map<string, string>();

    const embeddingProvider = {
      generateEmbedding: jest.fn(async () => [0.1, 0.2, 0.3]),
      generateBatch: jest.fn(async (texts: string[]) => {
        if (opts.embedThrows) {
          throw new Error('embed failed');
        }
        return texts.map(() => [0.1, 0.2, 0.3]);
      }),
    };
    const embeddingFactory = { getProvider: jest.fn().mockReturnValue(embeddingProvider) } as never;

    const prisma = {
      $executeRaw: jest.fn(async (query: { values?: unknown[] }) => {
        const values = query.values ?? [];
        // document insert: [id, title, content, filePath]
        if (values.length === 4 && typeof values[0] === 'string') {
          storedDocuments.set(values[0] as string, values[2] as string);
        }
        // status update: [status, documentId]
        if (
          values.length === 2 &&
          typeof values[0] === 'string' &&
          ['pending', 'indexing', 'ready', 'failed'].includes(values[0] as string)
        ) {
          statusWrites.push({ status: values[0] as string, documentId: values[1] as string });
        }
        return 1;
      }),
      $queryRaw: jest.fn(async (query: { values?: unknown[] }) => {
        const values = query.values ?? [];
        const content = storedDocuments.get(values[0] as string);
        return content === undefined ? [] : [{ content }];
      }),
    } as never;

    const logger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const aiProvider = { chat: jest.fn(() => of('ctx')) };
    const aiFactory = { getProvider: jest.fn(() => aiProvider) } as never;
    const config = {
      get: jest.fn((key: string) => (key === 'CONTEXTUAL_RETRIEVAL_ENABLED' ? 'true' : undefined)),
    } as never;

    const service = new DocumentService(
      embeddingFactory,
      prisma,
      logger as never,
      aiFactory,
      config,
    );
    return { service, statusWrites, logger, docContent };
  }

  beforeEach(() => {
    readFile.mockReset();
  });

  it('AC-02: registerDocument validates + stores the row and returns { documentId, status: pending } without indexing', async () => {
    const h = makeAsyncHarness();
    readFile.mockResolvedValue(h.docContent);

    const result = await h.service.registerDocument('/tmp/doc.md', 'Doc');

    expect(result).toEqual({ documentId: expect.any(String), status: 'pending' });
    // No indexing happened in the fast path → no status transition written yet.
    expect(h.statusWrites).toHaveLength(0);
  });

  it('AC-02: rejects an unsupported extension in the fast path', async () => {
    const h = makeAsyncHarness();
    await expect(h.service.registerDocument('/tmp/doc.pdf', 'Doc')).rejects.toThrow(
      /Unsupported file extension/,
    );
  });

  it('AC-03: indexDocument transitions pending → indexing → ready on success', async () => {
    const h = makeAsyncHarness();
    readFile.mockResolvedValue(h.docContent);

    const { documentId } = await h.service.registerDocument('/tmp/doc.md', 'Doc');
    await h.service.indexDocument(documentId);

    expect(h.statusWrites.map((w) => w.status)).toEqual(['indexing', 'ready']);
    expect(h.statusWrites.every((w) => w.documentId === documentId)).toBe(true);
  });

  it('AC-03: an embed failure marks the document failed (logged error) and re-throws', async () => {
    const h = makeAsyncHarness({ embedThrows: true });
    readFile.mockResolvedValue(h.docContent);

    const { documentId } = await h.service.registerDocument('/tmp/doc.md', 'Doc');
    await expect(h.service.indexDocument(documentId)).rejects.toThrow(/embed failed/);

    expect(h.statusWrites.map((w) => w.status)).toEqual(['indexing', 'failed']);
    expect(h.logger.error).toHaveBeenCalled();
  });

  it('AC-02/AC-03: scheduleIndexing returns immediately; indexing completes in the background', async () => {
    const h = makeAsyncHarness();
    readFile.mockResolvedValue(h.docContent);

    const { documentId } = await h.service.registerDocument('/tmp/doc.md', 'Doc');

    // Schedule but capture the promise; the request handler would NOT await it.
    const job = h.service.scheduleIndexing(documentId);

    // The scheduling call returns a promise synchronously — no status written
    // until the background job actually runs.
    expect(job).toBeInstanceOf(Promise);

    await job;
    expect(h.statusWrites.map((w) => w.status)).toEqual(['indexing', 'ready']);
  });

  it('AC-03: scheduleIndexing swallows failures (status=failed, no unhandled rejection)', async () => {
    const h = makeAsyncHarness({ embedThrows: true });
    readFile.mockResolvedValue(h.docContent);

    const { documentId } = await h.service.registerDocument('/tmp/doc.md', 'Doc');
    // Must resolve (not reject) even though indexing fails internally.
    await expect(h.service.scheduleIndexing(documentId)).resolves.toBeUndefined();
    expect(h.statusWrites.map((w) => w.status)).toEqual(['indexing', 'failed']);
  });

  it('AC-04: background indexing is bounded by the configured concurrency limit', async () => {
    // Build a service whose embed step blocks until released so we can observe
    // how many jobs run at once under a concurrency limit of 2.
    let inFlight = 0;
    let maxInFlight = 0;
    const releases: Array<() => void> = [];

    const docContent = `## Heading\n\n${buildParagraph(300)}`;
    const storedDocuments = new Map<string, string>();

    const embeddingProvider = {
      generateEmbedding: jest.fn(),
      generateBatch: jest.fn(async (texts: string[]) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((resolve) => releases.push(resolve));
        inFlight -= 1;
        return texts.map(() => [0.1, 0.2, 0.3]);
      }),
    };
    const embeddingFactory = { getProvider: jest.fn().mockReturnValue(embeddingProvider) } as never;
    const prisma = {
      $executeRaw: jest.fn(async (query: { values?: unknown[] }) => {
        const values = query.values ?? [];
        if (values.length === 4 && typeof values[0] === 'string') {
          storedDocuments.set(values[0] as string, values[2] as string);
        }
        return 1;
      }),
      $queryRaw: jest.fn(async (query: { values?: unknown[] }) => {
        const content = storedDocuments.get((query.values ?? [])[0] as string);
        return content === undefined ? [] : [{ content }];
      }),
    } as never;
    const logger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const aiProvider = { chat: jest.fn(() => of('ctx')) };
    const aiFactory = { getProvider: jest.fn(() => aiProvider) } as never;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'BACKGROUND_INDEX_CONCURRENCY') return '2';
        if (key === 'CONTEXTUAL_RETRIEVAL_ENABLED') return 'true';
        return undefined;
      }),
    } as never;

    const service = new DocumentService(
      embeddingFactory,
      prisma,
      logger as never,
      aiFactory,
      config,
    );

    readFile.mockResolvedValue(docContent);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { documentId } = await service.registerDocument(`/tmp/doc-${i}.md`, `Doc ${i}`);
      ids.push(documentId);
    }

    // Schedule all 5 jobs; only 2 may run concurrently.
    const jobs = ids.map((id) => service.scheduleIndexing(id));

    // Let the first batch enter the (blocked) embed step.
    await new Promise((r) => setTimeout(r, 0));
    expect(maxInFlight).toBeLessThanOrEqual(2);

    // Drain: release embed calls until all jobs complete.
    while (releases.length > 0) {
      const release = releases.shift();
      release?.();
      await new Promise((r) => setTimeout(r, 0));
    }
    await Promise.all(jobs);

    expect(embeddingProvider.generateBatch).toHaveBeenCalledTimes(5);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Document status endpoint (AC-05)
// ---------------------------------------------------------------------------

describe('DocumentService.getDocumentStatus', () => {
  function makeStatusService(queryResult: unknown[]) {
    const prisma = { $queryRaw: jest.fn(async () => queryResult) } as never;
    const service = new DocumentService(
      stubEmbeddingProviderFactory,
      prisma,
      stubLogger,
      stubAiProviderFactory,
      stubConfigService,
    );
    return { service, prisma };
  }

  it('AC-05: returns { documentId, status, chunksCount } for a known id', async () => {
    const { service } = makeStatusService([{ status: 'ready', chunksCount: 4 }]);
    await expect(service.getDocumentStatus('doc-1')).resolves.toEqual({
      documentId: 'doc-1',
      status: 'ready',
      chunksCount: 4,
    });
  });

  it('AC-05: reports a NULL status (pre-existing row) as ready', async () => {
    const { service } = makeStatusService([{ status: null, chunksCount: 2 }]);
    const result = await service.getDocumentStatus('doc-legacy');
    expect(result.status).toBe('ready');
    expect(result.chunksCount).toBe(2);
  });

  it('AC-05: reflects pending/indexing status with chunksCount=0', async () => {
    const { service } = makeStatusService([{ status: 'pending', chunksCount: 0 }]);
    await expect(service.getDocumentStatus('doc-2')).resolves.toEqual({
      documentId: 'doc-2',
      status: 'pending',
      chunksCount: 0,
    });
  });

  it('AC-05: throws NotFoundException (→ 404) for an unknown id', async () => {
    const { service } = makeStatusService([]);
    await expect(service.getDocumentStatus('missing')).rejects.toThrow(NotFoundException);
  });
});
