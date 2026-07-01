---
id: RESEARCH
title: Redis chunk buffering & streaming persistence — re-investigation
status: done
priority: medium
repo: inv
epic: research-redis-streaming-chunk-buffering-persistence
complexity: 0
created-at: 2026-06-23T16:15:58Z
updated-at: 2026-06-23T19:31:09+03:00
started-at: 2026-06-23T19:21:36+03:00
completed-at: 2026-06-23T19:31:09+03:00
---

# RESEARCH: Redis chunk buffering & streaming persistence (re-investigation)

**Epic:** `research-redis-streaming-chunk-buffering-persistence`
**Type:** Investigation — architecture / refactor strategy
**Created:** 2026-06-23
**Agents:** research-investigator (sole web-search) + read-only be-developer per repo

> **Prior art:** A first investigation of this topic completed 2026-06-16 at
> `.planning/work/research-redis-streaming-chunks-persistence/RESEARCH.md`
> (recommended B → C, defer D). This is a fresh re-run requested by the user:
> re-scan the CURRENT ai-service code, confirm whether that recommendation still
> holds, and re-answer the two framing questions below from scratch.

---

## Topic / Question

Two streaming-durability steps to describe and judge "do we need this?":

1. **Redis — buffering of streaming chunks.** As the AI service streams LLM
   chunks to the client, should each chunk be buffered into Redis (Stream / List /
   pub-sub / plain key) rather than held only in process memory? Describe what
   this step does and whether we actually need it.

2. **Streaming persistence — chunks → Redis → DB (zero data loss).** Persist the
   buffered chunks through Redis to the database so that a crash, client
   disconnect, or failed DB write mid-stream loses no generated content and the
   conversation can be reconstructed/resumed. Describe this step and whether we
   need it.

Questions to answer:
- Is Redis the right buffer, and which structure (Stream, List, pub/sub, key)?
- Write path: chunk → Redis → DB. Flush when/how (per-chunk, batched, on-complete)?
- Failure & recovery: crash mid-stream, DB outage, client disconnect — how is
  "zero data loss" actually achieved and verified, and how literal is it?
- How does this fit the CURRENT ai-service streaming + persistence code (has it
  changed since the 2026-06-16 scan)?
- Trade-offs vs simpler alternatives (in-memory buffer + final write, idempotent
  write, transactional outbox / WAL).
- Does the prior B → C → defer-D recommendation still stand?

## Scope

- In scope: backend streaming/persistence path in `ai-platform/` (ai-service),
  Redis buffering design, flush/recovery semantics, durability trade-offs,
  idempotency of the write path.
- Out of scope: frontend SSE consumption changes, infra provisioning of Redis,
  non-streaming request paths, client-resume UX (Option D — separate FE epic).

---

## Research Log
<!-- each stage is appended here as it happens -->
- [investigator] code scan done — backend-only topic (FE out of scope per header). Re-scanned CURRENT ai-service. **Key delta vs 2026-06-16:** `runId` plumbing now EXISTS — minted once at the AI_REQUEST boundary and threaded into all lanes (`ai.service.ts:174,200,…`); comments cite "TASK-003 … upserts on runId, idempotent under Kafka redelivery" (`:962-963`); the no-`conversationId` user-turn gap is closed via `ensurePersistedUserTurn` (`ai.service.ts:410-433`). **BUT the idempotency is NOT actually implemented at the persistence layer:** `ConversationService.saveMessage` (`conversation.service.ts:51-63`) is still a bare `prisma.message.create` that does NOT accept `runId`; the `Message` model (`schema.prisma:80-91`) has NO `runId` column and NO unique constraint (only non-unique `@@index([conversationId, createdAt])`). No `TASK-003`/idempotency epic exists in `.planning/work`. So Option B is half-wired (id threaded) but the upsert/unique-key half is missing — comments over-claim. Still NO Redis anywhere (no ioredis dep, no source refs, docker-compose = postgres+kafka only). Streaming/persistence shape otherwise unchanged: chunks held only in in-memory `collected`/`accumulated`/`result`; single write on `complete` via `persistAssistantMessage`; the Kafka bridge `streamAiResponse` (`ai.module.ts:186-243`) remains the single all-lane chunk chokepoint.

## Investigator — Plan
<!-- research-investigator: repos to consult + specific questions -->

**Repos to consult:** `be` only. The topic is entirely the ai-service streaming/persistence path; FE (client resume) is out of scope per the RESEARCH header. No `fe` tab.

