---
id: TASK-002
title: Add typed safeguard errors module (errors.ts + spec)
status: done
priority: high
repo: be
epic: chat-agent-mode-be
complexity: 2
created-at: 2026-06-14T12:00:00.000Z
updated-at: 2026-06-14T20:34:52+03:00
started-at: 2026-06-14T20:30:30+03:00
completed-at: 2026-06-14T20:34:52+03:00
spec: .planning/work/chat-agent-mode-be/SPEC.md
---

## Description

Create the typed error module the four safeguards throw and the loop catches. Each safeguard
breach must surface as a distinct, identifiable error so the `error` event carries a typed
reason. This is pure code — no NestJS DI, no decorators.

## Acceptance Criteria

- [ ] New file `ai-platform/apps/ai-service/src/ai/safeguards/errors.ts` exports a base
      `SafeguardError extends Error` plus four subclasses: `TokenBudgetExceededError`,
      `IterationCapExceededError`, `TimeoutExceededError`, `KillSwitchTrippedError`.
- [ ] Each error sets a stable `reason` discriminator string (e.g. `'token_budget'`,
      `'iteration_cap'`, `'timeout'`, `'kill_switch'`) usable in the `error` event payload.
- [ ] A type guard `isSafeguardError(err: unknown): err is SafeguardError` is exported.
- [ ] `errors.spec.ts` verifies each subclass is `instanceof SafeguardError`, carries the
      correct `reason`, and `isSafeguardError` returns true for them / false for a plain Error.
- [ ] `nx test ai-service` passes.

## Technical Notes

- Folder `ai-platform/apps/ai-service/src/ai/safeguards/` is new — create it. Do NOT create a
  new Nest module (per SPEC constraint: keep safeguards as a plain folder inside `ai/`).
- Set `this.name = <ClassName>` in each constructor so logs/stacks identify the breach.
- Pure TS classes only; later safeguard tasks import these.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the two new files (`errors.ts` and `errors.spec.ts`) against all acceptance criteria. The typed error hierarchy is correct and idiomatic: base `SafeguardError` plus the four required subclasses, exact `reason` discriminators, a working `isSafeguardError` type guard, and the canonical `Object.setPrototypeOf(this, new.target.prototype)` fix so `instanceof` survives TS downleveling. `this.name = new.target.name` correctly resolves to each subclass. Test coverage is thorough (instanceof, reason, name, custom message, negative cases). No bugs, security issues, or quality concerns found; only the test-run AC (`nx test ai-service`) is left to the QA stage to confirm.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected --target=test (base=HEAD~1 head=HEAD) ran 6 projects, all passed.
- ai-service: 15 suites, 247 tests passed (includes new errors.spec.ts)
- api-gateway: 8 tests passed
- auth-service: 1 test passed
- shared, database, kafka: no tests (passWithNoTests)
Exit code 0. No test failures.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=DOWN (cache-serve/infra), auth-service=DOWN (cache-serve/infra), ai-service=UP. Build compiled successfully for all services; the two DOWN services are a non-blocking boot WARN (no code defect — relevant service ai-service is UP).

All acceptance criteria verified:
- AC-1 PASS: errors.ts at the SPEC path ai/safeguards/errors.ts exports abstract SafeguardError extends Error plus TokenBudgetExceededError, IterationCapExceededError, TimeoutExceededError, KillSwitchTrippedError.
- AC-2 PASS: each subclass sets the stable reason discriminator ('token_budget', 'iteration_cap', 'timeout', 'kill_switch') via a readonly typed SafeguardReason field.
- AC-3 PASS: isSafeguardError(err): err is SafeguardError type guard exported (instanceof-based).
- AC-4 PASS: errors.spec.ts verifies instanceof Error/SafeguardError/own class, correct reason, name, custom message, and negative cases for plain Error and non-error values.
- AC-5 PASS: QA confirms nx test ai-service green — 247 tests across 15 suites including errors.spec.ts, exit 0.

Note: this is the typed-errors subtask of the chat-agent-mode-be epic; epic-wide ACs (AC-01..AC-08) are distributed across sibling tasks and are out of scope for this task's gate.
