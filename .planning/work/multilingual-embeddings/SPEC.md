# SPEC: Multilingual Embeddings (bge-m3, 1024-dim)

**Epic:** `multilingual-embeddings`
**Created:** 2026-06-09
**Status:** Ready for Planning
**Repo:** `be` (ai-platform backend only)
**Builds on:** `fast-embeddings` (provider abstraction + factory + switch re-index), `lmstudio-embeddings` (active provider), `hybrid-rag-search` (vector + trigram + RRF)

---

## Problem

Retrieval only returns a chunk when the query is phrased almost verbatim as the
source document. Root cause: the active embedding model
`text-embedding-nomic-embed-text-v1.5` (LM Studio) is **English-centric**. The
corpus and queries are **Ukrainian**. On Ukrainian text the model produces weak
vectors → cosine similarity is near-noise → the semantic half of hybrid search is
effectively dead → only the trigram lexical half returns hits → trigram needs
literal character overlap → "finds only when phrased like the doc."

Reranking and query expansion do not fix this — they reorder / rephrase against a
broken vector space. The fix is the embedding model itself.

---

## Goal

Move the whole platform to a **multilingual 1024-dim** embedding space built on
**`bge-m3`** (BAAI), which handles Ukrainian (and 100+ languages) strongly and
needs no `query:` / `passage:` prefixes. This requires:

1. Migrating the `chunks.embedding` column `vector(768)` → `vector(1024)`.
2. Making provider-switch re-index detection fire on **model change**, not just
   provider name change (today it stores only `provider`).
3. Re-pointing all three provider defaults at 1024-dim multilingual models so the
   platform stays coherent regardless of `EMBEDDING_PROVIDER`.
4. Re-indexing the entire vault into the new vector space.

No changes to `SearchService` SQL (the `::vector` casts are dimension-agnostic),
RRF fusion, or chunking.

---

## User Stories / Requirements

### US-01: Ukrainian Semantic Retrieval
> As a user querying in Ukrainian, I want a paraphrased question
> ("виводить помилку") to retrieve a doc that says it differently
> ("відображає попередження"), so I am not forced to quote the docs verbatim.

### US-02: 1024-dim Vector Column
> As an operator, I want the `chunks.embedding` column to hold 1024-dim vectors so
> `bge-m3` embeddings insert and index correctly under HNSW cosine.

### US-03: Re-index on Model Change
> As an operator, when I change the embedding **model** (not just the provider),
> I want the chunks truncated and the vault re-indexed automatically on next boot,
> since a different model is a different vector space.

### US-04: Coherent Multilingual Defaults Across Providers
> As an operator, whichever `EMBEDDING_PROVIDER` I pick, I want the default model
> to be 1024-dim multilingual so I never silently break the `vector(1024)` column.

### US-05: Fail-Fast Dimension Guard
> As a developer, if a configured model returns a vector whose length ≠ the column
> dimension, I want a clear error naming the model and expected/actual dims, not an
> opaque pgvector insert failure.

---

## Acceptance Criteria

- [ ] AC-01: New Prisma migration changes `chunks.embedding` from `vector(768)` to `vector(1024)`; `schema.prisma:56` updated to `Unsupported("vector(1024)")`
- [ ] AC-02: The migration **drops `chunks_embedding_hnsw_idx`, truncates `chunks`, alters the column to `vector(1024)`, then recreates the HNSW index** (`hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64)`) — in that order; the `chunks_content_trgm_idx` GIN index is left untouched
- [ ] AC-03: `embedding_provider_state` gains a `model` column (TEXT, nullable); `schema.prisma` model + a Prisma migration both updated
- [ ] AC-04: `detectAndHandleProviderChange()` compares a composite fingerprint of `(provider, model)` against the stored row; truncate-chunks + delete-vault-docs fires when **either** differs; the active model is resolved from the active provider's model env var (same defaults the providers use)
- [ ] AC-05: `upsertStoredProvider` / `readStoredProvider` (or successors) persist and read both `provider` and `model`
- [ ] AC-06: Default embedding models are all 1024-dim multilingual: `LMSTUDIO_EMBEDDING_MODEL=bge-m3`, `OLLAMA_EMBEDDING_MODEL=bge-m3`, OpenAI sends `dimensions: 1024`
- [ ] AC-07: `DIMENSIONS` constant in `openai-embedding.provider.ts:9` changes `768 → 1024`; OpenAI request body sends `dimensions: 1024`
- [ ] AC-08: A single `EXPECTED_EMBEDDING_DIM = 1024` constant is the one source of truth (shared from `shared` lib or `embeddings.constants.ts`); providers/insert path assert returned vector length === it and throw `Embedding dimension mismatch: model=<m>, expected=1024, got=<n>` on violation
- [ ] AC-09: On first boot after deploy, the `(provider, model)` fingerprint differs from the stored row → chunks truncated → vault re-indexed into the 1024-dim space automatically (no manual step)
- [ ] AC-10: `SearchService` vector SQL, RRF fusion, and `DocumentService` chunking are unchanged (verified — `::vector` casts infer dim from the array literal)
- [ ] AC-11: `.env.example` updated: `bge-m3` defaults for lmstudio + ollama, the 1024-dim requirement note, OpenAI `dimensions: 1024` note, and that LM Studio / Ollama must have `bge-m3` loaded/pulled before boot
- [ ] AC-12: `nx test ai-service` passes; new/updated unit tests cover the 1024 dimension guard (pass + mismatch), the `(provider, model)` fingerprint detection (fires on model-only change, no-ops when unchanged), and the OpenAI `dimensions: 1024` body

