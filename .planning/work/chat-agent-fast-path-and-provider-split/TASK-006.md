---
id: TASK-006
title: Route processMessage through lanes (structured = zero LLM) with integration tests
status: done
priority: high
repo: be
epic: chat-agent-fast-path-and-provider-split
complexity: 7
created-at: 2026-06-16T10:52:11Z
updated-at: 2026-06-16T18:53:13+03:00
started-at: 2026-06-16T18:37:55+03:00
completed-at: 2026-06-16T18:53:13+03:00
spec: .planning/work/chat-agent-fast-path-and-provider-split/SPEC.md
---

## Description

Insert `QueryRouterService.classify` into `AiService.processMessage` so each
query takes the cheapest correct lane: `meta` → existing capability answer,
`structured` → direct `tag-query.tool` (no `provider.chat()`, no RAG),
`technical` → RAG tool scoped to the technical-docs prefix, `complex` →
existing `runChatFlow` loop. The structured lane must answer with zero LLM
invocations. The streamed `AgentEvent` SSE payload shape must stay unchanged.

## Acceptance Criteria

- [ ] `processMessage` resolves the lane via `QueryRouterService` and dispatches
  accordingly.
- [ ] A structured query ("count tags", "list all tags", "count X") produces an
  answer with **zero** `provider.chat()` invocations on that path (asserted by a
  spy in an integration test). [AC-01]
- [ ] The structured lane resolves via the direct DB-backed `tag-query.tool`
  through `ToolRegistry` — no RAG similarity search, no LLM round-trip. [AC-02]
- [ ] A technical/API query calls `similaritySearch` with the technical-docs
  `filePathPrefix` only, never the whole index (asserted via spy). [AC-04]
- [ ] The complex lane still runs `runChatFlow` with all four safeguards and the
  30s budget; existing chunk/`AgentEvent` streaming behaviour is unchanged.
- [ ] `nx test ai-service` passes.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/ai/ai.service.ts` — branch inside / just
  before the current `from(capabilityDetector.isCapabilityQuery(...))` pipeline
  in `processMessage`.
- Keep capability (`meta`) short-circuit behaviour identical to today
  (`answerCapabilityQuery` with `CAPABILITY_VAULT_PREFIX`).
- For the technical lane, use the prefixed RAG tool (TASK-002). The technical
  `filePathPrefix` is an open question in the SPEC — choose the technical/API
  docs prefix analogous to `docs/obsidian-vault/project/`; define it as a named
  constant and document the choice in the task's implementation.
- Structured lane: call the `tag-query.tool` from the registry directly and
  stream its result; do not enter `runChatFlow`.
- Inject `QueryRouterService` into `AiService` (added to constructor).
- Add an integration spec asserting the `provider.chat` spy is never called on
  the structured path.
- Maps to AC-01, AC-02, AC-04.

## QA Results

Status: PASS

Cycle: 1 of 3

Ran `npx nx test ai-service --skip-nx-cache` in `ai-platform/`. Exit code 0 — 25 test suites, 318 tests passed (2.7s).

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported no affected projects (changes uncommitted); full ai-service suite run per task AC.

Static AC verification:
- `processMessage` calls `queryRouter.classify` and dispatches via `switch` on `meta | structured | technical | complex` (default → `runChatFlow`).
- Structured lane (`runStructuredLane`): resolves `TAG_QUERY_TOOL_NAME` from `ToolRegistry`, streams tool result directly — no `provider.chat()`, no RAG.
- Technical lane (`answerTechnicalQuery`): calls `similaritySearch` with `AiService.TECHNICAL_DOCS_PREFIX` (`docs/obsidian-vault/codebase/`).
- Complex lane: still routes to `runChatFlow` with 30s budget and agent events.
- `ai.service.spec.ts` "lane routing (TASK-006)" block: spy asserts zero `provider.chat()` on structured path; `tagToolRun` only; technical prefix spy; complex lane planning/final events.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; BOOT=[api-gateway:4000=UP, auth-service:4002=UP, ai-service:4001=UP]

All task acceptance criteria verified:
- `processMessage` calls `queryRouter.classify` and dispatches via `switch` on `meta | structured | technical | complex` (default → `runChatFlow`) — `ai.service.ts:132-148`.
- AC-01: Structured lane ("count tags", "list all tags") asserts zero `provider.chat()` via spy; `similaritySearch` also not called — `ai.service.spec.ts:384-413`.
- AC-02: `runStructuredLane` resolves `TAG_QUERY_TOOL_NAME` from `ToolRegistry`, calls `tool.run` directly — no RAG, no LLM — `ai.service.ts:157-199`.
- AC-04: Technical lane calls `similaritySearch` with `AiService.TECHNICAL_DOCS_PREFIX` (`docs/obsidian-vault/codebase/`) as third arg only — `ai.service.ts:635-648`, asserted in spec `:415-433`.
- Complex lane: still routes to `runChatFlow` with all four safeguards (`IterationCap`, `Timeout`, `TokenBudget`, `KillSwitch`) and emits `planning`/`final` agent events — `ai.service.ts:267-285`, spec `:435-448`.
- `nx test ai-service` — 25 suites, 318 tests passed (independently confirmed).
