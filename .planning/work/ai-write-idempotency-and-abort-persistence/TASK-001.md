---
id: TASK-001
title: Add runId column + @@unique([runId, role]) to Message with drift-safe migration
status: done
priority: high
repo: be
epic: ai-write-idempotency-and-abort-persistence
complexity: 4
created-at: 2026-06-23T21:21:00+03:00
updated-at: 2026-06-23T21:56:06+03:00
started-at: 2026-06-23T21:30:08+03:00
completed-at: 2026-06-23T21:56:06+03:00
spec: .planning/work/ai-write-idempotency-and-abort-persistence/SPEC.md
---

## Description

Add a `runId` correlation column and a `(runId, role)` unique constraint to the
`Message` model so that conversation writes can be made idempotent under Kafka
at-least-once redelivery (the upsert key is added in TASK-003). Generate the
Prisma migration and verify the generated SQL does NOT drop the existing raw
trgm/hnsw indexes on the chunks table.

## Acceptance Criteria

- [ ] `Message` model has `runId String? @map("run_id")` (nullable for back-compat).
- [ ] `Message` model has `@@unique([runId, role])`.
- [ ] A new migration exists under `libs/database/prisma/migrations/` adding the
      column and the unique index.
- [ ] The generated migration SQL does NOT drop the raw trgm/hnsw chunk indexes;
      if `prisma migrate dev` emitted DROPs for them, they are re-added in the
      same migration.
- [ ] Prisma client regenerates and the service type-checks
      (`npx tsc --noEmit -p apps/ai-service/tsconfig.app.json`).

## Technical Notes

- File: `ai-platform/libs/database/prisma/schema.prisma` — `Message` model at
  lines ~80-91 (currently: id, conversationId, role, content, createdAt, relation,
  `@@index([conversationId, createdAt])`, `@@map("messages")`).
- `runId` is nullable on purpose: Postgres treats multiple NULLs as distinct, so
  legacy rows with no `runId` won't collide on `@@unique([runId, role])`.
- ⚠ **Prisma-drift trap** (project memory `project_prisma_drift_drops_raw_indexes`):
  `prisma migrate dev` can silently emit `DROP INDEX` for the raw trgm/hnsw indexes
  that were added via raw SQL (not modelled in schema.prisma). Inspect the generated
  `migration.sql` before considering this done; re-append the `CREATE INDEX` for any
  dropped trgm/hnsw index.
- Do NOT touch `saveMessage`/upsert logic here — that is TASK-003. This task is
  schema + migration + regenerated client only.
- Keep `@@map("messages")` and the existing `@@index([conversationId, createdAt])`.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the Prisma schema change and both migrations (restored orphan `20260616000000_add_message_run_id` and new `20260623213000_message_run_id_role_unique`). Schema correctly adds nullable `runId String? @map("run_id")` and `@@unique([runId, role])` while preserving `@@map("messages")` and the existing `@@index([conversationId, createdAt])`. Both migrations re-assert the raw `chunks_content_trgm_idx`/`chunks_embedding_hnsw_idx` via idempotent `CREATE INDEX IF NOT EXISTS` and emit no DROP for them, correctly sidestepping the documented Prisma-drift trap; the second migration cleanly drops the intermediate single-column unique. No index-name collisions, timestamps order correctly after existing history, and migration_lock.toml provider matches. Overall the change is coherent, drift-safe, and meets all acceptance criteria; tsc-clean was reported by the developer (not independently re-runnable in read-only review).
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" because the TASK-001 schema/migration changes are still uncommitted in the working tree (HEAD~1..HEAD only contained research/.gitignore changes). Re-running against the actual working-tree change (`--files=libs/database/prisma/schema.prisma`) ran all 4 affected projects and all passed:

- database: no tests found (passWithNoTests), exit 0
- auth-service: 1 suite, 1 test passed
- api-gateway: 3 suites, 22 tests passed
- ai-service: 25 suites, 337 tests passed

Total: 360 tests passed, 0 failed. Successfully ran target test for 4 projects.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway:4000=UP, auth-service:4002=UP, ai-service:4001=UP.

All acceptance criteria verified:
- AC-1 (`runId String? @map("run_id")`): PASS — present at schema.prisma:85.
- AC-2 (`@@unique([runId, role])`): PASS — present at schema.prisma:90; `@@map("messages")` and `@@index([conversationId, createdAt])` preserved.
- AC-3 (new migration adds column + unique index): PASS — `20260623213000_message_run_id_role_unique` drops the intermediate single-column unique and creates the composite `(run_id, role)` unique; column added by restored `20260616000000_add_message_run_id`.
- AC-4 (migration does NOT drop trgm/hnsw chunk indexes): PASS — neither migration emits a DROP for `chunks_content_trgm_idx`/`chunks_embedding_hnsw_idx`; both are re-asserted via `CREATE INDEX IF NOT EXISTS`, sidestepping the documented Prisma-drift trap.
- AC-5 (client regenerates + service type-checks): PASS — `npx tsc --noEmit -p apps/ai-service/tsconfig.app.json` exited 0.
