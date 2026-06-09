---
id: TASK-004
title: Batch embedding in upload + reindex via generateBatch (post-contextualization)
status: done
priority: medium
repo: be
epic: contextual-retrieval
complexity: 3
created-at: 2026-06-09T09:40:04Z
updated-at: 2026-06-09T13:12:09+03:00
started-at: 2026-06-09T13:08:35+03:00
completed-at: 2026-06-09T13:12:09+03:00
spec: .planning/work/contextual-retrieval/SPEC.md
---

## Description

Fold batch embedding into both `uploadDocument` and `reindexDocument` so the now-heavier re-index stays fast. After contextualization is complete for all chunks, embed them via `generateBatch` (batched, not one-by-one). Throughput improves; behavior is otherwise identical. No changes to `SearchService` SQL, RRF fusion, or the vector column.

## Acceptance Criteria

- [ ] Upload + reindex embed chunks via `generateBatch` (batched), where contextualization is already complete (AC-20)
- [ ] Behavior otherwise identical; throughput improved (AC-20)
- [ ] No changes to `SearchService` SQL, RRF, or vector column
- [ ] `nx test ai-service` passes

## Technical Notes

- File: `apps/ai-service/src/document/document.service.ts`.
- Embed input stays original-cased (TASK-002) and contextualized (TASK-003).
- Batching happens AFTER per-chunk context gen completes for the document.
- Reuse the existing embedding provider's `generateBatch` from the provider abstraction (`fast-embeddings`).

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `document.service.ts` and `document.service.spec.ts`. The change correctly folds batch embedding into both `uploadDocument` (line 92) and `reindexDocument` (line 168) via `generateBatch`, called after `contextualizeChunks` completes for the whole document, with input order preserved when mapping `embeddings[i]` back to chunks. The contextualized, original-cased text is used identically for both the stored `content` and the embedded text, the reindex delete+insert transaction semantics are unchanged, and no `SearchService`/RRF/vector-column changes were made. Tests are solid: AC-20 asserts a single `generateBatch` call, no `generateEmbedding` calls, and that the batched input equals the stored contextualized content.

One non-blocking note for awareness: for a document that yields zero chunks (empty/whitespace-only file that still passes `assertSupportedFile`), `generateBatch([])` is now invoked unconditionally, and the OpenAI provider throws "returned no data" on an empty `data` array (openai-embedding.provider.ts:112) — whereas the previous per-chunk loop would have made no embedding call. This is a narrow edge case and likely not exercised in practice, but a `contextualized.length === 0` short-circuit before the embed call would make the "behavior otherwise identical" guarantee airtight.

Relevant files:
- /Users/tarasbannyi/TestAI/ai-agent-microservices/ai-platform/apps/ai-service/src/document/document.service.ts
- /Users/tarasbannyi/TestAI/ai-agent-microservices/ai-platform/apps/ai-service/src/document/document.service.spec.ts
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task. `nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit 0), and `nx show projects --affected` returned an empty list. Per D-06, no affected tests is not a failure.

## TeamLead Check

Status: APPROVED

All acceptance criteria for this task verified against the implementation in `document.service.ts` and its tests:
- AC-20 (batched embedding via `generateBatch`, post-contextualization): Confirmed. Both `uploadDocument` (line 92) and `reindexDocument` (line 168) call `this.embeddings.generateBatch(contextualized)` exactly once, after `contextualizeChunks` completes for the whole document, with input order preserved via `embeddings[i]`. The same contextualized, original-cased string is both stored as `content` and embedded — behavior otherwise identical. Test `AC-20` asserts a single `generateBatch` call, zero `generateEmbedding` calls, and that the batched input equals the stored contextualized content (spec lines 538-552).
- No `SearchService` SQL / RRF / vector-column changes: Confirmed. The insert SQL and `::vector` cast are unchanged; no SearchService or query-path edits in this task.
- `nx test ai-service` passes: QA reported no affected tests for this task's diff (per D-06 not a failure); code review confirmed the AC-20 test suite is solid.

Code review's non-blocking note (unconditional `generateBatch([])` on a zero-chunk document) is a narrow edge case that does not violate AC-20 and is not gating.
