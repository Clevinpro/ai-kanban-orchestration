---
id: TASK-003
title: Add EmbeddingProviderFactory selecting on EMBEDDING_PROVIDER env var; wire into EmbeddingsModule
status: done
priority: high
repo: be
epic: fast-embeddings
complexity: 3
created-at: 2026-05-28T12:00:00.000Z
updated-at: 2026-05-28T12:00:00.000Z
started-at: 2026-05-28T21:41:34+03:00
completed-at: 2026-05-28T21:44:29+03:00
spec: .planning/work/fast-embeddings/SPEC.md
---

## Description

Create `src/embeddings/providers/embedding-provider.factory.ts` in ai-service. The `EmbeddingProviderFactory` class reads `EMBEDDING_PROVIDER` from `ConfigService` (default `'ollama'`, lowercased). Its `getProvider()` method returns `OllamaEmbeddingProvider` when `'ollama'`, `OpenAiEmbeddingProvider` when `'openai'`, and throws `Error('Unsupported EMBEDDING_PROVIDER: <value>')` for any other value. Log the resolved provider name at INFO level in the constructor. Update `EmbeddingsModule` to declare and export `EmbeddingProviderFactory` alongside both provider classes so callers can inject it.

## Acceptance Criteria

- [ ] `src/embeddings/providers/embedding-provider.factory.ts` exists; `EmbeddingProviderFactory` is `@Injectable()`
- [ ] `getProvider()` returns correct provider for `'ollama'` and `'openai'`
- [ ] `getProvider()` throws `Error('Unsupported EMBEDDING_PROVIDER: <value>')` for unknown values
- [ ] Constructor logs `EMBEDDING_PROVIDER=<value>` via `LoggerService.log`
- [ ] `EmbeddingsModule` declares and exports `EmbeddingProviderFactory`, `OllamaEmbeddingProvider`, `OpenAiEmbeddingProvider`
- [ ] `nx test ai-service` passes

## Technical Notes

- Mirror `src/ai/providers/ai-provider.factory.ts` — same constructor injection pattern with both concrete providers injected, `getProvider()` switches on the env value
- Provider selection must happen at `getProvider()` call time (not lazily cached) so tests can override easily — or cache it in constructor; either is fine as long as it is consistent per boot
- Do NOT change callers in this task — that is TASK-004
- `EmbeddingsModule` is at `src/embeddings/embeddings.module.ts`; check what it currently imports before editing

---REVIEW-BLOCK-START---
Signal: CHANGES_REQUESTED
Findings:
- `ai-platform/apps/ai-service/src/embeddings/providers/openai-embedding.provider.ts:38-41` — `OpenAiEmbeddingProvider` throws in its constructor when `OPENAI_API_KEY` is missing. Because NestJS instantiates all providers in the module at startup, the app will crash on boot whenever `EMBEDDING_PROVIDER=ollama` and `OPENAI_API_KEY` is not set — even though OpenAI is never selected. The guard should be moved to `generateEmbedding`/`generateBatch` (or to the factory's `getProvider()`), not the constructor. BLOCKER.
- `ai-platform/apps/ai-service/src/embeddings/providers/openai-embedding.provider.ts:86` — `generateBatch` maps over `data.data` in returned order instead of sorting by the `index` field. The OpenAI embeddings API may return objects in a different order than the input array; using `index` to re-order the results is required for correctness. BLOCKER.
- `ai-platform/apps/ai-service/src/embeddings/providers/embedding-provider.interface.ts:1` — `EMBEDDING_PROVIDER_TOKEN` is declared but never used in any provider, module, or factory. This is dead code. If it is intended for TASK-004 that is fine, but it should either be wired up or removed to avoid confusion. WARNING.
- `ai-platform/apps/ai-service/src/embeddings/providers/ollama-embedding.provider.ts:42-44` — `generateBatch` fires all requests in parallel with no concurrency cap. For large input arrays this can saturate the local Ollama server. A concurrency limiter (e.g. p-limit or chunked batching) would be safer. WARNING (pre-existing pattern carried forward, but now surfacing in a reviewable file).

Two blockers prevent approval: the eager constructor guard on `OPENAI_API_KEY` breaks the `ollama`-only deployment path, and the missing `index`-based sort in `generateBatch` can silently return mis-ordered embeddings.
---REVIEW-BLOCK-END---

---REVIEW-BLOCK-START---
Signal: APPROVED
Findings:
- `ai-platform/apps/ai-service/src/embeddings/providers/embedding-provider.interface.ts:1` — `EMBEDDING_PROVIDER_TOKEN` declared but unused. WARNING — carry to TASK-004 or remove.
- `ai-platform/apps/ai-service/src/embeddings/embeddings.module.ts:34-39` — Exports `OPENAI_EMBEDDING_PROVIDER` token rather than the class directly. Architecturally correct; criterion wording imprecise. WARNING (no functional issue).

Both cycle-1 blockers confirmed fixed: constructor no longer throws on missing `OPENAI_API_KEY` (guard in `resolveApiKey()`); `generateBatch` sorts by `index` before mapping. All acceptance criteria met.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected` returned "No tasks were run" because the implementation files are untracked/unstaged and not captured in HEAD~1..HEAD diff. Ran `nx test ai-service` directly to cover the implemented code.

- 9 test suites passed, 116 tests passed, 0 failures
- Covers: `embedding-provider.factory.spec.ts`, `openai-embedding.provider.spec.ts`, `ollama-embedding.provider.spec.ts`, and 6 other suites

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:
- AC-1 PASS: `embedding-provider.factory.ts` exists; `EmbeddingProviderFactory` is `@Injectable()` (line 9).
- AC-2 PASS: `getProvider()` returns `OllamaEmbeddingProvider` for `'ollama'` and `OpenAiEmbeddingProvider` for `'openai'`; both branches covered in spec and confirmed by code reviewer cycle 2.
- AC-3 PASS: `getProvider()` throws `Error('Unsupported EMBEDDING_PROVIDER: <value>')` for unknown values (line 38); two test cases verify exact message format.
- AC-4 PASS: Constructor logs `EMBEDDING_PROVIDER=<value>` via `LoggerService.log` (line 23); tested in constructor describe block.
- AC-5 PASS: `EmbeddingsModule` declares and exports `EmbeddingProviderFactory`, `OllamaEmbeddingProvider`, and `OpenAiEmbeddingProvider` (via `OPENAI_EMBEDDING_PROVIDER` token — architecturally correct per code reviewer approval).
- AC-6 PASS: `nx test ai-service` ran 116 tests across 9 suites, 0 failures (QA Results).
