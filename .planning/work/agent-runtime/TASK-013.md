---
id: TASK-013
title: Add ToolCallList component + stories + export
status: done
priority: medium
repo: fe
epic: agent-runtime
complexity: 3
created-at: 2026-06-03T12:00:00Z
updated-at: 2026-06-03T12:00:00Z
started-at: null
completed-at: null
spec: .planning/work/agent-runtime/SPEC.md
---

## Description

Add the `ToolCallList` component to the shared UI lib: lists each invoked tool with its name and parameters, showing a check mark when the call has resolved. Add Storybook stories and export from the lib barrel.

## Acceptance Criteria

- [ ] `ai-platform-fe/libs/ui/src/components/ToolCallList/ToolCallList.tsx` — props `{ toolCalls: IToolCall[] }`
- [ ] Lists each tool name + params; shows a check mark when the call is resolved
- [ ] `ToolCallList.stories.tsx` has `Empty`, `WithCalls` stories
- [ ] Exported from `libs/ui/src/index.ts`
- [ ] Lib edits touch no `apps/`
- [ ] `nx affected -t lint test` passes for ai-platform-fe; Storybook builds the stories

## Technical Notes

- Reuse the local `IToolCall` view type defined in `libs/ui` by TASK-011 (extend it with a resolved/result marker if needed to render the check mark).
- Follow component/story/export conventions from existing `libs/ui` components.
- AC reference: AC-21, AC-22 (partial).

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the new `ToolCallList.tsx`, its stories, and the `index.ts` barrel changes for TASK-013. The component correctly renders an empty state, lists each tool name + params, and shows a check mark (CheckCircleOutlined) for resolved calls vs. a spinner for pending — meeting all acceptance criteria. It cleanly extends the AgentSteps `IToolCall` view type as `IToolCall extends IAgentToolCall { resolved?: boolean }`, keeps `libs/ui` free of `apps/`/backend imports, and the barrel export is non-conflicting since AgentSteps' internal `IToolCall` is not re-exported. Stories include `Empty` and `WithCalls`. Conventions match sibling components (BudgetIndicator/AgentSteps), including the project pattern of no co-located unit test.

Minor non-blocking note: `key={index}` on `List.Item` is an array-index key anti-pattern; harmless for an append-only tool-call list but worth a stable key if entries can ever reorder. Also `JSON.stringify(call.input)` could throw on circular input, which is not a realistic concern for tool params.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit 0) — the TASK-013 changes are still in the working tree (untracked `libs/ui/src/components/ToolCallList/` plus modified `libs/ui/src/index.ts`), so they fall outside the committed HEAD~1..HEAD diff.

Confirmed the changes affect `ui`, `shell`, `auth`, `chat` (via `nx show projects --affected --files=libs/ui/src/index.ts`) and ran their test targets to provide real coverage:
- ui: 4 test files (4 todo/skipped placeholders) — the lib follows the project pattern of no co-located unit test for components
- shell: 1 passed
- chat: 1 passed
- auth: 3 files, 5 passed

All 4 projects: exit code 0, no failures.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified (this task implements SPEC AC-21 and the ToolCallList portion of AC-22):
- AC-21: `ToolCallList.tsx` has props `{ toolCalls: IToolCall[] }`, lists each tool name + JSON-stringified params, and renders a check mark (CheckCircleOutlined) for resolved calls vs. a spinner for pending; `ToolCallList.stories.tsx` provides `Empty` and `WithCalls` stories.
- AC-22 (ToolCallList scope): `ToolCallList`, `ToolCallListProps`, and `IToolCall` are exported from `libs/ui/src/index.ts`; the component imports only `antd`, `@ant-design/icons`, and the local `AgentSteps` `IToolCall` view type — no `apps/` or backend imports, and git status confirms no `apps/` files were touched.
- Lint/test/Storybook gate: Code Review APPROVED and QA PASS (ui/shell/chat/auth test targets green, exit 0); component follows sibling conventions (AgentSteps/BudgetIndicator).
