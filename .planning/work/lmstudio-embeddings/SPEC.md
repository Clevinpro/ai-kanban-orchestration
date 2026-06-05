# SPEC: LM Studio Embedding Provider

**Epic:** `lmstudio-embeddings`
**Created:** 2026-06-05
**Status:** Ready for Planning
**Builds on:** `fast-embeddings` (provider abstraction + factory + switch-detection re-index)

---

## Goal

Add a third embedding provider — **LM Studio** — behind the existing
`EmbeddingProvider` interface and `EmbeddingProviderFactory`. LM Studio runs an
OpenAI-compatible HTTP server locally (default `http://localhost:1234/v1`), giving
users a **local, private, no-API-key** embedding path that is faster and more
flexible than Ollama (GPU-accelerated, hot-swappable models in a desktop UI).

Selected via `EMBEDDING_PROVIDER=lmstudio`. No changes to callers, the
`vector(768)` column, or the provider-switch re-index machinery — those already
exist from the `fast-embeddings` epic and the new provider plugs straight in.

---

## User Stories / Requirements

### US-01: Local OpenAI-Compatible Embeddings
> As a developer, I want to point the embedding step at LM Studio's local server
> so I get private, offline embeddings without an OpenAI API key and without
> Ollama's slower CPU path.

### US-02: Zero-Config Auth
> As an operator, I want LM Studio to work with no API key (it requires none by
> default), so selecting it needs only a URL and a model name.

### US-03: Same Interface, No Caller Changes
> As a developer, I want LM Studio to drop in behind the existing factory so no
> `SearchService` / `VaultSyncService` / `DocumentService` code changes.

### US-04: Automatic Re-index on Switch
> As an operator, when I set `EMBEDDING_PROVIDER=lmstudio`, I want the existing
> provider-switch detection to truncate chunks and re-index the vault, since
> embeddings from a different model live in a different vector space.

---

## Acceptance Criteria

- [ ] AC-01: `LmStudioEmbeddingProvider` implements the existing `EmbeddingProvider` interface (`generateEmbedding` + `generateBatch`)
- [ ] AC-02: Provider reads `LMSTUDIO_URL` (default `http://localhost:1234/v1`) and `LMSTUDIO_EMBEDDING_MODEL` (default `text-embedding-nomic-embed-text-v1.5`)
- [ ] AC-03: Requests POST to `<LMSTUDIO_URL>/embeddings` with OpenAI body shape `{ input, model }` — **no** `dimensions` field, **no** `Authorization` header
- [ ] AC-04: `generateBatch` sends `input: string[]` in a single HTTP call and returns vectors sorted by response `index` (OpenAI response shape `{ data: [{ embedding, index }] }`)
- [ ] AC-05: `EmbeddingProviderFactory` resolves `EMBEDDING_PROVIDER=lmstudio` to the new provider; unknown values still throw the existing clear error
- [ ] AC-06: `LmStudioEmbeddingProvider` registered in `EmbeddingsModule` via conditional `useFactory` (instantiated only when `EMBEDDING_PROVIDER=lmstudio`), mirroring the OpenAI wiring; new DI token added to `embeddings.constants.ts`
- [ ] AC-07: Switching to `lmstudio` triggers the **existing** `embedding_provider_state` detection → chunk truncate → vault re-index on next boot (no new migration, no new logic — just verify the new provider name flows through)
- [ ] AC-08: Axios errors sanitized into a clear `LM Studio API request failed: status=..., message=...` Error; empty-data response guarded
- [ ] AC-09: `.env.example` documents `EMBEDDING_PROVIDER=lmstudio`, `LMSTUDIO_URL`, `LMSTUDIO_EMBEDDING_MODEL`, and the 768-dim model requirement
- [ ] AC-10: Embedding call logged with provider name + duration (matches existing observability)
- [ ] AC-11: `nx test ai-service` passes; new provider unit-tested (mock HTTP) for single, batch, and HTTP-error paths; factory dispatch test extended for `lmstudio`

