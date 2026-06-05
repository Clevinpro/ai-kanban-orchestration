---
id: TASK-007
title: Implement AgentRunnerService reason-act loop Observable
status: done
priority: high
repo: be
epic: agent-runtime
complexity: 8
created-at: 2026-06-03T12:00:00Z
updated-at: 2026-06-03T12:00:00Z
started-at: null
completed-at: null
spec: .planning/work/agent-runtime/SPEC.md
---

## Description

Implement the core agent loop: an injectable service whose `run(task, config)` returns a cold `Observable<IAgentEvent>` that drives a bounded reason→act loop. Each turn checks all four safeguards in order, emits typed events, calls Claude to plan, optionally invokes the search tool, and streams the final answer token-by-token. All errors are caught and emitted as a single terminal `AGENT_ERROR`; unsubscribe trips the kill-switch and aborts in-flight work. Reuse the existing provider/search services — do not re-implement streaming.

## Acceptance Criteria

- [ ] `ai-platform/apps/ai-service/src/agent/agent-runner.service.ts` defines `@Injectable() class AgentRunnerService` exposing `run(task: string, config: IAgentConfig): Observable<IAgentEvent>`
- [ ] First emission is `AGENT_START` carrying the resolved `IAgentConfig`; final successful emission is `AGENT_DONE`, then the Observable completes
- [ ] Each turn, in order: `killSwitch.checkpoint()` → `timeout.check()` → `iterationCap.increment()` → emit `STEP { iteration, status }` → Claude plans → `budget.track(tokens)` → emit `BUDGET` with current `IBudgetState`
- [ ] Tool branch: emit `TOOL_CALL` (`IToolCall`), call `SearchService.similaritySearch(...)`, emit `TOOL_RESULT` with the result
- [ ] Final branch: stream the answer via repeated `TOKEN` events, then break the loop
- [ ] Any thrown safeguard/provider error is caught and emitted as a single `AGENT_ERROR { reason: string }`, then the Observable completes — never calls `subscriber.error`
- [ ] Unsubscribing triggers the kill-switch / aborts the in-flight Claude stream via the Observable teardown function
- [ ] `nx test ai-service` compiles — 0 TS errors (dedicated loop tests land in TASK-008)

## Technical Notes

- Skeleton and event ordering are specified in SPEC.md → Technical Design → "Agent loop skeleton". Follow it.
- Obtain the provider via `AiProviderFactory` (`ai-platform/apps/ai-service/src/ai/providers/ai-provider.factory.ts`); reuse `ClaudeProvider.chat` (`claude.provider.ts:27`) which returns `Observable<string>`. Do not re-implement `anthropic.messages.stream`.
- Inject `SearchService` (`ai-platform/apps/ai-service/src/search/search.service.ts`) for `similaritySearch`.
- Import safeguards from `./safeguards/*` (TASK-002..006) and types from `@ai-platform/shared` (TASK-001).
- Token accounting may use provider-reported or estimated counts (Out of Scope: exact metering).
- Implement `planNextAction` / `streamFinal` as private helpers; convert provider Observables to async iteration (e.g. `firstValueFrom` / `for await` over a converted stream) as needed.
- Constraint: always deliver a terminal event then complete; teardown must stop the loop (no orphaned background work).
- AC reference: AC-10..AC-16.

---REVIEW-BLOCK-START---
## Code Review

Status: CHANGES_REQUESTED

**Issues:**
- ai-platform/apps/ai-service/src/agent/agent-runner.service.ts:10 — `lastValueFrom` is imported from `rxjs` but never used (only `reduce`, `Observable`, `Subscription` are referenced). Unused import will fail the `nx affected -t lint` no-unused-vars rule in the pre-commit hook. WARNING
- ai-platform/apps/ai-service/src/agent/agent-runner.service.ts:12 — `SimilaritySearchResult` is imported from `../search/search.service` but never referenced anywhere in the file. Same lint-gate concern. WARNING
- ai-platform/apps/ai-service/src/agent/agent-runner.service.ts:117-122 — On teardown that fires mid-`planNextAction`/`collect`, `activeSubscription.unsubscribe()` aborts the provider stream without emitting next/error/complete, so the `collect` Promise (lines 209-216) never settles and the async IIFE awaits forever. The kill-switch correctly prevents further loop work, so no orphaned background processing runs, but the pending promise is a latent leak; consider rejecting/cleaning up the collect promise on teardown. WARNING

