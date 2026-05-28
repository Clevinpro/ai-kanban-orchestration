---
id: TASK-005
title: Add optional filePathPrefix param to SearchService.similaritySearch
status: readyForDevelop
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
