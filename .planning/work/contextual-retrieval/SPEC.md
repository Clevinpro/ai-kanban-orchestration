# SPEC: Contextual Retrieval + Index-Time Quality

**Epic:** `contextual-retrieval`
**Created:** 2026-06-09
**Status:** Ready for Planning
**Repo:** `be` (ai-platform backend only)
**Depends on:** `multilingual-embeddings` (MUST land first — bge-m3 1024-dim + the `(provider, model)` re-index fingerprint this epic extends)
**Builds on:** `hybrid-rag-search` (vector + trigram + RRF), `fast-embeddings` (provider abstraction)

---

## Problem

Even with a good multilingual embedding model, retrieval quality is capped by how
chunks are **created**. Today's index path (`document.service.ts`) has four
weaknesses, all at vector-creation time:

1. **No real per-chunk context.** The only "context" added before embedding is the
   bare heading (`Section: {heading}`). A chunk pulled out of its document loses
   what it refers to ("this setting", "the above error") → its vector is
   ambiguous → semantic recall suffers.
2. **Chunking degrades on unstructured input.** Heading/numbered detection only
   fires for markdown. A `.txt` file or a long heading-less prose section becomes
   one giant block that is hard-split at 1200 chars on **any** whitespace —
   cutting mid-sentence.
3. **Lowercasing before embedding.** Both index and query lowercase the text
   before embedding (`document.service.ts:60,131`, `query-normalizer.ts:19`).
   Symmetric, so not broken — but bge-m3 is trained on cased natural text;
   lowercasing pushes both sides out of distribution and strips proper-noun /
   acronym / sentence-boundary signal.
4. **`Section:` English literal** is prepended to every chunk regardless of corpus
   language — a constant foreign token in every Ukrainian vector.

---

## Goal

Raise embedding quality at index time, in one re-index pass, via:

1. **Contextual Retrieval** (Anthropic pattern): an LLM writes a 1-2 sentence
   context that situates each chunk inside its whole document; that context is
   prepended to the chunk for **both** embedding and lexical storage. Reported
   −35–49% retrieval failures.
2. **Boundary-aware chunking**: paragraph-based blocking for unstructured / plain
   text; oversized splits prefer paragraph → sentence → word boundaries.
3. **Remove lowercasing** on both index and query sides (kept symmetric).
4. **Drop the `Section:` English literal** — keep the heading as plain context, no
   foreign keyword.
5. **Recipe-version fingerprint**: a bumpable `INDEX_RECIPE_VERSION` joins the
   `(provider, model)` fingerprint so any future index-strategy change
   auto-truncates + re-indexes — same machinery, generalized.

Batch embedding is folded in so the (now heavier) re-index stays fast.

No changes to `SearchService` SQL, RRF fusion, or the vector column.

---

## User Stories / Requirements

### US-01: Context-Aware Chunks
> As a user, I want a chunk that says "this returns an error" to still be findable
> when I ask about the specific feature it belongs to, because the chunk's vector
> carries the document context, not just its raw sentence.

### US-02: Good Chunks From Plain Text
> As an operator uploading a `.txt` or a long heading-less note, I want it split on
> paragraph / sentence boundaries, not chopped mid-sentence at a character count.

### US-03: Cased, Native-Language Embeddings
> As a user querying in Ukrainian, I want embeddings built from the original cased
> text with no injected English keywords, so the vectors match how I actually write.

### US-04: Auto Re-index on Recipe Change
> As an operator, when the chunking / context strategy changes (a new
> `INDEX_RECIPE_VERSION`), I want chunks truncated and the vault re-indexed
> automatically on next boot — the same way a model change already does.

### US-05: Contextualization Is Optional and Safe
> As an operator, I want to disable contextual retrieval via env (it costs an LLM
> call per chunk at index time), and if context generation fails for a chunk, I
> want that chunk indexed without context rather than the whole upload failing.

### US-06: Step-Traceable Indexing
> As a developer debugging indexing, I want every stage of the upload/reindex
> operation logged as a numbered STEP with its passed parameters, so I can follow
> one document through the whole pipeline and see exactly where it slows or fails.

---

## Acceptance Criteria

### Contextual Retrieval
- [ ] AC-01: `DocumentService` injects `AiProviderFactory`; for each chunk it generates a ≤2-sentence context via the LLM, prompted with the **whole document** + the chunk, instructed to answer **in the document's language** and to only situate the chunk (no new facts)
- [ ] AC-02: `IAIProvider.chat()` returns `Observable<string>` (streaming) — context generation **accumulates the full stream** into one string (e.g. `lastValueFrom(chat(...).pipe(toArray()))` joined) before use
- [ ] AC-03: The generated context is prepended to the chunk: stored `content` **and** the embedded text both become `"{context}\n\n{chunkBody}"` — so the trigram lexical index benefits too
- [ ] AC-04: Env flag `CONTEXTUAL_RETRIEVAL_ENABLED` (default `true`) gates the feature; when `false`, the chunk is embedded/stored without an LLM call (heading-as-context only)
- [ ] AC-05: If context generation throws or times out for a chunk, the chunk is indexed **without** context (logged at `warn`); the document upload/reindex does not fail
- [ ] AC-06: Context generation respects a small concurrency limit (configurable, default e.g. 4) so a local LLM is not overwhelmed during a full vault reindex

