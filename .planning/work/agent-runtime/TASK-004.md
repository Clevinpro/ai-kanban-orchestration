---
id: TASK-004
title: Add IterationCap safeguard class + pass/throw spec
status: done
priority: high
repo: be
epic: agent-runtime
complexity: 2
created-at: 2026-06-03T12:00:00Z
updated-at: 2026-06-03T12:00:00Z
started-at: null
completed-at: null
spec: .planning/work/agent-runtime/SPEC.md
---

## Description

Add the `IterationCap` safeguard: a pure class tracking loop iteration count that throws when an increment would exceed the configured maximum. Co-locate a spec covering both pass and throw paths.

## Acceptance Criteria

- [ ] `ai-platform/apps/ai-service/src/agent/safeguards/iteration-cap.ts` exports `class IterationCap` with ctor `(max: number)`
- [ ] `increment(): void` throws `MaxIterationsError` when the count would exceed `max`
- [ ] `get current(): number` returns the current count
- [ ] Class is pure — no I/O, no NestJS DI
- [ ] `iteration-cap.spec.ts` covers pass path (increments up to `max`) and throw path (increment beyond `max` throws `MaxIterationsError`)
- [ ] `nx test ai-service` passes for this file

## Technical Notes

- Import `MaxIterationsError` from `./errors` (TASK-002).
- Decide and document the boundary: incrementing to exactly `max` is allowed; the increment that would make `current > max` throws. Spec must assert the boundary.
- AC reference: AC-06, AC-09.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `iteration-cap.ts` and its spec against TASK-004 acceptance criteria. The `IterationCap` class is pure (no DI/I/O), correctly exports the `(max: number)` ctor, `increment()`, and `get current()`, and imports `MaxIterationsError` from the existing `./errors` module (verified the export and its `instanceof`-safe prototype handling). Boundary semantics match the task contract: incrementing to exactly `max` passes, the increment that would exceed `max` throws before mutating state, and the spec asserts both paths plus the `max = 0` edge and the unchanged-count-after-reject case. No bugs or security concerns; constructor input validation (negative/non-integer `max`) is absent but not required by the task and the resulting behavior is safe.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit 0) — the task's new files under `apps/ai-service/src/agent/` are still untracked, so they fall outside the HEAD~1..HEAD diff and no project was flagged as affected.

As a verification fallback, ran `nx test ai-service` directly: 12 suites passed, 132 tests passed, 0 failed (exit 0). This run includes `iteration-cap.spec.ts`, satisfying AC "nx test ai-service passes for this file".

## TeamLead Check

Status: APPROVED

All acceptance criteria verified (SPEC AC-06, AC-09 — task scope):
- iteration-cap.ts exports `class IterationCap` with ctor `(max: number)` — confirmed.
- `increment(): void` throws `MaxIterationsError` (imported from `./errors`) when the increment would push `current` beyond `max`; count is left unmutated on reject — confirmed.
- `get current(): number` returns the current count — confirmed.
- Class is pure: no NestJS DI, no I/O — confirmed (sole import is the error type).
- Boundary documented and asserted: incrementing to exactly `max` passes, the increment that would exceed `max` throws; spec also covers the `max = 0` edge and unchanged-count-after-reject — confirmed.
- iteration-cap.spec.ts covers both pass and throw paths — confirmed.
- `nx test ai-service` passes (QA: 12 suites / 132 tests, exit 0, includes this file) — confirmed.