---

## Technical Design

### Architecture (extends fast-embeddings)

```
src/embeddings/providers/
├── embedding-provider.interface.ts      (unchanged)
├── embedding-provider.factory.ts        (+ lmstudio branch + injected provider)
├── ollama-embedding.provider.ts         (unchanged)
├── openai-embedding.provider.ts         (template — clone this)
└── lmstudio-embedding.provider.ts       (NEW)
```

### Why clone the OpenAI provider, not Ollama

LM Studio exposes the **OpenAI** API shape exactly: `POST /v1/embeddings` with
`{ input, model }` → `{ data: [{ embedding, index }] }`. The OpenAI provider's
single-call batch, index-sort, and error-sanitize logic are reused verbatim.
Only three deletions + one URL swap separate them.

### Diff from OpenAI provider

| Concern | OpenAI provider | LM Studio provider |
|---------|-----------------|--------------------|
| Base URL | hardcoded `https://api.openai.com/v1/embeddings` | `${LMSTUDIO_URL}/embeddings`, configurable, default `http://localhost:1234/v1` |
| Auth | `Authorization: Bearer <key>` + `resolveApiKey()` throw-guard | **none** — LM Studio needs no key |
| `dimensions` field | sends `dimensions: 768` (Matryoshka truncation) | **omitted** — llama.cpp backend ignores it; dim is fixed by the loaded model |
| Default model | `text-embedding-3-small` | `text-embedding-nomic-embed-text-v1.5` (native 768-dim) |
| Error prefix | `OpenAI API request failed` | `LM Studio API request failed` |
| Batch / sort / empty-guard | — | **identical, reused** |

### Provider (sketch)

```typescript
@Injectable()
export class LmStudioEmbeddingProvider implements EmbeddingProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.baseUrl =
      this.configService.get<string>('LMSTUDIO_URL') ?? 'http://localhost:1234/v1';
    this.model =
      this.configService.get<string>('LMSTUDIO_EMBEDDING_MODEL') ??
      'text-embedding-nomic-embed-text-v1.5';
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const start = Date.now();
    let data: OpenAiShapedResponse;
    try {
      const res = await axios.post(`${this.baseUrl}/embeddings`, {
        input: text,
        model: this.model,
      });
      data = res.data;
    } catch (err) {
      throw sanitizeAxiosError(err, 'LM Studio');
    }
    if (!data.data?.[0]) {
      throw new Error('LM Studio embeddings API returned no data');
    }
    this.logger.debug(`LM Studio embed: ${Date.now() - start}ms`, 'LmStudioEmbeddingProvider');
    return data.data[0].embedding;
  }

  async generateBatch(texts: string[]): Promise<number[][]> {
    let data: OpenAiShapedResponse;
    try {
      const res = await axios.post(`${this.baseUrl}/embeddings`, {
        input: texts,
        model: this.model,
      });
      data = res.data;
    } catch (err) {
      throw sanitizeAxiosError(err, 'LM Studio');
    }
    if (!data.data?.length) {
      throw new Error('LM Studio embeddings API returned no data');
    }
    return data.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}
```

### Factory branch

```typescript
// embedding-provider.factory.ts — add injected provider + branch
if (this.providerName === 'lmstudio') {
  if (!this.lmStudioEmbeddingProvider) {
    throw new Error('LM Studio provider not initialised (EMBEDDING_PROVIDER=lmstudio)');
  }
  return this.lmStudioEmbeddingProvider;
}
```

### Module wiring (mirror OpenAI conditional factory)

```typescript
// embeddings.constants.ts
export const LMSTUDIO_EMBEDDING_PROVIDER = 'LMSTUDIO_EMBEDDING_PROVIDER';

// embeddings.module.ts providers[]
{
  provide: LMSTUDIO_EMBEDDING_PROVIDER,
  useFactory: (cfg: ConfigService, log: LoggerService) =>
    cfg.get<string>('EMBEDDING_PROVIDER')?.toLowerCase() === 'lmstudio'
      ? new LmStudioEmbeddingProvider(cfg, log)
      : null,
  inject: [ConfigService, LoggerService],
}
```

