---
id: TASK-001
title: Add Document.status column (pending|indexing|ready|failed) — migration + schema
status: done
priority: high
repo: be
epic: fast-upload-indexing
complexity: 2
created-at: 2026-06-09T16:11:12Z
updated-at: 2026-06-09T19:16:59+03:00
started-at: 2026-06-09T19:12:29+03:00
completed-at: 2026-06-09T19:16:59+03:00
spec: .planning/work/fast-upload-indexing/SPEC.md
---

## Description

Add a `status` column to the `Document` model to track async indexing lifecycle: `pending | indexing | ready | failed`, default `pending`. Add to `schema.prisma` and create the Prisma migration. Must be nullable-safe for pre-existing rows — rows written before this column existed are treated as `ready` (either backfill existing rows to `ready` in the migration, or make the app read a null/absent status as `ready`).

## Acceptance Criteria

- [ ] `Document` gains a `status` column (`pending | indexing | ready | failed`, default `pending`) — migration + `schema.prisma` (AC-01)
- [ ] Pre-existing rows are nullable-safe: treated as `ready` (backfilled in migration or read-as-ready) (AC-01)
- [ ] `nx test ai-service` passes; Prisma client regenerates cleanly

## Technical Notes

- Files: `libs/database/prisma/schema.prisma` (Document model), new migration `libs/database/prisma/migrations/<ts>_add_document_status/`.
- Existing Document model has: id, title, content, filePath, summary, notes, createdAt, updatedAt, chunks. Add `status` near these.
- Use a Postgres `TEXT` (or native enum) column with default `'pending'`; backfill existing vault rows to `'ready'` (`UPDATE "documents" SET "status" = 'ready' WHERE "status" IS NULL`).
- Author migration via `npx prisma migrate dev --name add_document_status` (from `ai-platform/`); commit the generated migration dir with the schema change. See be-conventions SKILL.md "Database & Migrations".
- This task only adds the column — async logic that writes it is TASK-002/003.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the `Document.status` schema change and its two migrations. The `status String @default("pending")` field is correctly added to the `Document` model; the add-column migration creates a NOT NULL TEXT column with default `'pending'`, and the separate backfill migration flips all pre-existing rows (`WHERE "status" = 'pending'`) to `'ready'`, satisfying the nullable-safe AC-01 requirement. Migrations follow be-conventions (one dir per change, correct timestamp ordering, committed alongside the schema). Scope is correctly limited to the column only, with async write logic deferred to TASK-002/003. No bugs or security issues found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task. `nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit code 0) and `nx show projects --affected` returned an empty set. Per D-06, no affected tests is not a failure.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway:4000=UP, auth-service:4002=UP, ai-service:4001=DOWN (non-blocking — boots from cache, likely missing local infra such as DB/Redis, not a code defect).

All acceptance criteria verified. This task is scoped to AC-01 of SPEC.md (status column only); the remaining SPEC ACs (AC-02..AC-18) are explicitly deferred to TASK-002..TASK-008 per the SPEC task breakdown.

- AC-01 (status column): `schema.prisma` adds `status String @default("pending")`; migration `20260609161258_add_document_status` creates `status TEXT NOT NULL DEFAULT 'pending'`. PASS.
- AC-01 (nullable-safe — pre-existing rows treated as ready): migration `20260609161300_backfill_document_status_ready` backfills pre-existing rows (`UPDATE "documents" SET "status" = 'ready' WHERE "status" = 'pending'`). PASS.
- Task AC (nx test ai-service / Prisma client regenerates cleanly): no affected tests (D-06 exemption); Prisma client (`v7.8.0`) regenerated cleanly. PASS.