**Specific questions for be-developer (RESEARCH MODE, read-only):**
1. **Idempotency reality-check.** `ai.service.ts` threads `runId` into `saveMessage` and the comments (`:962-963`, `:399-400`) claim a "TASK-003" idempotent upsert on `runId` under Kafka redelivery. But `ConversationService.saveMessage` (`conversation.service.ts:51-63`) is a bare `create` that does not even take `runId`, and `schema.prisma` Message has no `runId` column / no unique constraint. Confirm: is the idempotent write actually implemented anywhere, or do those comments over-claim and the code still double-inserts on redelivery? Does it even type-check (is `saveMessage` being called with an extra `runId` arg the signature rejects)?
2. **Current durability of the assistant message.** Confirm persistence still happens once on `complete` per lane (agent loop `ai.service.ts:551`, capability/technical `:940`, structured `:245`), with content held only in in-memory `collected`/`accumulated`/`result`. Does any failure mode (crash mid-stream, DB-write throw after full stream, kill-switch/timeout, Kafka publish fail at `ai.module.ts:240-243`) now persist partial content, or is it still all-or-nothing biased toward nothing?
3. **Kafka redelivery axis.** Reconfirm consumer commit semantics in `libs/kafka/src/lib/kafka-consumer.service.ts` (auto-commit on? manual? `eachMessage` await/throw behavior) and whether a crash after delivery / before commit redelivers AI_REQUEST and re-runs the whole generation — i.e. is the duplicate-row risk from Q1 live today.
4. **Hook points unchanged?** Confirm the Kafka bridge `streamAiResponse` (`ai.module.ts:186-243`) is still the single chokepoint that sees every chunk of every lane (the `result += chunk` at `:197`, lifecycle `next`/`complete`/`error`), so a Redis buffer + restart-flush would hook there with no `ai.service.ts` edits; and that `runId` is now reliably available at that boundary for the per-run Redis key.

**Stages:** code scan (done) → open `be` tab, poll for sentinel (cap ~10 min) → read BE Findings → one WebSearch round → Synthesis (options table + recommendation + refactor strategy, noting what changed since 2026-06-16) → Summary.

- [investigator] be findings collected — confirmed idempotency is implemented NOWHERE (no column/upsert/stable runId; comments over-claim "TASK-003"), AND the ai-service does NOT type-check today (P0 build blocker: `runId` rejected by `saveMessage`, missing `AiChatOptions` export, single-arg `IAIProvider.chat`). `runId` is per-invocation `randomUUID()` deep in `processMessage`, NOT minted at the AI_REQUEST boundary and NOT surfaced to the Kafka bridge — so my "runId available at the chokepoint" premise was wrong. Kafka duplicate-row risk is live. Re-sequenced plan: P0 build fix → P1 real idempotency (incl. stable runId) → P2 persist-on-abort → P3 Redis Stream buffer → defer D. Proceeding to web pass.

## BE Findings
<!-- be-developer (RESEARCH MODE, read-only) — only if backend is consulted -->

**TL;DR:** The "TASK-003 idempotent upsert on `runId`" the comments describe **does
not exist** — not in the persistence layer, not in the schema, and the `runId` the
comments call "minted once at the AI_REQUEST boundary" is actually a per-process
`randomUUID()` minted inside `processMessage`. Worse, **the ai-service does not
type-check / build today**: the `runId` args passed to `saveMessage` are rejected by
its signature (`TS2353`), and a second, unrelated `AiChatOptions` regression breaks
the providers too. So Option B is *worse than half-wired* — it is wired to a method
that doesn't accept the field, the field has no column, and the build is red.

### Q1 — Idempotency reality-check: over-claimed, and it does not compile

- `ConversationService.saveMessage` (`apps/ai-service/src/conversation/conversation.service.ts:51-63`)
  is a **bare `prisma.message.create`**. Its param type is exactly
  `{ conversationId: string; role: MessageRole; content: string }` — **no `runId`**,
  no upsert, no `where`/unique key. The injected client type
  (`ConversationPrismaClient`, lines 7-25) only declares `message.create` (not
  `upsert`/`findFirst`), so even an upsert couldn't be written without widening it.
- `Message` model (`libs/database/prisma/schema.prisma:80-91`) has **no `runId`
  column** and **no `@unique`** — only the non-unique `@@index([conversationId, createdAt])`.
  There is no migration adding one (no `runId` anywhere under `libs/database/prisma/migrations`).
- `ai.service.ts` nonetheless passes `runId` into `saveMessage` at **lines 233, 433,
  906** and via `persistAssistantMessage` at **965-976** (which also forwards `runId`).
  The doc comments at `:399-401` and `:959-963` assert an "idempotent upsert on
  `runId` (TASK-003)" that simply isn't there. **No `TASK-003` epic exists** under
  `.planning/work`.
