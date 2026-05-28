---
id: TASK-001
title: Create EmbeddingProvider interface + token; refactor OllamaEmbeddingService into OllamaEmbeddingProvider
status: done
priority: high
repo: be
epic: fast-embeddings
complexity: 3
created-at: 2026-05-28T12:00:00.000Z
updated-at: 2026-05-28T12:00:00.000Z
started-at: 2026-05-28T21:16:25+03:00
completed-at: 2026-05-28T21:28:56+03:00
spec: .planning/work/fast-embeddings/SPEC.md
---

## Description

Create the `EmbeddingProvider` interface and `EMBEDDING_PROVIDER_TOKEN` symbol in a new file `src/embeddings/providers/embedding-provider.interface.ts` inside the ai-service. Then extract the existing logic from `OllamaEmbeddingService` (`src/embeddings/embeddings.service.ts`) into a new `OllamaEmbeddingProvider` at `src/embeddings/providers/ollama-embedding.provider.ts` that implements the interface. The interface must declare `generateEmbedding(text: string): Promise<number[]>` and `generateBatch(texts: string[]): Promise<number[][]>`. The existing `OllamaEmbeddingService` class name and file can be kept as-is or renamed — what matters is the new provider file exists and implements the interface correctly. Update `EmbeddingsModule` to export `OllamaEmbeddingProvider`.

## Acceptance Criteria

- [ ] `src/embeddings/providers/embedding-provider.interface.ts` exists with `EmbeddingProvider` interface and `EMBEDDING_PROVIDER_TOKEN = Symbol('EmbeddingProvider')`
- [ ] `src/embeddings/providers/ollama-embedding.provider.ts` exists, class `OllamaEmbeddingProvider` implements `EmbeddingProvider`, `@Injectable()` decorator present
- [ ] Both `generateEmbedding` and `generateBatch` methods present matching interface signature
- [ ] `EmbeddingsModule` updated to declare and export `OllamaEmbeddingProvider`
- [ ] `nx test ai-service` passes

## Technical Notes

- Mirror the pattern at `src/ai/providers/` — `ai-provider.interface.ts` → `embedding-provider.interface.ts`, `ollama.provider.ts` → `ollama-embedding.provider.ts`
- Existing Ollama HTTP logic (axios POST to `/api/embeddings`, `OLLAMA_URL`, `OLLAMA_EMBEDDING_MODEL`) moves unchanged into the new provider
- Keep `generateEmbeddingSilent` private helper if you keep the batch-via-parallel approach, or inline it
- `LoggerService` from `@ai-platform/shared` must remain injected (structured pino logging convention)
- Do NOT yet wire up the factory or change any callers — that is TASK-003 and TASK-004

---REVIEW-BLOCK-START---
Status: APPROVED

Findings:
None
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found via `nx affected --base=HEAD~1 --head=HEAD` — the implementation files are uncommitted (untracked providers directory and unstaged module changes), so nx affected detects no diff. Direct run of `nx test ai-service` confirms all 72 tests pass across 6 test suites (exit code 0). No test failures.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:
- Task AC-1 (PASS): `src/embeddings/providers/embedding-provider.interface.ts` exists; exports `EmbeddingProvider` interface with correct method signatures and `EMBEDDING_PROVIDER_TOKEN = Symbol('EmbeddingProvider')`.
- Task AC-2 (PASS): `src/embeddings/providers/ollama-embedding.provider.ts` exists; `OllamaEmbeddingProvider` class is decorated with `@Injectable()` and declares `implements EmbeddingProvider`.
- Task AC-3 (PASS): Both `generateEmbedding(text: string): Promise<number[]>` and `generateBatch(texts: string[]): Promise<number[][]>` are implemented with signatures matching the interface exactly.
- Task AC-4 (PASS): `EmbeddingsModule` at `src/embeddings/embeddings.module.ts` declares and exports `OllamaEmbeddingProvider`.
- Task AC-5 (PASS): `nx test ai-service` — 72 tests across 6 suites, exit 0 (confirmed by QA).
- SPEC AC-01 (PASS): Interface definition matches spec exactly.
- SPEC AC-03 (PASS): `OllamaEmbeddingProvider` uses existing Ollama HTTP logic (`OLLAMA_URL`, `OLLAMA_EMBEDDING_MODEL`), defaults to `ollama` path when env is unset.
