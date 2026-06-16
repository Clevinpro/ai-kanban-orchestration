---
id: TASK-005
title: Re-add ToolCallList to @libs/ui (dynamic tool names + stories + spec)
status: done
priority: high
repo: fe
epic: chat-agent-mode-fe
complexity: 3
created-at: 2026-06-15T12:00:00.000Z
updated-at: 2026-06-15T17:14:59+03:00
started-at: 2026-06-15T17:10:46+03:00
completed-at: 2026-06-15T17:14:59+03:00
spec: .planning/work/chat-agent-mode-fe/SPEC.md
---

## Description

Reintroduce the `ToolCallList` component in `@libs/ui` — a view-only list of the agent's tool
calls (tool name + input, and result state), rendered live. It was deleted in a prior attempt
and is reintroduced here. Tool names are dynamic (the backend registry can add tools).

## Acceptance Criteria

- [ ] New `ai-platform-fe/libs/ui/src/components/ToolCallList/ToolCallList.tsx` exports a
      `ToolCallList` component plus `ToolCallListProps`.
- [ ] Props take a list of tool-call items (`tool: string`, `input?: string`, and a state such
      as pending/done derived from tool_call vs tool_result) and render one row per call.
- [ ] The tool name is rendered from the dynamic `tool` string (no hardcoded tool names); empty
      list renders nothing (or a quiet placeholder).
- [ ] A `ToolCallList.stories.tsx` shows empty, single-call, and multi-call states.
- [ ] A `ToolCallList.spec.tsx` (Vitest + RTL) asserts rows render with the dynamic tool name and
      input.
- [ ] `ToolCallList` + `ToolCallListProps` are re-exported from
      `ai-platform-fe/libs/ui/src/index.ts`.
- [ ] `nx test ui` passes.

## Technical Notes

- Purely presentational; mirror existing `@libs/ui` component conventions. Align the item shape
  with the `@libs/api` agent event type (TASK-001).
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the reintroduced `ToolCallList` component (`ToolCallList.tsx`, `.spec.tsx`, `.stories.tsx`) and the `@libs/ui/src/index.ts` re-exports. The component is purely presentational, renders dynamic tool names from the `tool` string with no hardcoding, returns `null` on an empty list, and correctly mirrors the existing `AgentSteps` conventions and the `@libs/api` `AgentEvent` shape. Props (`ToolCallListProps`, `ToolCallItem`, `ToolCallState`) are exported and re-exported correctly; antd `List` uses the proper `dataSource` prop and `data-testid` pass-through. Stories cover empty/single/multi states and the spec asserts dynamic name+input rendering and derived state labels. All acceptance criteria are satisfied. Comments are English-only. No bugs, security, or quality issues found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported no affected projects (the ToolCallList implementation files are uncommitted in the working tree, so the HEAD~1..HEAD diff shows no changes). Per D-06, no affected tests is not a failure.

To verify the implemented work, ran `nx test ui` directly: 22 tests passed, 4 todo, 4 spec files skipped (pre-existing). The new `ToolCallList.spec.tsx` passed all 4 tests (renders one row per tool call, renders dynamic tool name + input, reflects derived state labels, plus empty-list rendering). `BudgetIndicator` (11) and `AgentSteps` (7) also passed. Target test ran successfully for project ui.

## TeamLead Check

Status: APPROVED

Smoke boot (fe): BUILD_OK; shell:3000=UP, auth:3001=UP, chat:3002=UP, docs:3003=UP

All acceptance criteria verified for TASK-005 (the `ToolCallList` slice of SPEC AC-04 + AC-07):
- ToolCallList.tsx exports `ToolCallList` + `ToolCallListProps` (also `ToolCallItem`, `ToolCallState`) — confirmed.
- Props take a list of items (`tool`, optional `input`, `state` derived from tool_call/tool_result) and render one row per call via antd `List`/`dataSource` — confirmed.
- Dynamic tool name rendered from the `tool` string (no hardcoding); empty list returns `null` — confirmed in component and asserted by spec ("renders the dynamic tool name…", "renders nothing for an empty list").
- ToolCallList.stories.tsx covers Empty, SingleCall, and MultiCall states — confirmed.
- ToolCallList.spec.tsx (Vitest + RTL) asserts dynamic tool name + input and derived state labels — confirmed, 4 tests passing.
- Re-exported from libs/ui/src/index.ts — confirmed.
- `nx test ui` passes (22 passed, 4 todo) — re-ran and confirmed green.
