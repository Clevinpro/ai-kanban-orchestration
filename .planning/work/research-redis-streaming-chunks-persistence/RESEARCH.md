---
id: RESEARCH
title: Redis-buffered streaming-chunk persistence (zero data loss)
status: done
priority: medium
repo: inv
epic: research-redis-streaming-chunks-persistence
complexity: 0
created-at: 2026-06-16T16:26:34Z
updated-at: 2026-06-16T19:39:26+03:00
started-at: 2026-06-16T19:31:04+03:00
completed-at: 2026-06-16T19:39:26+03:00
---

# RESEARCH: Redis-buffered streaming-chunk persistence (zero data loss)

**Epic:** `research-redis-streaming-chunks-persistence`
**Type:** Investigation — architecture / refactor strategy
**Created:** 2026-06-16
**Agents:** research-investigator (sole web-search) + read-only be-developer/fe-developer per repo

---

## Topic / Question

Should streaming LLM chunks be buffered through Redis before persisting to the DB,
to guarantee zero data loss? Investigate the architecture: as the AI service
streams chunks to the client (SSE), buffer each chunk into Redis, then flush the
assembled message to the database. Goal — if the process crashes / client
disconnects / DB write fails mid-stream, no partial or generated content is lost
and the conversation can be reconstructed or resumed.

Questions to answer:
- Is Redis the right buffer here, and what structure (Stream, List, pub/sub, plain key)?
- Write path: chunk → Redis → DB. When/how to flush (per-chunk, batched, on-complete)?
- Failure & recovery semantics: crash mid-stream, DB outage, client disconnect — how is
  "zero data loss" actually achieved and verified?
- How does this fit the current AI-service streaming + persistence code?
- Trade-offs vs simpler alternatives (in-memory buffer + final write, WAL, outbox pattern).

## Scope

- In scope: backend streaming/persistence path in `ai-platform/` (ai-service), Redis
  buffering design, flush/recovery semantics, durability trade-offs.
- Out of scope: frontend SSE consumption changes, infra provisioning of Redis,
  non-streaming request paths.

---

## Research Log
<!-- each stage is appended here as it happens -->
- [investigator] code scan done — backend-only topic. Streaming + persistence lives in `ai-platform/apps/ai-service/src/ai/ai.service.ts` and `.../conversation/conversation.service.ts`. Transport is Kafka (AI_REQUEST → AI_RESPONSE chunk/status/agent/complete), not direct SSE. Current durability model: chunks stream out but are NOT individually persisted — the full assembled text is written to DB once on stream `complete` via `persistAssistantMessage` (single `prisma.message.create`). No Redis anywhere in repo; infra = postgres (pgvector) + kafka only. FE explicitly out of scope.

## Investigator — Plan
<!-- research-investigator: repos to consult + specific questions -->

**Repos to consult:** `be` only. The topic is entirely the ai-service streaming/persistence path; FE is out of scope per the RESEARCH header. No `fe` tab will be opened.

**Specific questions for be-developer (RESEARCH MODE, read-only):**
1. In `ai.service.ts`, persistence of the assistant message happens once on stream `complete` (`persistAssistantMessage` → single `prisma.message.create`). Confirm there is NO other code path that persists partial/incremental content, and that a crash/timeout/kill-switch between first chunk and `complete` loses the entire assistant message. Are streamed chunks held only in the in-memory `collected`/`result` strings?
2. What exactly happens on the failure modes today: (a) process crash mid-stream, (b) `persistAssistantMessage` DB write throws, (c) kill-switch/timeout/iteration-cap fires mid-generation, (d) Kafka publish of a chunk fails? Does any of these leave a half-written or zero row, and is the user message always already persisted before generation?
3. Is there any existing idempotency / dedup / message id on the assistant write, or any retry, that a Redis-buffer + replay design would need to coordinate with? Note the Kafka consumer semantics (at-least-once?) and whether AI_REQUEST could be re-delivered, causing a duplicate run.
4. Practical integration points: where would a Redis buffer hook in with least disruption (the `subject.next(chunk)`/`collected += chunk` site in `streamAiResponse`/the chat-flow `subject.next`, and the `complete` flush)? Any shared lib pattern for adding a new infra client (like `libs/kafka`) we'd mirror for a `libs/redis`? Does the kill-switch registry give us a natural per-run key?

