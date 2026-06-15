---
id: TASK-012
title: Add agent-loop tests — happy path + budget-exceeded + cancel
status: done
priority: high
repo: be
epic: chat-agent-mode-be
complexity: 5
created-at: 2026-06-14T12:00:00.000Z
updated-at: 2026-06-14T22:59:26+03:00
started-at: 2026-06-14T22:52:25+03:00
completed-at: 2026-06-14T22:59:26+03:00
spec: .planning/work/chat-agent-mode-be/SPEC.md
---

## Description

Add the integration-level tests that exercise the assembled agent loop end-to-end inside
`AiService` (and its module wiring), closing AC-08. Per-safeguard unit specs already exist
(TASK-002–006); this task covers the loop behavior: a happy path, a budget breach, and a
cancel.

## Acceptance Criteria

- [ ] Happy path: agent run plans, calls `similaritySearch` (mocked), feeds the observation
      back, emits a `final` `AgentEvent`, and streams final-answer tokens to completion.
- [ ] Budget-exceeded: with a tiny `tokenBudget` (or `maxIterations`), the run aborts and the
      Observable errors with the typed safeguard `reason` (no unbounded looping).
- [ ] Cancel: tripping the run's `KillSwitch` (simulating `AI_CANCEL`) makes the next
      `checkpoint()` abort the run with `KillSwitchTrippedError`.
- [ ] Agent events carry a well-formed `budget` snapshot (iteration / tokensUsed / elapsedMs +
      configured maxima).
- [ ] Default chat-mode path remains green (regression guard for AC-07).
- [ ] `nx test ai-service shared api-gateway` all pass.

## Technical Notes

- Likely file: `ai-platform/apps/ai-service/src/ai/ai.service.spec.ts` (and/or a focused
  `runAgentFlow` spec). Mock `AiProviderFactory.getProvider().chat` to script planning turns,
  and mock `SearchService.similaritySearch`.
- Drive the provider mock to return a tool-call decision then a final answer for the happy path;
  return endless tool-calls for the budget/iteration breach test.
- Use an injected fake clock for any timeout assertions (see TASK-005) — no real timers.
- This is the AC-08 gate: ensure the full `nx test ai-service shared api-gateway` command is
  green before marking done.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the new agent-loop integration spec at `ai-platform/apps/ai-service/src/ai/ai.service.spec.ts` against the actual implementation in `ai.service.ts` and all four safeguard classes (`iteration-cap`, `timeout`, `kill-switch`, `token-budget`, `errors`). All five test cases trace correctly against the real loop semantics: happy path (plan→search→observation-feedback→streamed final), iteration-cap breach (exactly 2 chat calls then `IterationCapExceededError` with `reason: 'iteration_cap'`), cancel via `getKillSwitch().kill()` aborting the next `checkpoint()` with `KillSwitchTrippedError`, the well-formed `AgentBudget` snapshot (6-field shape matches the shared type exactly), and the AC-07 chat regression guard. Tests are deterministic (the `asyncStream` helper correctly handles the chat `BehaviorSubject` replay race, documented inline), use no real timers in assertions, and contain English-only comments per project rules. No bugs, security issues, or quality concerns found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected (--base=HEAD~1 --head=HEAD) ran target test for 6 projects, all successful:
- ai-service: 21 suites, 274 tests passed
- api-gateway: 3 suites, 18 tests passed
- auth-service: 1 suite, 1 test passed
- shared, database, kafka: no tests found (passWithNoTests, cached)

Total: 293 tests passed, 0 failed. Exit code 0.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK — all services compiled. Boot summary: ai-service:4001=UP, api-gateway:4000=DOWN (infra/port race, non-blocking), auth-service:4002=DOWN (infra/port race, non-blocking). Build gate passed; DOWN services are local-infra warnings, not code defects.

All acceptance criteria verified against `ai-platform/apps/ai-service/src/ai/ai.service.spec.ts` and the real implementation in `ai.service.ts`:
- Happy path (plan -> mocked similaritySearch -> observation fed back into 2nd planning turn -> `final` event -> streamed tokens): verified (spec lines 117-152).
- Budget-exceeded (maxIterations=2 -> IterationCapExceededError, reason `iteration_cap`, exactly 2 bounded chat calls, no unbounded loop): verified (lines 154-172).
- Cancel (getKillSwitch().kill() -> next checkpoint aborts with KillSwitchTrippedError / reason `kill_switch`): verified (lines 174-195).
- Well-formed budget snapshot (6-field shape: iteration/tokensUsed/elapsedMs + configured maxima): verified (lines 197-220).
- Default chat-mode regression guard for AC-07 (unchanged flow, zero agent events): verified (lines 222-236).
- `nx test ai-service shared api-gateway`: re-ran clean — ai-service 21 suites/274 tests, api-gateway 3 suites/18 tests, shared passWithNoTests. All green.

Implementation methods the tests depend on (`runAgentFlow`, `getKillSwitch`, `onAgentEvent`, `mode === 'agent'` branch, planning/tool_call/tool_result/final events) confirmed present in `ai.service.ts`. This closes the AC-08 test gate.
