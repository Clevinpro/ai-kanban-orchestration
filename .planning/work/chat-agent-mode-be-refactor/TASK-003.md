---
id: TASK-003
title: Update shared types — dynamic AgentEvent.tool, mode optional/ignored
status: done
priority: high
repo: be
epic: chat-agent-mode-be-refactor
complexity: 2
created-at: 2026-06-15T12:00:00.000Z
updated-at: 2026-06-15T16:10:25+03:00
started-at: 2026-06-15T16:07:22+03:00
completed-at: 2026-06-15T16:10:25+03:00
spec: .planning/work/chat-agent-mode-be-refactor/SPEC.md
---

## Description

Adjust the shared event/config contract for the tool-use refactor. The `tool` field on agent
events must carry any dynamic tool name (not just `similaritySearch`), and the `mode` field
becomes optional and ignored (duality removed) without breaking the already-deployed gateway
DTO.

## Acceptance Criteria

- [ ] In `ai-platform/libs/shared/src/lib/types/ai.types.ts`, `AgentEvent.tool` is typed as a
      plain `string` (dynamic tool name) — confirm it is not narrowed to a literal.
- [ ] `AgentRunConfig.mode` becomes optional (`mode?: 'chat' | 'agent'`) and is documented as
      deprecated/ignored by the unified flow; the three limit fields remain optional.
- [ ] No existing field is removed; all agent payloads still round-trip as plain JSON over SSE.
- [ ] Re-exports from `ai-platform/libs/shared/src/index.ts` remain intact.
- [ ] `nx test shared` passes (and `nx test ai-service api-gateway` still compile against the
      changed types).

## Technical Notes

- Decision (SPEC Open Question): keep `mode` accepted-but-ignored rather than removing it, so the
  deployed gateway DTO (`chat-agent-mode-be` TASK-011) and any in-flight clients do not break.
  The behavioral duality is removed in TASK-006; this task only relaxes the type.
- File: `ai-platform/libs/shared/src/lib/types/ai.types.ts` (+ barrel
  `ai-platform/libs/shared/src/index.ts` if needed).
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the two changed files: `ai.types.ts` and the barrel `index.ts`. `AgentEvent.tool` is correctly typed as a plain optional `string` (not a narrowed literal); `AgentRunConfig.mode` is now optional and clearly documented as deprecated/accepted-but-ignored with the three limit fields remaining optional. No existing fields were removed, all payload fields are plain JSON (no Dates/class instances) so SSE round-trips hold, and the `ai.types` re-export in `index.ts` is intact. The changes are type-widening only and non-breaking; English-only comments. Could not run `nx test` (read-only reviewer), but the type changes are sound and meet all acceptance criteria.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected ran target test for 5 projects (ai-service, api-gateway, shared, auth-service, kafka), all successful, exit code 0.
- shared: no tests found (passWithNoTests), exit 0 — cached
- kafka: no tests found (passWithNoTests), exit 0
- auth-service: 1 passed, 1 total
- api-gateway: 18 passed, 18 total (3 suites)
- ai-service: 284 passed, 284 total (23 suites)
Total: 303 tests passed, 0 failed. The changed types compile cleanly against ai-service and api-gateway.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway:4000=UP, auth-service:4002=UP, ai-service:4001=UP

All acceptance criteria verified:
- AC-1 (AgentEvent.tool dynamic string): PASS — `tool?: string` at ai.types.ts:38, explicitly not a narrowed literal.
- AC-2 (AgentRunConfig.mode optional/deprecated, three limit fields optional): PASS — `mode?: 'chat' | 'agent'` with @deprecated doc; maxIterations/tokenBudget/timeoutMs all optional (lines 64-70).
- AC-3 (no field removed, plain-JSON SSE round-trip): PASS — all fields retained; AgentEvent/AgentBudget are plain JSON only.
- AC-4 (re-exports from index.ts intact): PASS — `export * from './lib/types/ai.types'` present at index.ts:6.
- AC-5 (nx test shared passes; ai-service + api-gateway compile): PASS — QA reports 303 tests passed, 0 failed; changed types compile cleanly.
