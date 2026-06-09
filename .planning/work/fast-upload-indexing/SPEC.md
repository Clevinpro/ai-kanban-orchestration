# SPEC: Fast Upload — Async Indexing + Windowed Context

**Epic:** `fast-upload-indexing`
**Created:** 2026-06-09
**Status:** Ready for Planning
**Repo:** `be` (ai-platform backend only)
**Builds on:** `contextual-retrieval` (per-chunk LLM context, `CONTEXTUAL_RETRIEVAL_ENABLED`, `INDEX_RECIPE_VERSION`), `multilingual-embeddings` (1024-dim fingerprint)

---

## Problem

Contextual retrieval (epic `contextual-retrieval`) put a **per-chunk LLM call inside the
synchronous upload request**, and each call ships the **whole document** in its prompt.
Observed in production-local:

- `POST /api/documents/upload` took **18803 ms** for a 4-chunk doc.
- A 12 KB doc (`STACK.md`) → **28 chunks** → 28 LLM calls each carrying the full 12 KB → the
  api-gateway `fetch` proxy gave up and the request surfaced as **500** (gateway threw on the
  rejected fetch; ai-service had not failed, it was still grinding).
- Even a **light** 4.7 KB `.txt` (`Документація до кастомних HTML-тегів`) is slow: cost scales
  with **chunk count**, not bytes — ~10–14 numbered sections → ~10–14 whole-doc LLM calls.

Three root causes, all at index time:

1. **Indexing is on the request path.** Upload awaits context-gen + embed + insert before
   responding. With a local 35B chat model this is tens of seconds to minutes.
2. **Whole-document prompt per chunk.** Context cost is `O(chunks × documentLength)` — quadratic
   in document size. Almost all of that prompt is irrelevant to the one chunk.
3. **Raw content interpolated into a tag-delimited prompt.** Docs literally full of `<highlight>`,
   `<note>`, `<warning>`, or a stray `</document>` perturb the `<document>…</document>` /
   `<chunk>…</chunk>` prompt (the WARNING flagged in `contextual-retrieval` TASK-003 review).

Plus a latent gateway defect: the upload proxy uses bare `fetch` with **no timeout**, and a
rejected fetch surfaces as **500**, not a truthful **504**.

---

## Goal

Make upload return immediately and move indexing off the request path, cut context cost from
whole-document to a bounded window, and make the tag-prompt and the gateway proxy robust.

1. **Async indexing.** Upload validates + stores the document row + returns `202 Accepted` with
   `{ documentId, status: 'pending' }` immediately. Context-gen + embed + insert run in the
   background. A `status` column tracks `pending → indexing → ready | failed`.
2. **Windowed context prompt.** Replace the whole-document prompt with a bounded window
   (`CONTEXT_WINDOW_CHARS`, default e.g. 2000) around the chunk — its section plus neighbouring
   text — so cost is `O(chunks × window)`, not `O(chunks × documentLength)`.
3. **Prompt-safe content.** Sanitize interpolated chunk/window text so tag-shaped content cannot
   break the prompt delimiters; bound the per-chunk LLM call with an explicit timeout so a hung
   provider falls back instead of hanging the whole index.
4. **Honest gateway proxy.** Give the upload proxy an explicit timeout and map abort/timeout to
   **504**, non-2xx downstream to **502**; relay the `202` + body through unchanged.
5. **Recipe bump.** Windowed prompt changes stored chunk content, so bump `INDEX_RECIPE_VERSION`
   to auto-reindex the vault into the new recipe on next boot.

Crash recovery is free: a doc left `pending`/no-chunks after a restart is re-indexed by the
existing `VaultSyncService` startup scan (`reason=no-chunks`).

No changes to `SearchService` SQL, RRF fusion, or the vector column.

---

## User Stories / Requirements

### US-01: Instant Upload Response
> As a user uploading a document, I want the request to return in well under a second with a
> document id and a `pending` status, instead of blocking for tens of seconds while the server
> calls an LLM per chunk — so the UI is responsive and never times out.

### US-02: Background Indexing With Visible Status
> As a user, after upload I want to poll the document's status (`pending → indexing → ready` or
> `failed`) so the UI can show progress and tell me when search will include the document.