**Stages:** code scan (done) → open `be` tab, poll for sentinel (cap ~10 min) → read BE Findings → one WebSearch round → Synthesis (options table + recommendation + refactor strategy) → Summary.

- [investigator] be findings collected — confirmed all-or-nothing assistant persistence, single write on `complete`, no idempotency, Kafka at-least-once with crash-redelivery risk, clean hook at `ai.module.ts:197/205`. Proceeding to web pass.

## BE Findings
<!-- be-developer (RESEARCH MODE, read-only) — only if backend is consulted -->

_Read-only investigation of `ai-platform/` (ai-service + api-gateway + libs/kafka). No code changed._

### Q1 — Persistence happens once, on `complete`; chunks live only in memory. CONFIRMED.

There is **no incremental-persist path**. Every lane writes the assistant message exactly once via the single chokepoint `persistAssistantMessage` → `ConversationService.saveMessage` → one `prisma.message.create`:

- `persistAssistantMessage` — `ai-platform/apps/ai-service/src/ai/ai.service.ts:799-813`. Single `await this.conversationService.saveMessage({ role: 'assistant', content })`.
- `ConversationService.saveMessage` — `ai-platform/apps/ai-service/src/conversation/conversation.service.ts:51-63`. Single `prisma.message.create`. No `update`, no upsert, no batching anywhere.

The three streaming lanes each call it once, *after* the stream is fully assembled:
- **Chat/agent loop** (`runChatFlow` → `executeAgentLoop`): the final answer is persisted only inside the `decision.kind === 'final'` branch — `ai.service.ts:405-408` — i.e. after the loop terminates with a FINAL marker, immediately before `subject.complete()` at `:410`.
- **Capability / technical lane** (`buildAndStream`): persisted in the provider stream's `complete` callback — `ai.service.ts:779-784` — using the in-memory `collected` accumulator.
- **Structured lane** (`runStructuredLane`): persists the single tool observation at `ai.service.ts:188-193` (no LLM token streaming there).

Streamed content is held **only in in-memory strings**, never durably staged:
- `buildAndStream`: `let collected = ''` then `collected += chunk` on each `next` — `ai.service.ts:767, 776`. This is the buffer that gets persisted.
- `executeAgentLoop` / `streamAgentDecision`: `let accumulated = ''; accumulated += chunk` — `ai.service.ts:526, 549`. Only the post-`FINAL:` slice is forwarded to the user via `subject.next` (`:385`, `:563`); the full `accumulated` is what `parseAgentDecision` reads and `decision.answer` is persisted from.
- A **second** redundant in-memory copy exists one layer up in the Kafka bridge: `let result = ''; result += chunk` in `AiModule.streamAiResponse` — `ai-platform/apps/ai-service/src/ai/ai.module.ts:150, 197`. This `result` is used **only for a log line** (`:213`), never persisted — so it is not a recovery source today.

Net: a crash / timeout / kill-switch / provider error **between the first streamed token and the `complete`-time `persistAssistantMessage`** loses the **entire** assistant message. Nothing partial is written.

### Q2 — Failure modes today

Precondition on the user message: it is **persisted before generation in the LLM lanes**, but the ordering differs and there are gaps:
- Chat/agent loop: user message saved at `executeAgentLoop` `ai.service.ts:341-346`, *before* the planning loop — so it is durable before any token. **But only when `payload.conversationId` is set** (`:336`). If absent, `runChatFlow` registers a throwaway KillSwitch (`:283-285`) and **no history/user message is persisted at all**.
- Capability/technical (`buildAndStream`): user message saved at `:749-756`, after history load but before `provider.chat`. Durable before generation.
- Structured lane: user saved at `:173-180` before the tool runs.

Failure outcomes:

- **(a) Process crash mid-stream** — ai-service dies between first token and `complete`. User row already committed (LLM lanes); assistant message **entirely lost** (lived only in `collected`/`accumulated`). The SSE client at the gateway already received some chunks on screen, but they exist nowhere durable → on reload the conversation shows the user turn with **no assistant reply**. Kafka offset: see Q3 — the AI_REQUEST may be redelivered, re-running generation.

