---
id: TASK-003
title: Implement TokenBudget safeguard (+ spec)
status: done
priority: high
repo: be
epic: chat-agent-mode-be
complexity: 3
created-at: 2026-06-14T12:00:00.000Z
updated-at: 2026-06-14T20:41:50+03:00
started-at: 2026-06-14T20:37:15+03:00
completed-at: 2026-06-14T20:41:50+03:00
spec: .planning/work/chat-agent-mode-be/SPEC.md
---

## Description

Implement the `TokenBudget` safeguard: a pure, DI-free class that accumulates token usage
across loop iterations and throws when the configured budget is exceeded. Resolves the SPEC
open question on token accounting with a portable approach.

## Acceptance Criteria

- [ ] New file `ai-platform/apps/ai-service/src/ai/safeguards/token-budget.ts` exports a
      `TokenBudget` class constructed with a `budget: number`.
- [ ] `track(usage: { tokens?: number } | string): void` adds usage and throws
      `TokenBudgetExceededError` (from `errors.ts`) once cumulative tokens exceed `budget`.
- [ ] Token accounting is portable: when a provider reports usage (`tokens` number) it is used
      directly; otherwise a local estimate of `Math.ceil(text.length / 4)` is applied (Ollama /
      LMStudio may not report usage).
- [ ] A `tokensUsed` getter exposes the running total for budget snapshots.
- [ ] `token-budget.spec.ts` covers: under budget (no throw), provider-reported path, local
      estimate path, and exceeding budget (throws typed error).
- [ ] `nx test ai-service` passes.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/ai/safeguards/token-budget.ts` (+ `.spec.ts`).
- Depends on `errors.ts` (TASK-002).
- Pure class — no NestJS, no Observable. Checked outside the loop body by the loop in TASK-008.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `token-budget.ts` and `token-budget.spec.ts` against TASK-003 acceptance criteria and the `errors.ts` dependency. The `TokenBudget` class correctly accumulates usage, uses provider-reported `tokens` directly, falls back to the `Math.ceil(text.length / 4)` estimate, exposes a `tokensUsed` getter, and throws the typed `TokenBudgetExceededError`. It is a pure DI-free class with English-only comments, and the spec covers under-budget, provider-reported, local-estimate, exceed, and the budget-equality boundary cases. The implementation slightly widens the `track` input type to also accept `{ text?: string }`, which is a reasonable superset that better supports the required local-estimate path. No bugs or security issues found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected --target=test (--base=HEAD~1 --head=HEAD) ran 6 projects, all succeeded (exit code 0):
- ai-service: 16 suites / 253 tests passed
- api-gateway: 1 suite / 8 tests passed
- auth-service: 1 suite / 1 test passed
- shared, database, kafka: no tests found (passWithNoTests)

No test failures.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=DOWN (infra), auth-service=DOWN (infra), ai-service=UP. All three services compiled cleanly via webpack; the two DOWN services are non-blocking infra-dependent boots, not code defects.

All acceptance criteria verified:
- AC-1 PASS: `token-budget.ts` exports a `TokenBudget` class constructed with `budget: number`.
- AC-2 PASS: `track(usage)` accumulates usage and throws `TokenBudgetExceededError` from `errors.ts` once cumulative tokens exceed `budget`.
- AC-3 PASS: portable accounting — provider-reported `tokens` used directly, otherwise local estimate `Math.ceil(text.length / 4)`.
- AC-4 PASS: `tokensUsed` getter exposes the running total.
- AC-5 PASS: `token-budget.spec.ts` covers under-budget, provider-reported, local-estimate (string and object.text), exceed-budget (typed throw), and budget-equality boundary.
- AC-6 PASS: QA confirmed ai-service 16 suites / 253 tests passed; smoke build compiled clean.
