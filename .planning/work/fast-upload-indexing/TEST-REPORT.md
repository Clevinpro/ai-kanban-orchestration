# Epic Test Report — fast-upload-indexing

Verdict: PASS
Generated: 2026-06-09T17:15:00Z
Tasks verified: 8 (all done)
SPEC: .planning/work/fast-upload-indexing/SPEC.md

## Acceptance Criteria

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| AC-01 | `Document.status` column (`pending\|indexing\|ready\|failed`, default `pending`), nullable-safe pre-existing rows → `ready` | PASS | TASK-001: `schema.prisma` adds `status String @default("pending")`; migration `add_document_status` (TEXT NOT NULL DEFAULT 'pending') + `backfill_document_status_ready`. Code review APPROVED, TeamLead PASS |
| AC-02 | `uploadDocument` split: fast path stores row, returns `{documentId,status:'pending'}`; controller `202` without awaiting indexing | PASS | TASK-002: `registerDocument` fast path, `@HttpCode(202)`, `void scheduleIndexing(...)`. Tested + APPROVED |
| AC-03 | Background indexing sets `indexing`→`ready`/`failed` (error-logged) after response sent | PASS | TASK-002: `indexDocument` lifecycle; tested pending→indexing→ready and →failed on embed throw |
| AC-04 | Background indexing bounded by configurable in-process concurrency | PASS | TASK-002: semaphore `acquireSlot/releaseSlot`, `BACKGROUND_INDEX_CONCURRENCY`→`CONTEXTUAL_RETRIEVAL_CONCURRENCY`→2; tested maxInFlight ≤ limit |
| AC-05 | `GET /documents/:id/status` → `{documentId,status,chunksCount}`; unknown id → 404 | PASS | TASK-003: `@Get(':id/status')` + `getDocumentStatus` (LEFT JOIN COUNT); NULL→ready; NotFoundException. APPROVED |
| AC-06 | Crash recovery: orphaned `pending`/`indexing` no-chunks doc re-indexed by startup scan; no orphaned rows | PASS | TASK-003: `recoverOrphanedPending()` after `runStartupScan`; with-chunks→ready, chunk-less→failed. Tested |
| AC-07 | Context prompt embeds bounded window `CONTEXT_WINDOW_CHARS` (default 2000), not whole doc | PASS | TASK-004: `windowAroundChunk` centred+clamped; whole-doc prompt removed. Tested |
| AC-08 | Doc fitting within window uses whole doc unchanged — char-budget assertion | PASS | TASK-004: passthrough when `length <= window`; AC-08 char-budget test |
| AC-09 | Prompt length bounded regardless of doc size — `O(chunks × window)` | PASS | TASK-004: AC-09 test asserts bound for small-over and large docs |
| AC-10 | Interpolated chunk/window text sanitized so it cannot break `<document>`/`<chunk>` delimiters; meaning preserved | PASS | TASK-005: `escapeForPrompt` entity-encodes `<`→`&lt;`/`>`→`&gt;` in `buildContextPrompt`; decode round-trip test |
| AC-11 | Per-chunk `generateContext` bounded by `CONTEXT_LLM_TIMEOUT_MS` (default 15000) via rxjs `timeout()`; timeout→heading fallback (warn), doc not failed | PASS | TASK-005: `provider.chat().pipe(timeout(...), toArray())`; TimeoutError→heading fallback. Tested both paths |
| AC-12 | Existing per-chunk try/catch fallback preserved — escape+timeout additive | PASS | TASK-005: pre-existing fallback unchanged, additions layered inside. Verified |
| AC-13 | Gateway upload proxy sets `UPLOAD_PROXY_TIMEOUT_MS` timeout via `AbortController` | PASS | TASK-006: `AbortController` + `setTimeout(abort, getUploadProxyTimeoutMs())`, `signal` passed to fetch. Tested |
| AC-14 | Timeout/abort→504, non-2xx downstream→502, successful 202+body relayed | PASS | TASK-006: AbortError→GatewayTimeoutException, !ok/generic→BadGatewayException; 504/502 specs |
| AC-15 | Gateway relays `{documentId,status}` + `202` status code | PASS | TASK-006: `@HttpCode(ACCEPTED)`, relays body. AC-15 relay spec |
| AC-16 | `INDEX_RECIPE_VERSION` bumped to auto-reindex on next boot | PASS | TASK-007: `embeddings.constants.ts` v2→v3, single-sourced; spec assertion passes |
| AC-17 | `.env.example` documents `CONTEXT_WINDOW_CHARS`, `CONTEXT_LLM_TIMEOUT_MS`, `UPLOAD_PROXY_TIMEOUT_MS`, async-202+polling, re-enable note | PASS | TASK-007: all knobs + async behaviour + `CONTEXTUAL_RETRIEVAL_ENABLED=true` note (active stays `false`). APPROVED after fix cycle |
| AC-18 | `nx test ai-service`+`api-gateway` pass; covers async-202, transitions, status endpoint, window bound, escaping, timeout fallback, gateway 504/502 | PASS | TASK-008: api-gateway 8/8, ai-service 251/251 (259 total, exit 0); TeamLead re-ran `nx run-many` and mapped each behaviour to specs |

## Summary

PASS — all 18 acceptance criteria are satisfied by the aggregated evidence across the 8 done tasks. The epic delivers async upload (202 + background indexing with bounded concurrency and `pending→indexing→ready/failed` status, TASK-001/002/003), windowed context bounded by `CONTEXT_WINDOW_CHARS` (TASK-004), prompt-safe escaping plus per-chunk LLM timeout fallback (TASK-005), an honest gateway proxy mapping abort→504 / downstream→502 while relaying the 202 async shape (TASK-006), the `INDEX_RECIPE_VERSION` bump + `.env.example` docs (TASK-007), and a full test suite (TASK-008: 259 tests green across ai-service + api-gateway). Every AC has corroborating code-review APPROVED, QA PASS, and TeamLead Check verdicts. No follow-up fix tasks required.
