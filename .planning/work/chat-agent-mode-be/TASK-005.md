---
id: TASK-005
title: Implement Timeout safeguard (+ spec)
status: done
priority: high
repo: be
epic: chat-agent-mode-be
complexity: 2
created-at: 2026-06-14T12:00:00.000Z
updated-at: 2026-06-14T20:50:49+03:00
started-at: 2026-06-14T20:46:12+03:00
completed-at: 2026-06-14T20:50:49+03:00
spec: .planning/work/chat-agent-mode-be/SPEC.md
---

## Description

Implement the `Timeout` safeguard: a pure, DI-free class that enforces a wall-clock limit on
the agent run and throws once elapsed time exceeds `timeoutMs`.

## Acceptance Criteria

- [ ] New file `ai-platform/apps/ai-service/src/ai/safeguards/timeout.ts` exports a `Timeout`
      class constructed with `timeoutMs: number` and an injectable clock (default `Date.now`)
      for testability.
- [ ] `check(): void` throws `TimeoutExceededError` (from `errors.ts`) once
      `now - start >= timeoutMs`; otherwise returns.
- [ ] An `elapsedMs` getter exposes elapsed time for budget snapshots.
- [ ] `timeout.spec.ts` covers under-limit (no throw) and over-limit (throws typed error) using
      an injected fake clock — no real timers / no `setTimeout` waits.
- [ ] `nx test ai-service` passes.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/ai/safeguards/timeout.ts` (+ `.spec.ts`).
- Depends on `errors.ts` (TASK-002).
- Accept `now: () => number = () => Date.now()` as a constructor arg so the spec can advance
  time deterministically. Capture `start` at construction.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `timeout.ts` and `timeout.spec.ts` for the Timeout safeguard. The pure, DI-free `Timeout` class correctly captures `start` at construction via the injectable clock, implements the inclusive `now - start >= timeoutMs` boundary, exposes an `elapsedMs` getter, and throws the typed `TimeoutExceededError` (verified to exist in `errors.ts`). The spec uses a deterministic fake clock with strong boundary coverage (just-under, exactly-at, well-over) and the getter, with no real timers. All acceptance criteria are met; no bugs, security, or quality concerns found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` ran 6 projects. All passed: ai-service (18 suites, 261 tests), api-gateway (1 suite, 8 tests), auth-service (1 suite, 1 test); shared/database/kafka had no tests (passWithNoTests). The Timeout safeguard suite (`timeout.spec.ts`) is included in the ai-service run. Exit code 0.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; ai-service=UP, api-gateway=DOWN (infra), auth-service=DOWN (infra). All three services compiled successfully (webpack ok); the two DOWN services are non-blocking port-probe misses against missing local infra, not code defects.

All acceptance criteria verified:
- AC-1 (Timeout class + injectable clock): PASS — `timeout.ts` exports `Timeout(timeoutMs, now = () => Date.now())`, captures `start` at construction. File lives at the SPEC-authoritative path `src/ai/safeguards/timeout.ts` (SPEC line 82), the in-`AiModule` location mandated by CLAUDE.md.
- AC-2 (`check()` throws `TimeoutExceededError` on `now - start >= timeoutMs`): PASS — inclusive boundary at timeout.ts:43-51; error type confirmed exported in `errors.ts`.
- AC-3 (`elapsedMs` getter): PASS — timeout.ts:34-36.
- AC-4 (spec with fake clock, under/over-limit, no real timers): PASS — deterministic `fakeClock`, covers just-under/exactly-at/well-over + getter, no `setTimeout`.
- AC-5 (`nx test ai-service` passes): PASS — re-ran `timeout.spec.ts` (4/4 green); QA confirmed full ai-service run green (18 suites, 261 tests).

Maps to SPEC AC-04 (pure Timeout safeguard) and AC-08 (per-safeguard unit test).