### US-03: Cheap Context On Large Documents
> As an operator indexing a 12 KB / 28-chunk document, I want each chunk's context built from a
> bounded window around it, not the whole document re-sent 28 times, so indexing finishes in
> seconds and a local LLM is not flooded with redundant tokens.

### US-04: Tag-Heavy Documents Don't Break Context
> As an operator uploading a doc full of `<tag>` examples, I want that content escaped so it can't
> perturb the context prompt, and I want a per-chunk LLM timeout so one slow/looping generation
> falls back to heading-context instead of stalling the whole document.

### US-05: Truthful Gateway Errors
> As a developer, when the AI service is slow or down I want the gateway to return `504` (timeout)
> or `502` (downstream error) — not a misleading `500` — so I can tell apart "too slow" from
> "broken".

### US-06: Re-enable Contextual Retrieval Safely
> As an operator, once async indexing + windowing land, I want to turn `CONTEXTUAL_RETRIEVAL_ENABLED`
> back on without upload latency regressing, and I want the vault auto-reindexed into the new
> windowed recipe on next boot.

---

## Acceptance Criteria

### Async Indexing
- [ ] AC-01: `Document` gains a `status` column (`pending | indexing | ready | failed`, default `pending`) — migration + `schema.prisma`; nullable-safe for pre-existing rows (treated as `ready`)
- [ ] AC-02: `uploadDocument` is split: a fast path validates the file, stores the document row, and returns `{ documentId, status: 'pending' }`; the controller responds `202 Accepted` without awaiting indexing
- [ ] AC-03: Indexing (context-gen + embed + insert) runs in the background after the response is sent; on start it sets `status='indexing'`, on success `status='ready'`, on unrecoverable failure `status='failed'` (logged at `error`)
- [ ] AC-04: Background indexing is bounded by a configurable in-process concurrency limit so simultaneous uploads / a full reindex do not flood the LLM or DB
- [ ] AC-05: `GET /api/documents/:id/status` returns `{ documentId, status, chunksCount }`; unknown id → 404
- [ ] AC-06: Crash recovery — a document left `pending`/`indexing` with no chunks is re-indexed by the existing `VaultSyncService` startup scan; the scan sets/honours `status` (no orphaned `pending` rows after boot)

### Windowed Context
- [ ] AC-07: The context prompt no longer embeds the whole document; it embeds a bounded window of `CONTEXT_WINDOW_CHARS` (env, default 2000) centred on the chunk (chunk section + surrounding text, clamped to document bounds)
- [ ] AC-08: When the whole document already fits within `CONTEXT_WINDOW_CHARS`, behaviour is unchanged (whole doc used); larger docs use the window — verified by a token/char-budget assertion
- [ ] AC-09: Context cost is `O(chunks × window)` not `O(chunks × documentLength)` — a test asserts prompt length is bounded regardless of document size

### Prompt-Safe Content + Timeout
- [ ] AC-10: Chunk/window text interpolated into the prompt is sanitized so it cannot close or inject the `<document>`/`<chunk>` delimiters (escape `<`/`>` in interpolated content, or use a non-tag delimiter); the document's real text meaning is preserved for the LLM
- [ ] AC-11: Each per-chunk `generateContext` call is bounded by an explicit timeout (`CONTEXT_LLM_TIMEOUT_MS`, env, default e.g. 15000) via rxjs `timeout()`; on timeout the chunk falls back to heading-context (logged `warn`), the document is not failed by one slow chunk
- [ ] AC-12: The existing per-chunk try/catch fallback (AC-05 of `contextual-retrieval`) is preserved — escape + timeout are additive, not a regression

### Gateway Robustness
- [ ] AC-13: The api-gateway upload proxy (`documents.controller.ts`) sets an explicit request timeout (`UPLOAD_PROXY_TIMEOUT_MS`, env) on its `fetch` via `AbortController`
- [ ] AC-14: A proxy timeout/abort maps to **504** (`GatewayTimeoutException`); a non-2xx downstream maps to **502** (existing `BadGatewayException`); a successful `202` + JSON body is relayed through unchanged
- [ ] AC-15: The gateway relays the new async response shape (`{ documentId, status }`) and the `202` status code to the caller

