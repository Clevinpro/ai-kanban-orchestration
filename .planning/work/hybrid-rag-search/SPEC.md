# SPEC: Hybrid RAG Search for Reliable Tag/Token Retrieval

**Epic:** `hybrid-rag-search`
**Created:** 2026-05-28
**Status:** Ready for Planning

---

## Goal

Make RAG retrieval reliable for short symbolic queries (HTML-like tags such as `<faq>`,
identifiers, exact tokens) where pure vector similarity over `nomic-embed-text` is
inconsistent. Introduce hybrid search (vector + PostgreSQL full-text/trigram lexical),
fuse rankings via Reciprocal Rank Fusion (RRF), switch to markdown-aware chunking, and
add a structural section header to each chunk. Result: query `<faq>` returns the same
documentation block as `тег FAQ` every time.

---

## User Stories / Requirements

### US-01: Stable Retrieval for Symbolic Queries
> As a user, when I ask about a documentation tag by its exact form (e.g. `<faq>`,
> `<question>`, `<answer>`), I want the matching documentation block returned every
> single time — not intermittently.

### US-02: Stable Retrieval for Natural-Language Variants
> As a user, when I rephrase the same query in natural language (e.g. "тег FAQ",
> "що таке faq тег"), I want the same documentation block returned — semantic and
> symbolic queries must converge to the same answer.

### US-03: Structural Chunking
> As a developer maintaining the knowledge base, I want each numbered section of a
> reference document (`17. <faq>`, `18. <table>`, …) to live in its own chunk so
> embedding salience is concentrated on a single concept, not diluted across
> neighbours.

### US-04: Search Observability
> As a developer debugging retrieval misses, I want logs that expose the top-K
> similarity scores and the lexical/vector contribution per result so I can tell
> whether a miss is a chunking issue, an embedding issue, or a ranking issue.

### US-05: No Breaking Changes for Existing Callers
> As a developer, I want the `SearchService.similaritySearch` public signature to
> remain backward-compatible — `AiService.runRagFlow` and
> `AiService.answerCapabilityQuery` must continue to work without code changes
> beyond opt-in flags.

---

## Acceptance Criteria

- [ ] AC-01: Prisma migration adds a GIN trigram index on `chunks.content` using
      `pg_trgm` (`CREATE EXTENSION IF NOT EXISTS pg_trgm;` + `CREATE INDEX
      chunks_content_trgm_idx ON chunks USING gin (content gin_trgm_ops);`)
- [ ] AC-02: Prisma migration adds an HNSW index on `chunks.embedding` using
      `vector_cosine_ops` (`CREATE INDEX chunks_embedding_hnsw_idx ON chunks USING
      hnsw (embedding vector_cosine_ops);`)
- [ ] AC-03: New `MarkdownChunker` (or equivalent method on `DocumentService`)
      splits markdown by heading (`^#{1,6}\s`) and numbered-list (`^\d+\.\s`)
      boundaries; preserves chunks ≤ `MAX_CHUNK_SIZE = 1200` chars with 100-char
      overlap fallback when no boundary fits
- [ ] AC-04: Each stored chunk's `content` is prefixed with a `Section: <header>\n`
      header derived from the nearest preceding heading or numbered-list line, so
      the embedding picks up structural context
- [ ] AC-05: `SearchService.similaritySearch` runs vector search AND lexical search
      (`websearch_to_tsquery`-based or `similarity()` on `pg_trgm` — see Technical
      Design) in parallel, fuses rankings via RRF with constant `k = 60`, returns
      top-`limit` after fusion
- [ ] AC-06: `SearchService` exposes `QueryNormalizer` helper that produces a
      `{ semantic: string, lexical: string }` pair from a raw user query. Lexical
      form keeps `<>` and punctuation; semantic form strips them and lowercases
- [ ] AC-07: Tag-pattern queries matching `/^<[a-z][a-z0-9-]*\/?>$/i` route through
      a "lexical-boost" path: lexical RRF weight = 2× vector weight
- [ ] AC-08: `OllamaEmbeddingService.generateEmbedding` is invoked with the
      `semantic` form; lexical SQL uses the `lexical` form
- [ ] AC-09: `SearchService.similaritySearch` logs top-3 results with each row's
      `vectorScore`, `lexicalScore`, `rrfScore`, and `id` at `log` level
