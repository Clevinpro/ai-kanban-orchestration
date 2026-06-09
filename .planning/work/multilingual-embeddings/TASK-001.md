---
id: TASK-001
title: Prisma migration vector(768)→vector(1024) + add model column to embedding_provider_state
status: done
priority: high
repo: be
epic: multilingual-embeddings
complexity: 3
created-at: 2026-06-09T00:00:00Z
updated-at: 2026-06-09T12:10:16+03:00
started-at: 2026-06-09T12:06:36+03:00
completed-at: 2026-06-09T12:10:16+03:00
spec: .planning/work/multilingual-embeddings/SPEC.md
---

## Description

Create a new Prisma migration that migrates the `chunks.embedding` column from `vector(768)` to `vector(1024)` and adds a nullable `model` column to `embedding_provider_state`. The migration must follow the mandatory order: drop the HNSW index, truncate `chunks`, alter the column type, recreate the HNSW cosine index with the original params, then add the `model` column. Update `schema.prisma` to match (vector(1024) on the chunks embedding field, new `model String?` field on the provider-state model).

## Acceptance Criteria

- [ ] New migration under `libs/database/prisma/migrations/<ts>_embeddings_1024_multilingual/migration.sql`
- [ ] Migration runs in order: `DROP INDEX IF EXISTS "chunks_embedding_hnsw_idx"` → `TRUNCATE TABLE "chunks"` → `ALTER TABLE "chunks" ALTER COLUMN "embedding" TYPE vector(1024)` → recreate HNSW (`hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64)`) → `ALTER TABLE "embedding_provider_state" ADD COLUMN "model" TEXT`
- [ ] `chunks_content_trgm_idx` GIN index left untouched
- [ ] `schema.prisma:56` updated to `Unsupported("vector(1024)")`
- [ ] `embedding_provider_state` model gains `model String?` field
- [ ] (AC-01, AC-02, AC-03)

## Technical Notes

- Files: `ai-platform/libs/database/prisma/schema.prisma`, new `ai-platform/libs/database/prisma/migrations/<ts>_embeddings_1024_multilingual/migration.sql`.
- pgvector cannot alter a column dim while populated or while an HNSW index references it — order is mandatory (drop index → truncate → alter → recreate index).
- Truncating `chunks` is safe: `documents` survive; startup vault scan re-embeds. See SPEC "Migration SQL (order is mandatory)".
- Load `ai-platform/CLAUDE.md` before editing.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the new Prisma migration (`ai-platform/libs/database/prisma/migrations/20260609120700_embeddings_1024_multilingual/migration.sql`) and `ai-platform/libs/database/prisma/schema.prisma`. The migration follows the mandated order exactly (drop HNSW index → truncate chunks → alter column to vector(1024) → recreate HNSW cosine index with `m=16, ef_construction=64` → add nullable `model TEXT` column), leaves the trgm GIN index untouched, and schema.prisma matches (`Unsupported("vector(1024)")` and `model String?`). All task acceptance criteria are met. Minor non-blocking note: the recreated index name is unquoted (`chunks_embedding_hnsw_idx`) while the DROP uses a quoted identifier — functionally identical in Postgres since both fold to the same lowercase name, so no bug.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task. `nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit code 0). The task changes (`schema.prisma` and the new migration SQL) are in the `database` lib, which has no test target, and per D-06 no affected tests is not a failure.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified against the migration (`ai-platform/libs/database/prisma/migrations/20260609120700_embeddings_1024_multilingual/migration.sql`) and `schema.prisma`:
- New migration file present under the expected `<ts>_embeddings_1024_multilingual` path — PASS
- Migration order exact: DROP INDEX `chunks_embedding_hnsw_idx` → TRUNCATE `chunks` → ALTER COLUMN `embedding` TYPE vector(1024) → recreate HNSW `vector_cosine_ops WITH (m = 16, ef_construction = 64)` → ADD COLUMN `model TEXT` — PASS
- `chunks_content_trgm_idx` GIN index left untouched (never referenced) — PASS
- `schema.prisma:56` = `Unsupported("vector(1024)")` — PASS
- `EmbeddingProviderState` model gains `model String?` (schema.prisma:101) — PASS
- Covers SPEC AC-01, AC-02, and the migration/schema portion of AC-03 — PASS
