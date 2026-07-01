---
id: TASK-004
title: Re-add AgentSteps timeline to @libs/ui (+ stories + spec)
status: done
priority: high
repo: fe
epic: chat-agent-mode-fe
complexity: 3
created-at: 2026-06-15T12:00:00.000Z
updated-at: 2026-06-15T17:10:30+03:00
started-at: 2026-06-15T17:05:24+03:00
completed-at: 2026-06-15T17:10:30+03:00
spec: .planning/work/chat-agent-mode-fe/SPEC.md
---

## Description

Reintroduce the `AgentSteps` component in `@libs/ui` — a view-only timeline of the agent's
reason→act steps (planning, tool_call, tool_result, final), rendered live as events arrive. It
was deleted in a prior attempt and is reintroduced here.

## Acceptance Criteria

- [ ] New `ai-platform-fe/libs/ui/src/components/AgentSteps/AgentSteps.tsx` exports an
      `AgentSteps` component plus `AgentStepsProps`.
- [ ] Props take an ordered list of step items (`iteration`, `status`, optional `tool`/`input`)
      and render a vertical timeline, newest state reflected; an empty list renders nothing
      (or a quiet placeholder).
- [ ] Step `status` values map to readable labels/icons (planning / tool_call / tool_result /
      final).
- [ ] An `AgentSteps.stories.tsx` shows an empty, mid-run, and completed timeline.
- [ ] An `AgentSteps.spec.tsx` (Vitest + RTL) asserts steps render in order with correct labels.
- [ ] `AgentSteps` + `AgentStepsProps` are re-exported from `ai-platform-fe/libs/ui/src/index.ts`.
- [ ] `nx test ui` passes.

## Technical Notes

- Purely presentational; mirror existing `@libs/ui` component conventions (structure + stories +
  spec). Align the step item shape with the `@libs/api` agent event type (TASK-001).
- `tool` is a dynamic string — do not hardcode `similaritySearch` in labels.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the AgentSteps component (AgentSteps.tsx), its stories, spec, and the index.ts re-export. The component is purely presentational, correctly maps all four status values to labels/icons, renders nothing on an empty list, and keeps the `tool` name dynamic (verified by a dedicated test). The step shape mirrors the `@libs/api` `AgentEvent` type, and conventions match the existing BudgetIndicator. Confirmed against antd v6 type definitions that the `items` API usage (`content`, `icon`, custom color strings) targets the current non-deprecated API. All acceptance criteria are met; comments are English-only. No bugs, security, or quality concerns found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported no affected projects, because the TASK-004 deliverable (AgentSteps component + stories + spec, and the `index.ts` re-export) is uncommitted in the working tree, so the HEAD~1..HEAD diff is empty for ai-platform-fe.

To validate the actual deliverable, ran `nx test ui` directly: PASS. Test Files: 2 passed | 4 skipped. Tests: 18 passed | 4 todo. The new `src/components/AgentSteps/AgentSteps.spec.tsx` ran 7 tests, all passing.

## TeamLead Check

Status: APPROVED

Smoke boot (fe): BUILD_OK; shell=UP, auth=UP, chat=UP, docs=UP.

All acceptance criteria verified against the deliverables:
- AC1 — `AgentSteps.tsx` exports `AgentSteps` and `AgentStepsProps`.
- AC2 — props take an ordered list (`iteration`, `status`, optional `tool`/`input`), render a vertical antd `Timeline`; empty list returns `null`.
- AC3 — `STATUS_META` maps all four status values (planning / tool_call / tool_result / final) to readable labels + icons.
- AC4 — `AgentSteps.stories.tsx` provides Empty, MidRun, and Completed stories.
- AC5 — `AgentSteps.spec.tsx` (Vitest + RTL) asserts ordered render with correct labels (7 tests).
- AC6 — `AgentSteps` + `AgentStepsProps` re-exported from `libs/ui/src/index.ts`.
- AC7 — `nx test ui` passes (re-run confirmed: 18 passed, AgentSteps 7/7).

`tool` name is kept dynamic (not hardcoded), comments are English-only.
