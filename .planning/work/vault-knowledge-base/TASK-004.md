---
id: TASK-004
title: Remove DocumentController type guard — always fire generateDocNotes
status: readyForDevelop
priority: medium
repo: be
epic: vault-knowledge-base
complexity: 2
created-at: 2026-05-28T00:00:00Z
updated-at: 2026-05-28T00:00:00Z
spec: .planning/work/vault-knowledge-base/SPEC.md
---

## Description

Update `DocumentController.uploadDocument` so that after a successful upload it always fires `knowledgeService.generateDocNotes(result.documentId)` — drop the `if (result.type === DOCUMENT_TYPE.DOCUMENTATION)` branch and drop the chained `.then(() => this.knowledgeService.refreshGuideSummary(...))` call. Also adjust the `GET /documents/notes` query path so it no longer filters by `type`.

## Acceptance Criteria

- [ ] `document.controller.ts` no longer references `DOCUMENT_TYPE`, `DocumentType`, or `result.type`
- [ ] `uploadDocument` handler invokes `void this.knowledgeService.generateDocNotes(result.documentId).catch(...)` unconditionally
- [ ] No `refreshGuideSummary` call remains anywhere in controllers
- [ ] `GET /documents/notes` handler / underlying query removes the `WHERE type = ...` filter (whether it lives in controller or service)
- [ ] `nx build ai-service` succeeds with no TypeScript errors
- [ ] `grep -r "DOCUMENT_TYPE" ai-platform/apps/ai-service/src` returns 0 matches

## Technical Notes

- Locate controller via grep for `generateDocNotes` or `refreshGuideSummary`
- SPEC § DocumentController After Change shows target code shape
- If `getDocumentNotes` lives in a service that filters by type, the SQL/Prisma query there must also drop the type filter — keep the change scoped to the notes endpoint path
- Keep the existing `.catch(...)` error handling pattern intact
- API-gateway `DocumentsController` proxy is unchanged per SPEC § Constraints
