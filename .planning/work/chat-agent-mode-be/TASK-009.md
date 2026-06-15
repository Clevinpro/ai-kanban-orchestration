---
id: TASK-009
title: Branch AiModule.streamAiResponse on mode; wire agent events to publish
status: done
priority: high
repo: be
epic: chat-agent-mode-be
complexity: 5
created-at: 2026-06-14T12:00:00.000Z
updated-at: 2026-06-14T22:40:27+03:00
started-at: 2026-06-14T22:34:13+03:00
completed-at: 2026-06-14T22:40:27+03:00
spec: .planning/work/chat-agent-mode-be/SPEC.md
---

## Description

Wire the agent path into the Kafka response pipeline. Extend `AiModule`'s `AiRequestPayload`
to carry the mode + limits, branch `streamAiResponse`/`processMessage` to pass `onAgentEvent`,
and publish agent events over the existing `AI_RESPONSE` topic as `event: 'agent'`. Final
answer still publishes as `chunk`, terminating with `complete` or `error`.

## Acceptance Criteria

- [ ] `AiModule`'s internal `AiRequestPayload` interface gains `mode?`, `maxIterations?`,
      `tokenBudget?`, `timeoutMs?` and forwards them into `processMessage`.
- [ ] `streamAiResponse` provides an `onAgentEvent` callback that publishes
      `{ event: 'agent', agent: <AgentEvent>, userId, conversationId }` via the existing
      `publishResponse` queue (ordering preserved).
- [ ] Final-answer tokens continue to publish as `event: 'chunk'`; the run ends with
      `event: 'complete'`; safeguard breaches publish `event: 'error'` with the typed reason.
- [ ] Non-agent requests (`mode` omitted or `'chat'`) take the existing path with NO agent
      events emitted (AC-07 byte-for-byte unchanged).
- [ ] `nx test ai-service` passes.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/ai/ai.module.ts`.
- `publishResponse` already serializes publishes via `publishQueue` — reuse it for agent events
  so step/budget ordering is deterministic relative to chunks.
- Map the loop's typed safeguard `reason` into the `error` payload's `error` string.
- Do not add a new topic here (AI_CANCEL consumer is TASK-010).
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed TASK-009's change to `ai-platform/apps/ai-service/src/ai/ai.module.ts` (the `AiRequestPayload` mode/limits extension and `onAgentEvent` wiring), verified against its dependencies: `processMessage`'s signature and agent flow in `ai.service.ts`, the `AgentEvent`/`AiResponsePayload` types, and `isSafeguardError` in `src/ai/safeguards/errors.ts`. All four behavioral acceptance criteria are satisfied: agent-control fields forward into `processMessage`; agent events publish via the serialized `publishQueue` preserving ordering; final tokens stay `chunk` while safeguard breaches map the typed `reason` into the `error` payload; and the chat path emits no agent events (the `if (!chunk) return` guard also correctly suppresses the `BehaviorSubject` empty seed). The relocated safeguards import resolves correctly despite the stale `D` git-status entries for the old `src/agent/safeguards/` path. Clean, well-commented, English-only.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected ran test for 6 projects (ai-service, api-gateway, database, auth-service, shared, kafka), all successful. ai-service: 19 suites / 265 tests passed. api-gateway: 8 passed. auth-service: 1 passed. shared/database/kafka: no tests (passWithNoTests). Exit code 0.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=DOWN (infra), auth-service=DOWN (infra), ai-service=UP. Build compiled cleanly for all services; ai-service (the app this task touches) booted UP. The two DOWN services are non-blocking infra WARNs (DB/Redis not provisioned locally), not code defects.

All acceptance criteria verified and passed:
- AC-1: `AiRequestPayload` carries `mode?`/`maxIterations?`/`tokenBudget?`/`timeoutMs?` (ai.module.ts L24-27) and forwards them via `{ ...value, conversationId }` into `processMessage` (L111).
- AC-2: `onAgentEvent` callback publishes `{ event: 'agent', agent, userId, conversationId }` (L100-107) through the serialized `publishQueue`, preserving ordering relative to chunks.
- AC-3: Final tokens publish as `event: 'chunk'` (L124), run ends with `event: 'complete'` (L132); safeguard breaches map `isSafeguardError(error).reason` into the `error` payload (L147-156).
- AC-4: Non-agent path emits no agent events — `runAgentFlow` runs only when `payload.mode === 'agent'` (ai.service.ts L100); the `if (!chunk) return` guard keeps AC-07 chat behavior unchanged.
- AC-5: `nx test ai-service` green per QA (19 suites / 265 tests, exit 0).
