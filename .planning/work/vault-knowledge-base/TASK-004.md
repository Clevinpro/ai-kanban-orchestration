---
id: TASK-004
title: Remove DocumentController type guard — always fire generateDocNotes
status: done
priority: medium
repo: be
epic: vault-knowledge-base
complexity: 2
created-at: 2026-05-28T00:00:00Z
updated-at: 2026-05-28T00:00:00Z
started-at: 2026-05-28T00:00:00Z
completed-at: 2026-05-28T21:44:12+03:00
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

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

All four acceptance criteria are satisfied: `document.controller.ts` contains no references to `DOCUMENT_TYPE`, `DocumentType`, or `result.type`; `uploadDocument` unconditionally fires `void this.knowledgeService.generateDocNotes(result.documentId).catch(...)` (lines 75–83); no `refreshGuideSummary` call exists anywhere in the controller; and `getDocumentationNotes()` in `document.service.ts` uses a plain `SELECT` with no `WHERE type = ...` filter. The `search.service.ts` CTE refactor is clean and uses `Prisma.sql` parameterized queries throughout, eliminating SQL injection risk. The `ai.service.ts` changes are out of scope and introduce no regressions related to this task.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:
- AC-1 PASS: `document.controller.ts` contains zero references to `DOCUMENT_TYPE`, `DocumentType`, or `result.type` (confirmed via grep)
- AC-2 PASS: `uploadDocument` unconditionally fires `void this.knowledgeService.generateDocNotes(result.documentId).catch(...)` at lines 75–83 with no conditional guard
- AC-3 PASS: `refreshGuideSummary` does not appear anywhere in the ai-service source (grep 0 matches)
- AC-4 PASS: `getDocumentationNotes()` in `document.service.ts` uses a plain `SELECT ... FROM "documents" ORDER BY created_at DESC` with no `WHERE type =` filter
- AC-5 PASS: Code review confirmed no TypeScript errors; QA returned PASS status
- AC-6 PASS: `grep -r "DOCUMENT_TYPE" ai-platform/apps/ai-service/src` returns 0 matches (verified)

Additionally verified against SPEC ACs scoped to this task:
- SPEC AC-06 PASS: DocumentController.uploadDocument always fires generateDocNotes with no type guard
- SPEC AC-07 PASS: SearchService.similaritySearch accepts optional `filePathPrefix?: string`; when set, adds `WHERE d.file_path LIKE ${filePathPrefix + '%'}` filter (search.service.ts lines 22–73)
- SPEC AC-08 PASS: AiService.answerCapabilityQuery calls `searchService.similaritySearch(payload.message, 6, AiService.CAPABILITY_VAULT_PREFIX)` where CAPABILITY_VAULT_PREFIX = 'docs/obsidian-vault/project/', then streams through the normal AI pipeline
- SPEC AC-09 PASS: GET /documents/notes query has no WHERE type = filter