### Recipe + Config + Tests
- [ ] AC-16: `INDEX_RECIPE_VERSION` is bumped (windowed prompt changes stored content) so first boot after deploy auto-truncates chunks + reindexes via the existing `(provider, model, recipe_version)` fingerprint
- [ ] AC-17: `.env.example` documents `CONTEXT_WINDOW_CHARS`, `CONTEXT_LLM_TIMEOUT_MS`, `UPLOAD_PROXY_TIMEOUT_MS`, the async-upload behaviour (`202` + status polling), and that `CONTEXTUAL_RETRIEVAL_ENABLED` can be returned to `true` after this epic
- [ ] AC-18: `nx test ai-service` and `nx test api-gateway` pass; unit tests cover: async upload returns `202` without awaiting indexing, status transitions (`pending→indexing→ready`, and `→failed`), status endpoint, windowed-prompt char bound, tag-content escaping, LLM-timeout fallback, gateway `504` on abort + `502` on downstream error

---

## Technical Design

### Files touched

```
ai-platform/apps/ai-service/src/
├── document/document.service.ts        (split register/index, background runner, window, escape, timeout, status)
├── document/document.controller.ts     (202 + status endpoint)
└── vault/vault-sync.service.ts         (startup scan honours/sets status — crash recovery)

ai-platform/apps/api-gateway/src/
└── documents/documents.controller.ts   (AbortController timeout → 504/502, relay 202)

ai-platform/libs/database/prisma/
├── schema.prisma                        (Document.status)
└── migrations/<ts>_add_document_status/ (NEW)

ai-platform/apps/ai-service/src/embeddings/embeddings.constants.ts  (bump INDEX_RECIPE_VERSION)
ai-platform/.env.example                 (new knobs + async notes)
```

### Async upload flow

```
POST /upload
  → validate file + store Document row (status='pending')
  → RETURN 202 { documentId, status:'pending' }        // request ends here
  → (background, bounded concurrency):
        status='indexing'
        chunks = splitIntoChunks(doc)
        for each chunk (bounded): context = LLM(windowedPrompt(doc, chunk))   // escaped, timed out
        embeddings = generateBatch(contextualized)
        insert chunks
        status='ready'   (on throw → status='failed', logged error)
```

Background execution: an in-process runner (e.g. a small bounded queue / `mapWithConcurrency`
reused from `contextual-retrieval`) is sufficient — the `VaultSyncService` startup scan is the
durability net for crashes (re-indexes `no-chunks` docs on boot). A durable Kafka pipeline is
**out of scope** (see below); the seam should not preclude it.

### Windowed prompt

```
window = CONTEXT_WINDOW_CHARS (default 2000)
if doc.length <= window:  promptDoc = doc                      // unchanged for small docs
else:                     promptDoc = clamp(doc, around=chunk.offset, size=window)
context = LLM(prompt(escape(promptDoc), escape(chunk.body)))
```

`escape()` neutralizes `<`/`>` in interpolated content (or switch delimiters to a non-tag token)
so tag-shaped documents cannot break `<document>`/`<chunk>`.

### Per-chunk timeout (additive to existing fallback)

```typescript
import { lastValueFrom, toArray, timeout } from 'rxjs';
const parts = await lastValueFrom(
  provider.chat(prompt).pipe(timeout(CONTEXT_LLM_TIMEOUT_MS), toArray()),
);
// on TimeoutError → caught by existing try/catch → headingFallback (warn)
```

### Gateway proxy timeout

```typescript
const ac = new AbortController();
const t = setTimeout(() => ac.abort(), UPLOAD_PROXY_TIMEOUT_MS);
try {
  const res = await fetch(url, { method:'POST', body: formData, signal: ac.signal });
  if (!res.ok) throw new BadGatewayException(...);      // 502
  return await res.json();                               // relay 202 body
} catch (e) {
  if (e.name === 'AbortError') throw new GatewayTimeoutException(...);  // 504
  throw e;
} finally { clearTimeout(t); }
```

### .env.example additions

```bash
# Indexing runs in the background after upload — POST /documents/upload returns
# 202 { documentId, status:'pending' }. Poll GET /documents/:id/status.
CONTEXT_WINDOW_CHARS=2000          # context prompt window per chunk (was: whole document)
CONTEXT_LLM_TIMEOUT_MS=15000       # per-chunk context LLM timeout → heading fallback
UPLOAD_PROXY_TIMEOUT_MS=15000      # api-gateway upload proxy timeout → 504
# After this epic, contextual retrieval is safe to re-enable:
# CONTEXTUAL_RETRIEVAL_ENABLED=true
```

