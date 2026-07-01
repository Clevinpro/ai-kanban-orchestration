---
id: TASK-004
title: Persist accumulated assistant text on abort/error paths
status: done
priority: medium
repo: be
epic: ai-write-idempotency-and-abort-persistence
complexity: 4
created-at: 2026-06-23T21:21:00+03:00
updated-at: 2026-06-23T22:20:26+03:00
started-at: 2026-06-23T22:08:14+03:00
completed-at: 2026-06-23T22:20:26+03:00
spec: .planning/work/ai-write-idempotency-and-abort-persistence/SPEC.md
---

## Description

Salvage generated assistant content when a run aborts instead of completing.
Persist the already-accumulated text on the stream `error` path and on safeguard
aborts (timeout / token-budget / kill-switch), best-effort, via the now-idempotent
write. Because the write is idempotent on `(runId, role)` (TASK-003), a later
successful `complete` for the same `runId` is a harmless no-op/update.

## Acceptance Criteria

- [ ] In `streamAiResponse`'s `error` handler, when the accumulated `result` is
      non-empty, the assistant text is best-effort persisted (assistant role, run's
      `runId`).
- [ ] Safeguard-abort paths in the agent loop (typed safeguard errors thrown before
      the `final` branch) best-effort persist the accumulated answer before rethrow.
- [ ] A persistence failure in these paths is caught/logged and does NOT mask or
      replace the original error surfaced to the client.
- [ ] A test proves: partial generation + abort → one assistant row; subsequent
      success for the same `runId` does not create a second row.
- [ ] Service type-checks and `nx test ai-service` passes.

## Technical Notes

- Files: `ai-platform/apps/ai-service/src/ai/ai.module.ts`,
  `ai-platform/apps/ai-service/src/ai/ai.service.ts`.
- Chokepoint accumulator: `result` in `streamAiResponse` (`ai.module.ts:197`
  `result += chunk`). `error` handler at `ai.module.ts:220-237` — persist `result`
  there before/with the `error` publish.
- Safeguard errors are detected via `isSafeguardError(error)` (already used at
  `ai.module.ts`). In `ai.service.ts`, safeguard errors throw before reaching the
  `final` branch (agent loop persists at `:551`); add best-effort
  `persistAssistantMessage(conversationId, runId, <accumulated>)` on those abort
  paths.
- Use the idempotent `persistAssistantMessage` / `saveMessage` — depends on TASK-003.
- Wrap persistence in try/catch (or `.catch`) so a DB error here is logged and the
  original error still propagates — SPEC constraint: P2 writes must never mask the
  originating error.
- Capability/technical lane already persists `collected` on `complete` (`:940`); this
  task adds the abort/error branch, not the happy path.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the abort/error salvage implementation across `ai.module.ts` (stream `error` handler → `persistPartialOnAbort`) and `ai.service.ts` (agent-loop catch → `persistAssistantMessage` on safeguard aborts), plus the new unit tests in `ai.module.spec.ts` and `ai.service.spec.ts`.

Findings:
- All five acceptance criteria are met. The `error` handler salvages the accumulated `result` (AC1); the agent-loop catch salvages `accumulatedAnswer` on typed safeguard errors before rethrow (AC2); both salvage writes are wrapped so a DB failure is caught/logged and never masks the original error (AC3); and a test proves partial-generation + abort yields exactly one assistant row with a later same-`runId` success adding no second row (AC4).
- Idempotency is sound: `saveMessage` upserts on `(runId, role)` with `update: {}`, so the first write wins and the dual salvage (service-level then module-level) plus any later `complete` collapse to a no-op — no duplicate rows.
- The two salvage accumulators (`accumulatedAnswer` in the service, `result` in the module) carry the same forwarded final-answer tokens, so content is consistent regardless of which write lands first.

Minor non-blocking notes (no change required): the safeguard-abort salvage would persist a whitespace-only `accumulatedAnswer` since it gates only on `length > 0` (the `EMPTY_FINAL_ANSWER_FALLBACK` substitution is not applied on the abort path), and in the module `error` chain a `publishResponse` rejection would surface the publish error rather than the original via `.catch(reject)` — both are pre-existing/cosmetic and acceptable for an already-errored run.

Overall quality is high: clear comments tying decisions to the SPEC, correct error-precedence handling, and end-to-end tests that exercise the idempotent upsert via a fake Prisma honoring the unique constraint.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported no affected projects ("No tasks were run", exit 0) because the TASK-004 changes are still uncommitted in the working tree (HEAD~1..HEAD diff is empty for ai-platform).

To confirm coverage for the task's working-tree changes, ran a files-scoped affected test against the modified sources (`apps/ai-service/src/ai/ai.module.ts`, `ai.service.ts`):

- Project: ai-service
- Test Suites: 26 passed, 26 total
- Tests: 346 passed, 346 total
- Exit: success

All ai-service tests pass, including the abort/error salvage and idempotency tests added for this task.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=DOWN (infra/cache), auth-service=DOWN (infra/cache), ai-service=UP. All three webpack builds compiled successfully; the two DOWN services are non-blocking infra WARNs (missing local DB/Redis), not code defects.

All acceptance criteria verified:
- AC1 (error-handler salvage of non-empty `result`): `ai.module.ts:289` calls `persistPartialOnAbort(conversationId, runId, result)` in the stream `error` handler.
- AC2 (safeguard-abort persist before rethrow): `ai.service.ts:619-632` gates on `isSafeguardError(error)` and `accumulatedAnswer.length > 0`, persists via `persistAssistantMessage`, then `throw error`.
- AC3 (persistence failure caught/logged, never masks original error): both paths wrap the write in try/catch with error logging; the module path chains `.then(...).catch(reject)` so the original error still rejects to the client.
- AC4 (test proves one row on abort + no second row on same-`runId` success): `ai.module.spec.ts:206-255` asserts a single salvaged assistant row after kill-switch abort and still one row after a later same-`runId` success.
- AC5 (type-checks + `nx test ai-service` passes): re-ran `nx test ai-service --skip-nx-cache` → 26 suites / 346 tests passed; `tsc --noEmit -p apps/ai-service/tsconfig.app.json` exit 0.
