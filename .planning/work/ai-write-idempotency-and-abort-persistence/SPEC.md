# SPEC: AI Write Idempotency & Abort Persistence

**Epic:** `ai-write-idempotency-and-abort-persistence`
**Created:** 2026-06-23
**Status:** Ready for Planning
**Repo:** `be`

---

## Problem

The ai-service persists conversation turns through a non-idempotent path, and only
on stream `complete`. Two concrete defects (confirmed in
`.planning/work/research-redis-streaming-chunk-buffering-persistence/RESEARCH.md`):

1. **Duplicate rows on Kafka redelivery (live bug).** `runId` is minted per
   invocation (`ai.service.ts:174` `options?.runId ?? randomUUID()`) and never
   surfaced from the AI_REQUEST handler, so it is *not stable* across redeliveries.
   `Message` has no `runId` column and no unique key, and
   `ConversationService.saveMessage` (`conversation.service.ts:51-63`) is a bare
   `prisma.message.create` that explicitly **discards** the `runId` it receives.
   The Kafka consumer auto-commits after the whole inline run; a crash/rebalance
   mid-run re-delivers AI_REQUEST, re-runs generation, and **double-inserts** both
   the user and assistant turns.
2. **Whole-turn loss on abort (all-or-nothing).** Assistant content lives only in
   in-memory accumulators and is written once on `complete`. A DB throw, safeguard
   abort (timeout / token-budget / kill-switch), or crash-just-before-complete
   discards the fully-generated answer with no fallback.

## Goal

Make conversation persistence idempotent under Kafka at-least-once redelivery, and
salvage generated assistant content on abort — so a redelivered run can never
duplicate a turn and a failed/aborted run no longer silently loses what was already
produced. No new infrastructure (no Redis).

## User Stories / Requirements

### US-01: No duplicate turns on redelivery
> As a chat user, I want a re-processed AI request to never create a second copy of
> my message or the assistant's reply, so my conversation history stays clean even
> when Kafka redelivers or the service restarts mid-run.

### US-02: Don't lose generated content on abort
> As a chat user, I want the assistant text that was already generated to be saved
> even if the run is aborted by a timeout, token-budget, kill-switch, or a DB error,
> so a near-complete answer isn't thrown away.

### US-03: Stable run correlation
> As a developer, I want one `runId` minted at the AI_REQUEST boundary and threaded
> through every lane and every persisted row, so redeliveries reuse the same id and
> writes are idempotent.

## Acceptance Criteria

- [ ] AC-01: `runId` is minted in the AI_REQUEST handler (`ai.module.ts` `onModuleInit`
      subscribe callback), added to `AiRequestPayload`, and passed through
      `streamAiResponse` → `processMessage({ ..., runId }, ...)` so `ai.service.ts:174`
      reuses it instead of minting a fresh one.
- [ ] AC-02: A redelivered AI_REQUEST (same Kafka message) reuses the same `runId`
      across deliveries (verified by a unit/integration test simulating redelivery).
- [ ] AC-03: `Message` has a `runId` column (`@map("run_id")`) and a
      `@@unique([runId, role])` constraint; a new Prisma migration exists under
      `libs/database/prisma/migrations/` whose generated SQL does **not** drop the
      existing trgm/hnsw chunk indexes.
- [ ] AC-04: `ConversationService.saveMessage` is an idempotent upsert keyed on
      `(runId, role)`; calling it twice with the same `(runId, role)` results in
      exactly one row (verified by test).
- [ ] AC-05: When `runId` is absent (back-compat callers), `saveMessage` still writes
      exactly one row and does not throw (falls back to a non-unique create path or a
      minted id — see Technical Design).
- [ ] AC-06: On a safeguard abort (timeout / token-budget / kill-switch) or a stream
      `error` after partial generation, the already-accumulated assistant text is
      best-effort persisted via the idempotent path; a later success for the same
      `runId` is a no-op/update, never a duplicate (verified by test).
- [ ] AC-07: Existing chat/agent flows still persist exactly one user turn and one
      assistant turn per successful run (no regression).
- [ ] AC-08: tests pass (`nx test ai-service`) and the service type-checks
      (`npx tsc --noEmit -p apps/ai-service/tsconfig.app.json`).

## Technical Design

### Files touched

```
ai-platform/apps/ai-service/src/ai/ai.module.ts
ai-platform/apps/ai-service/src/ai/ai.service.ts
ai-platform/apps/ai-service/src/conversation/conversation.service.ts
ai-platform/libs/database/prisma/schema.prisma
ai-platform/libs/database/prisma/migrations/<new>/migration.sql
```

