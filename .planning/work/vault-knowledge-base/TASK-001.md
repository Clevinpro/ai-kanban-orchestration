---
id: TASK-001
title: Add Prisma migration to delete GUIDE docs, drop type column, drop DocumentType enum
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

Create a new Prisma migration that removes the GUIDE document type artifacts from the database. The migration must (1) delete all rows in `documents` where `type = 'GUIDE'` so FK cascade clears their chunks, (2) drop the `type` column from `documents`, and (3) drop the `DocumentType` enum. Also update `schema.prisma` to remove the `DocumentType` enum and the `type` field on the `Document` model so the Prisma client matches the new DB shape.

## Acceptance Criteria

- [ ] New migration directory created under `ai-platform/apps/ai-service/prisma/migrations/<timestamp>_remove_document_type/` with `migration.sql`
- [ ] `migration.sql` executes in order: DELETE GUIDE rows → DROP COLUMN `type` → DROP TYPE `DocumentType`
- [ ] `schema.prisma` no longer contains `enum DocumentType`
- [ ] `Document` model in `schema.prisma` no longer contains the `type` field
- [ ] `npx prisma generate` succeeds after schema edit
- [ ] `npx prisma migrate dev` (or equivalent) applies cleanly on a local DB without errors

## Technical Notes

- Migration SQL exact form (per SPEC § Migration):
  ```sql
  DELETE FROM "documents" WHERE "type" = 'GUIDE'::"DocumentType";
  ALTER TABLE "documents" DROP COLUMN "type";
  DROP TYPE "DocumentType";
  ```
- FK cascade on `chunks.document_id` removes orphaned chunks automatically — do not delete chunks manually
- Locate `schema.prisma` under `ai-platform/apps/ai-service/prisma/schema.prisma`
- Do not modify any TypeScript code in this task; consuming code is removed in TASK-002+
- The Prisma client regen may be required for downstream tasks but TypeScript will still error against `type` references until TASK-002 lands — that is expected
