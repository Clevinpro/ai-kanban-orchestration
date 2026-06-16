---
id: TASK-001
title: Lower DEFAULT_TIMEOUT_MS to 30000 in ai.service and update timeout tests
status: done
priority: high
repo: be
epic: chat-agent-fast-path-and-provider-split
complexity: 2
created-at: 2026-06-16T10:52:11Z
updated-at: 2026-06-16T14:25:56+03:00
started-at: 2026-06-16T14:19:07+03:00
completed-at: 2026-06-16T14:25:56+03:00
spec: .planning/work/chat-agent-fast-path-and-provider-split/SPEC.md
---

## Description

Enforce the "complex ≤30s" latency budget by changing the default wall-clock
timeout used by the unified chat flow from `120_000` ms to `30_000` ms. The
change is a single constant in `ai.service.ts`; an explicit per-request
`timeoutMs` must still override the default (already handled by
`clampPositiveInt` in `parseRequest`, so do not alter override behaviour).

## Acceptance Criteria

- [ ] `DEFAULT_TIMEOUT_MS = 30_000` in `ai.service.ts` (was `120_000`).
- [ ] With no per-request override, a run uses a 30s budget; an explicit
  `timeoutMs` still overrides (verified by test).
- [ ] Existing timeout-related tests are updated to the new default and pass.
- [ ] `nx test ai-service` passes.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/ai/ai.service.ts` — constant near line 30.
- Override path: `parseRequest` → `clampPositiveInt(r.timeoutMs, DEFAULT_TIMEOUT_MS)`; leave intact.
- Check `ai-platform/apps/ai-service/src/ai/ai.service.spec.ts` and
  `ai-platform/apps/ai-service/src/ai/safeguards/timeout.spec.ts` for any
  assertion that hardcodes `120000`; update to `30000` where it reflects the default.
- Maps to AC-03.

## QA Results

Status: PASS

Ran `npx nx test ai-service --skip-nx-cache` in `ai-platform/`. Exit code 0 — 23 test suites, 290 tests passed (2.9s).

Static AC verification:
- `DEFAULT_TIMEOUT_MS = 30_000` confirmed in `ai.service.ts` (line 30); no `120_000`/`120000` references remain under `apps/ai-service/`.
- Default budget: `ai.service.spec.ts` "plain question with no mode and no limits" asserts `planning.budget.timeoutMs: 30_000` when limits are omitted.
- Override path: same spec file "aborts the in-flight stream…" passes explicit `timeoutMs: 20` and asserts `TimeoutExceededError`; `clampPositiveInt` override behaviour intact.
- `timeout.spec.ts` uses generic limits (not tied to the service default); no stale 120000 assertions.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=UP, auth-service=UP, ai-service=UP

All acceptance criteria verified:
- Task AC-1: `DEFAULT_TIMEOUT_MS = 30_000` in `ai.service.ts` (line 30); no stale `120_000`/`120000` references under `apps/ai-service/`.
- Task AC-2 / SPEC AC-03: Default 30s budget confirmed via "plain question with no mode and no limits" test (`planning.budget.timeoutMs: 30_000`); explicit `timeoutMs: 20` override still triggers `TimeoutExceededError` in stall test.
- Task AC-3: Timeout-related specs updated (`ai.service.spec.ts` assertions at 30_000); `timeout.spec.ts` unchanged (generic limits).
- Task AC-4 / SPEC AC-09: `nx test ai-service` — 23 suites, 290 tests passed.
