# SPEC: Fast Embedding Provider Abstraction

**Epic:** `fast-embeddings`
**Created:** 2026-05-28
**Status:** Ready for Planning

---

## Goal

Replace the single-vendor `OllamaEmbeddingService` (50–200ms per query) with a pluggable
provider abstraction matching the existing `AiProviderFactory` pattern. Add an OpenAI
embedding provider (`text-embedding-3-small` with `dimensions=768`) so the chat query
embedding step drops to ~20–30ms without changing the pgvector column dimension
(768) or requiring a schema migration.

---

## User Stories / Requirements

### US-01: Pluggable Embedding Provider
> As a developer, I want a provider abstraction (`EmbeddingProvider` interface +
> factory selected by env var) so I can switch between Ollama and OpenAI without
> touching any caller.

### US-02: Faster Query Embeddings via OpenAI
> As a user, I want chat responses to start faster — the query-embedding step
> currently dominates total latency, and a cloud API embedding cuts it ~5×.

### US-03: Same Vector Dimension (no schema break)
> As an operator, I want to switch providers without changing the `vector(768)`
> Postgres column type or running schema migrations.

### US-04: Provider Switch Re-indexes the Vault
> As an operator, when I change `EMBEDDING_PROVIDER`, I want all existing chunks
> wiped and the vault re-indexed on next ai-service start, so query and stored
> embeddings come from the same model.

---

## Acceptance Criteria

- [ ] AC-01: `EmbeddingProvider` interface defined: `generateEmbedding(text: string): Promise<number[]>` + `generateBatch(texts: string[]): Promise<number[][]>`
- [ ] AC-02: `EmbeddingProviderFactory` resolves `EMBEDDING_PROVIDER` env var (`ollama` | `openai`); throws on unknown value with a clear error
- [ ] AC-03: `OllamaEmbeddingProvider` implements the interface using existing logic; default when env unset
- [ ] AC-04: `OpenAiEmbeddingProvider` implements the interface using `OPENAI_API_KEY` + `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-small`) with `dimensions=768`
- [ ] AC-05: All callers (`DocumentService`, `SearchService`, `VaultSyncService`) inject the factory token instead of `OllamaEmbeddingService` directly
- [ ] AC-06: `EMBEDDING_PROVIDER` env var documented in `.env.example` with both options; `OPENAI_API_KEY` and `OPENAI_EMBEDDING_MODEL` added
- [ ] AC-07: On ai-service startup, if `EMBEDDING_PROVIDER` differs from the value stored in a new `embedding_provider_state` row, `chunks` table is truncated and `VaultSyncService` re-indexes
- [ ] AC-08: Embedding response logged with provider name and duration for observability
- [ ] AC-09: `nx test ai-service` passes with both provider implementations covered by unit tests (mock HTTP)
- [ ] AC-10: Latency benchmark documented: typical embed call < 50ms with OpenAI provider on a warm connection (single-query, not batch)

---

## Technical Design

### Architecture Mirror

```
src/ai/providers/                          src/embeddings/providers/
├── ai-provider.factory.ts          ───►   ├── embedding-provider.factory.ts
├── ai-provider.interface.ts        ───►   ├── embedding-provider.interface.ts
├── claude.provider.ts              ───►   ├── openai-embedding.provider.ts
└── ollama.provider.ts              ───►   └── ollama-embedding.provider.ts
```

### Interface

```typescript
// src/embeddings/providers/embedding-provider.interface.ts
export interface EmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
  generateBatch(texts: string[]): Promise<number[][]>;
}

export const EMBEDDING_PROVIDER_TOKEN = Symbol('EmbeddingProvider');
```

### Factory

```typescript
// src/embeddings/providers/embedding-provider.factory.ts
@Injectable()
export class EmbeddingProviderFactory {
  private readonly provider: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly ollamaProvider: OllamaEmbeddingProvider,
    private readonly openAiProvider: OpenAiEmbeddingProvider,
    private readonly logger: LoggerService,
  ) {
    this.provider = (configService.get<string>('EMBEDDING_PROVIDER') ?? 'ollama').toLowerCase();
    this.logger.log(`EMBEDDING_PROVIDER=${this.provider}`, 'EmbeddingProviderFactory');
  }

  getProvider(): EmbeddingProvider {
    switch (this.provider) {
      case 'openai': return this.openAiProvider;
      case 'ollama': return this.ollamaProvider;
      default:
        throw new Error(`Unsupported EMBEDDING_PROVIDER: ${this.provider}`);
    }
  }
}
```

### OpenAI Provider

```typescript
@Injectable()
export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly dimensions = 768;  // matches existing vector(768) column

  constructor(private readonly configService: ConfigService, private readonly logger: LoggerService) {
    this.apiKey = configService.get<string>('OPENAI_API_KEY') ?? '';
    this.model = configService.get<string>('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-small';
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const start = Date.now();
    const { data } = await axios.post(
      'https://api.openai.com/v1/embeddings',
      { input: text, model: this.model, dimensions: this.dimensions },
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );
    this.logger.debug(`OpenAI embed: ${Date.now() - start}ms`, 'OpenAiEmbeddingProvider');
    return data.data[0].embedding;
  }

  async generateBatch(texts: string[]): Promise<number[][]> {
    // OpenAI native batch — one HTTP round-trip
    const { data } = await axios.post(
      'https://api.openai.com/v1/embeddings',
      { input: texts, model: this.model, dimensions: this.dimensions },
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );
    return data.data.map((d: { embedding: number[] }) => d.embedding);
  }
}
```