- [ ] AC-10: Existing call sites (`AiService.runRagFlow`,
      `AiService.answerCapabilityQuery`) require no signature changes — the new
      behaviour is enabled by default
- [ ] AC-11: Backfill script / one-shot command re-chunks and re-embeds all
      existing `documents` rows using the new chunker so historical data benefits
- [ ] AC-12: `nx test ai-service` passes — 0 TypeScript errors, 0 test failures
- [ ] AC-13: Manual smoke: queries `<faq>`, `<FAQ>`, `тег FAQ`, `faq tag`,
      `що таке faq` ALL return the same FAQ documentation chunk in top-3

---

## Technical Design

### Retrieval Pipeline (Hybrid + RRF)

```
User message
     │
     ▼
QueryNormalizer
     ├── semantic: lowercase, strip <>, NFC normalize
     └── lexical:  preserve as-is (keep angle brackets, punctuation)
     │
     ├──► OllamaEmbedding(semantic) ──► vectorRows[] (top-30 by cosine)
     │
     └──► Postgres lexical query(lexical) ──► lexicalRows[] (top-30 by ts_rank or pg_trgm)
                                              │
                                              ▼
                                  RRF fuse(vectorRows, lexicalRows, k=60,
                                           wVector=1.0, wLexical=isTagQuery ? 2.0 : 1.0)
                                              │
                                              ▼
                                          top-`limit`
```

### Reciprocal Rank Fusion (RRF)

```
score(doc) = Σ over each ranker r:
   weight_r * (1 / (k + rank_r(doc)))     // k = 60 (canonical)
```

Rows missing from a ranker contribute 0 for that ranker. Final sort: descending
RRF score. Stable tiebreaker: `id` ascending.

### Lexical Query Strategy

Two viable options — pick ONE during planning:

**Option A — `pg_trgm` similarity** (recommended for tag-shaped queries):
```sql
SELECT c.id, c.content, d.title,
       similarity(c.content, $1) AS lex_score
FROM chunks c
JOIN documents d ON c.document_id = d.id
WHERE c.content % $1            -- '%' operator uses GIN trigram index
ORDER BY lex_score DESC
LIMIT 30;
```

**Option B — `tsvector + websearch_to_tsquery`** (better for multi-word natural language):
```sql
SELECT c.id, c.content, d.title,
       ts_rank_cd(to_tsvector('simple', c.content),
                  websearch_to_tsquery('simple', $1)) AS lex_score
FROM chunks c
JOIN documents d ON c.document_id = d.id
WHERE to_tsvector('simple', c.content) @@ websearch_to_tsquery('simple', $1)
ORDER BY lex_score DESC
LIMIT 30;
```

For the specific `<faq>` case Option A wins because trigrams match
`<fa`, `faq`, `aq>` exactly even when the embedding fails to. Option A is the
recommended default. Use the `simple` config — no Ukrainian/English stemming
ambiguity.

### Markdown-Aware Chunking

Current chunker ([document.service.ts:85](ai-platform/apps/ai-service/src/document/document.service.ts:85))
splits by character count. Replace with structural splitter:

```typescript
splitIntoChunks(text: string): { content: string; section: string }[] {
  const lines = text.split('\n');
  const blocks: { header: string; body: string[] }[] = [];
  let currentHeader = '';
  let currentBody: string[] = [];

  for (const line of lines) {
    const isHeading = /^#{1,6}\s+(.+)$/.test(line);
    const isNumbered = /^(\d+)\.\s+(.+)$/.test(line);
    if (isHeading || isNumbered) {
      if (currentBody.length > 0 || currentHeader) {
        blocks.push({ header: currentHeader, body: currentBody });
      }
      currentHeader = line.replace(/^#{1,6}\s+/, '').trim();
      currentBody = [line];
    } else {
      currentBody.push(line);
    }
  }
  if (currentBody.length > 0) blocks.push({ header: currentHeader, body: currentBody });

  // Coalesce undersized blocks; split oversized blocks at whitespace.
  return this.normalizeBlocks(blocks, MAX_CHUNK_SIZE = 1200, OVERLAP = 100);
}
```

Stored chunk format: `Section: <header>\n<body>`. Embedding is computed on the
prefixed form — section title acts as a context anchor.

### QueryNormalizer

