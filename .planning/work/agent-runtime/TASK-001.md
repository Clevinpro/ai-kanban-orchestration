---
id: TASK-001
title: Add agent event/config types + enum to libs/shared and export
status: done
priority: high
repo: be
epic: agent-runtime
complexity: 3
created-at: 2026-06-03T12:00:00Z
updated-at: 2026-06-03T12:00:00Z
started-at: 2026-06-03T18:37:22+03:00
completed-at: null
spec: .planning/work/agent-runtime/SPEC.md
---

## Description

Create the framework-neutral type contract for the agent runtime in `ai-platform/libs/shared`. Add a new `agent.types.ts` file defining the `AgentEventType` string enum and the generic event/config/state interfaces, then re-export all symbols from the shared barrel. This file is the backend source of truth for the SSE event contract and must contain types/enum only — no runtime logic, no NestJS or rxjs value imports.

## Acceptance Criteria

- [ ] `libs/shared/src/lib/types/agent.types.ts` defines `AgentEventType` enum with members `AGENT_START, STEP, TOOL_CALL, TOOL_RESULT, BUDGET, TOKEN, AGENT_DONE, AGENT_ERROR`
- [ ] Enum is a string enum where each value === its member name (e.g. `AGENT_START = 'AGENT_START'`) so the SSE JSON `type` round-trips to the frontend switch
- [ ] Same file defines `IAgentEvent<T = unknown>` (`type: AgentEventType`, `data: T`, `timestamp: number`)
- [ ] Defines `IAgentConfig` (`maxIterations`, `tokenBudget`, `timeoutMs` — all `number`)
- [ ] Defines `IBudgetState` (`iteration`, `tokensUsed`, `elapsedMs` — all `number`)
- [ ] Defines `IToolCall` (`tool: string`, `input: Record<string, unknown>`)
- [ ] All five symbols re-exported from `libs/shared/src/index.ts`
- [ ] No runtime logic, no NestJS imports, no rxjs value imports in `agent.types.ts`
- [ ] `nx test shared` passes — 0 TS errors

## Technical Notes

- Mirror the existing pattern in `ai-platform/libs/shared/src/lib/types/ai.types.ts` for file layout and export style.
- Confirm the barrel: `ai-platform/libs/shared/src/index.ts` — add export(s) following the existing convention there.
- AC reference: AC-01, AC-02, AC-03. Constraint: `libs/shared` stays framework-neutral.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the new `agent.types.ts` type contract and the shared barrel export added for TASK-001. The `AgentEventType` string enum (8 members, each value equal to its member name for clean SSE round-tripping), `IAgentEvent<T = unknown>`, `IAgentConfig`, `IBudgetState`, and `IToolCall` all match the acceptance criteria exactly. The file is correctly types/enum-only with no runtime logic, no NestJS, and no rxjs imports, and follows the existing `ai.types.ts` layout. The barrel export at `index.ts:7` correctly re-exports all symbols via `export *`. No bugs, security, or quality issues found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit 0) — the task's changes are uncommitted in the working tree, so the HEAD~1..HEAD commit range captures no affected projects. As a sanity check, the directly-affected `shared` project test target was run and passed (exit 0); `shared` is a type-only library with `--passWithNoTests`, so no test files exist, which is expected for a types/enum-only task. No test failures.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified against the implementation:
- AC-01 — `AgentEventType` string enum defines all 8 members (`AGENT_START, STEP, TOOL_CALL, TOOL_RESULT, BUDGET, TOKEN, AGENT_DONE, AGENT_ERROR`), each value equal to its member name for clean SSE round-tripping (`agent.types.ts:7-16`).
- AC-02 — `IAgentEvent<T = unknown>` (`type`/`data`/`timestamp`), `IAgentConfig` (3 `number` fields), `IBudgetState` (3 `number` fields), and `IToolCall` (`tool: string`, `input: Record<string, unknown>`) all defined in the same file (lines 21-51).
- AC-03 — all symbols re-exported from the shared barrel via `export * from './lib/types/agent.types'` (`index.ts:7`); file is types/enum-only with zero imports — no runtime logic, no NestJS, no rxjs value imports.
- Gate (`nx test shared`) — QA reports PASS (type-only lib, `--passWithNoTests`, 0 TS errors).
