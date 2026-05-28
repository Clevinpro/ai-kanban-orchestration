---
id: TASK-006
title: Add filePath field to GET /documents/notes response
status: done
priority: medium
repo: be
epic: obsidian-integration
complexity: 2
created-at: 2026-05-26T00:00:00.000Z
updated-at: 2026-05-26T00:00:00.000Z
spec: .planning/work/obsidian-integration/SPEC.md
---

## Description

Expose `filePath` in the `GET /documents/notes` API response so the Docs FE (TASK-007) can distinguish vault-sourced documents (`filePath LIKE 'docs/obsidian-vault/%'`) from manually uploaded ones. This requires changes in ai-service (add `filePath` to the query/DTO) and api-gateway (forward the field through the proxy response).

## Acceptance Criteria

- [ ] `GET /api/documents/notes` response objects include `filePath: string | null`
- [ ] ai-service `GET /documents/notes` handler selects `filePath` from the `documents` table in its Prisma query
- [ ] Response DTO / type in ai-service updated to include `filePath`
- [ ] api-gateway proxy for `GET /documents/notes` forwards the `filePath` field unchanged (no transform that would strip it)
- [ ] Existing fields (`id`, `title`, `notes`, `createdAt`) still present — no regressions
- [ ] `filePath` is `null` for documents uploaded via the manual upload flow (they have no file path)

## Technical Notes

- Read `ai-platform/apps/ai-service/src/document/document.controller.ts` and `document.service.ts` to find the `getNotes` / `getDocumentNotes` method.
- Read `ai-platform/apps/api-gateway/src/documents/documents.controller.ts` to understand the proxy pattern.
- The `documents` table already has a `filePath` column (verified in SPEC AC-08 — no schema migration needed). Confirm in `libs/database/prisma/schema.prisma` before writing code.
- If api-gateway does a typed transform of the response, add `filePath` to that type; if it blind-proxies the JSON body, no change needed there.
- This is a purely additive change — no breaking API changes.

---REVIEW-BLOCK-START---
## Code Review

Status: CHANGES_REQUESTED

**Issues:**
- `/Users/tarasbannyi/TestAI/ai-agent-microservices/ai-platform/libs/database/prisma/schema.prisma:47` — `filePath` is declared `String` (NOT NULL) on the `Document` model, not `String?`. The `DocumentNotes` type in `document.service.ts` and `DocumentNote` type in `documents.controller.ts` both declare `filePath: string | null`, which misrepresents the DB constraint. Acceptance criterion AC-06 ("filePath is null for manually uploaded documents") cannot be satisfied by the current schema; manually-uploaded docs receive a temp file path at insert time (see `document.controller.ts` line 57), not SQL NULL. Either (a) the schema must be migrated to `String? @map("file_path")` to allow NULL for manual uploads, or (b) the TypeScript types should use `string` (non-nullable) and the AC must be revised. Shipping this as-is means the stated AC is unmet and the types are misleading. **BLOCKER**
- `/Users/tarasbannyi/TestAI/ai-agent-microservices/ai-platform/apps/api-gateway/src/documents/documents.controller.ts:39` — The `fetch` call to the ai-service does not forward the `Authorization` header from the incoming request. The current ai-service `GET /documents/notes` route has no guard so this does not break today, but service-to-service calls that drop the auth context are fragile. If a guard is added to the ai-service endpoint later this will silently fail. Consider forwarding the bearer token or using a shared service-to-service secret. **WARNING**

The purely additive SQL change (`"file_path" AS "filePath"`) and the proxy handler are both structurally sound. The critical issue is the schema/type/AC mismatch: the Prisma schema has `filePath` as a non-nullable `String`, so the `| null` type annotation and AC-06 are inconsistent with the actual data model. A schema migration to make the column nullable (and update the insert logic to pass `null` for manual uploads instead of the temp path) is needed to fully deliver the stated requirement.
---REVIEW-BLOCK-END---

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

The cycle 1 BLOCKER is fully resolved: `filePath` is now `String?` in the Prisma schema (line 47), the accompanying migration correctly drops the NOT NULL constraint, `DocumentNotes`/`DocumentNote` types correctly use `string | null`, and manual uploads explicitly pass `null` to `insertDocument`. The `getDocumentationNotes` raw query selects `"file_path" AS "filePath"`, and the api-gateway proxy passes the field through without stripping it. All six acceptance criteria are satisfied. The pre-existing warning about the api-gateway not forwarding the `Authorization` header to the ai-service remains but was acknowledged in cycle 1 and is out of scope for this task.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task. `nx affected --base=HEAD~1 --head=HEAD` exited 0 with "No tasks were run". Per D-06, no affected tests is not a failure.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:

- AC-1 PASS: `GET /api/documents/notes` returns `filePath: string | null` — `DocumentNote` type in api-gateway `documents.controller.ts:29` declares the field; blind-proxy at line 47 passes raw JSON through.
- AC-2 PASS: ai-service `getDocumentationNotes()` raw SQL (`document.service.ts:87`) selects `"file_path" AS "filePath"` from `documents` table.
- AC-3 PASS: `DocumentNotes` type in `document.service.ts:17-23` explicitly includes `filePath: string | null`.
- AC-4 PASS: api-gateway proxy returns raw JSON as `DocumentNote[]` with no transform that strips fields.
- AC-5 PASS: Raw SQL SELECT enumerates all original fields (`id`, `title`, `notes`, `created_at`/`createdAt`) — no regressions.
- AC-6 PASS: `upsertDocument` passes `null` as `filePath` for DOCUMENTATION type manual uploads (`document.service.ts:143`); schema `filePath String? @map("file_path")` and migration `20260527000000_make_document_file_path_nullable` confirm the column is nullable.
