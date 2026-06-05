---
id: TASK-008
title: "fix(fast-embeddings): log embed duration in OllamaEmbeddingProvider (AC-08)"
status: done
priority: high
repo: be
epic: fast-embeddings
complexity: 1
created-at: 2026-06-04T18:12:08.000Z
updated-at: 2026-06-04T21:28:44+03:00
started-at: 2026-06-04T21:23:53+03:00
completed-at: 2026-06-04T21:28:44+03:00
spec: .planning/work/fast-embeddings/SPEC.md
---

## Description

Epic test gate (TEST-REPORT.md, 2026-06-04) failed SPEC AC-08: "Embedding response logged with provider name and duration for observability."

`OpenAiEmbeddingProvider` already logs `OpenAI embed: <N>ms` via `LoggerService.debug`. `OllamaEmbeddingProvider` does not — `apps/ai-service/src/embeddings/providers/ollama-embedding.provider.ts` logs only `textLength` (line 26-29) and `dimensions` (line 35-38) in `generateEmbedding`, and only `count` in `generateBatch` (line 43). With `EMBEDDING_PROVIDER=ollama` (the default), no embed durations appear in logs, so the embed-step latency is unobservable and the SPEC Success Criterion 3 ("measurable in logs") cannot be evaluated on the ollama path.

Fix: add duration measurement (`Date.now()` delta around the axios call) to `OllamaEmbeddingProvider.generateEmbedding` and `generateBatch`, logging via `LoggerService.debug` in the same pattern as the OpenAI provider (e.g. `Ollama embed: <N>ms`, context `'OllamaEmbeddingProvider'`). Update/extend `ollama-embedding.provider.spec.ts` to assert the duration log. No behavior change beyond logging.

## Acceptance Criteria

- [ ] AC-08: Embedding response logged with provider name and duration for observability

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the duration-logging change to `OllamaEmbeddingProvider` (`generateEmbedding` and `generateBatch`) and the corresponding spec additions for AC-08. The implementation correctly measures the axios call duration and emits `Ollama embed: <N>ms` via `LoggerService.debug` with context `'OllamaEmbeddingProvider'`, faithfully mirroring the OpenAI provider pattern; the new `generateEmbeddingSilent` helper sensibly keeps batch logging to a single aggregate line. Tests assert the duration log on both paths via a `/^Ollama embed: \d+ms$/` regex. Change is minimal, focused, and introduces no behavior change beyond logging.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected (--base=HEAD~1 --head=HEAD) reported no tasks, since the task changes are still uncommitted in the working tree. Running affected against the modified file (apps/ai-service/src/embeddings/providers/ollama-embedding.provider.ts) ran target `test` for project `ai-service`: 15 test suites passed (15 total), 145 tests passed (145 total), 0 failed. This includes the updated `ollama-embedding.provider.spec.ts` asserting the `Ollama embed: <N>ms` duration log for AC-08.

## TeamLead Check

Status: APPROVED

AC-08 verified: `OllamaEmbeddingProvider` now logs embed duration with the provider context for observability. `generateEmbedding` measures the axios call duration and emits `Ollama embed: <N>ms` via `LoggerService.debug` with context `'OllamaEmbeddingProvider'` (ollama-embedding.provider.ts:30-41); `generateBatch` does the same for the aggregate batch (lines 47-50), mirroring the existing `OpenAiEmbeddingProvider` `OpenAI embed: <N>ms` pattern. This restores observability of the embed step on the default ollama path, satisfying SPEC AC-08 and unblocking Success Criterion 3 ("measurable in logs"). Code review APPROVED and qa-be PASS (15 suites / 145 tests, including the spec assertion of the duration log).
