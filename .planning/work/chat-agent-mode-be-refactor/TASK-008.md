---
id: TASK-008
title: Add POST /ai/chat/cancel endpoint publishing AI_CANCEL
status: done
priority: high
repo: be
epic: chat-agent-mode-be-refactor
complexity: 3
created-at: 2026-06-15T12:00:00.000Z
updated-at: 2026-06-15T16:44:53+03:00
started-at: 2026-06-15T16:39:30+03:00
completed-at: 2026-06-15T16:44:53+03:00
spec: .planning/work/chat-agent-mode-be-refactor/SPEC.md
---

## Description

Expose an in-flight cancel at the gateway so the FE stop control works. A new JWT-guarded
`POST /ai/chat/cancel` keyed by `conversationId` publishes to the `AI_CANCEL` Kafka topic; the
existing ai-service `AI_CANCEL` consumer trips the active run's `KillSwitch`, ending it with an
`error` event.

## Acceptance Criteria

- [ ] `AiController` (`ai-platform/apps/api-gateway/src/ai/ai.controller.ts`) gains a
      JWT-guarded `POST /ai/chat/cancel` accepting `{ conversationId: string }` (validated DTO).
- [ ] The handler publishes to `KAFKA_TOPICS.AI_CANCEL` with `{ conversationId, userId }`
      (userId from the authed request), keyed by `conversationId`.
- [ ] Returns a simple ack (e.g. `{ status: 'cancelling' }`); missing/invalid `conversationId`
      → 400.
- [ ] The existing ai-service `AI_CANCEL` consumer trips the matching run's `KillSwitch`
      (already implemented in `chat-agent-mode-be` TASK-010) — verify the topic/payload shape
      matches.
- [ ] `nx test api-gateway` passes.

## Technical Notes

- Files: `ai-platform/apps/api-gateway/src/ai/ai.controller.ts`, a small cancel DTO in
  `ai-platform/apps/api-gateway/src/ai/ai.dto.ts`.
- `KAFKA_TOPICS.AI_CANCEL` already exists (`chat-agent-mode-be` TASK-001). Match the consumer's
  expected payload (`{ conversationId, userId? }`) from `AiService.getKillSwitch` wiring.
- Reuse `kafkaProducer.publish(KAFKA_TOPICS.AI_CANCEL, { topic, value })` like the existing
  `chat` handler; reuse `getUserId(req)`.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the new JWT-guarded `POST /ai/chat/cancel` endpoint (`ai.controller.ts`), the `CancelChatRequestDto` (`ai.dto.ts`), and both spec files. The handler correctly publishes to `KAFKA_TOPICS.AI_CANCEL` keyed by `conversationId` with `{ conversationId, userId }`, returns `{ status: 'cancelling' }`, and validation rejects missing/blank `conversationId` with a 400. The producer payload shape exactly matches the ai-service `AiCancelPayload` consumer that trips the run's KillSwitch, and the `key` field is supported by `KafkaProducerService.publish`. Tests cover the keyed-publish path and the `sub` userId fallback. All acceptance criteria are met; code style is consistent with the existing `chat` handler.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

Ran `nx affected --target=test` for the changed ai-platform files. 5 projects affected, all passed:
- api-gateway: 3 suites, 22 tests passed (covers the new POST /ai/chat/cancel handler and DTO)
- ai-service: 23 suites, 287 tests passed
- auth-service: 1 suite, 1 test passed
- shared, kafka: no tests (passWithNoTests)

Total: 310 tests passed, 0 failed. Exit code 0.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway:4000=UP, auth-service:4002=DOWN (infra), ai-service:4001=DOWN (infra). Builds compiled cleanly; the DOWN services are missing local infra (DB/Redis/Kafka), not code defects — non-blocking.

All acceptance criteria verified:
- AC-1: `AiController.cancel` adds a JWT-guarded `POST /ai/chat/cancel` accepting validated `CancelChatRequestDto { conversationId }` (ai.controller.ts:78-105).
- AC-2: Handler publishes to `KAFKA_TOPICS.AI_CANCEL` with `{ conversationId, userId }` (userId from authed req via `getUserId`), keyed by `conversationId` (ai.controller.ts:95-102).
- AC-3: Returns `{ status: 'cancelling' }`; `@IsString @IsNotEmpty` on `conversationId` rejects missing/blank input with 400 via the global validation pipe (ai.dto.ts:38-45).
- AC-4: Payload shape `{ conversationId, userId }` keyed by `conversationId` matches the ai-service `AI_CANCEL` consumer wiring (`getKillSwitch`/`registerKillSwitch` keyed by `conversationId`, ai.service.ts:144-179), tripping the active run's KillSwitch.
- AC-5: `nx test api-gateway` passes — 3 suites / 22 tests, covering the keyed-publish path and the `sub` userId fallback (QA: 310 total tests, 0 failed).
