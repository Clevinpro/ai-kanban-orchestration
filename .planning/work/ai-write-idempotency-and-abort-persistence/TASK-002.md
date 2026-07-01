---
id: TASK-002
title: Mint stable runId at AI_REQUEST boundary and thread through to processMessage
status: done
priority: high
repo: be
epic: ai-write-idempotency-and-abort-persistence
complexity: 3
created-at: 2026-06-23T21:21:00+03:00
updated-at: 2026-06-23T22:01:18+03:00
started-at: 2026-06-23T21:56:24+03:00
completed-at: 2026-06-23T22:01:18+03:00
spec: .planning/work/ai-write-idempotency-and-abort-persistence/SPEC.md
---

## Description

Mint a single `runId` in the AI_REQUEST Kafka handler and thread it through
`streamAiResponse` into `processMessage`, so every lane and every persisted row
shares one id that is STABLE for a given Kafka message delivery. Today `runId` is
minted per-invocation deep inside `processMessage` and never surfaced, so a
redelivered AI_REQUEST gets a fresh id — defeating idempotency.

## Acceptance Criteria

- [ ] `AiRequestPayload` (`ai.module.ts`) has a `runId` field threaded from the
      handler (or `runId` is minted in the handler and passed as an explicit arg).
- [ ] The AI_REQUEST subscribe callback mints `runId` (e.g. `randomUUID()`) once
      and passes it to `streamAiResponse`.
- [ ] `streamAiResponse` passes `runId` into
      `processMessage({ ...value, conversationId }, { runId, onStatus, onAgentEvent })`.
- [ ] `ai.service.ts:174` (`options?.runId ?? randomUUID()`) now receives the
      threaded `runId` (the fallback only fires for back-compat callers).
- [ ] Service type-checks and `nx test ai-service` passes.

## Technical Notes

- Files: `ai-platform/apps/ai-service/src/ai/ai.module.ts`.
- AI_REQUEST handler: `onModuleInit` subscribe callback at `ai.module.ts:85-99`.
- `AiRequestPayload` interface at `ai.module.ts:24-34` (no `runId` today).
- `streamAiResponse(value, conversationId)` signature at `ai.module.ts:148` — add
  `runId`; it calls `processMessage({ ...value, conversationId }, { onStatus, onAgentEvent })`
  at `ai.module.ts:186-190`.
- `ProcessMessageOptions.runId?` ALREADY exists (`ai.service.ts:102`) and
  `ai.service.ts:174` already does `options?.runId ?? randomUUID()` — so this task
  is pure plumbing in `ai.module.ts`; do NOT change the lanes.
- The mint must be stable for the message delivery: mint in the handler, not inside
  the per-attempt path, so a redelivery of the same Kafka message reuses it. (Note:
  kafkajs redelivery is a fresh consumer poll — a true "same id across crash/redeliver"
  guarantee would require keying off message identity; for this task the requirement is
  that the id is minted ONCE at the boundary and threaded, not regenerated per lane.)
- Persistence-layer idempotency (the upsert) is TASK-003; the schema column is TASK-001.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the working-tree changes to `ai-platform/apps/ai-service/src/ai/ai.module.ts` plus the `.gitignore` addition. The runId is minted exactly once per AI_REQUEST delivery in the subscribe callback (ai.module.ts:101), after conversationId resolution, and threaded as an explicit arg through `streamAiResponse` (line 107, 156-160) into `processMessage({ ...value, conversationId }, { runId, onStatus, onAgentEvent })` (lines 199-202). This aligns with the existing `options?.runId ?? randomUUID()` fallback in ai.service.ts:174 and `ProcessMessageOptions.runId?` (ai.service.ts:102). All acceptance criteria are met, types are consistent, no lanes were touched, and the new runId is logged for traceability. Clean, minimal plumbing change with no bugs or security concerns.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit 0) because the TASK-002 change to `apps/ai-service/src/ai/ai.module.ts` is in the uncommitted working tree, not in the HEAD~1..HEAD range. Re-running scoped to the changed file (`--files=apps/ai-service/src/ai/ai.module.ts`) ran the affected `ai-service` project: 25 test suites passed (25 total), 337 tests passed (337 total), exit code 0. No failures.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; ai-service=UP, api-gateway=DOWN (infra), auth-service=DOWN (infra). All three services compiled cleanly; the relevant ai-service booted UP. The two DOWN services are non-blocking infra/timing WARNs (no code defect — builds passed).

All acceptance criteria verified against `ai.module.ts` and `ai.service.ts`:
- AC-1 (runId threaded from handler / explicit arg): runId minted in the handler and passed as an explicit arg to `streamAiResponse` (ai.module.ts:101,107) — PASS.
- AC-2 (subscribe callback mints runId once): `const runId = randomUUID()` at ai.module.ts:101, minted once per AI_REQUEST delivery after conversationId resolution — PASS.
- AC-3 (streamAiResponse passes runId into processMessage): `processMessage({ ...value, conversationId }, { runId, onStatus, onAgentEvent })` at ai.module.ts:199-202 — PASS.
- AC-4 (ai.service.ts:174 receives threaded runId, fallback for back-compat only): `options?.runId ?? randomUUID()` at ai.service.ts:174 now receives the threaded runId; lanes untouched — PASS.
- AC-5 (type-checks & nx test ai-service): smoke build BUILD_OK; QA confirmed 25 suites / 337 tests passing — PASS.
