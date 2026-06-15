---
id: TASK-001
title: Extend shared ai.types + add AI_CANCEL kafka topic (event contract)
status: done
priority: high
repo: be
epic: chat-agent-mode-be
complexity: 3
created-at: 2026-06-14T12:00:00.000Z
updated-at: 2026-06-14T18:13:00+03:00
started-at: 2026-06-14T18:06:20+03:00
completed-at: 2026-06-14T18:13:00+03:00
spec: .planning/work/chat-agent-mode-be/SPEC.md
---

## Description

Establish the shared event contract that every later task depends on. Extend
`ai-platform/libs/shared/src/lib/types/ai.types.ts` additively so the existing chat flow is
untouched while agent runs gain a typed channel, and add the `AI_CANCEL` topic to the Kafka
constants. This is the single source of truth the gateway, ai-service, and the paired FE epic
will consume.

## Acceptance Criteria

- [ ] `AiEventType` gains an `'agent'` value (decision: encode agent events as a new `event`
      value carrying a typed `agent` field, NOT extra `stage` values).
- [ ] `AiResponsePayload` gains an optional `agent?: AgentEvent` field; all existing fields
      remain unchanged and optional so `chat`/`status`/`chunk`/`complete`/`error` payloads are
      byte-compatible.
- [ ] A new `AgentEvent` type is exported: `{ iteration: number; status: 'planning' | 'tool_call' | 'tool_result' | 'final'; tool?: string; input?: string; budget?: AgentBudget }`.
- [ ] A new `AgentBudget` type is exported: `{ iteration: number; tokensUsed: number; elapsedMs: number; maxIterations: number; tokenBudget: number; timeoutMs: number }`.
- [ ] A new `AgentRunConfig` type is exported: `{ mode: 'chat' | 'agent'; maxIterations?: number; tokenBudget?: number; timeoutMs?: number }`.
- [ ] `KAFKA_TOPICS` enum gains `AI_CANCEL = 'ai.cancel'`.
- [ ] All new types are re-exported from `ai-platform/libs/shared/src/index.ts` if that barrel
      file gates type visibility.
- [ ] `nx test shared` passes.

## Technical Notes

- Files: `ai-platform/libs/shared/src/lib/types/ai.types.ts`,
  `ai-platform/libs/shared/src/lib/constants/kafka.constants.ts`, and the barrel
  `ai-platform/libs/shared/src/index.ts`.
- Current `AiEventType = 'status' | 'chunk' | 'complete' | 'error'` — add `'agent'`, do not
  remove anything. Keep `event: 'chunk'` reserved for final-answer tokens (FE token rendering
  must stay unchanged per AC-05/AC-07).
- All agent fields MUST round-trip as plain JSON over SSE (no class instances, no Dates).
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed all three changed files (ai.types.ts, kafka.constants.ts, index.ts) against the task's acceptance criteria. The changes are purely additive: `AiEventType` gains `'agent'`, `AiResponsePayload` gains an optional `agent?: AgentEvent` (all existing fields untouched and byte-compatible), and `AgentEvent`/`AgentBudget`/`AgentRunConfig` match the specified shapes exactly. `KAFKA_TOPICS.AI_CANCEL = 'ai.cancel'` is added with nothing removed, and the existing `export *` barrel statements propagate all new symbols. All fields are plain-JSON (no Dates or class instances), satisfying the SSE round-trip requirement, and comments are English-only. No bugs, security, or quality concerns; `nx test shared` is left to the QA stage to confirm.
---REVIEW-BLOCK-END---

## QA Results (cycle 1)

Status: FAIL

`nx affected --target=test --base=HEAD~1 --head=HEAD` ran 6 projects and exited with code 1.

- 1 test suite failed: `ai-service` — `apps/ai-service/src/document/document.controller.spec.ts`
  - Test suite failed to run (TypeScript compile error):
    `TS2694: Namespace 'global.Express' has no exported member 'Multer'.`
    at `apps/ai-service/src/document/document.controller.ts:63:35` (`@UploadedFile() file: Express.Multer.File | undefined`).
