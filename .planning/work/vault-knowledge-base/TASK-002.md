---
id: TASK-002
title: Refactor DocumentService — remove DOCUMENT_TYPE, getDocumentType, GUIDE branch, simplify signatures
status: readyForDevelop
priority: high
repo: be
epic: vault-knowledge-base
complexity: 5
created-at: 2026-05-28T00:00:00Z
updated-at: 2026-05-28T00:00:00Z
spec: .planning/work/vault-knowledge-base/SPEC.md
---

## Description

Strip all GUIDE-related and type-related code from `DocumentService` in the ai-service. Remove the `DOCUMENT_TYPE` constant, `DocumentTypeValue` type alias, and `getDocumentType()` helper. Collapse `upsertDocument` to no longer branch on type and drop the `type` parameter. Drop `type` from `insertDocument` SQL and signature. Change `uploadDocument(filePath, title, filename = title)` to `uploadDocument(filePath, title)` and remove `type` from the return shape so it returns `{ documentId, chunksCount }` only.

## Acceptance Criteria

- [ ] `DocumentService` source no longer references `DOCUMENT_TYPE`, `DocumentTypeValue`, or `getDocumentType`
- [ ] `upsertDocument(filePath, title, text)` collapses to: generate id, call `insertDocument`, return id — no GUIDE branch
- [ ] `insertDocument` SQL: `INSERT INTO "documents" ("id","title","content","file_path","created_at","updated_at") VALUES (...)` — no `"type"` column
- [ ] `uploadDocument` signature is `(filePath: string, title: string)` and returns `{ documentId: string; chunksCount: number }`
- [ ] No `import` of `DocumentType` from `@prisma/client` remains in `document.service.ts`
- [ ] `nx build ai-service` succeeds (no TypeScript errors in DocumentService)
- [ ] Existing callers in the same file/module updated to the new signature

## Technical Notes

- Path: `ai-platform/apps/ai-service/src/...` — locate `document.service.ts` via grep for `DOCUMENT_TYPE` or `getDocumentType`
- Spec shows the target signatures explicitly (§ DocumentService After Change)
- Callers outside this file (e.g. `VaultSyncService` — already 2-arg per SPEC § Constraints, `DocumentController` — handled in TASK-004) are addressed in their own tasks
- Do not touch `KnowledgeService.refreshGuideSummary` here (TASK-003)
- Do not touch controller guard here (TASK-004)
- Ensure return type interface or DTO used elsewhere drops the `type` field — update locally; downstream consumers handled in TASK-004