### Caller Refactor

`DocumentService`, `SearchService`, `VaultSyncService` currently inject
`OllamaEmbeddingService`. Replace with the factory:

```typescript
constructor(
  private readonly embeddingProviderFactory: EmbeddingProviderFactory,
  // ... others
) {}

private get embeddings(): EmbeddingProvider {
  return this.embeddingProviderFactory.getProvider();
}

// usage unchanged
const embedding = await this.embeddings.generateEmbedding(query);
```

### Provider Switch Re-indexing

Mixing 768-dim vectors from different models produces meaningless similarity scores —
cosine distance is only valid within a single embedding space. Switching providers
without re-indexing would silently degrade chat quality.

**Detection mechanism:** new tiny table tracks the active provider:

```sql
CREATE TABLE IF NOT EXISTS "embedding_provider_state" (
  "id"             INTEGER PRIMARY KEY DEFAULT 1,
  "provider"       TEXT NOT NULL,
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT singleton CHECK (id = 1)
);
```

**On ai-service boot:**

```typescript
// in VaultSyncService.onModuleInit (before runStartupScan)
const stored = await this.getStoredProvider();   // null on first run
const active = process.env['EMBEDDING_PROVIDER'] ?? 'ollama';

if (stored !== null && stored !== active) {
  this.logger.warn(`Embedding provider changed: ${stored} → ${active}; truncating chunks`, 'VaultSyncService');
  await this.prismaService.$executeRaw`TRUNCATE TABLE "chunks"`;
  await this.prismaService.$executeRaw`DELETE FROM "documents" WHERE "file_path" LIKE 'docs/obsidian-vault/%'`;
}

await this.upsertStoredProvider(active);
// existing runStartupScan() runs and re-indexes everything
```

### Env Vars

`.env.example` additions:

```bash
# Embedding provider — 'ollama' (default, local) or 'openai' (cloud, ~5× faster query)
EMBEDDING_PROVIDER=ollama

# OpenAI provider config — required when EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

### Why dim=768 (Matryoshka)

`text-embedding-3-small` natively produces 1536-dim vectors but supports the
`dimensions` request parameter (Matryoshka Representation Learning) to truncate
losslessly down to 256. Choosing `dimensions=768` keeps the existing `vector(768)`
Postgres column unchanged — no DB migration, no Prisma schema edit.

---

## Task Breakdown (for `/team-lead:plan`)

| # | Title | Repo | Complexity |
|---|-------|------|------------|
| 1 | Create `EmbeddingProvider` interface + token; move existing Ollama logic into `OllamaEmbeddingProvider` implementing the interface | be | 3 |
| 2 | Implement `OpenAiEmbeddingProvider` using `text-embedding-3-small` with `dimensions=768`; support single + batch endpoints | be | 4 |
| 3 | Add `EmbeddingProviderFactory` selecting on `EMBEDDING_PROVIDER` env var; wire into module exports | be | 3 |
| 4 | Refactor `DocumentService`, `SearchService`, `VaultSyncService` to inject the factory instead of `OllamaEmbeddingService` | be | 4 |
| 5 | Add `embedding_provider_state` table via Prisma migration; provider-switch detection truncates chunks/vault docs and triggers re-index in `VaultSyncService.onModuleInit` | be | 4 |
| 6 | `.env.example` updates; latency benchmark documented in commit note | be | 2 |
| 7 | Unit tests for both providers with mocked HTTP; factory dispatch test | be | 3 |

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Pinecone or other vector DBs | pgvector is the bottleneck-free path; the bottleneck is the embed call, not the search |
| Cohere / Voyage / other embedding vendors | Two providers cover 95% of needs; add later behind the same interface |
| In-process embedding cache (LRU on query string) | Solves a different problem; tracked separately |
| FE changes | None — query latency improvement is invisible to FE code |
| Embedding dimension upgrade to 1536/3072 | Higher quality at higher cost; existing 768-dim is sufficient and avoids schema migration |

---

## Constraints

- `OPENAI_API_KEY` must be set when `EMBEDDING_PROVIDER=openai` — factory must throw a clear error at boot if missing
- Switching provider truncates all chunks AND vault documents — re-index latency is a one-time cost at boot (~30s for current vault size)
- Manually uploaded documents are NOT auto-re-indexed (their source files are deleted post-upload) — users must re-upload them after a provider switch; document this in `.env.example`
- OpenAI requests must use `https://` and proper Authorization header — no logging of the API key
- Provider must NOT be selected per-request — the same provider must be used for index-time and query-time embeddings within a single boot

---

## Success Criteria

1. `EMBEDDING_PROVIDER=openai` ai-service boots, detects provider change vs stored state, truncates and re-indexes vault automatically
2. Single-query `generateEmbedding` latency on warm connection: < 50ms (typical 20-30ms) with OpenAI vs 50-200ms with Ollama
3. Chat first-token latency drops by the embed-step delta (measurable in logs)
4. `EMBEDDING_PROVIDER=ollama` reverts to the original Ollama path with no behavior change vs today
5. `nx test ai-service` passes; both providers have unit-test coverage of the success path and HTTP error path
6. No `OllamaEmbeddingService` references remain — only `EmbeddingProviderFactory` / `EmbeddingProvider` in caller code
