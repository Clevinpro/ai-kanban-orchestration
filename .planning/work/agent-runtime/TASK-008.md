---
id: TASK-008
title: Add AgentRunnerService spec (happy / over-budget / unsubscribe)
status: done
priority: high
repo: be
epic: agent-runtime
complexity: 5
created-at: 2026-06-03T12:00:00Z
updated-at: 2026-06-03T12:00:00Z
started-at: null
completed-at: null
spec: .planning/work/agent-runtime/SPEC.md
---

## Description

Add the unit spec for `AgentRunnerService` proving the three guarantees from Success Criteria 4: the happy path emits `AGENT_START … AGENT_DONE` in order, a forced over-budget run emits exactly one `AGENT_ERROR` then completes, and unsubscribe trips the kill-switch. Mock the provider factory and search service so the loop is deterministic.

## Acceptance Criteria

- [ ] `ai-platform/apps/ai-service/src/agent/agent-runner.service.spec.ts` exists with `AiProviderFactory`/provider and `SearchService` mocked
- [ ] Happy-path test: collected events start with `AGENT_START` and end with `AGENT_DONE`, in order, and the Observable completes (no error)
- [ ] Over-budget test: with a tiny `tokenBudget`, the stream emits exactly one `AGENT_ERROR` (reason set) then completes — `subscriber.error` is never called
- [ ] Unsubscribe test: unsubscribing mid-run trips the kill-switch (no further events / in-flight work stops)
- [ ] `nx test ai-service` passes — 0 TS errors, 0 failures

## Technical Notes

- Drive a fake provider returning a canned plan then a final-answer token stream; control budget by returning token counts that exceed the configured `tokenBudget`.
- Collect emissions into an array via `subscribe`; assert order by `event.type`.
- For the unsubscribe test, assert the kill path was reached (spy on the provider stream teardown or assert no `AGENT_DONE` arrives after unsubscribe).
- Mirror existing ai-service spec setup/mocking conventions (see other `*.service.spec.ts` in ai-service).
- AC reference: AC-11, AC-15, AC-16; SPEC Success Criteria 4.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `agent-runner.service.spec.ts` against the `AgentRunnerService` it tests, plus the `TokenBudget`/`KillSwitch` safeguards, `IAIProvider`/`AiProviderFactory` contracts, and the shared agent types. All three required guarantees are covered correctly and deterministically: the happy-path test verifies `AGENT_START`-first / `AGENT_DONE`-last ordering plus streamed `TOKEN` events; the over-budget test (`tokenBudget: 1`) correctly forces `budget.track()` to throw `BudgetExceededError` on the first planning turn, yielding exactly one `AGENT_ERROR` and no `subscriber.error`; the unsubscribe test correctly exercises the teardown path (`activeSubscription.unsubscribe()` → inner Observable teardown) and asserts no terminal event leaks after the subscriber is closed. The mocks match real signatures (`chat(string): Observable<string>`, `getProvider()`, constructor arg order `factory, search, logger`), and timing assumptions (synchronous `setActive` before the 10ms unsubscribe) hold. No bugs, no TS-type or convention issues found. Note: passing `nx test ai-service` (AC criterion) cannot be confirmed in this read-only review and should be validated by QA.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported no tasks because the new `apps/ai-service/src/agent/` files (including the deliverable `agent-runner.service.spec.ts`) are untracked and therefore absent from the `HEAD~1..HEAD` git diff. Per D-06, an empty affected set is not a failure, but since this task's AC requires `nx test ai-service` to pass, I validated the deliverable by running the target directly.

- Full ai-service suite: `nx test ai-service` — 15 test suites passed, 143 tests passed, 0 failures.
- `agent-runner.service.spec.ts` specifically: 1 suite, 3 tests passed (happy path, over-budget, unsubscribe).
- 0 TS errors, 0 failures.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified against the SPEC (Success Criteria 4; AC-11, AC-15, AC-16; gate AC-29):
- AC-1 (spec exists, deps mocked): `agent-runner.service.spec.ts` present with `AiProviderFactory`/provider (`buildProviderFactory`/`buildProvider`) and `SearchService` (`buildSearchService`) mocked. PASS.
- AC-2 (happy path / SPEC AC-11): asserts `AGENT_START` first, `AGENT_DONE` last, START precedes DONE, no `AGENT_ERROR`, Observable completes (`errored === false`), TOKEN stream order. PASS.
- AC-3 (over-budget / SPEC AC-15): `tokenBudget: 1` forces `budget.track()` to throw `BudgetExceededError` on the first planning turn (verified against `agent-runner.service.ts`: estimated tokens far exceed 1 before the final/TOKEN branch); test asserts exactly one `AGENT_ERROR` with truthy reason, no `AGENT_DONE`, no TOKEN, and `subscriber.error` never called. PASS.
- AC-4 (unsubscribe / SPEC AC-16): teardown wiring (`kill.kill()` + `activeSubscription?.unsubscribe()`) confirmed; test asserts in-flight stream torn down (`teardown === true`) and no terminal event leaks. PASS.
- AC-5 (`nx test ai-service`): QA ran the target directly — 15 suites / 143 tests passed, the new spec's 3 tests pass, 0 TS errors, 0 failures. PASS.
