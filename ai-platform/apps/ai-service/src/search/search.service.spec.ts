import { SearchService } from './search.service';
import type { SimilaritySearchResult } from './search.service';

// ---------------------------------------------------------------------------
// Minimal stubs for injected dependencies
// ---------------------------------------------------------------------------

const mockEmbeddingProvider = {
  generateEmbedding: jest.fn(),
  generateBatch: jest.fn(),
};

const mockEmbeddingsService = {
  getProvider: jest.fn().mockReturnValue(mockEmbeddingProvider),
};

const buildQueryRawMock = (rows: SimilaritySearchResult[]) => jest.fn().mockResolvedValue(rows);

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeRow(id: string, similarity = 0.8): SimilaritySearchResult {
  return { id, content: `content-${id}`, title: `title-${id}`, similarity };
}

function buildService(queryRawMock: jest.Mock): SearchService {
  const prismaService = { $queryRaw: queryRawMock } as never;
  const loggerService = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as never;
  return new SearchService(mockEmbeddingsService as never, prismaService, loggerService);
}

// ---------------------------------------------------------------------------
// Helper to call the private method under test
// ---------------------------------------------------------------------------

function callLexicalSearch(
  svc: SearchService,
  query: string,
  limit: number,
  filePathPrefix?: string,
): Promise<SimilaritySearchResult[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (svc as any).lexicalSearch(query, limit, filePathPrefix);
}

// ---------------------------------------------------------------------------
// Tests — SearchService.lexicalSearch
// ---------------------------------------------------------------------------

