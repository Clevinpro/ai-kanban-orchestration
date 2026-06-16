---
id: TASK-003
title: Re-add BudgetIndicator to @libs/ui (3 bars green→yellow→red + stories + spec)
status: done
priority: high
repo: fe
epic: chat-agent-mode-fe
complexity: 3
created-at: 2026-06-15T12:00:00.000Z
updated-at: 2026-06-15T17:05:13+03:00
started-at: 2026-06-15T16:59:13+03:00
completed-at: 2026-06-15T17:05:13+03:00
spec: .planning/work/chat-agent-mode-fe/SPEC.md
---

## Description

Reintroduce the `BudgetIndicator` component in `@libs/ui` — a view-only, backend-agnostic
component rendering three progress bars (iterations, tokens, time) that shift green → yellow →
red as usage approaches each limit. It was deleted in a prior attempt and is reintroduced here.

## Acceptance Criteria

- [ ] New `ai-platform-fe/libs/ui/src/components/BudgetIndicator/BudgetIndicator.tsx` exports a
      `BudgetIndicator` component plus `BudgetIndicatorProps`.
- [ ] Props take a budget snapshot (`iteration`, `tokensUsed`, `elapsedMs`, `maxIterations`,
      `tokenBudget`, `timeoutMs`) and render three bars with fill % = used/limit.
- [ ] Each bar color thresholds green (<70%) → yellow (70–90%) → red (>90%); clamps at 100%.
- [ ] A `BudgetIndicator.stories.tsx` shows low / mid / over-budget states.
- [ ] A `BudgetIndicator.spec.tsx` (Vitest + RTL) asserts fill % and color thresholds.
- [ ] `BudgetIndicator` + `BudgetIndicatorProps` are re-exported from
      `ai-platform-fe/libs/ui/src/index.ts`.
- [ ] `nx test ui` passes.

## Technical Notes

- Component is purely presentational (props in, no data fetching) — mirror existing `@libs/ui`
  component conventions (see `ChatMessage`, `DocumentList` for structure/stories/spec patterns).
- Keep the budget snapshot prop shape aligned with the `@libs/api` `AgentBudget` type (TASK-001).
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the new `BudgetIndicator` component, its stories, spec, and the `@libs/ui` index re-export. The component is purely presentational, correctly exports `BudgetIndicator` + `BudgetIndicatorProps`, and renders three threshold-colored bars. Edge cases are well-handled: `fillPercent` guards against zero/negative/non-finite limits and clamps to 0–100; `thresholdColor` boundaries (green <70, yellow 70–90, red >90) match the spec exactly and are covered by tests. The `orientation="vertical"` Space prop is correct for the project's antd v6.3.7 (verified `direction` is deprecated in favor of `orientation`). Stories cover low/mid/over-budget states; spec asserts fill %, color thresholds, clamping, and captions. Bars expose accessible labels and `aria-valuenow`. No bugs, security issues, or convention violations found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit 0) because the BudgetIndicator work is still uncommitted in the working tree (untracked `BudgetIndicator/` dir + modified `libs/ui/src/index.ts`), so the HEAD~1..HEAD diff is empty (D-06: no affected tests is not a failure).

To validate the task's test coverage directly, ran `nx test ui`: 11 BudgetIndicator tests passed (5 files: 1 passed, 4 skipped; 11 passed, 4 todo). Spec asserts fill % and color thresholds as required. Successfully ran target test for project ui.

## TeamLead Check

Status: APPROVED

Smoke boot (fe): BUILD_OK; shell:3000=UP, auth:3001=UP, chat:3002=UP, docs:3003=UP.

All acceptance criteria verified:
- AC-1 (component file exports BudgetIndicator + BudgetIndicatorProps): `BudgetIndicator.tsx` exists and exports both.
- AC-2 (props snapshot + 3 bars, fill % = used/limit): props are `iteration`/`tokensUsed`/`elapsedMs`/`maxIterations`/`tokenBudget`/`timeoutMs`; three `BudgetBar`s use `fillPercent(used, limit)`.
- AC-3 (color thresholds green <70 / yellow 70-90 / red >90, clamp at 100%): `thresholdColor` (>90 red, >=70 yellow, else green) and `fillPercent` clamp to 0-100 match the spec.
- AC-4 (stories show low/mid/over-budget): `BudgetIndicator.stories.tsx` has Low, Mid, OverBudget stories.
- AC-5 (spec asserts fill % and color thresholds): `BudgetIndicator.spec.tsx` present; 11 tests pass.
- AC-6 (re-export from index.ts): both `BudgetIndicator` and `BudgetIndicatorProps` re-exported at lines 24-25.
- AC-7 (`nx test ui` passes): verified — 11 passed, target ran successfully.