### Boundary-Aware Chunking
- [ ] AC-07: Text with **no** markdown headings / numbered items is blocked by paragraph (blank-line `\n\n` boundaries), then packed up to `MAX_CHUNK_SIZE` — not treated as one monolithic block
- [ ] AC-08: Oversized-block splitting prefers boundaries in order **paragraph → sentence (`.`/`!`/`?`/`…` + space) → word**, instead of `lastIndexOf(' ')` only; overlap is preserved
- [ ] AC-09: Existing markdown structural chunking (headings, numbered lists, coalesce undersized) still passes its current tests — this is additive for the unstructured path

### Casing & Literal
- [ ] AC-10: `.toLowerCase()` removed from the embedding input on **both** the index side (`document.service.ts`) and the query semantic side (`query-normalizer.ts`); `QueryNormalizer` keeps NFC-normalize + trim; lexical path unchanged (already case-as-is)
- [ ] AC-11: The `Section: {heading}` literal is replaced — the heading is carried as plain leading context (`"{heading}\n{body}"`) with no English keyword; documents with no heading are unaffected

### Recipe-Version Fingerprint (extends multilingual-embeddings)
- [ ] AC-12: `embedding_provider_state` gains a `recipe_version` column (migration + `schema.prisma`); detection in `vault-sync.service.ts` compares `(provider, model, recipe_version)` and truncates-chunks + reindexes when **any** differs
- [ ] AC-13: A single `INDEX_RECIPE_VERSION` constant (in `shared` or an index constants file) is the source of truth, bumped by this epic so first boot after deploy auto-reindexes into the new recipe
- [ ] AC-14: `upsert`/`read` stored-state persist and compare all three fields

### Stepped Operation Logging
- [ ] AC-15: Every stage of the index operation (both `uploadDocument` and `reindexDocument`) is logged as `STEP {n}/{total}: {label}` with passed parameters in the LoggerService `meta` arg (3rd param — `log(message, context, meta)`), not string-concatenated
- [ ] AC-16: Where a log call **already exists** in `document.service.ts` (lines ~45, 48, 51, 56, 75, 88, 99, 107, 125), only the `STEP {n}/{total}:` prefix + a `meta` object are added — the existing message text and `'DocumentService'` context are kept
- [ ] AC-17: Each step's `meta` carries a per-operation correlation id (`documentId`, plus an `operation: 'upload' | 'reindex'` tag) so concurrent operations' steps stay filterable; per-chunk steps also carry `chunkIndex` + `chunkTotal`
- [ ] AC-18: Logged parameters per step: file `title`/`ext` + text length (read); `chunkCount` (split); `documentId` (store row); `chunkIndex`/`chunkTotal` + `section` + content length + LLM `provider`/`model` (context gen); embedding `provider`/`model` + `batchSize` (embed); inserted `count` (insert); `chunksCount` + `durationMs` (done)
- [ ] AC-19: Parameters log **lengths/counts, never raw chunk or file content** (no large or sensitive text in logs); high-level steps at `log` (info), per-chunk detail at `debug` — matching existing levels

### Batch + Tests
- [ ] AC-20: Upload + reindex embed chunks via `generateBatch` (batched, not one-by-one) where contextualization is already complete; throughput improved, behavior otherwise identical
- [ ] AC-21: `.env.example` documents `CONTEXTUAL_RETRIEVAL_ENABLED`, the concurrency knob, that `AI_PROVIDER` (the chat LLM) is used for context, and the index-latency tradeoff
- [ ] AC-22: `nx test ai-service` passes; unit tests cover: paragraph/sentence chunking on plain text, no-lowercase embedding input, context-prepend shape, graceful fallback on LLM failure, `(provider, model, recipe_version)` fingerprint firing on recipe-only change, batch embedding, and that each pipeline step logs its `STEP n/total` + expected `meta` keys

---

## Technical Design

### Files touched (all `ai-platform/`)

```
apps/ai-service/src/
├── document/document.service.ts        (context gen + chunking + no-lowercase + batch)
├── search/query-normalizer.ts          (drop toLowerCase from semantic)
├── vault/vault-sync.service.ts         (fingerprint += recipe_version)
└── (index constants: EXPECTED_EMBEDDING_DIM lives in embeddings.constants.ts;
    add INDEX_RECIPE_VERSION nearby or in shared)

libs/database/prisma/
├── schema.prisma                       (+ recipe_version column)
└── migrations/<ts>_add_recipe_version/ (NEW)

.env.example                            (contextual-retrieval flags + notes)
```