- **(b) `persistAssistantMessage` DB write throws** — generation already fully done and streamed to the user. In `buildAndStream` the `.catch` routes to `subject.error` (`ai.service.ts:783`); in the agent loop the throw propagates out of `executeAgentLoop` and is caught by `runChatFlow`'s `.catch` → `subject.error` (`:297-299`). Either way the gateway emits an **`error` event** (`ai.module.ts:220-237`) *after* the user already saw the full answer. Result: **zero assistant row**, user sees a complete answer then an error — worst UX/data mismatch. No retry of the write anywhere.

- **(c) kill-switch / timeout / iteration-cap fires mid-generation** — these throw typed safeguard errors (`isSafeguardError`, `errors.ts`). Timeout can fire inside `streamAgentDecision` via the `stallTimer` (`ai.service.ts:582-593`) or between iterations via `timeout.check()` (`:355`); kill-switch via `killSwitch.checkpoint()` (`:356`); iteration-cap via `iterationCap.increment()` (`:354`). All reject the run → `subject.error` → gateway `error` event with `error.reason`. **No assistant row written** for the partial generation. The user message is still durable. Note a partial FINAL answer already streamed token-by-token to the user is **lost** even though the user saw it.

- **(d) Kafka publish of a chunk fails** — publishes are serialized through `publishQueue` in `streamAiResponse` (`ai.module.ts:151-162`). A rejected publish is caught at `:240-243` → `subscription.unsubscribe()` + `reject`. Unsubscribe tears down the RxJS chain; in `buildAndStream` the `tap({unsubscribe})` (`:790-793`) cancels the provider subscription. Critically this happens **before `complete`**, so `persistAssistantMessage` likely **never runs** → assistant message lost, even though generation may have largely succeeded. The `result`/`collected` buffers are discarded.

Summary: in **every** failure mode the assistant side is all-or-nothing and biased toward **nothing**; the user turn is durable in the LLM lanes (except the no-conversationId chat case).

### Q3 — Idempotency / dedup / retry / Kafka semantics

- **No idempotency or message id on the assistant write.** `Message.id` is a server-side `@default(cuid())` (`schema.prisma:81`); the producer/run never supplies a stable id. `saveMessage` is a bare `create` (`conversation.service.ts:56`). There is **no unique constraint** that would dedup a re-run (only `@@index([conversationId, createdAt])`, non-unique — `schema.prisma:89`). So a redelivered AI_REQUEST that re-runs to completion would `create` a **second** assistant row (and a second user row via `:341` / `:751`).
- **No application-level retry** of the DB write; failures surface as errors, the run ends.
- **Kafka consumer semantics = at-least-once, and effectively auto-commit.** The custom `KafkaConsumerService` (`libs/kafka/src/lib/kafka-consumer.service.ts`) uses kafkajs `consumer.run({ eachMessage })` (`:83-108`) with **no manual offset commit and `autoCommit` left at its default (on)**. Handlers are `await`ed (`:99-105`), and a throwing handler is swallowed (the handler is *removed*, `:102-104`) rather than causing a redelivery — so within a live process a failed AI_REQUEST does **not** auto-retry. **But** the AI_REQUEST handler in `ai.module.ts:87-107` wraps everything in its own try/catch that only logs (`:100-106`), so it never throws out to kafkajs anyway.
- **Redelivery / duplicate-run risk** is real on the **rebalance / crash** axis, not the error axis: with default auto-commit, if the process **crashes after the message was delivered but before the offset interval committed**, kafkajs redelivers AI_REQUEST to the next consumer in the group on rebalance → **the whole run executes again**. Combined with the no-unique-constraint write, that yields a duplicate assistant message once the retry succeeds. Cancel path keys AI_CANCEL by `conversationId` (`ai.controller.ts:95-102`); AI_REQUEST is published with **no key** (`ai.controller.ts:62-65`), so ordering/partitioning is not pinned per conversation.

Implication for a Redis-buffer + replay design: it must introduce its own **stable run/message id** (natural candidate: the `runId = randomUUID()` already minted in `runChatFlow` at `ai.service.ts:276`, but note it is *not* created for the non-agent lanes) and make the final write **idempotent** (e.g. upsert on a deterministic key, or a unique index) so replay-after-crash doesn't double-insert.

### Q4 — Practical Redis integration points

