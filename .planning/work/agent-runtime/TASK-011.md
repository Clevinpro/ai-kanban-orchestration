---
id: TASK-011
title: Add AgentSteps component + view types + stories + export
status: done
priority: high
repo: fe
epic: agent-runtime
complexity: 4
created-at: 2026-06-03T12:00:00Z
updated-at: 2026-06-03T12:00:00Z
started-at: null
completed-at: null
spec: .planning/work/agent-runtime/SPEC.md
---

## Description

Add the `AgentSteps` timeline component to the shared UI lib, plus the UI-facing view types it and sibling components need. Define `IAgentStep` and a local `IToolCall` mirror inside `libs/ui` (no backend-package import, no circular dep) with field names identical to the backend event payloads. Render an Ant Design `Timeline`; the active step shows a spinner and statuses map to icons. Add Storybook stories and export from the lib barrel.

## Acceptance Criteria

- [ ] `ai-platform-fe/libs/ui/src/components/AgentSteps/AgentSteps.tsx` — props `{ steps: IAgentStep[] }`, renders an AntD `Timeline`
- [ ] Active step shows a spinner; statuses map to icons
- [ ] `IAgentStep` (`{ iteration: number; status: string; label?: string }`) and a local `IToolCall` (`{ tool: string; input: Record<string, unknown> }`) view types defined inside `libs/ui` — no import from `apps/*` or backend packages
- [ ] `AgentSteps.stories.tsx` has `Running`, `Completed`, `WithError` stories
- [ ] `AgentSteps` and its prop/view types exported from `libs/ui/src/index.ts`
- [ ] Lib edits touch no `apps/`
- [ ] `nx affected -t lint test` passes for ai-platform-fe; Storybook builds the stories

## Technical Notes

- Follow the existing component layout in `ai-platform-fe/libs/ui/src/components/` (see `ChatInput`, `ChatMessage`) for folder/story/export conventions.
- Keep `IAgentStep`/`IToolCall` field names identical to backend payloads so the `useAgent` mapping (TASK-014) is trivial.
- This task owns the shared view-type definitions for the epic (AC-23) — later FE tasks import them from here.
- AC reference: AC-19, AC-22 (partial), AC-23.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the new `AgentSteps` component, its stories, and the barrel export against TASK-011 acceptance criteria. The component renders an AntD `Timeline` with status-to-icon/color mapping and a spinner for active steps, defines `IAgentStep` and a local `IToolCall` view type with no `apps/*` or backend imports (correctly fulfilling AC-23 ownership), handles the empty-steps case, and exports the component plus all view types from `libs/ui/src/index.ts`. Stories cover `Running`, `Completed`, and `WithError`. Naming, folder layout, and conventions match sibling components (`ChatMessage`), dependencies (antd ^6, @ant-design/icons ^6) support the `Timeline items` API, and no `apps/` files were touched. Clean, no bugs or security concerns. Minor non-blocking note: `IToolCall` is defined and exported but unused within this component (intended for downstream tasks per the task notes).
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

Ran `nx affected --target=test --base=HEAD~1 --head=HEAD` from `ai-platform-fe/`. Exit code 0, output "No tasks were run" — no projects were affected in the HEAD~1..HEAD commit range (the task's `AgentSteps/` additions and `libs/ui/src/index.ts` edit are uncommitted working-tree changes, so the committed range contains no FE changes). Per D-06, no affected tests is not a failure.

No affected tests found — no test coverage for this task.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified against the implementation in `ai-platform-fe/libs/ui`:

- AC-19: `AgentSteps.tsx` has props `{ steps: IAgentStep[] }` and renders an AntD `Timeline` (items API, supported by antd ^6); active/running statuses render a spinning `LoadingOutlined`; statuses map to status-specific icons/colors via `getStepVisual`; `AgentSteps.stories.tsx` defines `Running`, `Completed`, and `WithError` stories.
- AC-22 (partial — this task owns the `AgentSteps` slice): `AgentSteps` plus `AgentStepsProps`, `IAgentStep`, and `IToolCall` are exported from `libs/ui/src/index.ts`; lib edits touch no `apps/` (only `libs/ui` files changed). BudgetIndicator/ToolCallList portions of AC-22 belong to sibling tasks.
- AC-23: `IAgentStep` (`{ iteration: number; status: string; label?: string }`) and a local `IToolCall` mirror (`{ tool: string; input: Record<string, unknown> }`) are defined inside `libs/ui` with field names matching the backend payloads, and import only antd / @ant-design/icons / react — no `apps/*` or backend-package imports, so no circular dep.

Code Review APPROVED and QA PASS (no affected tests in the committed range per D-06, consistent with uncommitted working-tree changes). Conventions match sibling components (ChatMessage). Approved.
