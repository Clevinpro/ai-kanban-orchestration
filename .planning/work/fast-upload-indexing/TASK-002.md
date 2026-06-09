---
id: TASK-002
title: Async upload — return 202 immediately, index in background with status transitions
status: done
priority: high
repo: be
epic: fast-upload-indexing
complexity: 5
created-at: 2026-06-09T16:11:12Z
updated-at: 2026-06-09T19:26:46+03:00
started-at: 2026-06-09T19:17:19+03:00
completed-at: 2026-06-09T19:26:46+03:00
spec: .planning/work/fast-upload-indexing/SPEC.md
---

## Description

Move document indexing off the request path. Split `uploadDocument`: a fast path validates the file and stores the `Document` row (`status='pending'`), and the controller responds `202 Accepted` with `{ documentId, status: 'pending' }` WITHOUT awaiting indexing. The heavy work (context-gen + embed + insert) runs in the background after the response is sent: set `status='indexing'` on start, `status='ready'` on success, `status='failed'` (logged at `error`) on unrecoverable failure. Background indexing is bounded by a configurable in-process concurrency limit so simultaneous uploads / a full reindex do not flood the LLM or DB.

## Acceptance Criteria

- [ ] `uploadDocument` split: fast path validates + stores Document row, returns `{ documentId, status: 'pending' }`; controller responds `202 Accepted` without awaiting indexing (AC-02)
- [ ] Indexing runs in the background after the response is sent; sets `status='indexing'` on start, `status='ready'` on success, `status='failed'` (logged `error`) on failure (AC-03)
- [ ] Background indexing bounded by a configurable in-process concurrency limit (AC-04)
- [ ] `nx test ai-service` passes

## Technical Notes

- Files: `apps/ai-service/src/document/document.service.ts`, `apps/ai-service/src/document/document.controller.ts`.
- Returning `202` then doing the work synchronously in the same await chain is a BUG — the response MUST be sent before indexing runs (e.g. schedule the index task, do not `await` it in the request handler).
- Reuse the `mapWithConcurrency` primitive from contextual-retrieval for the bounded background runner; concurrency knob via ConfigService (reuse/extend existing `CONTEXTUAL_RETRIEVAL_CONCURRENCY` or a new env).
- Keep the existing per-chunk context fallback intact; a per-chunk fallback is NOT a document `failed` — only an unrecoverable error (embed/insert) marks `failed`.
- Depends on TASK-001 (`status` column).
- The status-polling endpoint + crash recovery are TASK-003.
- Controller `@HttpCode(HttpStatus.ACCEPTED)` (202) on the upload handler; update the return shape.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `document.controller.ts`, `document.service.ts`, `document.module.ts`, and `document.service.spec.ts` against TASK-002. The async-upload split is correctly implemented: `registerDocument` is the fast path (validate + store row with `status='pending'`), the controller returns `202 Accepted` via `void this.documentService.scheduleIndexing(...)` without awaiting the heavy work, and `indexDocument` drives the `indexing → ready/failed` lifecycle with per-chunk context fallback (never a `failed`). The in-process semaphore (`acquireSlot`/`releaseSlot`/`runBackground`) is balanced and correctly bounds concurrency via `BACKGROUND_INDEX_CONCURRENCY` (falling back to `CONTEXTUAL_RETRIEVAL_CONCURRENCY`, then 2). The synchronous `uploadDocument` is preserved for `VaultSyncService`, whose delete-after-index contract still holds. Temp-file lifecycle is sound: the temp file is read synchronously before the 202 response, the background indexer re-reads content from the DB (not the temp dir), and cleanup is correctly deferred to the detached `.finally()`. Tests cover all four ACs plus the failure/swallow paths.

Minor (non-blocking) note: the new `BACKGROUND_INDEX_CONCURRENCY` env var is not documented in `ai-platform/.env.example`, unlike the sibling `CONTEXTUAL_RETRIEVAL_CONCURRENCY` knob; worth adding for consistency. (`.env.example` is outside this task's listed changed files.)
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

The committed HEAD~1..HEAD window touched only planning files (no affected projects). The actual TASK-002 changes (`document.controller.ts`, `document.module.ts`, `document.service.ts`, `document.service.spec.ts`) are present in the working tree, so QA ran the affected test target against those changes.

All affected projects passed:
- ai-service: 19 suites, 227 tests passed (includes the async-upload / background-indexing / concurrency tests)
- auth-service: 1 test passed
- database: no tests (passWithNoTests)
- api-gateway: no tests (passWithNoTests)

Exit code 0.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=DOWN, auth-service=DOWN, ai-service=DOWN (boot soft-fail, non-blocking — local infra such as DB/Redis not running; all services compiled cleanly).

All acceptance criteria for TASK-002 verified (the AC-02/03/04 slice of the SPEC):
- AC-02: `uploadDocument` split — `registerDocument` is the fast path (validate + store `Document` row with `status='pending'`, returns `{ documentId, status:'pending' }`); controller carries `@HttpCode(HttpStatus.ACCEPTED)` (202) and fires `void scheduleIndexing(...)` without awaiting, so the response is sent before indexing. Synchronous `uploadDocument` preserved for `VaultSyncService`. Tested (registerDocument returns pending without status writes; scheduleIndexing returns immediately).
- AC-03: `indexDocument` drives `indexing` on start → `ready` on success → `failed` (logged at `error`) on unrecoverable embed/insert/missing-row failure; per-chunk context fallback never marks `failed`. Tested (pending→indexing→ready, and →failed on embed throw with error log + re-throw; scheduleIndexing swallows failures without unhandled rejection).
- AC-04: Background indexing bounded by an in-process semaphore (`acquireSlot`/`releaseSlot`/`runBackground`) sized from `BACKGROUND_INDEX_CONCURRENCY` → `CONTEXTUAL_RETRIEVAL_CONCURRENCY` → default 2. Tested (5 scheduled jobs, maxInFlight ≤ 2 under limit 2).
- `nx test ai-service` passes (227 tests, per QA).
