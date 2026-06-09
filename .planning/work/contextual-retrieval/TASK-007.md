---
id: TASK-007
title: Tests — chunking, no-lowercase, context-prepend, fallback, fingerprint, batch, step logging
status: done
priority: medium
repo: be
epic: contextual-retrieval
complexity: 3
created-at: 2026-06-09T09:40:04Z
updated-at: 2026-06-09T13:35:33+03:00
started-at: 2026-06-09T13:31:23+03:00
completed-at: 2026-06-09T13:35:33+03:00
spec: .planning/work/contextual-retrieval/SPEC.md
---

## Description

Add unit tests covering all new behavior from this epic so `nx test ai-service` passes with the new logic exercised. Cover: paragraph/sentence chunking on plain text; no-lowercase embedding input; context-prepend shape (`"{context}\n\n{chunkBody}"`); graceful fallback when the LLM context call fails (chunk indexed without context, upload succeeds); `(provider, model, recipe_version)` fingerprint firing on a recipe-version-only change; batch embedding path; and that each pipeline step logs its `STEP n/total` + the expected `meta` keys.

## Acceptance Criteria

- [ ] Test: paragraph/sentence chunking on plain text (AC-22)
- [ ] Test: no-lowercase embedding input (AC-22)
- [ ] Test: context-prepend shape `"{context}\n\n{chunkBody}"` (AC-22)
- [ ] Test: graceful fallback on LLM context failure — chunk indexed without context, upload succeeds (AC-22)
- [ ] Test: `(provider, model, recipe_version)` fingerprint fires on recipe-version-only change (AC-22)
- [ ] Test: batch embedding path (AC-22)
- [ ] Test: each pipeline step logs `STEP n/total` + expected `meta` keys (AC-22)
- [ ] `nx test ai-service` passes

## Technical Notes

- Test files alongside sources: `document.service.spec.ts`, `vault-sync.service.spec.ts`, `query-normalizer.spec.ts` as needed.
- Mock `AiProviderFactory` / `chat()` to return a controlled `Observable<string>`; for fallback, make it throw.
- Fingerprint test: hold provider + model fixed, change only `recipe_version` → expect truncate + reindex path fires.
- Step-logging test: spy on `LoggerService` and assert `STEP n/total` message + `meta` keys per SPEC AC-18 table.
- Final task — exercises TASK-001..006 integrated.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the four test files delivered by this test-only task (`document.service.spec.ts`, `vault-sync.service.spec.ts`, `query-normalizer.spec.ts`, `embeddings.constants.spec.ts`) against the contextual-retrieval SPEC and the actual implementations in `document.service.ts`, `query-normalizer.ts`, and `embeddings.constants.ts`. Every AC-22 requirement is covered: paragraph/sentence boundary chunking, no-lowercase symmetric input (semantic preserves case, lexical unchanged), context-prepend shape `"{context}\n\n{body}"`, graceful fallback on both chat-error and provider-unavailable paths (warn logged, upload resolves), `(provider, model, recipe_version)` fingerprint firing on recipe-version-only change, batched `generateBatch` embedding, and `STEP n/total` + `meta`-key logging for both upload and reindex. Assertions match the real method signatures, return shapes, log levels (debug for per-chunk steps 5/6, info for 1-4/7), and the `headingFallback` single-newline shape. Stubs are isolated with no real IO. One non-blocking note: the chunk-insert detection heuristic in `makeUploadHarness` (`values[1].startsWith('[')`) relies on Prisma's internal `.values` ordering and the vector literal prefix; it works for the current insert but is somewhat fragile to column-order changes. Overall quality is high and the suite faithfully exercises the integrated TASK-001..006 logic.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit 0) — the task's changes are uncommitted working-tree edits, so the committed HEAD~1..HEAD range shows no affected projects (D-06: not a failure).

Verified directly via `nx test ai-service` (the project owning all modified files): Test Suites 19 passed / 19 total, Tests 220 passed / 220 total, exit 0. Covered spec files include `document.service.spec.ts`, `vault-sync.service.spec.ts`, `query-normalizer.spec.ts`, and `embeddings.constants.spec.ts`.

## TeamLead Check

Status: APPROVED

This is a test-only task whose sole SPEC criterion is AC-22 ("`nx test ai-service` passes; unit tests cover: paragraph/sentence chunking on plain text, no-lowercase embedding input, context-prepend shape, graceful fallback on LLM failure, `(provider, model, recipe_version)` fingerprint firing on recipe-only change, batch embedding, and that each pipeline step logs its `STEP n/total` + expected `meta` keys"). All seven required test areas verified present in the delivered specs, plus the suite-pass gate:

- Paragraph/sentence chunking on plain text — `document.service.spec.ts` "unstructured paragraph blocking" describe (blocks heading-less text, packs paragraphs to MAX, splits oversized paragraph on sentence boundary not mid-sentence).
- No-lowercase embedding input — `query-normalizer.spec.ts` (semantic returns `'FAQ'`/`'тег FAQ'` with case preserved); index-side no-lowercase exercised via `document.service.spec.ts` context tests where embedded text equals cased stored content.
- Context-prepend shape `"{context}\n\n{body}"` — `document.service.spec.ts` AC-03 (stored content === embedded text === `"{context}\n\n{body}"`).
- Graceful fallback on LLM failure — `document.service.spec.ts` AC-05 (chat error and unavailable-provider paths: fall back to heading context, warn logged, upload resolves).
- `(provider, model, recipe_version)` fingerprint on recipe-only change — `vault-sync.service.spec.ts` "truncates when only the recipe version changes (same provider + model)" (provider+model fixed, only recipeVersion differs → TRUNCATE + delete fires).
- Batch embedding path — `document.service.spec.ts` AC-20 (`generateBatch` called once, `generateEmbedding` not called, batched input equals contextualized chunks).
- Per-step `STEP n/total` + `meta` keys — `document.service.spec.ts` AC-15..AC-19 for both upload (steps 1-7) and reindex (steps 3,5,6,7), asserting prefix, context, meta keys, and log levels.
- `nx test ai-service` passes — QA confirmed 220/220 tests, 19/19 suites, exit 0.

Code review APPROVED, QA PASS. All acceptance criteria met.