- **It does not type-check.** `npx tsc --noEmit -p apps/ai-service/tsconfig.app.json`
  reports, among others:
  - `ai.service.ts(233,13)`, `(433,7)`, `(906,9)`, `(975,7)`: `TS2353 — 'runId' does
    not exist in type '{ conversationId; role; content }'` (the four `saveMessage`/`persistAssistantMessage` calls).
  - `ai.service.ts(692,25)` and `(920,44)`: `TS2554 — Expected 1 arguments, but got 2`
    — `provider.chat(messages, { maxTokens, disableThinking })` against `IAIProvider.chat(message)`
    which takes **one** arg (`libs/shared/src/lib/types/ai.types.ts:85-88`).
  - `providers/lmstudio.provider.ts(1,25)`: `TS2305 — Module '@ai-platform/shared' has
    no exported member 'AiChatOptions'`. The type is *referenced* (lmstudio import +
    `chat(message, options?: AiChatOptions)` at `:90`) but **never defined/exported**
    anywhere in `libs/shared/src`.
  - The Nx app build uses `NxAppWebpackPlugin({ compiler: 'tsc' })` (`apps/ai-service/webpack.config.js`),
    i.e. real `tsc` — not transpile-only — so these are hard build failures, not just
    editor noise. The last two clusters (the `chat`-options + `AiChatOptions` ones) look
    like fallout from commit `4cd8989` ("reasoning_effort") that landed the option
    plumbing without exporting the type or widening the interface; the `runId` cluster
    is the over-claimed "TASK-003" work landing without its schema/service half.

  **Verdict:** the idempotent write is implemented **nowhere**. On Kafka redelivery the
  code (once it compiles at all) **double-inserts**. The comments over-claim outright.

### Q2 — Current durability of the assistant message: still all-or-nothing, biased to nothing

Persistence still happens **once, on `complete`, per lane**, with content held only in
in-process accumulators:

- Agent loop: `persistAssistantMessage(payload.conversationId, runId, finalAnswer)` at
  `ai.service.ts:551`, after the loop reaches `decision.kind === 'final'`. The streamed
  answer lives only in `subject.next(...)` forwarding; nothing assembles a partial.
- Capability/technical lane: accumulates into local `collected` and persists in the
  stream's `complete` handler at `:940` (`provider.chat(...).subscribe(... complete: persist(collected))`).
- Structured lane: `subject.next(observation)` then `persistAssistantMessage(..., observation)`
  at `:245` (zero-LLM, near-instant — not a streaming durability concern).

Failure modes — none persist partial content:
1. **Crash mid-stream** (process dies before `complete`): `collected`/the streamed
   tokens are in heap only → **total loss** of the assistant turn.
2. **DB-write throw after a full stream** (`persistAssistantMessage` rejects): caught
   only as `subject.error(err)` (`:942`) → surfaces an `error` SSE event; the fully
   generated answer is **discarded**, never retried, no fallback store.
3. **Kill-switch / timeout / token-budget**: the loop throws a typed safeguard error
   *before* reaching the `final` branch, so `persistAssistantMessage` never runs →
   whatever was streamed to the client is **not persisted**.
4. **Kafka publish fail in the bridge** (`ai.module.ts:153-159` `publishResponse`, or the
   `complete`/`error` publishes at `:206-237`): a rejected `AI_RESPONSE` publish rejects
   the `publishQueue`, which unsubscribes the source (`:240-243`). DB persistence and the
   publish are **independent and unordered** — persistence may succeed while the client
   never sees `complete`, or the client may see chunks the DB never stored. There is no
   transaction, no outbox, no correlation.

So the durability posture is unchanged from the 2026-06-16 scan and is **all-or-nothing,
biased toward nothing**: any abort/crash/throw on the persistence-side path drops the
assistant turn entirely. The user turn *is* now written up-front
(`ensurePersistedUserTurn`, `:408-437`) — but through the same non-idempotent `saveMessage`.

### Q3 — Kafka redelivery axis: duplicate risk is live

`libs/kafka/src/lib/kafka-consumer.service.ts`:
- The consumer uses **kafkajs default auto-commit** — `consumer.run({ eachMessage })`
  (`:83-108`) with **no `autoCommit:false`, no `eachBatch`, no manual `commitOffsets`**.
  kafkajs auto-commits offsets periodically and after `eachMessage` resolves.
- `eachMessage` **awaits each handler** (`await h(payload)`, `:101`) and swallows handler
  throws by *removing the handler* (`:102-105`) rather than rethrowing — so a throw does
  **not** prevent the offset commit for that message.
