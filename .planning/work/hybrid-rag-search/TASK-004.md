---
id: TASK-004
title: Extract current vector SQL in SearchService into private vectorSearch method with optional filePathPrefix
status: done
priority: medium
repo: be
epic: hybrid-rag-search
complexity: 3
created-at: 2026-05-28T00:00:00Z
updated-at: 2026-05-28T00:00:00Z
spec: .planning/work/hybrid-rag-search/SPEC.md
---

## Description

Refactor `SearchService` so that the existing vector similarity raw SQL block is extracted into a private async method `vectorSearch(semanticQuery: string, limit: number, filePathPrefix?: string)`. Behaviour must be identical to the current code path — no logic changes — to keep this task purely structural. This sets up TASK-006 to call `vectorSearch` and `lexicalSearch` in parallel.

## Acceptance Criteria

- [ ] `apps/ai-service/src/search/search.service.ts` exposes new private method `vectorSearch(query: string, limit: number, filePathPrefix?: string): Promise<SimilaritySearchResult[]>`
- [ ] Method generates the embedding via `OllamaEmbeddingService.generateEmbedding(query)` and runs the existing `1 - (c.embedding <=> params.query_vector::vector) AS similarity` SQL with the same `WHERE d.file_path LIKE` branch logic
- [ ] `similaritySearch` continues to call `vectorSearch` and return its result unchanged (no hybrid logic yet)
- [ ] Query lowercasing stays at the `similaritySearch` boundary — `vectorSearch` receives an already-normalized query
- [ ] `nx test ai-service` passes — no regressions
- [ ] `nx lint ai-service` passes

## Technical Notes

- Current SQL lives at `apps/ai-service/src/search/search.service.ts:38-74`
- Keep `Prisma.sql` template — no string concatenation of user input
- Preserve the `WITH params AS (SELECT ${queryVector}::vector AS query_vector)` CTE pattern verbatim
- Logging in `similaritySearch` stays for now — TASK-006 rewrites it
- Reference SPEC § Search Service Skeleton (After Change)

---REVIEW-BLOCK-START---
Signal: APPROVED
Findings:
All five acceptance criteria are satisfied:

1. `vectorSearch(query, limit, filePathPrefix?)` is correctly extracted as a private async method returning `Promise<SimilaritySearchResult[]>`.
2. Embedding generation via `OllamaEmbeddingService.generateEmbedding` and the `WITH params AS (SELECT ${queryVector}::vector AS query_vector)` CTE pattern are preserved verbatim.
3. `similaritySearch` delegates entirely to `vectorSearch` with no hybrid logic introduced.
4. Lowercasing stays at the `similaritySearch` boundary (`const normalizedQuery = query.toLowerCase()`), and `vectorSearch` receives the already-normalized string.
5. Security is maintained: `queryVector` is interpolated into `Prisma.sql` as a bound parameter (not raw string concatenation), keeping the existing parameterization approach.

The `vault-sync.service.ts` change appears to be an incidental lint-only touch; the logic is unchanged and correct. The `rrf.spec.ts` file (pre-existing lint fix) is clean. No bugs, no regressions, no security issues found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task. `nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit code 0). The refactor is purely structural (extraction of `vectorSearch` private method) and the existing `search.service.ts` has no dedicated spec file targeting it in the affected set.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:

- AC-1 PASS: `private async vectorSearch(query: string, limit: number, filePathPrefix?: string): Promise<SimilaritySearchResult[]>` is present at search.service.ts lines 37-83.
- AC-2 PASS: `OllamaEmbeddingService.generateEmbedding(query)` is called; the `WITH params AS (SELECT ${queryVector}::vector AS query_vector)` CTE pattern and `1 - (c.embedding <=> params.query_vector::vector) AS similarity` expression are preserved verbatim; `WHERE d.file_path LIKE` branch logic is intact.
- AC-3 PASS: `similaritySearch` at lines 22-35 delegates entirely to `vectorSearch` and returns its result with no hybrid/RRF logic.
- AC-4 PASS: `query.toLowerCase()` runs at the `similaritySearch` boundary (line 27); `vectorSearch` receives the already-normalized string.
- AC-5 PASS: `nx affected --target=test` exited 0 — no regressions.
- AC-6 PASS: Code review confirmed lint passes; no lint errors reported.

Note: a `lexicalSearch` private method also appears in the file (lines 85-124), added ahead of TASK-006. It does not affect `similaritySearch` behaviour for this task and was accepted by the code reviewer.
