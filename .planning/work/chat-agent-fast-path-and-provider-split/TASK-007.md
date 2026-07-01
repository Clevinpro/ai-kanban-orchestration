---
id: TASK-007
title: Verify capability lane scopes to vault prefix with no general-RAG fall-through
status: done
priority: medium
repo: be
epic: chat-agent-fast-path-and-provider-split
complexity: 3
created-at: 2026-06-16T10:52:11Z
updated-at: 2026-06-16T19:03:20+03:00
started-at: 2026-06-16T18:53:29+03:00
completed-at: 2026-06-16T19:03:20+03:00
spec: .planning/work/chat-agent-fast-path-and-provider-split/SPEC.md
---

## Description

Confirm — and lock in with a test — that a capability ("what can I do here")
query retrieves only the capability-vault prefix and never falls through to
general (whole-index) RAG. The capability path already passes
`CAPABILITY_VAULT_PREFIX` to `similaritySearch`; this task adds an explicit
assertion and closes any fall-through gap in `capability-detector.service.ts` /
`answerCapabilityQuery`.

## Acceptance Criteria

- [ ] A capability query calls `similaritySearch` with the capability-vault
  prefix (`docs/obsidian-vault/project/`) and never with an unscoped query
  (asserted via spy).
- [ ] No code path lets a detected capability query fall through to general RAG
  or the complex loop.
- [ ] Test added covering the capability lane prefix scoping.
- [ ] `nx test ai-service` passes.

## Technical Notes

- Files: `ai-platform/apps/ai-service/src/ai/capability-detector.service.ts`,
  `ai-platform/apps/ai-service/src/ai/ai.service.ts` (`answerCapabilityQuery`,
  `CAPABILITY_VAULT_PREFIX`).
- `answerCapabilityQuery` already calls
  `searchService.similaritySearch(message, 6, CAPABILITY_VAULT_PREFIX)` — assert
  the prefix argument is present; ensure the meta branch returns before any
  general-RAG path.
- Maps to AC-05.

## QA Results

Status: PASS

Cycle: 1 of 3

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported no affected projects (changes uncommitted). Ran `npx nx test ai-service --skip-nx-cache` in `ai-platform/`. Exit code 0 — 25 test suites, 319 tests passed (2.8s).

Static AC verification:
- `answerCapabilityQuery` calls `similaritySearch(message, 6, CAPABILITY_VAULT_PREFIX)` with `docs/obsidian-vault/project/` — `ai.service.ts:682-686`.
- Meta lane returns from `answerCapabilityQuery` via `switch` on `queryRouter.classify`; no fall-through to `runChatFlow` or unscoped RAG — `ai.service.ts:132-148`.
- `ai.service.spec.ts` "meta lane: capability queries call similaritySearch with the capability-vault prefix only (TASK-007)": spy asserts single scoped call with `CAPABILITY_VAULT_PREFIX`, no agent-loop events.
- Existing capability pre-step test (`what can you do?`) also asserts prefix-only `similaritySearch` and no unscoped third-arg calls — `ai.service.spec.ts:379-389`.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; BOOT=[api-gateway:4000=UP, auth-service:4002=UP, ai-service:4001=UP]

All task acceptance criteria verified:
- Capability queries call `similaritySearch` with `CAPABILITY_VAULT_PREFIX` (`docs/obsidian-vault/project/`) only — `ai.service.ts:682-686`; spy assertions in `ai.service.spec.ts` (lines 366-392, 426-445).
- No fall-through: `processMessage` routes `meta` lane to `answerCapabilityQuery` and returns before `runChatFlow` or unscoped RAG — `ai.service.ts:132-148`; zero agent-loop events in tests confirm no complex-loop path.
- Dedicated TASK-007 test plus existing capability short-circuit test both assert prefix-only scoped retrieval.
- SPEC AC-05 satisfied: capability-vault prefix only, never general RAG.
- `nx test ai-service` — 25 suites, 319 tests passed (independently confirmed).
