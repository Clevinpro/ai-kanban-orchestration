---
id: TASK-009
title: Verify safeguards intact and AgentEvent SSE shape stable; run full ai-service tests
status: done
priority: medium
repo: be
epic: chat-agent-fast-path-and-provider-split
complexity: 3
created-at: 2026-06-16T10:52:11Z
updated-at: 2026-06-16T19:27:39+03:00
started-at: 2026-06-16T19:16:32+03:00
completed-at: 2026-06-16T19:27:39+03:00
spec: .planning/work/chat-agent-fast-path-and-provider-split/SPEC.md
---

## Description

Final regression gate for the epic: confirm that after routing changes, all four
safeguards (IterationCap, Timeout, TokenBudget, KillSwitch) remain constructed
and checked for the complex lane, and that the `AgentEvent` SSE payload shape is
unchanged so existing FE-facing tests stay green. Run the full `ai-service`
suite and fix any regressions surfaced by the new lanes.

## Acceptance Criteria

- [ ] The complex lane (`runChatFlow`) still constructs and checks all four
  safeguards per run (verified by existing/added tests).
- [ ] The `AgentEvent` payload shape (`iteration`, `status`, `tool`, `input`,
  `budget`) is unchanged; existing agent-event/SSE tests pass. [AC-08]
- [ ] `nx test ai-service` passes with the full suite green. [AC-09]

## Technical Notes

- References: `ai-platform/apps/ai-service/src/ai/ai.service.ts` (safeguard
  construction in `runChatFlow`/`executeAgentLoop`), `safeguards/*`,
  `ai-platform/libs/shared/src/lib/types/ai.types.ts` (`AgentEvent`,
  `AgentBudget`).
- This is a verification + stabilization task: do not change the `AgentEvent`
  contract; only fix regressions introduced by routing.
- Run `nx test ai-service` (per `ai-platform/CLAUDE.md`) as the final gate.
- Maps to AC-08, AC-09.

## QA Results

Status: PASS

Cycle: 1 of 3

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported no affected projects (changes uncommitted). Ran `npx nx test ai-service --skip-nx-cache` in `ai-platform/`. Exit code 0 — 25 test suites, 321 tests passed (2.6s).

Static AC verification:
- Four safeguards on complex lane: `IterationCapExceededError` (`ai.service.spec.ts:242-260`), `KillSwitchTrippedError` (`262-283`), `TimeoutExceededError` (`310-329`), `TokenBudgetExceededError` (`558-570` in TASK-009 regression gate).
- `AgentEvent` SSE contract: TASK-009 `describe('complex lane regression gate')` asserts allowed keys (`iteration`, `status`, `tool`, `input`, `budget`) and field types on every emitted event (`525-556`).
- Complex lane routing: `complex lane: still runs runChatFlow with safeguards and agent events` (`470-483`) confirms planning/final events on non-fast-path queries.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK — api-gateway=UP (4000), auth-service=UP (4002), ai-service=UP (4001)

All acceptance criteria verified:
- **AC-08 / task AC-1:** `runChatFlow` constructs all four safeguards per run (`ai.service.ts:280-285`); tests cover iteration cap (242-260), kill switch (262-283), timeout (310-329), and token budget (558-570).
- **AC-08 / task AC-2:** `AgentEvent` SSE contract stable — TASK-009 regression gate asserts allowed keys and field types on every emitted event (491-556); complex lane routing test confirms planning/final events (470-483).
- **AC-09 / task AC-3:** `nx test ai-service` — 25 suites, 321 tests passed (independently re-run at TeamLeadCheck).
