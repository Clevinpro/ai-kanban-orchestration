---
id: TASK-011
title: Extend gateway ChatRequestDto + controller to forward mode+limits
status: done
priority: high
repo: be
epic: chat-agent-mode-be
complexity: 3
created-at: 2026-06-14T12:00:00.000Z
updated-at: 2026-06-14T22:52:07+03:00
started-at: 2026-06-14T22:47:12+03:00
completed-at: 2026-06-14T22:52:07+03:00
spec: .planning/work/chat-agent-mode-be/SPEC.md
---

## Description

Expose agent mode at the public API edge. Extend `ChatRequestDto` with optional `mode` and the
three limit fields, validate them, and have `AiController.chat` forward them into the
`AI_REQUEST` Kafka payload. Omitting them preserves today's behavior exactly.

## Acceptance Criteria

- [ ] `ChatRequestDto` (gateway) gains `mode?: 'chat' | 'agent'` (validated, e.g. `@IsIn`),
      and optional positive-integer `maxIterations?`, `tokenBudget?`, `timeoutMs?`
      (`@IsOptional` + `@IsInt`/`@IsPositive`).
- [ ] `AiController.chat` includes these fields in the `AI_REQUEST` value when present; when
      absent the published payload is unchanged from today (no `mode` key or `mode: 'chat'`).
- [ ] Invalid values (negative numbers, unknown mode) are rejected by validation with 400.
- [ ] `nx test api-gateway` passes; existing controller tests still green.
- [ ] `nx test shared api-gateway` passes.

## Technical Notes

- Files: `ai-platform/apps/api-gateway/src/ai/ai.dto.ts`,
  `ai-platform/apps/api-gateway/src/ai/ai.controller.ts`.
- Import the shared `AgentRunConfig`-style types from `@ai-platform/shared` (TASK-001) where
  helpful, but DTO validation decorators stay in the gateway DTO.
- Keep the `AI_REQUEST` publish shape additive; the ai-service consumer (TASK-009) reads these
  optionally.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the gateway `ChatRequestDto` extension, `AiController.chat` Kafka forwarding, and both spec files. The DTO correctly adds `mode` (`@IsIn(['chat','agent'])`) and optional positive-integer limits (`@IsOptional`/`@IsInt`/`@IsPositive`); the controller forwards each field only when defined, preserving the original payload shape when omitted. The `AgentRunConfig` import resolves via `@ai-platform/shared` -> `ai.types.ts` (the deleted `agent.types.ts` in git status is unrelated). The `publish(topic, { topic, value })` call matches the existing `IKafkaMessage` contract. Tests cover present/absent fields and invalid-value rejection. All acceptance criteria are met; code is clean, additive, and English-commented. No bugs or security concerns found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` ran tests for 6 projects (ai-service, api-gateway, database, auth-service, shared, kafka); all passed. Key results: api-gateway 18 passed / 3 suites, ai-service 269 passed / 20 suites, auth-service 1 passed; shared/database/kafka have no tests (passWithNoTests). Exit code 0.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway:4000=UP, auth-service:4002=DOWN (infra), ai-service:4001=DOWN (infra). Builds compiled cleanly; the two DOWN services are non-blocking (missing local DB/Kafka, not a code defect).

All acceptance criteria verified:
- AC-1 PASS — `ai.dto.ts` adds `mode?` via `@IsIn(['chat','agent'])` and `maxIterations`/`tokenBudget`/`timeoutMs` via `@IsOptional`+`@IsInt`+`@IsPositive`; `mode` typed as `AgentRunConfig['mode']` from `@ai-platform/shared`.
- AC-2 PASS — `ai.controller.ts` (lines 42-59) forwards each agent field only when `!== undefined`; payload shape unchanged when omitted (spec asserts no `mode` key).
- AC-3 PASS — validation decorators reject unknown mode / non-positive / non-integer values with 400 via the global ValidationPipe.
- AC-4 PASS — `nx test api-gateway` green (18 passed, 3 suites); existing controller tests still pass.
- AC-5 PASS — `nx test shared api-gateway` green per QA.
This slice also satisfies SPEC AC-01 (gateway forwards mode+limits into AI_REQUEST, additive shape).
