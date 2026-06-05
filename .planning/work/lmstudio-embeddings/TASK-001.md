---
id: TASK-001
title: Implement LmStudioEmbeddingProvider (clone OpenAI provider, swap URL, drop auth + dimensions)
status: done
priority: high
repo: be
epic: lmstudio-embeddings
complexity: 3
created-at: 2026-06-05T10:29:52Z
updated-at: 2026-06-05T13:37:35+03:00
started-at: 2026-06-05T13:33:44+03:00
completed-at: 2026-06-05T13:37:35+03:00
spec: .planning/work/lmstudio-embeddings/SPEC.md
---

## Description

Create `LmStudioEmbeddingProvider` at `ai-platform/apps/ai-service/src/embeddings/providers/lmstudio-embedding.provider.ts`, implementing the existing `EmbeddingProvider` interface (`generateEmbedding` + `generateBatch`). Clone the OpenAI provider (`openai-embedding.provider.ts`) as the template: keep the single-call batch, response index-sort, empty-data guard, and axios error-sanitize logic identical, but swap the hardcoded OpenAI URL for a configurable `LMSTUDIO_URL` base, remove the `Authorization` header and API-key resolution entirely, and omit the `dimensions` field from the request body.

## Acceptance Criteria

- [ ] `LmStudioEmbeddingProvider` implements `EmbeddingProvider` (`generateEmbedding` + `generateBatch`)
- [ ] Reads `LMSTUDIO_URL` (default `http://localhost:1234/v1`) and `LMSTUDIO_EMBEDDING_MODEL` (default `text-embedding-nomic-embed-text-v1.5`) via `ConfigService`
- [ ] Requests POST to `<LMSTUDIO_URL>/embeddings` with body `{ input, model }` only — no `dimensions` field, no `Authorization` header
- [ ] `generateBatch` sends `input: string[]` in one HTTP call and returns vectors sorted by response `index`
- [ ] Axios errors sanitized into `LM Studio API request failed: status=..., message=...` Error; empty-data response throws clear error
- [ ] Embedding call logged with provider name + duration (matches existing observability pattern)

## Technical Notes

- Template: `ai-platform/apps/ai-service/src/embeddings/providers/openai-embedding.provider.ts` — clone, then apply the diff table from SPEC.md ("Diff from OpenAI provider" section).
- Deletions vs OpenAI: `resolveApiKey()` throw-guard, `Authorization: Bearer` header, `dimensions: 768` body field.
- Response shape is OpenAI-compatible: `{ data: [{ embedding, index }] }`.
- Provider sketch with exact constructor/config defaults is in SPEC.md "Provider (sketch)".
- Do NOT touch the factory or module in this task — wiring is TASK-002.
- Load `ai-platform/CLAUDE.md` before editing.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the new `LmStudioEmbeddingProvider` against the OpenAI provider template and all six acceptance criteria. The clone is faithful: config defaults are correct, the request body is `{ input, model }` only (no `dimensions`, no `Authorization` header), batch uses a single call with index-sorted results, errors are sanitized to the `LM Studio API request failed: ...` format, empty-data is guarded, and the embed call is logged with provider name and duration. The `resolveApiKey()` guard and no-key constructor warning were correctly removed. Code quality is consistent with the existing codebase; no bugs or security issues found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit code 0). The new file `apps/ai-service/src/embeddings/providers/lmstudio-embedding.provider.ts` is currently untracked, so the HEAD~1..HEAD range detects no affected projects. No affected tests found — no test coverage for this task.

## TeamLead Check

Status: APPROVED

All acceptance criteria for this task verified against `lmstudio-embedding.provider.ts` (these map to SPEC AC-01, AC-02, AC-03, AC-04, AC-08, AC-10; SPEC AC-05/06/07/09/11 are explicitly out of scope here and deferred to TASK-002/003/004):

- AC (implements interface): `implements EmbeddingProvider` with both `generateEmbedding` and `generateBatch`. PASS.
- AC (config defaults): reads `LMSTUDIO_URL` (default `http://localhost:1234/v1`) and `LMSTUDIO_EMBEDDING_MODEL` (default `text-embedding-nomic-embed-text-v1.5`) via `ConfigService`. PASS.
- AC (request shape): POSTs to `${baseUrl}/embeddings` with body `{ input, model }` only — no `dimensions` field and no `Authorization` header (no headers arg passed to axios). PASS.
- AC (batch): single HTTP call with `input: string[]`, results `.slice().sort((a,b) => a.index - b.index).map(d => d.embedding)`. PASS.
- AC (error sanitize + empty guard): `sanitizeAxiosError` emits exact `LM Studio API request failed: status=..., message=...`; empty-data guarded in both methods. PASS.
- AC (observability): `logger.debug` with duration and `'LmStudioEmbeddingProvider'` context in both paths. PASS.

Code review APPROVED and QA PASS are consistent with the implementation.