### Contextual Retrieval flow (per chunk)

```
splitIntoChunks(doc) → for each chunk:
  if CONTEXTUAL_RETRIEVAL_ENABLED:
    context = LLM.chat(prompt(wholeDoc, chunk))   // streamed → accumulated
  else:
    context = heading (or "")
  contextualized = context ? `${context}\n\n${chunk.body}` : chunk.body
  → store contextualized as content
  → embed contextualized (NO toLowerCase)
```

**Prompt shape** (kept short, language-faithful):

```
Here is a document:
<document>{wholeDoc}</document>

Here is a chunk from it:
<chunk>{chunk.body}</chunk>

Write 1-2 short sentences, in the same language as the document, that situate this
chunk within the document so it can be understood on its own. Add no new facts.
Output only the context sentences.
```

**Streaming accumulation** — `chat()` is `Observable<string>`:

```typescript
import { lastValueFrom, toArray } from 'rxjs';
const parts = await lastValueFrom(provider.chat(prompt).pipe(toArray()));
const context = parts.join('').trim();
```

**Cost / safety** — one LLM call per chunk including the full doc in the prompt is
heavy. Mitigations baked into ACs: env flag to disable, bounded concurrency,
per-chunk try/catch fallback. (Prompt caching of the document applies only to the
Claude provider; local LM Studio / Ollama pay compute each call — index-time,
one-off.)

### Boundary-aware chunking

Current oversized split (`document.service.ts:247-266`) cuts at `lastIndexOf(' ')`.
Replace the boundary search with a preference cascade and add a plain-text path:

- **Unstructured input** (no heading/numbered match in the whole doc): split into
  paragraphs on `\n\n`, then pack paragraphs into chunks up to `MAX`, carrying the
  existing coalesce/overlap logic.
- **Oversized split boundary**: try last paragraph break before `end`, else last
  sentence terminator (`. ! ? …` followed by whitespace), else last space, else
  hard cut. Overlap unchanged.

True embedding-distance semantic chunking is **out of scope** (see below) — this is
the pragmatic boundary-aware version.

### Recipe-version fingerprint (generalize multilingual-embeddings)

`multilingual-embeddings` makes the fingerprint `(provider, model)`. This epic adds
the index recipe:

```typescript
// detection
const active = (process.env['EMBEDDING_PROVIDER'] ?? 'ollama').toLowerCase();
const model  = resolveActiveModel(active);
const recipe = INDEX_RECIPE_VERSION;          // bumped constant

const changed = stored && (
  stored.provider !== active ||
  stored.model    !== model  ||
  stored.recipeVersion !== recipe
);
// changed → TRUNCATE chunks + DELETE vault docs → startup scan reindexes
```

```sql
ALTER TABLE "embedding_provider_state" ADD COLUMN "recipe_version" TEXT;
```

Bumping `INDEX_RECIPE_VERSION` is how any future chunking/context change ships a
re-index — no bespoke migration each time.

### Stepped operation logging

The `LoggerService` already takes structured fields:
`log(message, context?, meta?: Record<string, unknown>)` (pino). Use the `meta`
arg for parameters — do **not** concatenate params into the message.

Canonical step sequence (same numbering for `upload`; `reindex` skips read/store):

| STEP | Label | `meta` params |
|------|-------|---------------|
| 1/7 | validate file | `documentId?, operation, filePath, ext` |
| 2/7 | read file | `documentId, operation, title, textLength` |
| 3/7 | split into chunks | `documentId, operation, textLength, chunkCount` |
| 4/7 | store document row | `documentId, operation, title` |
| 5/7 | generate context (per chunk) | `documentId, chunkIndex, chunkTotal, section, contentLength, llmProvider, llmModel` |
| 6/7 | embed chunk(s) | `documentId, embedProvider, embedModel, batchSize` |
| 7/7 | insert + done | `documentId, chunksCount, durationMs` |

Helper to keep call sites clean and numbering consistent:

```typescript
private logStep(
  n: number,
  total: number,
  label: string,
  meta: Record<string, unknown>,
  level: 'log' | 'debug' = 'log',
): void {
  this.logger[level](`STEP ${n}/${total}: ${label}`, 'DocumentService', meta);
}
```

Existing calls get the prefix + meta only; e.g. `document.service.ts:48`

```typescript
// before
this.logger.log(`Split into ${chunks.length} chunk(s), storing document`, 'DocumentService');
// after
this.logStep(3, 7, 'split into chunks', { documentId, operation, textLength: text.length, chunkCount: chunks.length });
```

