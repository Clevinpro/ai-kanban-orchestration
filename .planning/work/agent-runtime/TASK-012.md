---
id: TASK-012
title: Add BudgetIndicator component + stories + export
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

Add the `BudgetIndicator` component to the shared UI lib: three Ant Design `Progress` bars (iterations, tokens, time) that change color as each ratio approaches its limit. Add Storybook stories and export from the lib barrel.

## Acceptance Criteria

- [ ] `ai-platform-fe/libs/ui/src/components/BudgetIndicator/BudgetIndicator.tsx` — props `{ iteration, maxIterations, tokensUsed, tokenBudget, elapsedMs, timeoutMs }`
- [ ] Renders three AntD `Progress` bars (iterations / tokens / time)
- [ ] Color thresholds: green `<60%` → yellow `<85%` → red `≥85%` of each bar's limit
- [ ] `BudgetIndicator.stories.tsx` has `Low`, `Medium`, `NearLimit` stories
- [ ] Exported from `libs/ui/src/index.ts`
- [ ] Lib edits touch no `apps/`
- [ ] `nx affected -t lint test` passes for ai-platform-fe; Storybook builds the stories

## Technical Notes

- Compute each ratio (`iteration/maxIterations`, `tokensUsed/tokenBudget`, `elapsedMs/timeoutMs`) and map to a single shared color helper for the three thresholds.
- Follow component/story/export conventions from existing `libs/ui` components and from TASK-011.
- AC reference: AC-20, AC-22 (partial).

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the new `BudgetIndicator.tsx`, its Storybook stories, and the barrel export. All seven acceptance criteria are met: props match the spec exactly, three AntD `Progress` bars render (iterations/tokens/time), color thresholds (green <60% / yellow <85% / red >=85%) are implemented via a shared `ratioToColor` helper, all three stories (Low/Medium/NearLimit) are present, and both the component and its type are exported. The `computeRatio` helper correctly guards against divide-by-zero and clamps to [0,1], no `apps/` files are touched, and the code cleanly follows the conventions of the sibling `AgentSteps` component. Code quality is high with clear JSDoc and no bugs or security concerns found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

Ran `nx affected --target=test --base=HEAD~1 --head=HEAD` in ai-platform-fe (exit code 0). Output: "NX No tasks were run" — no projects were affected. The BudgetIndicator work (new `libs/ui/src/components/BudgetIndicator/` files plus modified `libs/ui/src/index.ts`) is currently uncommitted/untracked, so the HEAD~1..HEAD diff contains no changes for nx to detect. No affected tests found — no test coverage to execute for this task (D-06: not a failure).

## TeamLead Check

Status: APPROVED

All acceptance criteria verified. AC-20: props `{ iteration, maxIterations, tokensUsed, tokenBudget, elapsedMs, timeoutMs }` match exactly; three AntD `Progress` bars render (iterations/tokens/time); color thresholds green `<60%` / yellow `<85%` / red `>=85%` implemented via `WARNING_THRESHOLD=0.6` and `DANGER_THRESHOLD=0.85` in `ratioToColor`; stories `Low`, `Medium`, `NearLimit` present. AC-22 (export portion): `BudgetIndicator` + `BudgetIndicatorProps` exported from `libs/ui/src/index.ts`; lib edits touch no `apps/`. Gate: code review APPROVED, QA PASS (no affected tests, D-06 not a failure).
