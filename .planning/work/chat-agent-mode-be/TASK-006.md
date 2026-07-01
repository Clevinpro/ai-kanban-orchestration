---
id: TASK-006
title: Implement KillSwitch safeguard (+ spec)
status: done
priority: high
repo: be
epic: chat-agent-mode-be
complexity: 2
created-at: 2026-06-14T12:00:00.000Z
updated-at: 2026-06-14T20:54:56+03:00
started-at: 2026-06-14T20:51:05+03:00
completed-at: 2026-06-14T20:54:56+03:00
spec: .planning/work/chat-agent-mode-be/SPEC.md
---

## Description

Implement the `KillSwitch` safeguard: a pure, DI-free class holding a flippable flag. The
loop calls `checkpoint()` each iteration; an external `AI_CANCEL` consumer (TASK-010) calls
`kill()` to abort the run promptly.

## Acceptance Criteria

- [ ] New file `ai-platform/apps/ai-service/src/ai/safeguards/kill-switch.ts` exports a
      `KillSwitch` class.
- [ ] `kill(): void` sets an internal killed flag (idempotent).
- [ ] `checkpoint(): void` throws `KillSwitchTrippedError` (from `errors.ts`) when killed;
      otherwise returns.
- [ ] An `isKilled` getter exposes the current state.
- [ ] `kill-switch.spec.ts` covers: checkpoint before kill (no throw), after kill (throws typed
      error), and idempotent repeated `kill()`.
- [ ] `nx test ai-service` passes.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/ai/safeguards/kill-switch.ts` (+ `.spec.ts`).
- Depends on `errors.ts` (TASK-002).
- Instance-per-run: TASK-010 keeps a `Map<conversationId, KillSwitch>` so cancel targets the
  right run. Keep this class state-only; the registry lives in the module.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `kill-switch.ts` and `kill-switch.spec.ts` against TASK-006 acceptance criteria. The `KillSwitch` class is a pure, DI-free, state-only implementation: `kill()` is idempotent, `checkpoint()` throws the typed `KillSwitchTrippedError` (correctly imported from the existing `errors.ts`), and the `isKilled` getter exposes state. The spec covers checkpoint-before-kill (no throw), checkpoint-after-kill (typed throw), and idempotent repeated `kill()`. Comments are English-only and the registry concern is correctly left to TASK-010 as specified. Quality is high with no bugs or security concerns.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected test (--base=HEAD~1 --head=HEAD) ran 6 projects, all passing. ai-service: 19 suites, 265 tests passed. api-gateway: 8 tests passed. auth-service: 1 test passed. shared/database/kafka: no tests (passWithNoTests). Exit code 0.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=DOWN (cache-served, compiled OK — boot timing/infra WARN), auth-service=DOWN (same), ai-service=UP. All apps compiled; ai-service (the task's repo) boots clean.

All acceptance criteria verified against `ai-platform/apps/ai-service/src/ai/safeguards/kill-switch.ts` and `kill-switch.spec.ts` (task-scoped slice of SPEC AC-04, the four pure safeguards):
- File exports `KillSwitch` class — PASS.
- `kill(): void` sets internal killed flag, idempotent (repeated calls leave it killed) — PASS.
- `checkpoint(): void` throws `KillSwitchTrippedError` imported from `errors.ts` when killed, returns otherwise — PASS.
- `isKilled` getter exposes state — PASS.
- spec covers checkpoint-before-kill (no throw), checkpoint-after-kill (typed throw), idempotent repeated `kill()` — PASS.
- `nx test ai-service` passes — PASS (QA: 265 tests green). Class is pure/DI-free/state-only; registry correctly deferred to TASK-010.