- All other projects passed: shared (no tests), database (no tests), kafka (no tests),
  auth-service (1 passed), api-gateway (8 passed), ai-service (217 tests passed, 13 of 14 suites).

Note: The failing suite is unrelated to TASK-001's scope (this task only edited shared `ai.types.ts`,
`kafka.constants.ts`, and `index.ts` — none have tests of their own). The failure originates in the
ai-service document controller's `Express.Multer.File` typing and was present in the affected baseline.
Per QA policy (exit code 1 with test failure output), this run is recorded as FAIL.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Re-reviewed the three core TASK-001 files — they match the cycle-1 approved state with no regression (additive `AiEventType` 'agent', optional `AiResponsePayload.agent?`, correctly-shaped `AgentEvent`/`AgentBudget`/`AgentRunConfig`, `KAFKA_TOPICS.AI_CANCEL = 'ai.cancel'`, all re-exported via the barrel). The new QA fix in `tsconfig.spec.json` (adding `"multer"` to the `types` array) is correct, minimal, and well-justified: it resolves the `TS2694` `Express.Multer.File` compile error in `document.controller.ts:63` by mirroring `tsconfig.app.json`'s existing `["node", "multer"]`, backed by `@types/multer` in devDependencies. The change is purely additive (preserves `jest`/`node`) and scoped to the test compile config only. No bugs, security, or quality concerns.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` ran 6 projects and exited with code 0.

- shared, database, kafka: no tests found (passWithNoTests).
- auth-service: 1 suite / 1 test passed.
- api-gateway: 1 suite / 8 tests passed.
- ai-service: 14 suites / 225 tests passed.

The prior cycle-1 failure (`TS2694: Namespace 'global.Express' has no exported member 'Multer'` in `document.controller.spec.ts`) is resolved — the ai-service suite now compiles and runs all 14 suites (previously 13 of 14), confirming the `tsconfig.spec.json` `"multer"` types fix. No remaining failures.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=UP, auth-service=UP, ai-service=UP.

All acceptance criteria verified against the implementation in `ai-platform/libs/shared/src/lib/types/ai.types.ts`, `kafka.constants.ts`, and the barrel `index.ts`:
- AC-1 (`AiEventType` gains `'agent'`): PASS — `AiEventType = 'status' | 'chunk' | 'complete' | 'error' | 'agent'`; agent data carried via a typed `agent` field, not extra stages.
- AC-2 (`AiResponsePayload.agent?: AgentEvent`): PASS — optional field added; all existing fields (`stage`/`message`/`result`/`error`) unchanged and optional, so chat/status/chunk/complete/error payloads stay byte-compatible.
- AC-3 (`AgentEvent` exported): PASS — `{ iteration; status: 'planning'|'tool_call'|'tool_result'|'final'; tool?; input?; budget?: AgentBudget }` matches exactly.
- AC-4 (`AgentBudget` exported): PASS — `{ iteration; tokensUsed; elapsedMs; maxIterations; tokenBudget; timeoutMs }` matches exactly.
- AC-5 (`AgentRunConfig` exported): PASS — `{ mode: 'chat'|'agent'; maxIterations?; tokenBudget?; timeoutMs? }` matches exactly.
- AC-6 (`KAFKA_TOPICS.AI_CANCEL = 'ai.cancel'`): PASS — added with nothing removed.
- AC-7 (re-exported from barrel): PASS — `export * from './lib/types/ai.types'` and `export * from './lib/constants/kafka.constants'` propagate all new symbols.
- AC-8 (`nx test shared` passes): PASS — QA confirmed shared has no tests (passWithNoTests) and the full affected run exited 0 (225 ai-service tests passing after the multer fix).

All fields are plain JSON (no Dates/class instances), satisfying the SSE round-trip requirement; comments are English-only.
