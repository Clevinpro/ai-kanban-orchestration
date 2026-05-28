---
id: TASK-006
title: Rewrite AiService.answerCapabilityQuery to use scoped vault RAG and stream response
status: readyForDevelop
priority: high
repo: be
epic: vault-knowledge-base
complexity: 4
created-at: 2026-05-28T00:00:00Z
updated-at: 2026-05-28T00:00:00Z
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