**Least-disruption hook points (write path), in priority order:**

1. **A single sink seam already exists per lane.** Rather than instrument every `subject.next`, the cleanest hook is the place where the accumulator grows, because that is exactly the "content we'd lose":
   - `buildAndStream` `next` callback — `ai.service.ts:771-778` (`collected += chunk; subject.next(chunk)`). Add `redis.append(runKey, chunk)` here; flush/delete on `complete` (`:779`).
   - agent loop's forwarded-token callback — `ai.service.ts:374-386` and/or the raw provider chunk in `streamAgentDecision` `:548-549`. The user-visible content is the post-`FINAL:` slice forwarded at `:385`/`:563`, so buffering *there* mirrors exactly what the user sees.
   - `runStructuredLane` `:186` (single observation — trivial).
2. **Even less invasive: instrument the Kafka bridge instead of the service.** `AiModule.streamAiResponse` (`ai.module.ts:148-245`) already has a per-run `result` accumulator (`:150, 197`) and clear lifecycle callbacks: `next` (`:192`), `complete` (`:205`), `error` (`:220`). This is a **single chokepoint that sees every chunk of every lane** and already owns the run boundary. Buffering chunks to Redis at `:197` and flushing/clearing at `:205` would cover all lanes with one edit and **no change to `ai.service.ts`**. Trade-off: it sits *above* `persistAssistantMessage`, so a Redis-recovery write would need its own path to `ConversationService.saveMessage` (the gateway/ai-service split means the assistant DB write lives in ai-service, which this module is part of — so it is reachable: `ConversationService` is already injected into `AiModule` at `:81`).
3. **Per-run key source.** The kill-switch registry gives a **natural per-conversation** key (`killSwitches: Map<conversationId, KillSwitchEntry[]>`, `ai.service.ts:107`) and a **per-run** id (`runId`, `:276`) — but both exist **only in the agent/`runChatFlow` lane**. For an all-lanes design, the robust composite key is `conversationId + runId`, where `runId` should be **minted once at the AI_REQUEST boundary** (`ai.module.ts:84-108`, where `conversationId` is also resolved) and threaded down — or simply minted in `streamAiResponse`. `conversationId` alone is insufficient because concurrent runs share it (the registry already stacks entries for exactly this reason, `:213-221`).

**Shared-lib pattern to mirror for `libs/redis`:** `libs/kafka` is the template.
- Structure: `libs/kafka/src/lib/{kafka.module.ts, kafka.constants.ts, kafka-producer.service.ts, kafka-consumer.service.ts}` + barrel `src/index.ts`.
- `KafkaModule.forRoot(config)` returns a **global `DynamicModule`** injecting a config value under a `Symbol` token (`KAFKA_MODULE_CONFIG`, `kafka.constants.ts`) and exporting injectable services (`kafka.module.ts:7-24`). A `RedisModule.forRoot({ url })` exporting a `RedisService` (wrapping an `ioredis`/`node-redis` client with `OnModuleInit`/`OnModuleDestroy` connect/disconnect, exactly like `KafkaProducerService:15-40`) would slot in identically and be importable globally.
- Allowed per `ai-platform/CLAUDE.md` (`libs/**` is in scope), but **a new lib requires checking `nx.json` first** and adding the dep — note **no Redis client is currently a dependency** (only transitive in `package-lock.json`; zero `import` of redis/ioredis in source). Infra (`docker-compose.yml`) has **postgres + kafka only**, so a Redis service would need adding there too.