---

## Task Breakdown (for `/team-lead:plan`)

| # | Title | Repo | Complexity |
|---|-------|------|------------|
| 1 | `Document.status` column (`pending\|indexing\|ready\|failed`) — migration + `schema.prisma`, nullable-safe | be | 2 |
| 2 | Async upload: split register/index, return `202 {documentId,status}`, background runner with bounded concurrency, status transitions + `error` on failure | be | 5 |
| 3 | `GET /documents/:id/status` endpoint + startup-scan crash recovery (no orphaned `pending`) | be | 3 |
| 4 | Windowed context prompt (`CONTEXT_WINDOW_CHARS`), char-budget bound, small-doc unchanged | be | 4 |
| 5 | Prompt-safe content (escape `<`/`>` / non-tag delimiter) + per-chunk `timeout()` fallback (`CONTEXT_LLM_TIMEOUT_MS`) | be | 3 |
| 6 | Gateway upload proxy: `AbortController` timeout → 504, downstream non-2xx → 502, relay 202 (`UPLOAD_PROXY_TIMEOUT_MS`) | be | 3 |
| 7 | Bump `INDEX_RECIPE_VERSION` + `.env.example` docs (window, timeouts, async, re-enable note) | be | 2 |
| 8 | Tests: 202-without-await, status transitions + endpoint, window char-bound, tag escaping, LLM-timeout fallback, gateway 504/502 | be | 3 |

> Order: status column → async path → status endpoint/recovery → window → escape/timeout →
> gateway → recipe bump (last, so one auto-reindex captures the windowed recipe) → tests.

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Durable Kafka indexing pipeline (retry, DLQ, multi-instance) | In-process runner + startup-scan recovery is enough for the current single-instance dev tool; revisit if scaled. Seam must not preclude it |
| FE upload/status polling UI | Separate `fe` epic — this epic ships the `202` + status endpoint contract only |
| True embedding-distance semantic chunking | Already out of scope in `contextual-retrieval`; unchanged |
| Re-ranking / query expansion | Separate epics |
| Prompt caching of the window for the Claude provider | Optional later optimization; local LLMs don't support it |
| Changes to `SearchService` SQL / RRF / vector column | Unchanged |

---

## Constraints

- `be`-only epic. No `fe` / `kanban` files. Never combine repos in one task.
- Upload must respond **before** indexing runs — returning `202` then doing the work synchronously
  in the same await chain is a bug.
- The window must be **symmetric in meaning**: it changes only the *context* prompt input, not the
  embedded chunk body shape (`"{context}\n\n{chunkBody}"` is unchanged) — so search stays compatible.
- Escaping must not alter the text the LLM reasons over so much that context quality drops; prefer
  delimiter-swap or minimal `<`/`>` escaping over heavy stripping.
- Bumping `INDEX_RECIPE_VERSION` truncates all chunks → one full vault reindex on next boot
  (one-time, expected) — and that reindex now runs in the background path.
- `CONTEXTUAL_RETRIEVAL_ENABLED` stays `false` in `.env` until this epic lands; flip to `true`
  only after AC-18 passes.

---

## Success Criteria

1. `POST /documents/upload` returns `202 { documentId, status:'pending' }` in well under 1 s, for
   both the 28-chunk `STACK.md` and the tag-heavy `.txt` — no 500/timeout.
2. Polling `GET /documents/:id/status` walks `pending → indexing → ready`; a forced failure lands
   `failed` and the upload still returned `202`.
3. A 12 KB document's context prompts are each bounded by `CONTEXT_WINDOW_CHARS`, not 12 KB×28.
4. A document full of `<tag>` examples indexes without prompt breakage; one slow chunk times out to
   heading-context, the rest index normally.
5. With AI service stopped, the gateway returns `504` (timeout) / `502` (down) — never `500`.
6. Bumping `INDEX_RECIPE_VERSION` auto-reindexes the vault on boot via the background path.
7. `nx test ai-service` and `nx test api-gateway` pass; async, status, window, escape, timeout, and
   gateway paths covered.
