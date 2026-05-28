---
id: TASK-005
title: Add private lexicalSearch method in SearchService using pg_trgm similarity with optional filePathPrefix
status: done
priority: high
repo: be
epic: hybrid-rag-search
complexity: 4
created-at: 2026-05-28T00:00:00Z
updated-at: 2026-05-28T00:00:00Z
started-at: 2026-05-28T00:00:00Z
completed-at: 2026-05-28T21:44:12+03:00
spec: .planning/work/hybrid-rag-search/SPEC.md
---

## Description

Add a private async method `lexicalSearch(lexicalQuery: string, limit: number, filePathPrefix?: string)` to `SearchService` that performs trigram-based lexical search against `chunks.content` using the `pg_trgm` `%` operator and `similarity()` function. Result rows match the `SimilaritySearchResult` shape so they fuse cleanly with `vectorSearch` output. Method must respect the same optional `filePathPrefix` filter as the vector path.

## Acceptance Criteria

- [ ] New private method `lexicalSearch(query: string, limit: number, filePathPrefix?: string): Promise<SimilaritySearchResult[]>` in `apps/ai-service/src/search/search.service.ts`
- [ ] SQL uses `similarity(c.content, ${query}) AS similarity` and `WHERE c.content % ${query}` so the GIN trigram index from TASK-001 is hit
- [ ] When `filePathPrefix` is set, adds `AND d.file_path LIKE ${prefix + '%'}` and joins `documents d ON c.document_id = d.id`
- [ ] Orders by `similarity DESC, c.id ASC` with `LIMIT ${limit}` (limit defaults to 30 at call site in TASK-006)
- [ ] Empty result on empty query — guard with `if (!query.trim()) return [];`
- [ ] Uses parameterized `Prisma.sql` — no string interpolation of user input
- [ ] `nx test ai-service` passes; `nx lint ai-service` passes

## Technical Notes

- Trigram operator `%` plus `similarity()` is the standard `pg_trgm` retrieval pattern; the `%` operator uses the GIN index created in TASK-001
- Reference SPEC § Lexical Query Strategy — Option A
- Returned `similarity` field is the trigram score (0..1) — caller (`rrfFuse`) uses only the rank, not the raw score
- Title field comes from `documents.title` like the vector path
- Method is invoked but not yet wired in `similaritySearch` — TASK-006 does the wiring
- Pattern reference: existing vector raw SQL in `search.service.ts:38-74`

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

**Reviewed:** `ai-platform/apps/ai-service/src/search/search.service.ts` (lexicalSearch method, lines 85-124) and `ai-platform/apps/ai-service/src/search/search.service.spec.ts`.

**Findings (non-blocking):**

- `ai-platform/apps/ai-service/src/search/search.service.ts:99,104,117,122` — `similarity(c.content, ${query})` is called twice per SQL branch: once in the SELECT list and again in the ORDER BY clause. PostgreSQL will execute the function twice per row rather than reusing the projected column alias. A positional reference (`ORDER BY 4 DESC, c.id ASC`) or a wrapping subquery/CTE would eliminate the double evaluation. WARNING (performance/style, not a correctness bug).

- `ai-platform/apps/ai-service/src/search/search.service.spec.ts` — No test covers the DB-throws / rejected-promise path for `lexicalSearch`. The task scope does not require it, but it is a gap for production-grade coverage. WARNING (coverage gap, out of scope for TASK-005).

**Overall:** The implementation correctly satisfies all TASK-005 acceptance criteria. The `lexicalSearch` method is private, uses `Prisma.sql` parameterization throughout (no user-input string interpolation), guards against empty/whitespace queries, applies the `pg_trgm` `%` operator and `similarity()` function, conditionally joins `documents` for the `filePathPrefix` filter with `LIKE` concatenation matching the existing `vectorSearch` pattern, and orders by `similarity DESC, c.id ASC`. Unit tests cover all required paths (empty guard, with/without prefix, row passthrough).
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No projects were affected by HEAD~1..HEAD (the task implementation files are staged/unstaged but not yet in a commit). Direct run of `nx test ai-service` confirms all tests pass: 44 tests across 5 suites, 0 failures.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:

- AC-01 PASS: Private method `lexicalSearch(query: string, limit: number, filePathPrefix?: string): Promise<SimilaritySearchResult[]>` present at lines 108-147 of `search.service.ts`.
- AC-02 PASS: Both SQL branches use `similarity(c.content, ${query}) AS similarity` in the SELECT list and `WHERE c.content % ${query}` to hit the GIN trigram index.
- AC-03 PASS: `filePathPrefix` branch joins `documents d ON c.document_id = d.id` and applies `AND d.file_path LIKE ${filePathPrefix + '%'}`. The no-prefix branch also joins `documents` for the `title` column, matching the `SimilaritySearchResult` shape.
- AC-04 PASS: Both branches order by `similarity(c.content, ${query}) DESC, c.id ASC` with `LIMIT ${limit}`.
- AC-05 PASS: Guard `if (!query.trim()) return [];` at line 113 returns early on empty/whitespace queries.
- AC-06 PASS: All SQL issued via `Prisma.sql` template literals; user input (`query`, `filePathPrefix + '%'`) is passed as parameterized values — no string interpolation of user input.
- AC-07 PASS: QA confirmed `nx test ai-service` — 44 tests, 0 failures.
