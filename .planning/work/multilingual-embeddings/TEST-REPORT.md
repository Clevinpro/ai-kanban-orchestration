# Epic Test Report — multilingual-embeddings

Verdict: PASS
Generated: 2026-06-09T12:40:00+03:00
Tasks verified: 4 (all done)
SPEC: .planning/work/multilingual-embeddings/SPEC.md

## Acceptance Criteria

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| AC-01 | New migration `vector(768)→vector(1024)`; `schema.prisma:56` = `Unsupported("vector(1024)")` | PASS | TASK-001 review/TL APPROVED; verified migration `20260609120700_embeddings_1024_multilingual/migration.sql` + `schema.prisma:56` |
| AC-02 | Drop HNSW → truncate → alter → recreate HNSW (`m=16, ef_construction=64`) in order; trgm GIN untouched | PASS | TASK-001; migration SQL confirmed exact order, trgm index never referenced |
| AC-03 | `embedding_provider_state` gains `model` TEXT nullable; schema + migration both updated | PASS | TASK-001; `ADD COLUMN "model" TEXT` + `model String?` in schema |
| AC-04 | `detectAndHandleProviderChange()` compares `(provider, model)` composite; fires when either differs; model resolved from provider env defaults | PASS | TASK-003 review/TL APPROVED; vault-sync.service.ts:77-98, `resolveActiveModel()` single-sourced |
| AC-05 | upsert/read persist + return both `provider` and `model` | PASS | TASK-003; `readStoredState()`/`upsertStoredState()` (vault-sync.service.ts:128-145) |
| AC-06 | Defaults all 1024-dim multilingual: lmstudio/ollama `bge-m3`, OpenAI `dimensions: 1024` | PASS | TASK-002; `DEFAULT_MULTILINGUAL_EMBEDDING_MODEL='bge-m3'`, OpenAI body sends dims |
| AC-07 | OpenAI `DIMENSIONS 768→1024`; body sends `dimensions: 1024` | PASS | TASK-002; `DIMENSIONS = EXPECTED_EMBEDDING_DIM`, body lines 83/105 |
| AC-08 | Single `EXPECTED_EMBEDDING_DIM=1024`; guard throws `Embedding dimension mismatch: model=<m>, expected=1024, got=<n>` | PASS | TASK-002; `embeddings.constants.ts:9,34-36` `assertEmbeddingDimension` |
| AC-09 | First boot fingerprint differs → truncate → auto re-index | PASS | TASK-003; first boot `model=NULL` ≠ resolved `bge-m3` → truncate + vault re-scan |
| AC-10 | SearchService SQL / RRF / DocumentService chunking unchanged | PASS | TASK-004; no search.service/document.service in changed set; `::vector` casts dim-agnostic |
| AC-11 | `.env.example` updated: bge-m3 defaults, 1024 note, OpenAI dims note, load/pull-before-boot warning | PASS | TASK-003; `.env.example` carries all required notes |
| AC-12 | `nx test ai-service` passes; guard pass/mismatch, fingerprint, OpenAI dims covered | PASS | Live run: 19 suites / 198 tests passed; TASK-004 covers guard, fingerprint, OpenAI body |

## Summary

PASS — all 12 acceptance criteria verified across 4 done tasks. The platform moved to a multilingual 1024-dim embedding space: the Prisma migration drops the HNSW index, truncates chunks, widens `embedding` to `vector(1024)`, recreates the cosine HNSW index, and adds a nullable `model` column (AC-01/02/03). Provider-change detection now keys on a composite `(provider, model)` fingerprint resolved from single-sourced provider defaults, persisting and reading both fields so a model-only swap or first boot auto-truncates and re-indexes (AC-04/05/09). All three providers default to 1024-dim multilingual models (`bge-m3` for lmstudio/ollama, OpenAI `dimensions: 1024`), governed by a single `EXPECTED_EMBEDDING_DIM=1024` with a fail-fast dimension guard (AC-06/07/08). Search SQL, RRF, and chunking are untouched (AC-10), `.env.example` documents the new defaults and pre-boot requirements (AC-11), and a live `nx test ai-service` run is green at 198 tests covering the guard, fingerprint, and OpenAI-dimensions paths (AC-12).