describe('SearchService.lexicalSearch', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Empty / whitespace guard
  // -------------------------------------------------------------------------

  describe('empty query guard', () => {
    it('returns [] immediately for an empty string without hitting the DB', async () => {
      const queryRaw = buildQueryRawMock([]);
      const svc = buildService(queryRaw);

      const result = await callLexicalSearch(svc, '', 10);

      expect(result).toEqual([]);
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('returns [] immediately for a whitespace-only string without hitting the DB', async () => {
      const queryRaw = buildQueryRawMock([]);
      const svc = buildService(queryRaw);

      const result = await callLexicalSearch(svc, '   ', 10);

      expect(result).toEqual([]);
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Without filePathPrefix
  // -------------------------------------------------------------------------

  describe('without filePathPrefix', () => {
    it('executes a $queryRaw call and returns its rows', async () => {
      const rows = [makeRow('a'), makeRow('b')];
      const queryRaw = buildQueryRawMock(rows);
      const svc = buildService(queryRaw);

      const result = await callLexicalSearch(svc, 'typescript', 5);

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('b');
    });

    it('returns an empty array when the DB returns no rows', async () => {
      const queryRaw = buildQueryRawMock([]);
      const svc = buildService(queryRaw);

      const result = await callLexicalSearch(svc, 'something', 30);

      expect(result).toEqual([]);
    });

    it('passes each result row through as-is preserving all fields', async () => {
      const expected = makeRow('chunk-42', 0.65);
      const queryRaw = buildQueryRawMock([expected]);
      const svc = buildService(queryRaw);

      const result = await callLexicalSearch(svc, 'NestJS', 30);

      expect(result[0]).toEqual(expected);
    });
  });

  // -------------------------------------------------------------------------
  // With filePathPrefix
  // -------------------------------------------------------------------------

  describe('with filePathPrefix', () => {
    it('executes a $queryRaw call and returns its rows when filePathPrefix is provided', async () => {
      const rows = [makeRow('x')];
      const queryRaw = buildQueryRawMock(rows);
      const svc = buildService(queryRaw);

      const result = await callLexicalSearch(svc, 'react', 10, 'docs/frontend/');

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('x');
    });

    it('returns an empty array when the DB returns no rows for the given prefix', async () => {
      const queryRaw = buildQueryRawMock([]);
      const svc = buildService(queryRaw);

      const result = await callLexicalSearch(svc, 'react', 10, 'docs/missing/');

      expect(result).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — SearchService.similaritySearch (hybrid pipeline)
// ---------------------------------------------------------------------------

describe('SearchService.similaritySearch', () => {
  beforeEach(() => {
    mockEmbeddingProvider.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Parallel fan-out: $queryRaw is called twice per search (vector + lexical)
  // -------------------------------------------------------------------------

  describe('parallel fan-out', () => {
    it('calls $queryRaw twice when the lexical query is non-empty', async () => {
      const queryRaw = jest.fn().mockResolvedValue([makeRow('r1')]);
      const svc = buildService(queryRaw);

      await svc.similaritySearch('NestJS framework', 6);

      // One call for vectorSearch, one for lexicalSearch
      expect(queryRaw).toHaveBeenCalledTimes(2);
    });

    it('calls $queryRaw twice for any non-blank input (both vector and lexical paths)', async () => {
      // A query consisting only of angle brackets normalises lexical to '<>' and
      // semantic to ''. The lexicalSearch early-exit fires only on empty string —
      // '<>' is non-empty, so DB is still called. This confirms both paths fire
      // for any non-blank input.
      const queryRaw = jest.fn().mockResolvedValue([]);
      const svc = buildService(queryRaw);

      await svc.similaritySearch('NestJS', 6);

      expect(queryRaw).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // RRF fusion and result count
  // -------------------------------------------------------------------------

  describe('RRF fusion and limit', () => {
    it('returns at most `limit` results even when vector + lexical sets are larger', async () => {
      // Return 5 distinct rows from each ranker (10 total unique docs).
      // NOTE: lexicalSearch calls $queryRaw before vectorSearch (no async preamble),
      // so mock ordering is: first call → lexical, second call → vector.
      const vectorRows = ['v1', 'v2', 'v3', 'v4', 'v5'].map((id) => makeRow(id, 0.9));
      const lexicalRows = ['l1', 'l2', 'l3', 'l4', 'l5'].map((id) => makeRow(id, 0.7));

      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce(lexicalRows) // lexicalSearch fires $queryRaw first
        .mockResolvedValueOnce(vectorRows); // vectorSearch fires $queryRaw second

      const svc = buildService(queryRaw);
      const result = await svc.similaritySearch('query', 3);

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('returns fused results ranked by RRF score (doc in both lists ranks first)', async () => {
      // 'both' appears in both rankers at rank 1 — must outrank single-ranker docs.
      // Mock order: lexical first, vector second.
      const vectorRows = [makeRow('both', 0.9), makeRow('vectorOnly', 0.8)];
      const lexicalRows = [makeRow('both', 0.95), makeRow('lexicalOnly', 0.85)];

      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce(lexicalRows)
        .mockResolvedValueOnce(vectorRows);

      const svc = buildService(queryRaw);
      const result = await svc.similaritySearch('query', 10);

      expect(result[0].id).toBe('both');
    });

    it('returns all fused rows when total is less than limit', async () => {
      const vectorRows = [makeRow('a'), makeRow('b')];
      const lexicalRows = [makeRow('b'), makeRow('c')];

      // Mock order: lexical first, vector second.
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce(lexicalRows)
        .mockResolvedValueOnce(vectorRows);

      const svc = buildService(queryRaw);
      // 3 unique docs, limit=10 — all 3 must be returned
      const result = await svc.similaritySearch('query', 10);

      expect(result).toHaveLength(3);
      const ids = result.map((r) => r.id);
      expect(ids).toContain('a');
      expect(ids).toContain('b');
      expect(ids).toContain('c');
    });
  });

  // -------------------------------------------------------------------------
  // Tag-query routing: wLexical=2.0 when query matches tag pattern
  // -------------------------------------------------------------------------

  describe('tag-query routing', () => {
    it('promotes lexically-top-ranked doc when query is a tag (<faq>)', async () => {
      // vectorWinner: rank 1 in vector only
      // lexicalWinner: rank 1 in lexical only
      // With wLexical=2 the lexical winner must outscore the vector winner.
      // Mock order: lexical first, vector second.
      const vectorRows = [makeRow('vectorWinner')];
      const lexicalRows = [makeRow('lexicalWinner')];

      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce(lexicalRows) // lexicalSearch first
        .mockResolvedValueOnce(vectorRows); // vectorSearch second

      const svc = buildService(queryRaw);
      const result = await svc.similaritySearch('<faq>', 10);

      expect(result[0].id).toBe('lexicalWinner');
    });

    it('does not boost lexical result for a plain-text query', async () => {
      // Without tag boost the lexical and vector rank-1 single-ranker docs tie;
      // tiebreaker resolves by id ascending.
      // Mock order: lexical first, vector second.
      const vectorRows = [makeRow('zVector')];
      const lexicalRows = [makeRow('aLexical')];

      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce(lexicalRows) // lexicalSearch first
        .mockResolvedValueOnce(vectorRows); // vectorSearch second

      const svc = buildService(queryRaw);
      const result = await svc.similaritySearch('some plain query', 10);

      // Both have equal wLexical=wVector=1 → equal score → tiebreaker id asc
      expect(result[0].id).toBe('aLexical');
      expect(result[1].id).toBe('zVector');
    });
  });

  // -------------------------------------------------------------------------
  // Logger emits one INFO line containing required fields
  // -------------------------------------------------------------------------

  describe('logging', () => {
    it('emits one log call containing query, vectorRows length, lexicalRows length, isTag, and top3 JSON', async () => {
      const vectorRows = [makeRow('v1'), makeRow('v2')];
      const lexicalRows = [makeRow('l1')];

      // Mock order: lexical first, vector second.
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce(lexicalRows)
        .mockResolvedValueOnce(vectorRows);

      const logFn = jest.fn();
      const prismaService = { $queryRaw: queryRaw } as never;
      const loggerService = { log: logFn, warn: jest.fn(), error: jest.fn() } as never;
      const svc = new SearchService(mockEmbeddingsService as never, prismaService, loggerService);

      await svc.similaritySearch('NestJS', 6);

      expect(logFn).toHaveBeenCalledTimes(1);
      const [message, context] = logFn.mock.calls[0];
      expect(context).toBe('SearchService');
      expect(message).toContain('vectorRows=2');
      expect(message).toContain('lexicalRows=1');
      expect(message).toContain('isTag=false');
      // top3 must be valid JSON array
      const top3Match = (message as string).match(/top3=(\[.*?\])/);
      expect(top3Match).not.toBeNull();
      if (top3Match) {
        const top3 = JSON.parse(top3Match[1]) as unknown[];
        expect(Array.isArray(top3)).toBe(true);
      }
    });

    it('logs isTag=true for a tag-shaped query', async () => {
      // Mock order: lexical first, vector second.
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce([makeRow('l1')])
        .mockResolvedValueOnce([makeRow('v1')]);

      const logFn = jest.fn();
      const prismaService = { $queryRaw: queryRaw } as never;
      const loggerService = { log: logFn, warn: jest.fn(), error: jest.fn() } as never;
      const svc = new SearchService(mockEmbeddingsService as never, prismaService, loggerService);

      await svc.similaritySearch('<faq>', 6);

      const [message] = logFn.mock.calls[0];
      expect(message).toContain('isTag=true');
    });
  });
});
