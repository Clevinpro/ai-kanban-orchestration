---
id: TASK-010
title: Add AI_CANCEL consumer tripping active run's KillSwitch
status: done
priority: high
repo: be
epic: chat-agent-mode-be
complexity: 5
created-at: 2026-06-14T12:00:00.000Z
updated-at: 2026-06-14T22:46:58+03:00
started-at: 2026-06-14T22:40:50+03:00
completed-at: 2026-06-14T22:46:58+03:00
spec: .planning/work/chat-agent-mode-be/SPEC.md
---

## Description

Implement cancel-in-flight. Maintain a registry of active agent runs keyed by
`conversationId`, subscribe `AiModule` to the `AI_CANCEL` Kafka topic, and on a cancel message
trip that run's `KillSwitch` so the loop aborts promptly with an `error` event.

## Acceptance Criteria

- [ ] `AiModule.onModuleInit` subscribes to `KAFKA_TOPICS.AI_CANCEL` (added in TASK-001).
- [ ] A registry (`Map<conversationId, KillSwitch>`) tracks the active `KillSwitch` per agent
      run; the entry is created when an agent run starts and removed on complete/error.
- [ ] An `AI_CANCEL` message keyed by `conversationId` looks up the run and calls
      `killSwitch.kill()`; the loop's next `checkpoint()` throws `KillSwitchTrippedError`.
- [ ] The cancelled run terminates with `event: 'error'` carrying the kill-switch reason; an
      unknown/already-finished `conversationId` is a safe no-op (logged, no throw).
- [ ] Chat-mode runs register no kill switch and are unaffected.
- [ ] `nx test ai-service` passes.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/ai/ai.module.ts` (coordinate the registry seam with
  `AiService.runAgentFlow` from TASK-008 — whichever owns `KillSwitch` creation must expose it
  to the module for registration).
- `AI_CANCEL` payload shape: `{ conversationId: string; userId?: string }`. Define/keep it
  consistent with the gateway producer (gateway cancel endpoint is out of scope for this epic;
  publishing the topic is enough to satisfy AC-06).
- Guard against leaks: always delete the registry entry in the run's terminal handlers.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `ai.module.ts` (AI_CANCEL consumer wiring) and the new `ai.module.spec.ts`, cross-checked against `AiService` (registry seam), `KillSwitch`, the `AI_CANCEL` topic constant, and `KafkaConsumerService`. The implementation satisfies all acceptance criteria: it subscribes to `KAFKA_TOPICS.AI_CANCEL` on init, looks up the active run's kill switch via `aiService.getKillSwitch(conversationId)` and trips it, and treats missing/unknown/already-finished conversationIds as safe logged no-ops that never throw (so the Kafka handler is not evicted). The registry lifecycle in `AiService` is robust — switches are stacked per `conversationId` and removed by `runId` in a `finally` block, preventing leaks and concurrent-run clobbering, and chat-mode runs register no switch. `KafkaConsumerService.subscribe` correctly supports the second topic subscription by merging the topic set. Tests cover subscription, trip, unknown-id no-op, and missing-id no-op. Quality is high. Minor non-blocking nit: a cancel arriving after a run finishes is logged at `warn`, which may be noisier than warranted for a normal race (`log`/`debug` would suffice).
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected test (--base=HEAD~1 --head=HEAD) ran 6 projects, all passed (exit 0):
- ai-service: 20 test suites, 269 tests passed
- api-gateway: 1 suite, 8 tests passed
- auth-service: 1 suite, 1 test passed
- shared, database, kafka: no tests (passWithNoTests)

Logged ERROR/WARN lines in api-gateway output are expected assertions from negative-path tests (timeout, ECONNREFUSED, 500), not failures.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK — ai-service=UP; api-gateway=DOWN, auth-service=DOWN (non-blocking; webpack compiled successfully for all, services served from Nx cache without an open port / missing local infra, not a code defect).

All acceptance criteria verified:
- AC-01 (onModuleInit subscribes to AI_CANCEL): `ai.module.ts` calls `kafkaConsumer.subscribe(KAFKA_TOPICS.AI_CANCEL, ...)` in `onModuleInit`; constant present in `kafka.constants.ts` (`AI_CANCEL = 'ai.cancel'`).
- AC-02 (registry Map<conversationId, KillSwitch>): `AiService.killSwitches = Map<string, KillSwitchEntry[]>`; `registerKillSwitch` creates entry on agent run start, `releaseKillSwitch` removes by `runId` in the run's `finally`.
- AC-03 (cancel trips kill switch → checkpoint throws): `handleCancel` resolves via `aiService.getKillSwitch(conversationId)` and calls `killSwitch.kill()`; spec asserts `checkpoint()` then throws `KillSwitchTrippedError`.
- AC-04 (terminate with error event; unknown/finished id safe no-op): module surfaces typed safeguard reason as `event: 'error'`; missing/unknown/empty conversationId logged and returned with no throw (covered by two no-op tests).
- AC-05 (chat-mode runs register no kill switch): `runAgentFlow` only reached when `mode === 'agent'`; registration guarded by `payload.conversationId`, chat path uses `runRagFlow`, no registry entry.
- AC-06 (nx test ai-service passes): QA reports ai-service 20 suites / 269 tests passed; smoke build confirms compilation.

Maps to SPEC AC-06 (AI_CANCEL keyed by conversationId trips the run's KillSwitch).
