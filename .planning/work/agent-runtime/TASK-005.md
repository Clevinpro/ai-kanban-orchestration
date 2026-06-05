---
id: TASK-005
title: Add Timeout safeguard class + pass/throw spec
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

Add the `Timeout` safeguard: a pure class that records a start time on construction and throws when elapsed wall-clock time exceeds the configured limit. Co-locate a spec covering both pass and throw paths.

## Acceptance Criteria

- [ ] `ai-platform/apps/ai-service/src/agent/safeguards/timeout.ts` exports `class Timeout` with ctor `(ms: number)` that records the start time
- [ ] `check(): void` throws `TimeoutError` when `elapsed > ms`
- [ ] `get elapsed(): number` returns milliseconds since construction
- [ ] Class is pure — no I/O, no NestJS DI
- [ ] `timeout.spec.ts` covers pass path (within limit, no throw) and throw path (over limit throws `TimeoutError`)
- [ ] `nx test ai-service` passes for this file

## Technical Notes

- Import `TimeoutError` from `./errors` (TASK-002).
- Use `Date.now()` for start/elapsed. In the spec, simulate elapsed time deterministically (e.g. fake timers or inject/override the clock) rather than real `sleep` — keep the test fast and non-flaky.
- AC reference: AC-07, AC-09.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the new `Timeout` safeguard class and its co-located spec. The implementation is a pure class with no I/O or DI, correctly records start time via `Date.now()`, exposes a read-only `elapsed` getter, and `check()` throws `TimeoutError` only on strict overflow (`elapsed > ms`). The `TimeoutError` import resolves to a properly-defined error class in `./errors`. Tests are deterministic (mocked clock, no real sleep) and cover pass, boundary-equals-limit, over-limit, and zero-limit cases. All acceptance criteria are met; no bugs or security concerns found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (affected projects: `[]`) because the new agent files under `apps/ai-service/src/agent/` are untracked relative to HEAD. Per D-06, no affected tests is not a failure.

To confirm coverage for this task, the `ai-service` test target was run directly: 13 test suites passed, 136 tests passed, 0 failed (incl. `timeout.spec.ts` covering pass and over-limit throw paths).

## TeamLead Check

Status: APPROVED

All acceptance criteria verified against SPEC.md (AC-07, AC-09 — timeout scope):
- AC-07 / task AC-1: `timeout.ts` exports `class Timeout` with ctor `(ms: number)` recording start time via `Date.now()` — verified in source.
- task AC-2: `check(): void` throws `TimeoutError` on strict overflow (`elapsed > ms`) — verified, error imported from `./errors` where `TimeoutError extends Error`.
- task AC-3: `get elapsed(): number` returns `Date.now() - startedAt` — verified.
- task AC-4 (purity): class has no I/O and no NestJS DI — verified pure.
- AC-09 / task AC-5: `timeout.spec.ts` covers pass path (within limit and equal-to-limit) and throw path (over limit + zero-limit) with a deterministic mocked `Date.now()` clock — no real sleep.
- task AC-6 / Gate: `nx test ai-service` passes (136 tests, 0 failures) per QA Results.
