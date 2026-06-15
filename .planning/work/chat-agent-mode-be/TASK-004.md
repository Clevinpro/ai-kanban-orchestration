---
id: TASK-004
title: Implement IterationCap safeguard (+ spec)
status: done
priority: high
repo: be
epic: chat-agent-mode-be
complexity: 2
created-at: 2026-06-14T12:00:00.000Z
updated-at: 2026-06-14T20:45:57+03:00
started-at: 2026-06-14T20:42:03+03:00
completed-at: 2026-06-14T20:45:57+03:00
spec: .planning/work/chat-agent-mode-be/SPEC.md
---

## Description

Implement the `IterationCap` safeguard: a pure, DI-free class that counts reason→act
iterations and throws once the cap is reached, making an unbounded loop impossible.

## Acceptance Criteria

- [ ] New file `ai-platform/apps/ai-service/src/ai/safeguards/iteration-cap.ts` exports an
      `IterationCap` class constructed with a `maxIterations: number`.
- [ ] `increment(): number` advances the counter and throws `IterationCapExceededError` (from
      `errors.ts`) when the count would exceed `maxIterations`; returns the current iteration
      otherwise.
- [ ] A `current` getter exposes the iteration number for budget snapshots.
- [ ] `iteration-cap.spec.ts` covers: increments up to the cap without throwing, and throws the
      typed error once the cap is exceeded.
- [ ] `nx test ai-service` passes.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/ai/safeguards/iteration-cap.ts` (+ `.spec.ts`).
- Depends on `errors.ts` (TASK-002).
- Decide and document inclusive vs exclusive boundary in a comment (recommend: allow exactly
  `maxIterations` iterations, throw on the one after).
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the new `IterationCap` safeguard and its spec. The class is a pure, DI-free counter with correct inclusive-cap boundary logic (`count + 1 > maxIterations`), allowing exactly `maxIterations` increments and throwing `IterationCapExceededError` on the next call without mutating the counter. The `current` getter, error message, and JSDoc-documented boundary semantics all match the acceptance criteria, and the dependency `errors.ts` correctly exports the typed error. Tests cover initial state, increments up to the cap, the typed-error throw, and the no-advance-on-breach invariant. No bugs, security, or quality concerns.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected (--base=HEAD~1 --head=HEAD) ran target test for 6 projects, all succeeded (exit code 0):
- ai-service: 17 suites / 257 tests passed
- api-gateway: 1 suite / 8 tests passed
- auth-service: 1 suite / 1 test passed
- shared, database, kafka: no tests (passWithNoTests)

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=DOWN (infra), auth-service=DOWN (infra), ai-service=UP. Build compiled successfully for all services; the DOWN services are non-blocking (missing local infra), and ai-service — the service owning this task's code — booted cleanly.

All acceptance criteria verified and passed:
- AC-1: `IterationCap` class with `maxIterations: number` constructor exported from `ai-platform/apps/ai-service/src/ai/safeguards/iteration-cap.ts` (canonical `ai/safeguards/` path per SPEC.md, replacing the deleted `agent/` module).
- AC-2: `increment(): number` advances the counter and throws `IterationCapExceededError` (imported from `errors.ts`) on inclusive-cap breach (`count + 1 > maxIterations`) without mutating the counter; returns the current iteration otherwise.
- AC-3: `current` getter exposes the iteration number for budget snapshots.
- AC-4: `iteration-cap.spec.ts` covers initial zero state, increments up to the cap, the typed-error throw, and the no-advance-on-breach invariant.
- AC-5: `nx test ai-service` passes (17 suites / 257 tests, per QA Results).