**Recovery-path note (for the investigator's synthesis):** because the AI_RESPONSE chunks are fan-out SSE keyed by `userId`/`conversationId` (gateway `ai.controller.ts:116-138`) and the final answer is the *only* durable artifact, a Redis buffer most naturally serves two distinct goals that should be decided separately: (i) **crash-recovery of the assistant DB write** (flush buffered text → idempotent `saveMessage` on restart/retry) and (ii) **resume/replay to a reconnecting client**. The current code supports neither; the in-memory `collected`/`accumulated`/`result` strings are the entire safety net.

[be-developer] RESEARCH DONE

## FE Findings
<!-- fe-developer (RESEARCH MODE, read-only) — only if frontend is consulted -->

## Web Findings
<!-- research-investigator: the single web-search pass -->

One focused round. The exact "buffer LLM chunks in Redis, decouple generation from delivery, survive crashes/reconnects" pattern is well-established prior art — it is essentially Redis's and Upstash's recommended architecture for streaming LLM apps.

**What the industry actually does (corroborated across sources):**

- **Structure = Redis Streams, not List/pub-sub/plain key.** The canonical pattern writes each token with `XADD` to a per-run Stream; consumers read with `XREAD`/`XREADGROUP` and forward to the client. Streams are chosen specifically because they are an **append-only log with per-entry IDs**, which is what makes reconnect/replay and consumer-group fan-out work. Plain pub/sub is rejected because it is fire-and-forget (a disconnected subscriber loses messages); a List works but lacks the entry-ID cursor that resume needs. (Redis blog/tutorial.)
- **Decouple generation from delivery.** The strongest recovery property comes not from "buffer then DB" but from splitting the pipeline: a **generator** publishes tokens to Redis as fast as the model emits them, and a **separate, "dumb" consumer** reads from Redis and pushes to the client. Generation then continues regardless of client state, and any new/reconnecting consumer can catch up from a stored cursor. (Upstash "resumable LLM streams"; Redis Streams tutorial.)
- **Resume = last-event-id / resume token.** Reconnect is implemented by the client sending the last Stream entry ID it saw (SSE `Last-Event-ID` is the natural transport); the server replays everything after that ID. This is the same mechanism the topic calls "reconstruct or resume." There is a real cost: you keep per-stream state in Redis with a TTL and pay reconnect round-trips. (dev.to resume-tokens article; Ably.)
- **Durability of the final message is a separate concern from resume.** None of the sources persist *every chunk* to the primary DB. The DB write is still **once, on completion** (or on a periodic checkpoint) — Redis is the *live durability buffer*, and the relational DB is the *system of record*. The win is that if the app crashes mid-stream, the tokens already in the Redis Stream survive (Redis is itself durable via AOF/RDB), so a recovery worker can flush the assembled text to the DB after restart instead of losing it.
- **TTL / cleanup matters.** Per-run Streams must expire (or be `DEL`-ed on successful flush) or Redis memory grows unbounded; the replication-backlog/memory caveats (Netdata) are a reminder that this is operational state, not free.

**Caveats / uncertainty:**
- The "zero data loss" phrasing is aspirational. Redis with default config can lose up to ~1s of writes on crash (AOF `everysec`); `appendfsync always` closes that gap at a throughput cost. So Redis-buffering reduces the loss window from "the entire message" to "sub-second of tokens," but is not literally zero unless you also make the final DB flush idempotent and replay-on-restart. Treat the goal as "no loss of a *completed* generation, and at most a sub-second tail of an in-flight one."
- Most published examples use WebSockets; this codebase uses Kafka → gateway SSE, so the "consumer pushes to client" half is partly already solved by Kafka. That changes the cost/benefit (see Synthesis).

**Sources:**
- [Streaming LLM Responses (Redis blog)](https://redis.io/blog/streaming-llm-responses/)
- [Stream LLM Output to Browser with Redis Streams (Redis tutorial)](https://redis.io/tutorials/howtos/solutions/streams/streaming-llm-output/)
- [How to Build LLM Streams That Survive Reconnects, Refreshes, and Crashes (Upstash)](https://upstash.com/blog/resumable-llm-streams)
- [Resume tokens and last-event IDs for LLM streaming (dev.to / Ably)](https://dev.to/ablyblog/resume-tokens-and-last-event-ids-for-llm-streaming-how-they-work-what-they-cost-to-build-4l7e)
- [Redis replication backlog overflow (Netdata)](https://www.netdata.cloud/guides/redis/redis-replication-backlog-overflow/)

## Synthesis
<!-- research-investigator: options table, recommendation, refactor strategy -->

**Framing.** The topic conflates two distinct goals that the code (and the web prior art) show should be decided separately:
- **G1 — Durable assistant write (crash-recovery of the final message).** Today this is the real gap: in *every* failure mode the assistant row is all-or-nothing and biased toward nothing (BE Q2). This is the high-value, low-cost win.
- **G2 — Resume/replay to a reconnecting client.** Genuinely needs a Redis-Streams-style append log + last-event-id. Higher cost; the codebase has no client-resume mechanism at all today, and FE is out of scope for this epic.

A second, cheaper bug surfaced independently: **no idempotency on the write + Kafka at-least-once crash-redelivery** (BE Q3) means a crash today can *also* produce a **duplicate** assistant/user row on retry. Any durability design must fix idempotency first or it makes duplication worse.

### Options

| Option | Pros | Cons | Effort |
|---|---|---|---|
| **A. Status quo (in-memory buffer, single write on `complete`)** | Zero infra; simplest | Crash/timeout/kill/Kafka-publish-fail mid-stream loses the *entire* assistant message; DB-write failure after full stream = answer shown, zero row; no resume; duplicate-on-redelivery | none |
| **B. Idempotency-only (no Redis): stable run/message id + idempotent write** | Eliminates duplicate-row risk from Kafka redelivery; tiny; no new infra; prerequisite for everything else | Does **not** by itself save a lost in-flight message (a crash still loses the buffer); no resume | XS (unique index migration + upsert) |
| **C. Redis Stream buffer + recovery flush (G1)** — `XADD` each chunk to `stream:run:{conversationId}:{runId}`, idempotent flush to DB on `complete`, sweeper flushes orphaned streams on restart | Reduces loss window from "whole message" to sub-second tail; survives process crash and DB-write-failure (replay from Redis); reuses the single Kafka-bridge chokepoint; matches industry prior art | New `libs/redis` + ioredis dep + Redis in docker-compose; operational state w/ TTL; "zero loss" only with `appendfsync always`; needs B underneath | M |
| **D. C + client resume/replay (G2)** — persist last-event-id, replay-after-cursor on reconnect | Full "reconstruct or resume" UX; survives client disconnect/refresh mid-stream | Requires gateway SSE + FE changes (out of scope this epic); most complex; Kafka fan-out already partly covers delivery, so marginal benefit for the added cost | L |
| **E. Transactional outbox / WAL instead of Redis** | DB is single source of truth; no second datastore | Outbox is for *publishing* committed rows reliably, not for buffering *uncommitted* in-flight tokens — wrong tool here; per-chunk WAL to Postgres = heavy write amplification on hot path | M–L, poor fit |

### Recommendation

**Adopt B now, then C. Defer D.** Concretely: **B (idempotent write) is a prerequisite and a standalone bug-fix** — do it first and independently. Then layer **C (Redis Stream buffer + restart-time recovery flush)** to close G1, hooked at the single Kafka-bridge chokepoint so it covers all lanes with no change to `ai.service.ts`. **Do not** persist every chunk to Postgres (Option E / per-chunk DB write) — that is write amplification on the hottest path and the prior art universally keeps the DB write once-on-complete. **Defer D (client resume)** to a separate epic that includes FE, since this epic scopes FE out and Kafka fan-out already handles live delivery.

Rationale: most of the actual "data loss" pain (BE Q2) is the **failed/lost final write**, which B+C fix cheaply. True client-resume (D) is the expensive part and is where the topic's "SSE buffer each chunk" framing over-reaches relative to current need.

### Refactor strategy (ordered, grounded in real paths)

1. **(B) Idempotency foundation — no Redis.**
   - Mint a stable `runId` once at the AI_REQUEST boundary (`ai-platform/apps/ai-service/src/ai/ai.module.ts:84-108`, where `conversationId` is resolved) and thread it into `processMessage`/`streamAiResponse`. Note `runId` exists today only in `runChatFlow` (`ai.service.ts:276`) — move/duplicate its minting up so all lanes share one.
   - Add an idempotency key to the assistant write: extend `Message` with a nullable unique `runId` (or `clientMsgId`) in `libs/database/prisma/schema.prisma` (~`:81-89`); migrate. **Watch the known Prisma-drift trap** (raw trgm/hnsw indexes get dropped by `migrate dev` — see project memory) when generating this migration.
   - Change `ConversationService.saveMessage` (`conversation.service.ts:51-63`) from bare `create` to an upsert keyed on `runId` so a redelivered run cannot double-insert. Also fix the no-`conversationId` chat gap (`ai.service.ts:336`) so the user turn is always durable.

2. **(C) `libs/redis` lib — mirror `libs/kafka`.**
   - Scaffold `libs/redis/src/lib/{redis.module.ts, redis.constants.ts, redis.service.ts}` + barrel, modeled on `libs/kafka` (`RedisModule.forRoot({ url })` global `DynamicModule`, `RedisService` wrapping ioredis with `OnModuleInit`/`OnModuleDestroy` connect/disconnect — same shape as `KafkaProducerService:15-40`). **Check `nx.json` before adding the lib** (per `ai-platform/CLAUDE.md`), add `ioredis` to `package.json` (currently not a direct dep), and add a `redis:` service to `docker-compose.yml` (currently postgres+kafka only).

3. **(C) Buffer write at the single chokepoint.**
   - In `AiModule.streamAiResponse` (`ai.module.ts:148-245`): on each `next` (`:192-204`) `XADD stream:run:{conversationId}:{runId}` the chunk; set a short TTL on the stream key. This one site already sees every chunk of every lane and owns the run lifecycle — no `ai.service.ts` edits needed.

4. **(C) Flush + cleanup on `complete`/`error`.**
   - On `complete` (`ai.module.ts:205-219`): the idempotent `persistAssistantMessage` already ran in-service; after it succeeds, `DEL` the Redis stream. On the **DB-write-failure** path (BE Q2b/d), leave the stream intact so the recovery sweeper can retry.

5. **(C) Restart recovery sweeper.**
   - On `onModuleInit` (`ai.module.ts:84`), scan for orphaned `stream:run:*` keys whose flush flag is unset, reassemble text via `XRANGE`, and call the idempotent `saveMessage`. The unique `runId` from step 1 makes this safe to run after a crash even if the original process had partially committed.

6. **(Defer / separate FE epic — D)** Expose last-event-id replay through the gateway SSE (`ai.controller.ts`) + FE reconnect. Out of scope here.

## Investigator — Summary
<!-- research-investigator: confidence, risks, next actions -->

**Confidence: High** on the current-state analysis (BE findings are file-line precise and match my own scan) and on the recommended shape (it mirrors well-established Redis/Upstash prior art). **Medium** on exact effort sizing for `libs/redis` + infra and on whether resume (D) is actually wanted — that needs a product call.

**Key risks:**
- **Idempotency must land first (B).** Adding Redis recovery without a unique write key would *worsen* duplication under Kafka crash-redelivery (BE Q3). Sequencing matters.
- **"Zero data loss" is not literal.** Redis default `appendfsync everysec` can lose ~1s of tokens on a Redis crash; full zero requires `appendfsync always` (throughput cost). Set expectations: B+C guarantee no loss of a *completed* generation and at most a sub-second tail of an in-flight one.
- **Prisma migration trap** (project memory): the `Message`-schema change risks `migrate dev` silently dropping the raw trgm/hnsw indexes — inspect the generated migration.
- **Scope creep into FE.** The topic's "SSE buffer each chunk / resume" wording pulls toward Option D, which this epic scopes FE out of. Keep D as a separate epic.
- **Operational footprint.** New Redis dependency, docker-compose service, TTL/cleanup discipline, and a restart sweeper — all net-new operational surface for a service that currently has none.

**Still needs validation:**
- Product decision: is **G1 (durable final write)** sufficient, or is **G2 (client resume)** actually required? Recommendation assumes G1 now, G2 deferred.
- Whether `runId` should be minted client-side (true end-to-end idempotency across gateway→Kafka) or server-side at the AI_REQUEST boundary (simpler, covers the crash-redelivery case). Leaning server-side.
- Confirm Kafka `autoCommit` interval / actual redelivery behavior on a real crash (BE inferred default-on; verify in `libs/kafka/src/lib/kafka-consumer.service.ts`).

**Concrete next actions:**
1. Run `/team-lead:spec` (or `/team-lead:plan`) for **Option B** as a standalone `repo: be` bug-fix epic (idempotent assistant write + stable `runId` + close the no-`conversationId` user-turn gap). Highest value/lowest cost; unblocks the rest.
2. Then a `repo: be` epic for **Option C** (`libs/redis` scaffold mirroring `libs/kafka`, docker-compose `redis:` service, buffer at `ai.module.ts:192-219`, restart sweeper at `:84`).
3. Open a **separate FE-inclusive epic** for **Option D** (resume/last-event-id) only if product wants client-resume.