- The AI_REQUEST handler (`ai.module.ts:85-99`) runs the **entire generation inline**
  inside `eachMessage` (`await this.streamAiResponse(...)`). Because the whole run is
  awaited before `eachMessage` returns, the offset for an AI_REQUEST is **not committed
  until the run finishes**. Therefore: **a crash/restart mid-run (or before the periodic
  auto-commit fires) re-delivers AI_REQUEST and re-runs the whole generation from
  scratch.** This is also the documented "Kafka rebalance hot-reload crash" hazard
  (long inline run + serve restart → session-timeout eviction → redelivery).
- Combined with Q1: the re-run mints a **fresh** `runId` (`ai.service.ts:174`
  `options?.runId ?? randomUUID()`, and `streamAiResponse` never passes one — see Q4),
  and `saveMessage` is a bare `create` → **a redelivered AI_REQUEST inserts duplicate
  user and assistant rows.** The duplicate-row risk from Q1 is **live today** (modulo the
  build being red). Idempotency is the genuinely missing primitive — more so than any
  Redis buffer.

### Q4 — Hook points: chokepoint intact, but the `runId` premise is FALSE

- The single-chokepoint claim **holds**: `streamAiResponse` (`ai.module.ts:148-245`) is
  the one place that observes every chunk of every lane. `processMessage(...).subscribe`
  (`:186-238`) sees `next(chunk)` → `result += chunk` (`:197`) → `publishResponse(event:'chunk')`,
  plus `complete`/`error`. A Redis buffer + restart-flush could hook here in
  `next`/`complete`/`error` with **no `ai.service.ts` edits**.
- **BUT `runId` is NOT available at that boundary.** The investigator's premise is wrong:
  - `AiRequestPayload` (`ai.module.ts:24-34`) has **no `runId`** field.
  - The AI_REQUEST handler (`:85-99`) **never mints a `runId`**; it derives only
    `conversationId`, then calls `streamAiResponse(value, conversationId)`.
  - `streamAiResponse` calls `processMessage({ ...value, conversationId }, { onStatus,
    onAgentEvent })` (`:186-190`) — **with no `runId` option**.
  - So `runId` is minted **per invocation** deep inside `processMessage`
    (`ai.service.ts:174` `options?.runId ?? randomUUID()`) and is **never surfaced back**
    to `ai.module.ts`. The bridge cannot key a per-run Redis stream on it without new
    plumbing. (The "minted once at the AI_REQUEST boundary and threaded into all lanes"
    comments at `ai.service.ts:98-102, 172-174, 330` describe an *intended* design that
    the wiring never realized: the boundary that should mint it doesn't, and the value
    never escapes `AiService`.)

  To make a per-run Redis key viable, `runId` must first be **minted in the AI_REQUEST
  handler**, added to `AiRequestPayload` (or a separate arg), threaded into
  `streamAiResponse` and passed as `options.runId` to `processMessage`. That is a small
  but **prerequisite** change for *any* run-keyed durability (Redis or DB).

### Where/how to refactor — options, in dependency order

The findings reorder the priorities vs the 2026-06-16 B→C recommendation. Two things must
happen *before* Redis is even worth discussing:

- **P0 — Make it build (blocker).** Define+export `AiChatOptions` from
  `libs/shared/src/lib/types/ai.types.ts` and widen `IAIProvider.chat(message, options?: AiChatOptions)`
  (currently single-arg, `:86`); add `runId` to the `saveMessage` param type +
  `ConversationPrismaClient` (or revert the `runId` args). Until then nothing below ships.
- **P1 — Real idempotency (Option B, done properly).** This is the highest-value,
  lowest-cost durability win and removes the live duplicate-row bug:
  - Schema: add `runId String @map("run_id")` to `Message` + a **unique key** that
    matches the write granularity. A run produces *both* a user turn and an assistant
    turn, so `@@unique([runId, role])` (not `@@unique([runId])`) is the correct key.
    New migration dir under `libs/database/prisma/migrations/`.
  - Mint `runId` in the **AI_REQUEST handler** (`ai.module.ts`), add it to
    `AiRequestPayload`, thread it through `streamAiResponse` → `processMessage(options.runId)`
    so it is **stable across redeliveries** (today it is regenerated — Q4).
  - Convert `saveMessage` to `prisma.message.upsert({ where: { runId_role: {...} }, create, update:{} })`
    (or `create` + catch P2002), widening `ConversationPrismaClient` accordingly.
  - Result: redelivered AI_REQUEST re-runs generation but **writes are no-ops** — the
    transcript can't double. This is the "idempotent write" alternative in the topic's
    trade-off list, and it is strictly simpler than Redis.
- **P2 — Persist on abort, not just on `complete` (Option C-lite, no Redis).** Cheapest
  partial-loss mitigation: in `streamAiResponse`'s `error` handler (and on safeguard
  aborts in the agent loop) persist the already-accumulated text as a best-effort
  assistant turn (idempotent via P1, so a later success is a no-op/update). Captures the
  "DB-write/timeout/kill mid-stream" losses from Q2 without any new infra.