The implementation is well-structured and satisfies the functional acceptance criteria: correct per-turn safeguard ordering (kill→timeout→iterationCap→STEP→plan→budget→BUDGET), terminal `AGENT_ERROR` via `subscriber.complete()` (never `subscriber.error`), cold Observable with teardown that trips the kill-switch and aborts the in-flight stream, and reuse of `AiProviderFactory`/`SearchService` without re-implementing streaming. The module wiring and `AiProviderFactory` export are correct. Primary concern is the two unused imports, which will likely break the lint stage of the commit hook before QA.
---REVIEW-BLOCK-END---

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Re-reviewed agent-runner.service.ts after the developer's fixes. All three prior WARNINGs are resolved: the unused `lastValueFrom` and `SimilaritySearchResult` imports are gone (the remaining import set — `finalize, Observable, reduce, Subscription` and `SearchService` — is fully used), and the hanging-`collect`-promise leak is fixed via a `finalize()` + `settled` guard that rejects the promise on teardown. All safeguard APIs and `@ai-platform/shared` types resolve correctly and per-turn ordering and terminal-event semantics are intact; no regressions. Minor non-blocking note: `toAsyncIterable` (used by `streamFinal`) lacks the same explicit promise-settling guard on external unsubscribe, but the kill-switch + subscription teardown prevent orphaned work, and dedicated teardown tests are scoped to TASK-008.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported no affected projects (exit 0, "No tasks were run") — the task's agent files under `apps/ai-service/src/agent/` are untracked and therefore absent from the HEAD~1..HEAD diff, so nx affected detected no change.

To verify AC-08 (`nx test ai-service` compiles with 0 TS errors), ran the target directly: `nx test ai-service` succeeded — Test Suites: 14 passed, 14 total; Tests: 140 passed, 140 total; 0 TS compile errors. Dedicated reason-act loop tests are scoped to TASK-008 per the task spec.

## TeamLead Check

Status: APPROVED

All acceptance criteria for this task (AC-10 through AC-16, plus the AC-08 compile gate) verified against `ai-platform/apps/ai-service/src/agent/agent-runner.service.ts`:
- AC-10: `@Injectable() class AgentRunnerService` exposes `run(task, config): Observable<IAgentEvent>` (lines 41-53).
- AC-11: First emission `AGENT_START` with resolved config (line 73); last successful emission `AGENT_DONE` then `subscriber.complete()` (lines 103-104).
- AC-12: Per-turn order kill.checkpoint → timeout.check → cap.increment → STEP → plan → budget.track → BUDGET with `IBudgetState` (lines 77-88).
- AC-13: Tool branch emits `TOOL_CALL`, calls `searchService.similaritySearch`, emits `TOOL_RESULT` (lines 90-94).
- AC-14: Final branch streams repeated `TOKEN` events then breaks the loop (lines 95-100).
- AC-15: Thrown errors caught and emitted as a single `AGENT_ERROR { reason }` then `subscriber.complete()`; never `subscriber.error` (lines 105-112).
- AC-16: Teardown trips kill-switch and aborts the in-flight provider subscription (lines 117-121).
- AC-08 gate: QA confirmed `nx test ai-service` compiles, 140/140 tests pass, 0 TS errors.

Module wiring confirmed: `AgentModule` provides/exports `AgentRunnerService` and imports `AiModule` + `SearchModule`. Prior code-review WARNINGs (unused imports, hanging collect-promise) are resolved. Code review APPROVED and QA PASS.
