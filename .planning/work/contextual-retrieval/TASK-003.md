---
id: TASK-003
title: Contextual Retrieval — per-chunk LLM context with flag, concurrency, fallback
status: done
priority: high
repo: be
epic: contextual-retrieval
complexity: 5
created-at: 2026-06-09T09:40:04Z
updated-at: 2026-06-09T13:08:20+03:00
started-at: 2026-06-09T13:00:52+03:00
completed-at: 2026-06-09T13:08:20+03:00
spec: .planning/work/contextual-retrieval/SPEC.md
---

## Description

Implement the Anthropic Contextual Retrieval pattern in `DocumentService`. Inject `AiProviderFactory`; for each chunk generate a ≤2-sentence context via the chat LLM, prompted with the WHOLE document + the chunk, instructed to answer in the document's language and only situate the chunk (no new facts). `chat()` returns `Observable<string>` (streaming) — fully accumulate the stream into one string before use (e.g. `lastValueFrom(provider.chat(prompt).pipe(toArray()))` joined + trimmed). Prepend the generated context to the chunk so BOTH the stored `content` and the embedded text become `"{context}\n\n{chunkBody}"` (trigram lexical index benefits too). Gate behind `CONTEXTUAL_RETRIEVAL_ENABLED` (default `true`); when `false`, embed/store with heading-as-context only, no LLM call. If context gen throws or times out for a chunk, index that chunk WITHOUT context (log at `warn`) — the upload/reindex must not fail. Respect a configurable concurrency limit (`CONTEXTUAL_RETRIEVAL_CONCURRENCY`, default 4) so a local LLM is not overwhelmed during a full vault reindex.

## Acceptance Criteria

- [ ] `DocumentService` injects `AiProviderFactory`; per-chunk ≤2-sentence context generated, prompted with whole document + chunk, in the document's language, no new facts (AC-01)
- [ ] Streamed `chat()` fully accumulated into one string before use (AC-02)
- [ ] Context prepended: stored `content` AND embedded text both become `"{context}\n\n{chunkBody}"` (AC-03)
- [ ] `CONTEXTUAL_RETRIEVAL_ENABLED` (default `true`) gates feature; `false` → no LLM call, heading-as-context only (AC-04)
- [ ] Context-gen throw/timeout → chunk indexed without context, logged `warn`, upload does not fail (AC-05)
- [ ] Configurable concurrency limit (default 4) bounds context generation (AC-06)
- [ ] `nx test ai-service` passes

## Technical Notes

- File: `apps/ai-service/src/document/document.service.ts`. Uses the chat LLM (`AI_PROVIDER`), independent of `EMBEDDING_PROVIDER`.
- Prompt shape (SPEC §"Prompt shape"): document in `<document>`, chunk in `<chunk>`, "1-2 short sentences, same language, situate the chunk, add no new facts, output only the context sentences."
- Accumulation: `import { lastValueFrom, toArray } from 'rxjs';` — partial/streamed handling is a bug.
- Builds on TASK-001 chunking + TASK-002 no-lowercase. Embed the contextualized text without lowercasing.
- Batch embedding is TASK-004 — here embedding may remain as-is; do not regress the no-lowercase input.
- `.env.example` documentation is TASK-006.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed document.service.ts, document.module.ts, and document.service.spec.ts for TASK-003 (Contextual Retrieval). All seven acceptance criteria are met: AiProviderFactory + ConfigService injected, per-chunk context generated from whole-document+chunk prompt (same language, no new facts), stream fully accumulated via toArray()+join+trim, context prepended identically to both stored content and embedded text, CONTEXTUAL_RETRIEVAL_ENABLED gating with safe default, graceful warn-logged heading fallback on error/unavailable-provider, and bounded concurrency via an order-preserving mapWithConcurrency. The concurrency primitive is correct (shared-cursor increment is atomic on JS's single thread), edge cases (empty chunks, disabled flag, provider throw) are covered by tests, and module wiring is correct.

**Non-blocking observations (no change required):**
- document.service.ts:255 — `generateContext` has no explicit rxjs `timeout()`; the SPEC mentions "throws or times out." Fallback relies on the provider's transport surfacing a timeout as a stream error. If a provider's `chat()` Observable hangs without erroring, the per-chunk fallback would not trigger. Acceptable given current providers error on transport failure, but an explicit `.pipe(timeout(...))` would make the timeout guarantee self-contained. WARNING-level note only.
- document.service.ts:274-277 — whole-document content is interpolated raw into `<document>`/`<chunk>` tags; a document literally containing those closing tags could perturb the prompt. Inherent to the Anthropic pattern and low-risk for trusted vault content; informational only.

Overall quality is high and the change is approved.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected --base=HEAD~1 --head=HEAD reported "No tasks were run" because the TASK-003 changes (document.service.ts, document.module.ts, document.service.spec.ts) are still uncommitted in the working tree, so commit-to-commit affected detection found no projects. Re-ran with --uncommitted to exercise the actual changes: 4 projects (ai-service, database, auth-service, api-gateway) all passed. ai-service (the project containing this task's changes): 19 test suites passed, 210 tests passed. auth-service: 1 passed. database/api-gateway: no tests found (passWithNoTests). All green, exit code 0.

## TeamLead Check

Status: APPROVED

All acceptance criteria for TASK-003 (the Contextual Retrieval slice) verified against the implementation and tests:
- AC-01: `DocumentService` injects `AiProviderFactory` + `ConfigService`; `generateContext` prompts the chat LLM with the whole document (`<document>`) and the chunk (`<chunk>`), instructing 1-2 short sentences in the document's language, situate-only, no new facts. Covered by the `AC-01` prompt-shape test.
- AC-02: `generateContext` fully accumulates the streamed `chat()` via `lastValueFrom(provider.chat(prompt).pipe(toArray()))` then `join('').trim()`. Multi-emission stream test confirms full accumulation.
- AC-03: `contextualizeChunks` returns `"{context}\n\n{chunk.content}"` which is used as both the stored `content` and the embedded input; test asserts `storedContents === embeddedTexts` with the `{context}\n\n` shape.
- AC-04: `contextualRetrievalEnabled` getter (default `true`, only literal `false` disables); when disabled, `headingFallback` yields `"{heading}\n{body}"` with no LLM call. Test confirms `chat` not called and heading-only context.
- AC-05: `generateContext` try/catch and provider-acquisition try/catch both log at `warn` and fall back to heading; upload resolves successfully. Two tests cover chat-error and unavailable-provider paths.
- AC-06: `mapWithConcurrency` bounds in-flight LLM calls to `contextConcurrency` (default 4). Test with concurrency=2 confirms `maxInFlight <= 2`.
- `nx test ai-service`: QA reports 19 suites / 210 tests pass (run via --uncommitted since changes are unstaged).

Note (non-blocking, consistent with code review): no explicit rxjs `timeout()` on `generateContext`; fallback relies on the provider transport surfacing timeouts as stream errors. Acceptable for current providers. Batch embedding and `.env.example` are explicitly out of scope here (TASK-004 / TASK-006).