- **P3 — Redis chunk buffer + restart-flush (Options "B/C" of the topic).** Only now is
  Redis worth it, and the chokepoint (Q4) makes it a localized add in
  `streamAiResponse`'s `next`/`complete`/`error` — **but requires P1's stable `runId`
  first** (Q4). Recommended structure: a **Redis Stream** per run
  (`run:{runId}:chunks`, `XADD` per chunk, TTL on `complete`) — Streams give ordered,
  range-readable, individually-ackable entries and survive restart, which List/pub-sub
  don't (pub/sub is fire-and-forget; a List works but lacks consumer-group ack/replay).
  Flush policy: buffer per-chunk to Redis, **single DB write on `complete`** (don't write
  per-chunk to Postgres — high write amplification for `Message.content`); on restart, a
  recovery sweep reads `run:*:chunks` streams with no terminal marker and flushes them to
  the DB via the P1 idempotent upsert. This is the only design that approaches "literal
  zero data loss" for the *assistant* turn, but it adds an ioredis dep, a docker-compose
  Redis service, a recovery sweeper, and TTL/orphan management.

### Trade-offs vs simpler alternatives (answering the topic's framing)

- **In-memory buffer + final write (status quo):** simplest; loses the turn on any
  crash/abort/DB-throw (Q2). Already what exists.
- **Idempotent write (P1):** small, schema-local, removes the *duplicate* failure mode
  and is a prerequisite for everything else. Does **not** by itself prevent *loss* on
  crash — it prevents *duplication* on redelivery. Highest ROI right now.
- **Persist-on-abort (P2):** removes most *loss* modes cheaply; depends on P1 to stay
  duplicate-free. No new infra.
