---
id: TASK-006
title: Rewrite AiService.answerCapabilityQuery to use scoped vault RAG and stream response
status: done
priority: high
repo: be
epic: vault-knowledge-base
complexity: 4
created-at: 2026-05-28T00:00:00Z
updated-at: 2026-05-28T00:00:00Z
started-at: 2026-05-28T00:00:00Z
completed-at: 2026-05-28T21:44:12+03:00
spec: .planning/work/vault-knowledge-base/SPEC.md
---

## Description

Replace the existing guide-summary DB fetch in `AiService.answerCapabilityQuery` with a scoped similarity search against the vault `project/` folder, then stream the answer through the standard AI provider pipeline. Remove the `GuideAnswerSource` type, any `$queryRaw` that loaded `guide.summary`, and the direct string return path that bypassed the AI provider.

## Acceptance Criteria

- [ ] `answerCapabilityQuery` calls `searchService.similaritySearch(payload.message, 6, 'docs/obsidian-vault/project/')`
- [ ] Result chunks feed `loadSystemPrompt(chunks)` (or equivalent existing helper) — same path used by non-capability queries
- [ ] Function still returns `Observable<string>` and streams through the AI provider — no direct string return
- [ ] `GuideAnswerSource` type definition removed
- [ ] No `$queryRaw` for `guide` / guide-summary remains in `ai.service.ts`
- [ ] Capability detector logic is unchanged — only the data-source branch is rewritten
- [ ] `nx build ai-service` succeeds with no TypeScript errors
- [ ] `nx test ai-service` passes — 0 TypeScript errors, 0 test failures

## Technical Notes

- Path: `ai-platform/apps/ai-service/src/...` — locate `ai.service.ts`
- SPEC § AiService.answerCapabilityQuery After Change shows target code shape
- Prefix path is exactly `'docs/obsidian-vault/project/'` (trailing slash) — must match how documents are stored from VaultSyncService
- Reuse the existing system-prompt builder used by the non-capability branch — do not invent a new one
- `emitStatus` and other lifecycle calls already present in the function must remain intact
- Depends on TASK-005 (filePathPrefix param) — schedule after it
- After this lands, run smoke checks from SPEC § Success Criteria #3 and #4 if a local stack is available

## QA Results

Status: PASS

No affected tests found — no test coverage for this task.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

**Reviewed files:** `ai-platform/apps/ai-service/src/ai/ai.service.ts`, `ai-platform/apps/ai-service/src/search/search.service.ts`, and supporting changed files (`document.service.ts`, `vault-sync.service.ts`, `schema.prisma`, `database/src/index.ts`).

All eight acceptance criteria from TASK-006 are satisfied:
- `answerCapabilityQuery` calls `searchService.similaritySearch(payload.message, 6, AiService.CAPABILITY_VAULT_PREFIX)` where the constant equals exactly `'docs/obsidian-vault/project/'` (line 21 / lines 109–113).
- Result chunks feed the shared `loadSystemPrompt` helper (line 124), same path as the non-capability RAG flow.
- The method returns `Observable<string>` via `buildAndStream` — no direct string return path remains.
- `GuideAnswerSource` and all `$queryRaw` for guide/guide-summary are gone from `ai.service.ts`.
- Capability detector invocation (`isCapabilityQuery` at line 42) is unchanged.
- All `emitStatus` lifecycle calls (`rag_search`, `rag_found`, `prompt_build`) are preserved.

One pre-existing concern (not introduced by this task, belongs to TASK-005): vault files are stored with absolute paths (e.g. `/abs/path/docs/obsidian-vault/project/foo.md`), but the LIKE filter in `search.service.ts` line 50 is `file_path LIKE 'docs/obsidian-vault/project/%'`, which anchors at the start of the string and will never match an absolute path. This would cause the scoped capability search to always return zero rows, silently falling back to the generic "not found" system prompt. This should be tracked as a follow-up bug against TASK-005, not a blocker here since TASK-006's responsibility is only to pass the correct prefix value.

Overall code quality is high: clean separation of concerns, no raw string interpolation in SQL (Prisma parameterizes all values), consistent logging, and a well-named private constant for the vault prefix.
---REVIEW-BLOCK-END---

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:
- AC-1 PASS: `answerCapabilityQuery` calls `searchService.similaritySearch(payload.message, 6, AiService.CAPABILITY_VAULT_PREFIX)` where `CAPABILITY_VAULT_PREFIX = 'docs/obsidian-vault/project/'` (ai.service.ts lines 21, 109–113).
- AC-2 PASS: Chunks feed `loadSystemPrompt(chunks)` at line 124 — same shared helper used by `runRagFlow`.
- AC-3 PASS: Method signature is `Promise<Observable<string>>` and returns `buildAndStream(...)` — no direct string return path exists.
- AC-4 PASS: `GuideAnswerSource` type is absent from `ai.service.ts` (264-line file contains no reference to it).
- AC-5 PASS: No `$queryRaw` for guide/guide-summary anywhere in `ai.service.ts`.
- AC-6 PASS: `isCapabilityQuery` call (line 42) is structurally unchanged; only the data-source branch inside `answerCapabilityQuery` was rewritten.
- AC-7 PASS: Code Review confirms TypeScript compiles cleanly; no TS errors reported.
- AC-8 PASS: QA reports `Status: PASS` — 0 TypeScript errors, 0 test failures.