---

## Technical Design

### Files touched (all `ai-platform/`)

```
libs/database/prisma/
├── schema.prisma                                   (vector(768)→1024; +model column)
└── migrations/<ts>_embeddings_1024_multilingual/   (NEW migration.sql)

apps/ai-service/src/
├── embeddings/
│   ├── embeddings.constants.ts                     (+ EXPECTED_EMBEDDING_DIM = 1024)
│   └── providers/
│       ├── openai-embedding.provider.ts            (DIMENSIONS 768→1024)
│       ├── ollama-embedding.provider.ts            (default model → bge-m3)
│       └── lmstudio-embedding.provider.ts          (default model → bge-m3)
├── vault/vault-sync.service.ts                     (fingerprint = provider+model)
└── document/document.service.ts                    (optional: dim guard on insert)

.env.example                                        (defaults + 1024 notes)
```

### Migration SQL (order is mandatory)

A pgvector column's dimension cannot be altered while populated or while an HNSW
index references it. Sequence:

```sql
-- 1. drop the vector index (cosine HNSW from hybrid-search-indexes)
DROP INDEX IF EXISTS "chunks_embedding_hnsw_idx";

-- 2. empty the table — old 768-dim vectors are invalid in the new model's space
TRUNCATE TABLE "chunks";

-- 3. widen the column
ALTER TABLE "chunks" ALTER COLUMN "embedding" TYPE vector(1024);

-- 4. recreate the HNSW cosine index with the same params
CREATE INDEX "chunks_embedding_hnsw_idx"
  ON "chunks" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5. extend provider-state to track the model
ALTER TABLE "embedding_provider_state" ADD COLUMN "model" TEXT;
```

The `chunks_content_trgm_idx` GIN trigram index is on `content` — untouched.
Truncating `chunks` is safe: documents survive, and the startup vault scan +
provider-change handler re-embed everything.

### Fingerprint detection (vault-sync.service.ts)

Today `detectAndHandleProviderChange()` compares `provider` only. Extend to a
composite so a model swap under the same provider also re-indexes:

```typescript
async detectAndHandleProviderChange(): Promise<void> {
  const active = (process.env['EMBEDDING_PROVIDER'] ?? 'ollama').toLowerCase();
  const activeModel = this.resolveActiveModel(active); // reads the per-provider model env + default

  const stored = await this.readStoredState(); // { provider, model } | null

  const changed =
    stored !== null &&
    (stored.provider !== active || stored.model !== activeModel);

  if (changed) {
    this.logger.warn(
      `Embedding fingerprint changed: ${stored.provider}/${stored.model} → ${active}/${activeModel}; truncating chunks`,
      'VaultSyncService',
    );
    await this.prismaService.$executeRaw`TRUNCATE TABLE "chunks"`;
    await this.prismaService
      .$executeRaw`DELETE FROM "documents" WHERE "file_path" LIKE 'docs/obsidian-vault/%'`;
  }

  await this.upsertStoredState(active, activeModel);
}
```

`resolveActiveModel(provider)` maps `provider → model` env var using the **same
defaults the providers use** (single source of truth — import the provider
defaults, do not re-hardcode):

| provider | env var | default |
|----------|---------|---------|
| `ollama` | `OLLAMA_EMBEDDING_MODEL` | `bge-m3` |
| `openai` | `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` (dim 1024) |
| `lmstudio` | `LMSTUDIO_EMBEDDING_MODEL` | `bge-m3` |

### Why bge-m3

