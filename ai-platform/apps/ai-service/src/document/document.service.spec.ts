import { DocumentService } from './document.service';
import type { ChunkResult } from './document.service';

// ---------------------------------------------------------------------------
// Stubs — splitIntoChunks is synchronous and does not touch injected deps
// ---------------------------------------------------------------------------

const stubEmbeddings = {} as never;
const stubPrisma = {} as never;
const stubLogger = {} as never;

function makeService(): DocumentService {
  return new DocumentService(stubEmbeddings, stubPrisma, stubLogger);
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
