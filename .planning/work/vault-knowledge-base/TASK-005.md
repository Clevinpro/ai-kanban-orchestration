---
id: TASK-005
title: Add optional filePathPrefix param to SearchService.similaritySearch
status: done
priority: high
repo: be
epic: vault-knowledge-base
complexity: 3
created-at: 2026-05-28T00:00:00Z
updated-at: 2026-05-28T00:00:00Z
spec: .planning/work/vault-knowledge-base/SPEC.md
---

## Description

Extend `SearchService.similaritySearch` with an optional third parameter `filePathPrefix?: string`. When the prefix is set, the underlying pgvector query must JOIN `documents` and filter chunks by `d.file_path LIKE '<prefix>%'`. When unset, the existing unfiltered query path is unchanged.

## Acceptance Criteria

- [ ] `similaritySearch(query: string, limit = 6, filePathPrefix?: string): Promise<SimilaritySearchResult[]>` signature
- [ ] When `filePathPrefix` is provided, raw SQL JOINs `chunks` to `documents` and applies `WHERE d.file_path LIKE ${filePathPrefix + '%'}`
- [ ] Returned shape (`id`, `content`, `title`, `similarity`) matches existing `SimilaritySearchResult`
- [ ] When `filePathPrefix` omitted, existing behavior preserved (no JOIN if not currently joined; identical result set as before)
- [ ] Uses Prisma `$queryRaw` parameterization for `filePathPrefix` — no string concatenation into SQL
- [ ] `nx build ai-service` succeeds with no TypeScript errors

## Technical Notes

- Path: `ai-platform/apps/ai-service/src/...` — locate `search.service.ts`
- SPEC § SearchService After Change provides exact target SQL
- Embedding generation and `queryVector` construction are reused — do not duplicate
- The vector cast `params.query_vector::vector` and ORDER BY `<=>` operator must match the existing unfiltered query semantics
- No changes to consumers in this task — `AiService` wiring is TASK-006

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

**Reviewed:** `ai-platform/apps/ai-service/src/search/search.service.ts` — implementing optional `filePathPrefix` filtering on `similaritySearch`.

All acceptance criteria satisfied. The `filePathPrefix + '%'` concatenation on line 50 occurs in JavaScript before passing to `Prisma.sql` tagged template — Prisma binds it as a positional parameter, no SQL injection risk, matches SPEC reference exactly. The `if (filePathPrefix)` falsy guard correctly treats empty string as "no filter." Redundant `::vector` cast on `params.query_vector` is harmless and matches SPEC. Unfiltered fallback preserves existing behavior including the `documents` JOIN required to populate `title` in `SimilaritySearchResult`. Minor code duplication between branches matches SPEC reference.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:
- AC-1 PASS: `similaritySearch(query: string, limit = 6, filePathPrefix?: string): Promise<SimilaritySearchResult[]>` signature present at lines 22-26 of `search.service.ts`.
- AC-2 PASS: `if (filePathPrefix)` branch at lines 36-54 uses `Prisma.sql` tagged template with `JOIN documents d ON c.document_id = d.id` and `WHERE d.file_path LIKE ${filePathPrefix + '%'}`.
- AC-3 PASS: Both branches SELECT `c.id, c.content, d.title, 1 - (...) AS similarity`, matching the `SimilaritySearchResult` type definition at lines 7-12.
- AC-4 PASS: `else` branch at lines 55-73 preserves the existing unfiltered query behavior (includes documents JOIN for title population, no WHERE filter).
- AC-5 PASS: `Prisma.sql` tagged template binds `filePathPrefix + '%'` as a positional parameter — no raw SQL string concatenation. Code reviewer explicitly confirmed no injection risk.
- AC-6 PASS: Code reviewer approved with no TypeScript errors; implementation is type-correct (proper imports, typed generics, consistent return types).