### Env vars (.env.example additions)

```bash
# Embedding provider — 'ollama' (default) | 'openai' | 'lmstudio' (local, OpenAI-compatible)
EMBEDDING_PROVIDER=ollama

# LM Studio provider config — used when EMBEDDING_PROVIDER=lmstudio.
# No API key required. URL is the OpenAI-compatible base (include /v1).
# Model MUST output 768-dim vectors to match the vector(768) column —
# 'text-embedding-nomic-embed-text-v1.5' is native 768.
LMSTUDIO_URL=http://localhost:1234/v1
LMSTUDIO_EMBEDDING_MODEL=text-embedding-nomic-embed-text-v1.5
```

---

## Task Breakdown (for `/team-lead:plan`)

| # | Title | Repo | Complexity |
|---|-------|------|------------|
| 1 | Implement `LmStudioEmbeddingProvider` (clone OpenAI provider: swap URL → `LMSTUDIO_URL`, drop auth header + `dimensions`, reuse batch/sort/error-sanitize) | be | 3 |
| 2 | Add `LMSTUDIO_EMBEDDING_PROVIDER` token; wire conditional `useFactory` in `EmbeddingsModule`; add `lmstudio` branch + injected provider in `EmbeddingProviderFactory` | be | 3 |
| 3 | `.env.example` updates (provider option + URL + model + 768-dim note); verify provider-switch re-index fires for `lmstudio` against existing `embedding_provider_state` machinery | be | 2 |
| 4 | Unit tests: `LmStudioEmbeddingProvider` single / batch / HTTP-error / empty-data; assert no `Authorization` header and no `dimensions` in body; extend factory dispatch test for `lmstudio` | be | 3 |

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Changes to `EmbeddingProvider` interface or factory contract | Stable from `fast-embeddings`; only an additive branch |
| New `embedding_provider_state` migration / re-index logic | Already exists; `lmstudio` flows through the existing switch detection unchanged |
| Caller refactors (`SearchService` etc.) | Already inject the factory; provider is transparent |
| LM Studio chat/completions provider (LLM, not embeddings) | Separate concern; this epic is embeddings only |
| Per-request provider selection | Same provider must serve index-time and query-time within a boot (existing constraint) |
| `dimensions` truncation / Matryoshka for LM Studio | llama.cpp backend ignores the param — handled by choosing a native-768 model |

---

## Constraints

- The configured `LMSTUDIO_EMBEDDING_MODEL` **must output 768-dim vectors** — LM Studio cannot truncate via `dimensions`. A non-768 model breaks pgvector inserts. Document in `.env.example`.
- LM Studio's local server must be **running with the embedding model loaded** before ai-service starts; provider surfaces a clear connection error otherwise (sanitized, no stack leak).
- No `Authorization` header and no `dimensions` field in the request body — both must be absent (asserted in tests).
- Provider must NOT be selected per-request — same provider for index-time and query-time within a boot (inherited constraint).
- Switching provider truncates all chunks + vault docs and re-indexes at boot (one-time cost, existing behavior).

---

## Success Criteria

1. `EMBEDDING_PROVIDER=lmstudio` boots ai-service, the factory returns `LmStudioEmbeddingProvider`, switch detection truncates + re-indexes the vault automatically.
2. `generateEmbedding` / `generateBatch` hit `<LMSTUDIO_URL>/embeddings` with `{ input, model }` only — no auth, no `dimensions` — and return correct 768-dim vectors.
3. `EMBEDDING_PROVIDER=ollama` and `=openai` behave exactly as before — no regression.
4. HTTP / connection errors surface as sanitized `LM Studio API request failed: ...` messages.
5. `nx test ai-service` passes; new provider covered for single, batch, and error paths; factory test covers `lmstudio` dispatch.
6. No caller code changed — only new provider file + constants + module + factory + `.env.example`.
