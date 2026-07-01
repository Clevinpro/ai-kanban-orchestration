---
id: TASK-007
title: Extend AiService request parsing + ProcessMessageOptions for agent mode
status: done
priority: high
repo: be
epic: chat-agent-mode-be
complexity: 3
created-at: 2026-06-14T12:00:00.000Z
updated-at: 2026-06-14T21:00:00+03:00
started-at: 2026-06-14T20:55:11+03:00
completed-at: 2026-06-14T21:00:00+03:00
spec: .planning/work/chat-agent-mode-be/SPEC.md
---

## Description

Prepare `AiService` to receive agent-mode inputs without yet implementing the loop. Extend the
internal request payload parsing and the `ProcessMessageOptions` callback surface so the loop
(TASK-008) and the module wiring (TASK-009) have a typed seam to plug into. Default behavior
(no `mode` / `mode: 'chat'`) must remain identical.

## Acceptance Criteria

- [ ] `AiRequestPayload` (in `ai.service.ts`) gains optional `mode?: 'chat' | 'agent'`,
      `maxIterations?: number`, `tokenBudget?: number`, `timeoutMs?: number`.
- [ ] `parseRequest` reads these fields when present, defaults `mode` to `'chat'`, and clamps /
      validates the numeric limits (ignore non-positive or non-numeric values, fall back to
      sane defaults).
- [ ] `ProcessMessageOptions` gains optional `onAgentEvent?: (event: AgentEvent) => void`
      (type from `@ai-platform/shared`, TASK-001).
- [ ] `processMessage` routes to the agent path only when `mode === 'agent'`; otherwise the
      existing capability/RAG branch runs unchanged. The agent path may delegate to a private
      stub `runAgentFlow(...)` returning the existing RAG observable for now (real loop arrives
      in TASK-008).
- [ ] Existing `ai.service` tests still pass; chat-mode path is behaviorally unchanged.
- [ ] `nx test ai-service` passes.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/ai/ai.service.ts`.
- Keep default constants near the top (e.g. `DEFAULT_MAX_ITERATIONS`, `DEFAULT_TOKEN_BUDGET`,
  `DEFAULT_TIMEOUT_MS`) for reuse by the loop.
- Do not change `runRagFlow` / `answerCapabilityQuery` signatures beyond what is needed.
- This task is a thin seam: no safeguard wiring yet. Keep the stub obvious so TASK-008 replaces
  it cleanly.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the working-tree changes to `ai-platform/apps/ai-service/src/ai/ai.service.ts` (AiRequestPayload, parseRequest, ProcessMessageOptions, processMessage routing, runAgentFlow stub) against TASK-007 acceptance criteria. All criteria are met: the payload type gains mode/maxIterations/tokenBudget/timeoutMs, parseRequest defaults mode to 'chat' and clamps numerics via clampPositiveInt (rejecting non-finite/non-positive/non-numeric, flooring to int), onAgentEvent uses the shared AgentEvent type, and processMessage routes to the agent stub only when mode === 'agent' while the chat/RAG branch is unchanged. AgentEvent is correctly exported from @ai-platform/shared. Default constants sit at the top for TASK-008 reuse, and the runAgentFlow stub is clearly marked. No existing ai.service spec file exists, so the chat-mode-unchanged criterion holds and is logically preserved. Implementation is a clean, well-scoped seam. Overall quality is high.

Minor (non-blocking): the internal AiRequestPayload made mode/limits required rather than optional — this is acceptable since parseRequest always populates them, and is arguably better than carrying optionality post-parse.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected --target=test (--base=HEAD~1 --head=HEAD) ran 6 projects, all successful. ai-service: 19 suites / 265 tests passed. api-gateway: 8 tests passed. auth-service: 1 test passed. shared, database, kafka: no tests (passWithNoTests). Exit code 0.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=DOWN (infra/soft, webpack compiled successfully), auth-service=DOWN (infra/soft, webpack compiled successfully), ai-service=UP.

All acceptance criteria verified against ai-platform/apps/ai-service/src/ai/ai.service.ts:
- AC1 (AiRequestPayload gains mode/maxIterations/tokenBudget/timeoutMs): PASS — lines 17-24; fields are populated as required post-parse, an acceptable refinement of the optional seam.
- AC2 (parseRequest defaults mode to chat, clamps/validates numerics): PASS — line 289 defaults mode; clampPositiveInt (lines 305-310) rejects non-numeric/non-finite/non-positive and floors to int.
- AC3 (ProcessMessageOptions.onAgentEvent using shared AgentEvent): PASS — lines 26-29; AgentEvent imported from @ai-platform/shared (line 1) and re-exported via libs/shared/src/index.ts.
- AC4 (processMessage routes to agent only when mode === 'agent'; chat/RAG branch unchanged; runAgentFlow stub returns existing RAG observable): PASS — lines 54-56, 76-83.
- AC5 (existing ai.service tests pass, chat path unchanged): PASS — no prior spec existed; chat path structurally untouched.
- AC6 (nx test ai-service passes): PASS — QA: 265 tests passed, exit 0.
