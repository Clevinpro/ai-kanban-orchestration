---
tags: [epic, planning]
epic: hybrid-rag-search
updated: 2026-05-28
---

# Epic: hybrid-rag-search

## Progress

```
████████████████████░░  10 / 10 (100%)
```

## Tasks

| ID | Title | Status | Repo | Complexity |
|----|-------|--------|------|------------|
| TASK-001 | Add Prisma migration creating pg_trgm extension, GIN trigram index on chunks.content, and HNSW index on chunks.embedding | ✅ done | be | 3 |
| TASK-002 | Add QueryNormalizer class (normalize + isTagQuery) with unit tests | ✅ done | be | 3 |
| TASK-003 | Add rrfFuse pure helper to SearchService with unit tests covering tag-boost weights | ✅ done | be | 4 |
| TASK-004 | Extract current vector SQL in SearchService into private vectorSearch method with optional filePathPrefix | ✅ done | be | 3 |
| TASK-005 | Add private lexicalSearch method in SearchService using pg_trgm similarity with optional filePathPrefix | ✅ done | be | 4 |
| TASK-006 | Rewrite SearchService.similaritySearch to run parallel hybrid retrieval, RRF fuse, tag-query boost, and top-3 score logging | ✅ done | be | 5 |
| TASK-007 | Replace DocumentService.splitIntoChunks with markdown-aware splitter respecting heading and numbered-list boundaries | ✅ done | be | 6 |
| TASK-008 | Update DocumentService.uploadDocument to prefix each chunk content with `Section: <header>\\n` before embedding | ✅ done | be | 3 |
| TASK-009 | Update document.service.spec.ts to cover markdown chunker boundary behaviour | ✅ done | be | 3 |
| TASK-010 | Add POST /documents/reindex endpoint to re-chunk and re-embed all existing documents idempotently within a transaction | ✅ done | be | 5 |