```typescript
export class QueryNormalizer {
  static normalize(raw: string): { semantic: string; lexical: string } {
    const lexical = raw.normalize('NFC').trim();
    const semantic = lexical
      .toLowerCase()
      .replace(/[<>]/g, ' ')      // strip angle brackets
      .replace(/\s+/g, ' ')
      .trim();
    return { semantic, lexical };
  }

  static isTagQuery(raw: string): boolean {
    return /^<[a-z][a-z0-9-]*\/?>$/i.test(raw.trim());
  }
}
```

### Search Service Skeleton (After Change)

```typescript
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

  const fused = this.rrfFuse(vectorRows, lexicalRows, {
    k: 60,
    wVector: 1.0,
    wLexical: isTag ? 2.0 : 1.0,
  });

  this.logger.log(
    `Hybrid search: query="${lexical}", vectorRows=${vectorRows.length}, ` +
    `lexicalRows=${lexicalRows.length}, top3=${this.formatTop(fused, 3)}`,
    'SearchService',
  );

  return fused.slice(0, limit);
}
```

### Files Changed / Added

| File | Change |
|------|--------|
| `libs/database/prisma/migrations/<ts>_hybrid_search_indexes/migration.sql` | NEW — `pg_trgm`, GIN trigram index, HNSW index |
| `apps/ai-service/src/search/query-normalizer.ts` | NEW — `QueryNormalizer` class |
| `apps/ai-service/src/search/search.service.ts` | Add `vectorSearch`, `lexicalSearch`, `rrfFuse`; rewrite `similaritySearch` |
| `apps/ai-service/src/document/document.service.ts` | Replace `splitIntoChunks` with markdown-aware splitter; prefix chunks with `Section:` header |
| `apps/ai-service/src/document/document.controller.ts` | Add `POST /documents/reindex` (or CLI script) to backfill existing docs |
| `apps/ai-service/src/search/search.service.spec.ts` | NEW — unit tests for `rrfFuse`, `QueryNormalizer`, tag-query routing |
| `apps/ai-service/src/document/document.service.spec.ts` | UPDATE — tests for markdown chunker boundaries |

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Switching embedding model to `bge-m3` | Larger change; defer until hybrid measured |
| Cross-encoder re-ranker (`bge-reranker-v2-m3`) | P3 polish; revisit after hybrid + chunking land |
| Query expansion via LLM paraphrase | Adds latency; hybrid + structural chunks should suffice for the `<faq>` case |
| Frontend changes | Backend-only — Chat MFE / Docs MFE unchanged |
| Capability detector logic | Already routed correctly; unrelated to retrieval quality |
| `nomic-embed-text` model upgrade in `docker-compose.yml` | Out of scope this epic |

---

## Constraints

- All chunk re-indexing must be idempotent — running the backfill twice must produce
  the same number of chunks (delete-then-insert per `document_id` within a transaction)
- HNSW index must be created with `WITH (m = 16, ef_construction = 64)` defaults — do
  not tune yet
- `QueryNormalizer.isTagQuery` regex must NOT match closing tags (`</faq>`) — only
  self-contained tag-shaped queries
- Lexical search SQL must use parameterized `Prisma.sql` — no string interpolation of
  user input
- RRF implementation must be pure-function and unit-testable (no I/O)
- `SearchService.similaritySearch` public signature MUST remain
  `(query: string, limit?: number, filePathPrefix?: string)` — additive only
- All new code, comments, and log messages in English

---

## Success Criteria

1. `nx test ai-service` passes — 0 TypeScript errors, 0 test failures
2. Query `<faq>` returns the FAQ documentation chunk in top-3 on 10/10 consecutive runs
3. Query `тег FAQ` returns the same FAQ chunk as `<faq>` (set intersection of top-3
   non-empty)
4. `EXPLAIN ANALYZE` of the lexical query shows `Bitmap Index Scan on
   chunks_content_trgm_idx` — confirming the trigram index is used
5. `EXPLAIN ANALYZE` of the vector query shows `Index Scan using
   chunks_embedding_hnsw_idx` — confirming HNSW index is used
6. Re-indexed chunks contain `Section:` prefix verified via
   `SELECT content FROM chunks LIMIT 5`
7. Logs from a single search show non-empty `vectorRows` AND `lexicalRows` counts plus
   `top3` JSON line
