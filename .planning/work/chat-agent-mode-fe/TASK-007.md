---
id: TASK-007
title: Add limit inputs + metrics panels + stop button to chat.tsx (no toggle)
status: done
priority: high
repo: fe
epic: chat-agent-mode-fe
complexity: 5
created-at: 2026-06-15T12:00:00.000Z
updated-at: 2026-06-15T17:26:31+03:00
started-at: 2026-06-15T17:20:12+03:00
completed-at: 2026-06-15T17:26:31+03:00
spec: .planning/work/chat-agent-mode-fe/SPEC.md
---

## Description

Surface the tool-use UI on the existing `/chat` page. Add optional limit inputs to the composer,
mount the three `@libs/ui` agent panels (steps timeline, budget bars, tool-call list) fed by
`useChat` state, and add a stop button that cancels a running chat. No chat|agent mode toggle —
this is the existing chat, enhanced.

## Acceptance Criteria

- [ ] `ai-platform-fe/apps/chat/src/routes/chat.tsx` exposes optional `maxIterations`,
      `tokenBudget`, `timeoutMs` inputs in the composer (no mode toggle anywhere).
- [ ] On send, the limits (when set) are passed through `useChat.sendMessage`; an empty/unset
      limit sends as today.
- [ ] `AgentSteps`, `BudgetIndicator`, and `ToolCallList` (from `@libs/ui`) render from
      `useChat`'s `steps` / `budget` / `toolCalls`; they appear when agent events arrive and stay
      quiet for a plain answer with none.
- [ ] A stop button is shown while a run is streaming and calls `useChat.stop()`.
- [ ] A plain chat (no limits, no tool calls) looks and behaves as today (AC-06).
- [ ] `nx test chat` passes.

## Technical Notes

- File: `ai-platform-fe/apps/chat/src/routes/chat.tsx`; import the three components from
  `@libs/ui` and the new state/handlers from `useChat` (TASK-006).
- Layout (SPEC Open Question): inline-in-bubble vs side/below panel; pick a clean default and
  keep it self-contained. Limit inputs may be a small collapsible "limits" control rather than a
  mode toggle.
- Do not add a `/agent` route, `useAgent` hook, or a second `EventSource`.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `chat.tsx` and `chat.spec.tsx` against the useChat hook contract (TASK-006) and the three `@libs/ui` component prop types. The integration is correct and type-safe: limit inputs are surfaced in a collapsible control with no mode toggle, `toSendLimits` correctly omits unset fields so plain chats send the legacy request shape, the AgentSteps/BudgetIndicator/ToolCallList panels are gated behind `hasAgentActivity` (and `setBudget(null)`/reset on send keeps them quiet for plain answers), and the stop button is conditionally rendered only while streaming and wired to `stop()`. The `Space orientation="vertical"` and the tool-call input/output-by-state mapping both match established codebase patterns. Tests cover all six acceptance criteria with appropriate mocks. No bugs, security issues, or quality concerns found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

The committed-range affected run (`--base=HEAD~1 --head=HEAD`) reported "No tasks were run" because the task changes (`apps/chat/src/routes/chat.tsx` modified, `chat.spec.tsx` untracked) are in the working tree, not yet committed. Re-running affected against the working-tree changes (`--uncommitted`) covered the chat project and its dependents: all 5 affected projects passed. The chat project (where this task's changes live) ran 2 test files / 7 tests, all passing. No failures across any affected project.

## TeamLead Check

Status: APPROVED

Smoke boot (fe): BUILD_OK; shell:3000=UP, auth:3001=UP, chat:3002=UP, docs:3003=UP.

All acceptance criteria verified against `chat.tsx` and `chat.spec.tsx`:
- AC-1: collapsible "Limits (optional)" control exposes `maxIterations`/`tokenBudget`/`timeoutMs` InputNumbers with no mode toggle — PASS.
- AC-2: `toSendLimits` omits unset fields and returns `undefined` when empty; tests confirm `sendMessage('hello', undefined)` and `sendMessage('do work', { maxIterations: 5 })` — PASS.
- AC-3: `AgentSteps` / `BudgetIndicator` / `ToolCallList` render from `useChat` `steps`/`budget`/`toolCalls`, gated by `hasAgentActivity`; verified quiet for plain answer and present when events arrive — PASS.
- AC-4: stop button rendered only while streaming and wired to `stop()` — PASS.
- AC-5 (AC-06): plain chat sends undefined limits and renders no panels — behaviorally unchanged — PASS.
- AC-6: `nx test chat` re-run with `--skip-nx-cache`: 2 files / 7 tests, all passing — PASS.