### P1 — Idempotent write + stable runId

- **Boundary mint (`ai.module.ts`):** in the AI_REQUEST subscribe callback
  (`:85-99`) mint `const runId = randomUUID()` (stable for this message delivery);
  add `runId` to `AiRequestPayload` (`:24-34`); pass into
  `streamAiResponse(value, conversationId, runId)` and from there into
  `processMessage({ ...value, conversationId }, { runId, onStatus, onAgentEvent })`
  (`ai.module.ts:186-190`). `ProcessMessageOptions.runId?` already exists
  (`ai.service.ts:102`); `ai.service.ts:174` already does `options?.runId ?? randomUUID()`,
  so threading the option makes it stable with no change to the lanes.
- **Schema (`schema.prisma:80-91`):** add `runId String? @map("run_id")` to `Message`
  + `@@unique([runId, role])`. (`runId` nullable to keep AC-05 back-compat; the unique
  index treats multiple NULLs as distinct in Postgres, so legacy null-runId rows don't
  collide.) New migration via `prisma migrate dev`. **⚠ Prisma-drift trap** (project
  memory): inspect generated SQL — `migrate dev` can silently `DROP` the raw trgm/hnsw
  chunk indexes; re-add them in the migration if dropped (AC-03).
- **Upsert (`conversation.service.ts:51-63`):** convert the bare `create` to
  `upsert({ where: { runId_role: { runId, role } }, create: {...}, update: {} })` when
  `runId` is present; fall back to plain `create` when `runId` is undefined (AC-05).
  Widen `ConversationPrismaClient` (`:7-25`) to declare `message.upsert`.
  `persistAssistantMessage` (`ai.service.ts:965`) and `ensurePersistedUserTurn`
  (`:408`) already forward `runId` — no change there.

### P2 — Persist on abort

- In `streamAiResponse`'s `error` handler (`ai.module.ts:220-237`) the `result`
  accumulator (`:197`) already holds streamed text. Before/with the `error` publish,
  best-effort `saveMessage({ conversationId, role: 'assistant', content: result, runId })`
  when `result` is non-empty. Idempotent via P1 → if `complete` later wrote the same
  `runId`, this is a no-op/update.
- In the agent loop / lane safeguard-abort paths (`ai.service.ts` where typed
  safeguard errors throw before the `final` branch), persist the accumulated answer
  via `persistAssistantMessage(conversationId, runId, <partial>)` before rethrowing.
- All P2 writes wrapped so a persistence failure does not mask the original error.

### Kafka redelivery semantics (why this works)

The consumer (`libs/kafka/src/lib/kafka-consumer.service.ts`) auto-commits offsets and
awaits the whole inline run. A crash/rebalance before commit re-delivers the same
AI_REQUEST. With a stable `runId` (P1) the re-run regenerates content but the
`(runId, role)` upsert makes every write a no-op/update → transcript cannot double.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Redis Stream chunk buffer + restart-flush (P3) | Premature until idempotency exists; needs ioredis dep + docker-compose service + recovery sweeper; gated on a product decision about near-zero in-flight loss. Separate `be` epic. |
| Client resume / last-event-id replay (D) | Needs gateway SSE + FE changes; Kafka fan-out already covers live delivery. Separate FE-inclusive epic. |
| Transactional outbox / WAL (E) | Heavier than current scale needs; only if publish/persist atomicity becomes a hard requirement. |
| Moving generation off the inline `eachMessage` path | Rebalance-crash hazard is mitigated by idempotency here; consumer redesign is its own epic. |

## Open Questions

- [ ] AC-05 back-compat: are there any live callers of `saveMessage` without a
      `runId`, or can `runId` be made required end-to-end? (If none remain after P1,
      drop the nullable fallback and make `runId` non-null.)
- [ ] Structured lane writes a single observation via `persistAssistantMessage`
      (`ai.service.ts:245`) — confirm it shares the run's `runId` so `@@unique([runId, role])`
      is the correct granularity for every lane.
- [ ] Backfill: existing `messages` rows have null `runId`. Acceptable to leave them
      null (no backfill), or is a one-time migration wanted?

## Constraints

- Single repo (`be`) — no cross-service work in one task.
- Prisma migration must preserve the raw trgm/hnsw chunk indexes (project memory:
  Prisma drift drops raw indexes).
- No new runtime infrastructure (no Redis, no new docker-compose service).
- P2 persistence failures must never mask the originating error.