- **Transactional outbox / WAL:** would couple the `AI_RESPONSE` publish and the DB write
  atomically (fixes the publish/persist divergence in Q2#4) but is heavier than this
  service needs given a single chokepoint already exists; an outbox row written in the
  same tx as the message + a relay to Kafka is the textbook fix if publish/persist
  consistency becomes a hard requirement. Overkill for the current scale.
- **Redis Stream buffer + restart-flush (P3):** the only path to near-literal zero-loss
  *during* streaming; meaningful infra + operational cost (Redis availability — note the
  documented "Redis hard boot dependency" hazard: any Redis dependency must degrade, not
  crash the service). "Zero data loss" is **not literal** without it *and* P1 — at best
  the assistant turn is recoverable to the last `XADD`'d chunk; the in-flight token since
  the last `XADD` is still at risk.

### Does the prior B→C→defer-D recommendation still stand?

**Directionally yes, but it must be re-sequenced and de-scoped of its false premise.** The
2026-06-16 plan assumed B (idempotency) was the easy, partly-done base. The current code
shows B is **not done at all** (no column, no upsert, non-stable `runId`) and the tree is
additionally **not compiling**. So the honest sequence is: **P0 (fix the build) → P1 (B,
implemented for real, including stable `runId`) → P2 (cheap persist-on-abort) → P3 (C, the
Redis Stream buffer, only after P1)**, with D (client-resume) still deferred to a separate
FE epic as before. Redis (C) remains the *right* tool for buffering *if* literal zero-loss
during streaming is a true requirement — Streams over List/pub-sub/key — but it is premature
to add it before idempotency exists, because most of the perceived "data loss" today is
actually duplicate-and-drop behavior that P1+P2 fix without any new infrastructure.

[be-developer] RESEARCH DONE

## FE Findings
<!-- fe-developer (RESEARCH MODE, read-only) — only if frontend is consulted -->

## Web Findings
<!-- research-investigator: the single web-search pass -->

One focused round (the 2026-06-16 investigation already established the core Redis-Streams prior art; this round re-confirms it and sharpens the idempotency angle that the BE findings just made central).

**The buffer structure is still Redis Streams, not List/pub-sub/key.** The canonical pattern `XADD`s each token to a per-run Stream; consumers `XREAD`/`XREADGROUP` and forward to the client. Streams win because they are an append-only log with per-entry IDs + consumer-group ack/replay — exactly what reconnect/recovery needs. Pub/sub is rejected (fire-and-forget; a disconnected subscriber loses messages); a plain List works but lacks the entry-ID cursor and ack semantics. (Redis tutorial/blog, Dragonfly guide.)

**Decouple the buffer from the SSE connection.** The strongest published designs ("resumable streams") have the generator `XADD` tokens to Redis as fast as the model emits, and a *separate* consumer push to the client; the Redis Stream buffers the response **independently of the client connection**, so a reconnecting client replays everything (including tokens generated while it was disconnected) "without duplicates or missing chunks." (Upstash, LibreChat, Stardrift.) Note: in THIS codebase the gateway→FE delivery half is already partly solved by Kafka fan-out, so the marginal value of Redis here is crash-recovery of the *server-side* buffer, not client delivery.

**Idempotency is the recognized hard primitive — independently corroborated.** The Redis Streams docs have a dedicated "Idempotent message processing" page, and Redis 8.6 added native at-most-once stream *production* precisely because at-least-once delivery (exactly our Kafka situation) otherwise double-writes. The documented crash pattern is explicit: "if a producer crashes after XADD but before the reply, on restart it must XADD again … if the worker dies between commit and ack, entries replay and you write an idempotent `last_login_at` again, which is harmless." The whole point: **the durability mechanism is only safe if the terminal write is idempotent.** This validates the BE re-sequencing — idempotency (P1) is a prerequisite, not an optional extra. (Redis idempotency docs; MojoAuth write-behind example.)

**"Zero data loss" remains aspirational, not literal.** Redis default `appendfsync everysec` can lose ~1s of writes on a Redis crash; `always` closes the gap at a throughput cost. Buffering reduces the loss window from "the entire message" to "the sub-second tail of an in-flight generation," and only if the final DB flush is idempotent + replayed on restart. Treat the goal as "no loss of a *completed* generation, at most a sub-second token tail of an in-flight one."

**Sources:**
- [Stream LLM Output to Browser with Redis Streams (Redis)](https://redis.io/learn/howtos/solutions/streams/streaming-llm-output)
- [Streaming LLM Responses (Redis blog)](https://redis.io/blog/streaming-llm-responses/)
- [Idempotent message processing (Redis Streams docs)](https://redis.io/docs/latest/develop/data-types/streams/idempotency/)
- [How to Build LLM Streams That Survive Reconnects, Refreshes, and Crashes (Upstash)](https://upstash.com/blog/resumable-llm-streams)
- [Resumable Streams (LibreChat)](https://www.librechat.ai/docs/features/resumable_streams)
- [Is resumable LLM streaming hard? (Stardrift)](https://stardrift.ai/blog/streaming-resumptions)
- [Using Redis Streams: best practices (Dragonfly)](https://www.dragonflydb.io/guides/using-redis-streams-commands-sample-application-and-best-practices)

## Synthesis
<!-- research-investigator: options table, recommendation, refactor strategy -->

**Answering the two framing questions directly:**

1. **Redis — buffering of streaming chunks: do we need it?** *Not yet.* It is the right tool (Redis Streams, not List/pub-sub/key) *if* literal near-zero-loss during in-flight streaming becomes a hard requirement. But it is **premature**: today most of the perceived "data loss" is not lost-buffer, it is (a) the whole assistant turn dropped on any abort/crash/DB-throw, and (b) **duplicate** rows on Kafka redelivery. Both are fixed far more cheaply without Redis (idempotency + persist-on-abort). Adding Redis before idempotency exists would *worsen* duplication.

2. **Streaming persistence chunks → Redis → DB (zero data loss): do we need it?** *Not literally, and not as "every chunk → DB."* The prior art universally keeps the DB write **once, on completion** (or checkpoint); Redis is the live durability buffer, the relational DB the system of record. Per-chunk Postgres writes are write-amplification on the hottest path — explicitly the wrong design. The genuine value (recover an in-flight generation after a crash) is real but is the *last* increment, only worthwhile after the cheaper fixes land and only if product wants near-zero in-flight loss.

**Reframing vs the 2026-06-16 recommendation.** That report recommended B→C→defer-D and assumed B (idempotency) was "easy and partly done." The current code shows the opposite: **B is implemented nowhere** (no `runId` column, no upsert, `runId` is a non-stable per-invocation `randomUUID()` that never escapes `AiService`), the comments over-claim a non-existent "TASK-003," **and the ai-service does not type-check today** (a hard build blocker that predates any durability work). So the direction still holds but must be re-sequenced and gated behind a build fix.

### Options

| Option | Pros | Cons | Effort |
|---|---|---|---|
| **P0. Fix the build (blocker, not optional)** | Unblocks everything; `nx build/test ai-service` currently red | Pure regression cleanup, no durability value on its own | XS–S |
| **A. Status quo (in-memory buffer, single write on `complete`)** | Zero infra | Any crash/abort/DB-throw/Kafka-publish-fail mid-stream loses the entire assistant turn; duplicate rows on redelivery; doesn't compile | none |
| **P1. Real idempotency — stable `runId` + `@@unique([runId, role])` + upsert** | Removes the live duplicate-row bug; prerequisite for all run-keyed durability; no new infra; highest ROI | Schema migration (Prisma-drift trap); does not by itself prevent *loss* on crash | S |
| **P2. Persist-on-abort (no Redis)** | Captures most *loss* modes (DB-throw/timeout/kill/crash-just-before-complete) cheaply; idempotent via P1 so safe | Still loses a true mid-stream process crash (text only in heap); best-effort | S |
| **P3. Redis Stream buffer + restart-flush (the topic's "B/C")** | Only path to near-literal zero-loss of an in-flight assistant turn; localized at the `ai.module.ts` chokepoint; matches prior art | New ioredis dep + docker-compose Redis + recovery sweeper + TTL/orphan mgmt; must degrade-not-crash (Redis-hard-boot hazard); requires P1's stable `runId` first; "zero loss" still not literal (sub-second tail) | M |
| **D. Client resume / last-event-id (G2)** | Full reconnect-survives UX | Needs gateway SSE + FE changes (out of scope this epic); Kafka fan-out already covers live delivery | L, defer |
| **E. Transactional outbox / WAL** | Atomically couples AI_RESPONSE publish + DB write (fixes publish/persist divergence in BE Q2#4) | Heavier than needed at current scale; per-chunk WAL = write amplification | M–L, poor fit |

### Recommendation

**P0 → P1 → P2 now; P3 only if product wants near-zero in-flight loss; defer D; skip E.**

- **P0 (fix the build) is an unconditional blocker** — the ai-service does not type-check (missing `AiChatOptions` export, single-arg `IAIProvider.chat` called with 2 args, `runId` rejected by `saveMessage`). This is independent of the durability question and must land first regardless of which durability option is chosen. It is the single most important finding of this re-investigation.
- **P1 (real idempotency) is the highest-value durability work** and the genuine missing primitive (corroborated by the Redis idempotency docs and the live Kafka at-least-once redelivery path). Do it as a standalone `repo: be` change: stable `runId` minted at the AI_REQUEST boundary, `Message.runId` column + `@@unique([runId, role])`, `saveMessage` → upsert.
- **P2 (persist-on-abort)** is a cheap follow-on that removes most actual loss with no new infra.
- **P3 (Redis Stream buffer)** remains the *correct* tool for literal in-flight durability, but is premature until P1 exists; gate it behind a product decision that "no loss of an in-flight (not-yet-complete) generation" is truly required. Do NOT persist every chunk to Postgres.
- **D (client resume)** stays a separate FE-inclusive epic (out of scope here; Kafka already handles live delivery).

### Refactor strategy (ordered, grounded in real paths)

1. **P0 — make it build.** Define + export `AiChatOptions` from `ai-platform/libs/shared/src/lib/types/ai.types.ts` and widen `IAIProvider.chat(message, options?: AiChatOptions)` (currently single-arg at `:86`, called with 2 args at `ai.service.ts:692,920`); and EITHER add `runId` to `saveMessage`'s param type + `ConversationPrismaClient` (`conversation.service.ts:7-25,51-63`) — folding into P1 — OR temporarily drop the `runId` args. Verify with `npx tsc --noEmit -p apps/ai-service/tsconfig.app.json` and `nx test ai-service`. Likely fallout from commit `4cd8989`.
2. **P1 — real idempotency.**
   - Mint `runId` in the **AI_REQUEST handler** (`ai.module.ts:85-99`), add it to `AiRequestPayload` (`ai.module.ts:24-34`), thread through `streamAiResponse` → `processMessage({ ...value, runId }, …)` so it is **stable across Kafka redeliveries** (today it is regenerated per invocation at `ai.service.ts:174` and never surfaced — BE Q4).
   - Schema: add `runId String @map("run_id")` to `Message` (`libs/database/prisma/schema.prisma:80-91`) + **`@@unique([runId, role])`** (a run writes both a user and an assistant turn — `@@unique([runId])` alone is wrong). New migration. **Watch the Prisma-drift trap** (project memory): `migrate dev` can silently DROP the raw trgm/hnsw chunk indexes — inspect the generated SQL.
   - Convert `ConversationService.saveMessage` (`conversation.service.ts:51-63`) from bare `create` to `upsert({ where: { runId_role: { runId, role } }, create, update: {} })`, widening `ConversationPrismaClient`. Redelivered runs become write no-ops.
3. **P2 — persist-on-abort.** In `streamAiResponse`'s `error` handler (`ai.module.ts:220-237`) and on safeguard aborts in the agent loop, best-effort persist the already-accumulated text (the `result` accumulator at `ai.module.ts:197` is a natural source) via the now-idempotent `persistAssistantMessage`/`saveMessage`. Idempotency (P1) makes a later success a harmless update.
4. **P3 — Redis Stream buffer + restart-flush (only after P1, gated on product).**
   - Scaffold `ai-platform/libs/redis` mirroring `libs/kafka` (`RedisModule.forRoot({ url })` global `DynamicModule`, `RedisService` wrapping ioredis with `OnModuleInit`/`OnModuleDestroy`). **Must degrade, not crash, if Redis is down** (project memory: Redis-hard-boot hazard — log, don't rethrow). Check `nx.json` before adding the lib; add `ioredis` to `package.json` (not a dep today); add a `redis:` service to `ai-platform/docker-compose.yml` (postgres+kafka only today).
   - Buffer at the chokepoint: in `streamAiResponse` `next` (`ai.module.ts:192-204`) `XADD run:{runId}:chunks` (TTL); flush/`DEL` on `complete` (`:205-219`); leave intact on `error` for the sweeper.
   - Restart sweep on `onModuleInit`: scan `run:*:chunks` with no terminal marker, reassemble via `XRANGE`, flush via the P1 idempotent upsert.
5. **D — deferred** to a separate FE-inclusive epic (gateway SSE last-event-id replay + FE reconnect).

## Investigator — Summary
<!-- research-investigator: confidence, risks, next actions -->

**Confidence: High** on the current-state analysis (BE findings are file-line precise, include a reproduced `tsc` failure, and match my own scan) and on the recommended shape (mirrors well-established Redis/Upstash prior art + the Redis idempotency docs). **Medium** on whether Redis (P3) is wanted at all — that is a product call about how literal "zero in-flight loss" must be.

**Headline finding (changed since 2026-06-16):** The prior B→C→defer-D recommendation is **directionally still correct but its premise was false.** Option B (idempotency) is implemented **nowhere** — `runId` is a non-stable per-invocation `randomUUID()` that never leaves `AiService`, there is no `Message.runId` column, no unique key, and `saveMessage` is a bare `create`. The code comments cite a "TASK-003 idempotent upsert" that does not exist (no such epic in `.planning/work`). **And the ai-service does not type-check today** (missing `AiChatOptions` export, single-arg `IAIProvider.chat` called with two args, `runId` rejected by `saveMessage`) — a hard build blocker, likely fallout from commit `4cd8989`. So the honest sequence is **P0 (fix build) → P1 (B, for real) → P2 (persist-on-abort) → P3 (C, Redis) → defer D.**

**Key risks:**
- **The build is red.** Nothing durability-related can ship until P0 lands. This is the most urgent, and it is unrelated to Redis.
- **Sequencing.** Adding Redis (P3) before idempotency (P1) would *worsen* duplication under Kafka at-least-once redelivery. P1 must come first — corroborated by the Redis idempotency docs.
- **"Zero data loss" is not literal.** Even with P3, Redis default `appendfsync everysec` can lose ~1s of tokens; only completed generations are fully safe.
- **Prisma migration trap** (project memory): the `Message` schema change risks `migrate dev` silently dropping raw trgm/hnsw indexes — inspect generated SQL.
- **Redis-hard-boot hazard** (project memory): any new Redis dependency must degrade (log, not rethrow), never crash ai-service on Redis-down.
- **Operational footprint** of P3: ioredis dep, docker-compose Redis, recovery sweeper, TTL/orphan management — net-new surface for a service with none today.

**Still needs validation:**
- Product decision: is **durable-final-write + idempotency (P1+P2)** sufficient, or is **near-zero in-flight loss (P3 Redis)** truly required? Recommendation assumes P1+P2 now, P3 gated, D deferred.
- Root-cause the P0 build break (confirm it traces to `4cd8989`) and whether main is also red or only this branch.
- Confirm `@@unique([runId, role])` is the right write granularity for all lanes (structured lane writes a single observation; verify it shares the run's `runId`).

**Concrete next actions:**
1. **Immediately:** open a `repo: be` fix epic for **P0** (export `AiChatOptions`, widen `IAIProvider.chat`, reconcile `saveMessage` signature) — the tree must build before anything else. Run `/team-lead:spec` or `/team-lead:plan`.
2. Then a `repo: be` epic for **P1** (stable `runId` at the AI_REQUEST boundary + `Message.runId` + `@@unique([runId, role])` + upsert `saveMessage`) — highest durability ROI; can be folded with P0's `saveMessage` fix.
3. Then **P2** (persist-on-abort at `ai.module.ts:220-237`), small follow-on, no infra.
4. Only if product wants near-zero in-flight loss: a `repo: be` epic for **P3** (`libs/redis` mirroring `libs/kafka`, docker-compose `redis:`, buffer at the `ai.module.ts:192-219` chokepoint, restart sweeper).
5. Keep **D** (client resume) as a separate FE-inclusive epic.