| Concern | nomic-embed-text-v1.5 (current) | bge-m3 (target) |
|---------|----------------------------------|-----------------|
| Languages | English-centric | 100+ incl. Ukrainian |
| Dimensions | 768 | 1024 |
| Prefixes | none | none (unlike e5's `query:`/`passage:`) |
| LM Studio | GGUF ✓ | GGUF ✓ (OpenAI `/v1/embeddings` shape, no body change) |
| Ollama | ✓ | `ollama pull bge-m3` ✓ |

Request/response shapes are unchanged (`{ input, model }` → `{ data: [...] }`),
so the provider classes need only a default-model swap — no new HTTP logic.

### Dimension guard (one source of truth)

```typescript
// embeddings.constants.ts
export const EXPECTED_EMBEDDING_DIM = 1024;
```

Assert at the boundary (provider return or pre-insert) so a misloaded model fails
fast instead of erroring deep in a pgvector insert:

```typescript
if (embedding.length !== EXPECTED_EMBEDDING_DIM) {
  throw new Error(
    `Embedding dimension mismatch: model=${this.model}, expected=${EXPECTED_EMBEDDING_DIM}, got=${embedding.length}`,
  );
}
```

### .env.example additions

```bash
# Embedding provider — 'ollama' (default) | 'openai' | 'lmstudio'
# ALL providers must emit 1024-dim vectors to match the vector(1024) column.
EMBEDDING_PROVIDER=lmstudio

# 1024-dim multilingual model (Ukrainian-capable). Must be loaded in LM Studio
# (or pulled in Ollama) BEFORE ai-service boots.
LMSTUDIO_EMBEDDING_MODEL=bge-m3
OLLAMA_EMBEDDING_MODEL=bge-m3

# OpenAI path truncates to 1024 via the dimensions param (Matryoshka).
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

---

## Task Breakdown (for `/team-lead:plan`)

| # | Title | Repo | Complexity |
|---|-------|------|------------|
| 1 | Prisma migration: drop HNSW idx → truncate chunks → alter `embedding` to `vector(1024)` → recreate HNSW idx → add `model` column to `embedding_provider_state`; update `schema.prisma` (vector dim + model field) | be | 3 |
| 2 | Add `EXPECTED_EMBEDDING_DIM = 1024`; set OpenAI `DIMENSIONS 768→1024` + `dimensions: 1024` body; default `bge-m3` for ollama + lmstudio providers; add dimension-mismatch guard at insert/return boundary | be | 3 |
| 3 | Extend `vault-sync.service.ts`: store + compare `(provider, model)` fingerprint; `resolveActiveModel()` reusing provider defaults; truncate+reindex on either change; `.env.example` updates | be | 4 |
| 4 | Tests: dimension guard pass/mismatch; fingerprint detection fires on model-only change and no-ops when unchanged; OpenAI body carries `dimensions: 1024`; verify Search SQL / RRF / chunking untouched | be | 3 |

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Re-ranking | Separate epic — fixes precision, not the recall/language root cause. Do after this lands |
| Query expansion / multi-query | Separate epic — only worth it once the vector space works |
| Contextual Retrieval (index-time chunk context) | Separate, heavier epic; this SPEC fixes the model first |
| Changes to `SearchService` SQL, RRF weights, chunking | `::vector` casts are dim-agnostic; no change needed |
| `EmbeddingProvider` interface / factory contract | Stable; only default model strings + a guard change |
| Per-request model selection | Same model serves index-time and query-time within a boot (inherited constraint) |
| Making the column dimension runtime-configurable | pgvector needs a fixed dim per column + HNSW; 1024 is committed platform-wide |

---

## Constraints

- The configured model **must output exactly 1024-dim vectors**. nomic-embed-text (768) and any non-1024 model will fail the dimension guard and break inserts — this is intentional (fail fast).
- LM Studio (or Ollama) must have **`bge-m3` loaded/pulled and running** before ai-service boots; absence surfaces as the existing sanitized connection error.
- The dimension migration **truncates all chunks** — a one-time full re-index of the vault happens on the next boot. Documents are preserved; chunks are rebuilt.
- Migration step order (drop index → truncate → alter → recreate index) is mandatory; reordering fails on a populated column or an index-bound type change.
- This is a `be`-only epic — no `fe` or `kanban` files. Never combine repos in one task.
- The `(provider, model)` fingerprint must resolve the model from the **same defaults the providers use** — no second copy of the default strings that can drift.

---

## Success Criteria

1. A Ukrainian paraphrase retrieves the correct chunk that a verbatim-only query previously required — semantic recall restored (manual check: a query that failed pre-change now returns the right doc with a meaningful cosine similarity).
2. `chunks.embedding` is `vector(1024)`; HNSW cosine index present; bge-m3 vectors insert and rank correctly.
3. First boot after deploy auto-truncates chunks and re-indexes the vault into the 1024-dim space — no manual command.
4. Changing only `LMSTUDIO_EMBEDDING_MODEL` (same provider) on a later boot also triggers the truncate + re-index.
5. A model that returns the wrong dimension fails fast with `Embedding dimension mismatch: ...` — no opaque pgvector error.
6. `EMBEDDING_PROVIDER=ollama` / `=openai` also resolve to 1024-dim multilingual defaults — no provider silently breaks the column.
7. `nx test ai-service` passes; guard, fingerprint, and OpenAI-dimensions paths covered.