Rules: log lengths/counts only (never raw content); high-level steps at `log`,
per-chunk (STEP 5/6) detail at `debug`; every step carries `documentId` so one
operation is greppable end to end.

### .env.example additions

```bash
# Contextual Retrieval — an LLM (AI_PROVIDER) writes a short context per chunk at
# index time. Improves recall; adds one LLM call per chunk during upload/reindex.
CONTEXTUAL_RETRIEVAL_ENABLED=true
CONTEXTUAL_RETRIEVAL_CONCURRENCY=4
```

---

## Task Breakdown (for `/team-lead:plan`)

| # | Title | Repo | Complexity |
|---|-------|------|------------|
| 1 | Boundary-aware chunking: paragraph blocking for unstructured text + paragraph→sentence→word split cascade; replace `Section:` literal with plain heading context; keep markdown tests green | be | 4 |
| 2 | Remove `.toLowerCase()` from embedding input on index (`document.service.ts`) and query semantic (`query-normalizer.ts`); verify lexical path untouched | be | 2 |
| 3 | Contextual Retrieval: inject `AiProviderFactory`, per-chunk context via streamed `chat()` accumulation, language-faithful prompt, `CONTEXTUAL_RETRIEVAL_ENABLED` flag, bounded concurrency, per-chunk graceful fallback | be | 5 |
| 4 | Batch embedding in upload + reindex (post-contextualization) via `generateBatch` | be | 3 |
| 5 | Stepped operation logging: `logStep(n, total, label, meta)` helper; add `STEP n/total` + `meta` params to every pipeline stage in `uploadDocument` + `reindexDocument`; upgrade existing log calls with step prefix; lengths-only, `documentId` correlation | be | 3 |
| 6 | Recipe-version fingerprint: `recipe_version` column (migration + schema), extend `(provider, model, recipe_version)` detection + persistence, add + bump `INDEX_RECIPE_VERSION`, `.env.example` notes | be | 3 |
| 7 | Tests: plain-text chunking, no-lowercase input, context-prepend shape, LLM-failure fallback, recipe fingerprint fires on version-only change, batch path, `STEP n/total` + `meta` keys per step | be | 3 |

> Order matters: chunking / casing / context / batch / logging land first; the
> recipe-version bump (task 6) is last so the single auto-reindex captures **all**
> new logic.

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| True embedding-distance semantic chunking | Heavy (embed every sentence, detect distance peaks); boundary-aware split captures most of the win cheaply. Future epic |
| Hierarchical / small-to-big retrieval (doc-summary + chunk levels) | Separate retrieval-shape change; this epic is chunk-level quality only |
| Re-ranking | Separate epic — precision layer, runs after retrieval |
| Query expansion / multi-query | Separate epic |
| Fine-tuned embeddings | Niche; not warranted yet |
| Prompt caching for local LLM context calls | LM Studio / Ollama don't support it; only the Claude path benefits, handled if/when used |
| Changes to `SearchService` SQL, RRF weights, vector column | Unchanged — context/chunking changes flow through the existing query path |

---

## Constraints

- **Depends on `multilingual-embeddings` being merged first** — this epic extends its `(provider, model)` fingerprint to add `recipe_version`. Do not start until that lands.
- Contextual retrieval uses the **chat** LLM (`AI_PROVIDER`), which is independent of `EMBEDDING_PROVIDER`; that provider must be reachable at index time or context falls back to none (per AC-05).
- `chat()` is streaming (`Observable<string>`) — context generation must fully accumulate the stream; partial/streamed handling is a bug.
- Context generation cost scales as chunks × document tokens. The env flag + concurrency limit + graceful fallback are mandatory, not optional polish.
- Removing `.toLowerCase()` must be done on **both** sides in the same epic; a one-sided change breaks cosine symmetry.
- The recipe bump truncates all chunks → one full vault reindex on next boot (one-time, expected).
- `be`-only epic. No `fe` / `kanban` files. Never combine repos in one task.

---

## Success Criteria

1. A chunk whose meaning depends on its document ("this returns an error") is retrieved by a query naming the feature it belongs to — context-carrying vectors restore that recall (manual check against a previously-failing query).
2. A plain `.txt` upload is split on paragraph/sentence boundaries — no mid-sentence cuts; markdown docs chunk as before.
3. Embedding input is original-cased with no `Section:` literal; index and query remain symmetric.
4. `CONTEXTUAL_RETRIEVAL_ENABLED=false` indexes with no LLM calls; a forced LLM failure indexes the chunk without context and logs a warning — upload still succeeds.
5. Bumping `INDEX_RECIPE_VERSION` on deploy auto-truncates chunks and reindexes the vault — no manual command.
6. Reindex with batching is not slower than the pre-change one-by-one path despite the added context step (for the `ENABLED=false` case).
7. `nx test ai-service` passes; chunking, casing, context, fallback, fingerprint, and batch paths covered.
