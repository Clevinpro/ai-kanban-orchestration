---
id: TASK-005
title: Add embedding_provider_state Prisma table + provider-switch detection and re-index in VaultSyncService
status: done
priority: high
repo: be
epic: fast-embeddings
complexity: 4
created-at: 2026-05-28T12:00:00.000Z
updated-at: 2026-05-28T12:00:00.000Z
started-at: 2026-05-28T21:45:03+03:00
completed-at: 2026-05-28T21:45:31+03:00
spec: .planning/work/fast-embeddings/SPEC.md
---

## Description

Add a new Prisma model `EmbeddingProviderState` (maps to table `embedding_provider_state`) with a singleton-row constraint (`id` always 1). Run `npx prisma migrate dev` to generate the migration. In `VaultSyncService.onModuleInit`, before the existing `runStartupScan()` call, add provider-switch detection: read the stored provider from the DB; if it differs from the current `EMBEDDING_PROVIDER` env var, log a warning, truncate the `chunks` table, and delete all vault document rows (those with `file_path LIKE 'docs/obsidian-vault/%'`); then upsert the current provider name into `embedding_provider_state`. The existing `runStartupScan()` runs after and re-indexes everything.

## Acceptance Criteria

- [ ] `embedding_provider_state` table exists in Prisma schema with fields: `id Int @id @default(1)`, `provider String`, `updatedAt DateTime @default(now()) @updatedAt`
- [ ] Migration generated via `npx prisma migrate dev --name add-embedding-provider-state`
- [ ] On first boot (no stored row), provider is upserted, no truncation occurs
- [ ] On boot with matching provider, no truncation occurs
- [ ] On boot with changed provider, `chunks` truncated and vault docs deleted before `runStartupScan()` runs
- [ ] Warning log on provider change: `Embedding provider changed: <old> → <new>; truncating chunks`
- [ ] `upsertStoredProvider` writes/updates the singleton row after detection logic
- [ ] `nx test ai-service` passes

## Technical Notes

- Prisma schema lives at `ai-platform/libs/database/prisma/schema.prisma`
- Run migration from `ai-platform/` directory: `cd ai-platform && npx prisma migrate dev --name add-embedding-provider-state`
- Singleton constraint: add `@@map("embedding_provider_state")` and ensure `id` defaults to 1; enforce in application code (upsert with `where: { id: 1 }, create: { id: 1, provider: active }, update: { provider: active }`)
- SQL for truncation: `this.prismaService.$executeRaw\`TRUNCATE TABLE "chunks"\`` and `this.prismaService.$executeRaw\`DELETE FROM "documents" WHERE "file_path" LIKE 'docs/obsidian-vault/%'\``
- `VaultSyncService` is at `apps/ai-service/src/vault/vault-sync.service.ts`
- `PrismaService` is already injected in `VaultSyncService` — no new DI needed
- Manually uploaded documents are NOT auto-re-indexed (source files deleted post-upload); this behavior is intentional and documented in SPEC

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

**Issues:**
- `ai-platform/apps/ai-service/src/vault/vault-sync.service.spec.ts:243,258,272-274` — `String(args[0])` to inspect Prisma tagged-template `$executeRaw` call arguments is fragile: it relies on `Array.prototype.toString` joining the template parts with commas. For statements with no interpolated values this happens to work, but the test intent is opaque and will silently break if interpolations are added. Using `JSON.stringify(args[0])` or checking the raw array element directly (`args[0][0]`) would be more explicit. Severity: WARNING.
- `ai-platform/apps/ai-service/src/vault/vault-sync.service.ts:73` — `TRUNCATE TABLE "chunks"` lacks `RESTART IDENTITY` or `CASCADE`. The `chunks` table has a FK to `documents` (`onDelete: Cascade` at Prisma level), but the underlying DB constraint direction is `chunks.document_id → documents.id`. Truncating `chunks` without `CASCADE` is fine since no tables reference `chunks`, and vault documents are deleted separately on the next line. No actual bug, but the intent would be clearer with an inline comment. Severity: WARNING (style only).

All acceptance criteria are met: the `EmbeddingProviderState` model is in the schema with the correct fields, migration SQL is present, `detectAndHandleProviderChange` correctly skips truncation on first boot and on matching provider, truncates + deletes on mismatch, logs the expected warning, and always upserts afterward. The `runProviderCheckAndStartupScan` wrapper preserves the contract that `runStartupScan` runs after the check. Test coverage for the new methods is thorough. The `.env.example` correctly documents the new `EMBEDDING_PROVIDER`, `OPENAI_API_KEY`, and `OPENAI_EMBEDDING_MODEL` variables with appropriate warnings.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected returned no projects (task changes are uncommitted working-tree modifications; HEAD~1..HEAD diff contains no ai-platform/ files). Tests were run directly via `nx test ai-service`.

Result: 9 test suites, 116 tests — all passed. No failures or errors.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:
- AC-1 PASS: `EmbeddingProviderState` model in schema.prisma with `id Int @id @default(1)`, `provider String`, `updatedAt DateTime @default(now()) @updatedAt @map("updated_at")`, and `@@map("embedding_provider_state")`.
- AC-2 PASS: Migration file `20260528130000_add_embedding_provider_state/migration.sql` present with correct `CREATE TABLE` DDL.
- AC-3 PASS: `readStoredProvider()` returns null when no row; `stored !== null` guard skips truncation; `upsertStoredProvider` still called. Unit test (line 233–248 of spec file) confirms.
- AC-4 PASS: `stored !== active` check prevents truncation when provider matches. Unit test (line 250–263) confirms.
- AC-5 PASS: `runProviderCheckAndStartupScan` calls `detectAndHandleProviderChange()` then `runStartupScan()` — truncation/delete happens before re-index. Unit tests confirm truncation path.
- AC-6 PASS: Warning log message `Embedding provider changed: ${stored} → ${active}; truncating chunks` at vault-sync.service.ts line 70–72. Unit test (line 277–288) asserts exact message content.
- AC-7 PASS: `upsertStoredProvider(active)` called unconditionally at line 78, after the conditional truncation block.
- AC-8 PASS: QA confirmed 9 test suites, 116 tests all passing via `nx test ai-service`.
