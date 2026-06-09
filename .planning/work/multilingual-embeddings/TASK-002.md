---
id: TASK-002
title: Add EXPECTED_EMBEDDING_DIM=1024, OpenAI dims 1024, bge-m3 defaults, dimension guard
status: done
priority: high
repo: be
epic: multilingual-embeddings
complexity: 3
created-at: 2026-06-09T00:00:00Z
updated-at: 2026-06-09T12:20:03+03:00
started-at: 2026-06-09T12:10:34+03:00
completed-at: 2026-06-09T12:20:03+03:00
spec: .planning/work/multilingual-embeddings/SPEC.md
---

## Description

Introduce a single source-of-truth constant `EXPECTED_EMBEDDING_DIM = 1024` in `embeddings.constants.ts`. Set the OpenAI provider's `DIMENSIONS` constant `768 → 1024` and ensure the OpenAI request body sends `dimensions: 1024`. Change the default embedding model to `bge-m3` for both the Ollama and LM Studio providers. Add a fail-fast dimension guard at the provider-return (or pre-insert) boundary that throws when a returned vector length ≠ `EXPECTED_EMBEDDING_DIM`.

## Acceptance Criteria

- [ ] `EXPECTED_EMBEDDING_DIM = 1024` exported from `embeddings.constants.ts` (single source of truth)
- [ ] `openai-embedding.provider.ts:9` `DIMENSIONS` changed `768 → 1024`; request body sends `dimensions: 1024`
- [ ] Ollama provider default model → `bge-m3`; LM Studio provider default model → `bge-m3`
- [ ] Guard throws `Embedding dimension mismatch: model=<m>, expected=1024, got=<n>` when returned vector length ≠ 1024
- [ ] (AC-06, AC-07, AC-08)

## Technical Notes

- Files: `ai-platform/apps/ai-service/src/embeddings/embeddings.constants.ts`, `.../providers/openai-embedding.provider.ts`, `.../providers/ollama-embedding.provider.ts`, `.../providers/lmstudio-embedding.provider.ts`.
- Guard asserts at the boundary so a misloaded model fails fast instead of erroring deep in a pgvector insert.
- Default model strings live with the providers — TASK-003's `resolveActiveModel()` will import them, so keep them exportable / single-sourced (no duplicate copies that can drift).
- Load `ai-platform/CLAUDE.md` before editing.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the `EXPECTED_EMBEDDING_DIM=1024` constant, the `assertEmbeddingDimension` guard, OpenAI `dimensions: 1024` wiring, and the `bge-m3` defaults across the Ollama and LM Studio providers plus all three spec files. All acceptance criteria are met: the dimension is single-sourced, the guard is correctly applied at every provider return boundary (including Ollama's private silent helper), and the default model is single-sourced via `DEFAULT_MULTILINGUAL_EMBEDDING_MODEL` with no drift-prone duplication in provider code. Test coverage is thorough and verifies the body fields and defaults. No bugs or security issues found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected test ran target test for 4 projects (ai-service, database, auth-service, api-gateway), all succeeded.
- ai-service: 18 suites / 182 tests passed (covers embeddings constant, dimension guard, OpenAI dims, and bge-m3 provider defaults)
- auth-service: 1 suite / 1 test passed
- database, api-gateway: no tests found (passWithNoTests)

Note: the task's code changes are uncommitted (working tree), so the standard `--base=HEAD~1 --head=HEAD` invocation reported "No tasks were run". Re-ran with `--base=HEAD` to include the working-tree changes, which correctly selected the affected ai-service project. All tests green.

## TeamLead Check

Status: APPROVED

All in-scope acceptance criteria (AC-06, AC-07, AC-08) verified against the implementation:

- AC-06 — Defaults are all 1024-dim multilingual: Ollama and LM Studio default to `bge-m3` via the single-sourced `DEFAULT_MULTILINGUAL_EMBEDDING_MODEL` (`embeddings.constants.ts:16`, used in both providers); OpenAI sends `dimensions: 1024` in both `generateEmbedding` and `generateBatch`. Tested in `ollama-embedding.provider.spec.ts` (default `bge-m3`) and `openai-embedding.provider.spec.ts` (`body.dimensions === 1024`).
- AC-07 — `DIMENSIONS` is `EXPECTED_EMBEDDING_DIM` (1024) in `openai-embedding.provider.ts:10`; request body includes `dimensions: DIMENSIONS` in both POST calls (lines 79, 102). Verified by spec assertions on the request body.
- AC-08 — Single source of truth `EXPECTED_EMBEDDING_DIM = 1024` (`embeddings.constants.ts:9`); `assertEmbeddingDimension` throws the exact message `Embedding dimension mismatch: model=<m>, expected=1024, got=<n>` and is applied at every provider return boundary, including Ollama's private `generateEmbeddingSilent` helper.

Provider default strings are single-sourced (no drift-prone duplication), satisfying the TASK-003 reuse constraint. Note: the explicit guard pass/mismatch unit test belongs to AC-12 (TASK-004) and is correctly out of this task's scope. Code review APPROVED and QA PASS (18 suites / 182 ai-service tests green) corroborate.
