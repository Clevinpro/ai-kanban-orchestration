---
id: TASK-006
title: Recipe-version fingerprint — recipe_version column, detection, INDEX_RECIPE_VERSION bump, .env docs
status: done
priority: high
repo: be
epic: contextual-retrieval
complexity: 3
created-at: 2026-06-09T09:40:04Z
updated-at: 2026-06-09T13:31:06+03:00
started-at: 2026-06-09T13:22:59+03:00
completed-at: 2026-06-09T13:31:06+03:00
spec: .planning/work/contextual-retrieval/SPEC.md
---

## Description

Generalize the `multilingual-embeddings` `(provider, model)` re-index fingerprint to include the index recipe. Add a `recipe_version` column to `embedding_provider_state` (Prisma migration + `schema.prisma`). Extend detection in `vault-sync.service.ts` to compare `(provider, model, recipe_version)` and truncate-chunks + reindex when ANY differs; `upsert`/`read` of stored-state must persist and compare all three fields. Add a single `INDEX_RECIPE_VERSION` constant as the source of truth (near `EXPECTED_EMBEDDING_DIM` in `embeddings.constants.ts`, or shared) and bump it in this epic so the first boot after deploy auto-truncates chunks and reindexes the vault into the new recipe. Document the contextual-retrieval flags in `.env.example`. Land last so the single auto-reindex captures all new logic from prior tasks.

## Acceptance Criteria

- [ ] `embedding_provider_state` gains `recipe_version` column (migration + `schema.prisma`) (AC-12)
- [ ] `vault-sync.service.ts` detection compares `(provider, model, recipe_version)`; truncates chunks + reindexes when any differs (AC-12)
- [ ] Single `INDEX_RECIPE_VERSION` constant is source of truth, bumped by this epic so first boot auto-reindexes (AC-13)
- [ ] `upsert`/`read` stored-state persist + compare all three fields (AC-14)
- [ ] `.env.example` documents `CONTEXTUAL_RETRIEVAL_ENABLED`, `CONTEXTUAL_RETRIEVAL_CONCURRENCY`, that `AI_PROVIDER` is the context LLM, and the index-latency tradeoff (AC-21)
- [ ] `nx test ai-service` passes

## Technical Notes

- Files: `libs/database/prisma/schema.prisma` (+ column), new migration `libs/database/prisma/migrations/<ts>_add_recipe_version/`, `apps/ai-service/src/vault/vault-sync.service.ts`, `apps/ai-service/src/embeddings/embeddings.constants.ts`.
- SQL: `ALTER TABLE "embedding_provider_state" ADD COLUMN "recipe_version" TEXT;`
- Detection logic in SPEC §"Recipe-version fingerprint": changed = stored && (provider|model|recipeVersion differs) → truncate + delete vault docs → startup scan reindexes.
- Depends on `multilingual-embeddings` `(provider, model)` fingerprint already merged.
- MUST be the last code task — bump captures all prior chunking/casing/context/batch logic in one reindex.

---REVIEW-BLOCK-START---
## Code Review

Status: CHANGES_REQUESTED

**Issues:**
- ai-platform/libs/database/prisma/migrations/ — No migration adds the `recipe_version` column. The only embeddings-related migration (`20260609120700_embeddings_1024_multilingual/migration.sql`) stops at line 18 with `ALTER TABLE "embedding_provider_state" ADD COLUMN "model" TEXT;` and never runs `ALTER TABLE "embedding_provider_state" ADD COLUMN "recipe_version" TEXT;`. The task's required `<ts>_add_recipe_version/` migration does not exist on disk. BLOCKER — violates AC-12.
- ai-platform/apps/ai-service/src/vault/vault-sync.service.ts:138-162 — `readStoredState()` (`SELECT ... "recipe_version"`) and `upsertStoredState()` (`INSERT ... "recipe_version" ...`) reference a column that no migration creates. On `prisma migrate deploy` against a clean DB, these raw queries fail at boot with "column \"recipe_version\" does not exist". Because `runProviderCheckAndStartupScan()` has no try/catch and is fired via `void` in `onModuleInit`, the rejection is unhandled and the startup vault scan never runs — the vault is never (re)indexed. BLOCKER — consequence of the missing migration.

`schema.prisma` (recipeVersion column), `embeddings.constants.ts` (INDEX_RECIPE_VERSION = 'v2'), the composite `(provider, model, recipe_version)` detection logic, `.env.example` docs (AC-21), and the new/updated specs are all correct and well-tested. The sole blocking defect is that the schema and runtime SQL depend on a `recipe_version` column for which no migration was authored; add the `ALTER TABLE ... ADD COLUMN "recipe_version" TEXT;` migration before this can land.
---REVIEW-BLOCK-END---

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Re-reviewed the full changeset including the previously-missed migration. The `20260609131000_add_recipe_version/migration.sql` correctly runs `ALTER TABLE "embedding_provider_state" ADD COLUMN "recipe_version" TEXT;` and sorts after the multilingual migration that creates the table's `model` column, so column dependencies resolve in order — the cycle 1 BLOCKER was a false positive. All five ACs are satisfied: schema.prisma maps `recipeVersion → recipe_version`, composite `(provider, model, recipe_version)` detection truncates and reindexes on any field change, `INDEX_RECIPE_VERSION = 'v2'` is single-sourced and bumped, read/upsert persist and compare all three fields, and `.env.example` documents the contextual-retrieval flags plus the index-latency tradeoff. Raw SQL column names align with the Prisma `@map` names and the new tests cover provider-only, model-only, recipe-only, and first-boot paths. Clean, well-tested work.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit 0) because the HEAD~1..HEAD window contains only planning files — the TASK-006 implementation lives uncommitted in the working tree (all under the `ai-service` project: `vault-sync.service.ts`, `embeddings.constants.ts`, `schema.prisma`, plus specs). Ran the affected project's test target directly to validate: `nx test ai-service` -> 19 suites passed, 220 tests passed (exit 0). Covers provider-only, model-only, recipe-only, and first-boot reindex detection paths.

## TeamLead Check

Status: APPROVED

All acceptance criteria for TASK-006 verified against the implementation:
- AC-12: `recipe_version` column added via migration `20260609131000_add_recipe_version/migration.sql` (`ALTER TABLE "embedding_provider_state" ADD COLUMN "recipe_version" TEXT;`) — sorts after the multilingual migration that creates the `model` column, so dependencies resolve in order. `schema.prisma` maps `recipeVersion String? @map("recipe_version")`. `vault-sync.service.ts:88-104` composite detection compares `(provider, model, recipeVersion)` and truncates chunks + deletes vault docs when any differs.
- AC-13: `INDEX_RECIPE_VERSION = 'v2'` is single-sourced in `embeddings.constants.ts` and consumed by vault-sync; bumped from the implicit v1 baseline so first boot auto-reindexes.
- AC-14: `readStoredState()` selects all three fields; `upsertStoredState()` persists and the upsert ON CONFLICT updates all three.
- AC-21: `.env.example` documents `CONTEXTUAL_RETRIEVAL_ENABLED`, `CONTEXTUAL_RETRIEVAL_CONCURRENCY`, that `AI_PROVIDER` is the context chat LLM, and the index-latency/cost tradeoff.
- `nx test ai-service`: 19 suites / 220 tests pass; recipe-only, provider-only, model-only, and first-boot detection paths covered.

The cycle-1 BLOCKER (missing migration) was resolved in the second developer pass and confirmed a false positive by the re-review.
