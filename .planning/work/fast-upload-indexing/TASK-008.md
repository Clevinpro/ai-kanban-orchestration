---
id: TASK-008
title: Tests — async 202, status transitions/endpoint, window bound, escaping, LLM timeout, gateway 504/502
status: done
priority: medium
repo: be
epic: fast-upload-indexing
complexity: 3
created-at: 2026-06-09T16:11:12Z
updated-at: 2026-06-09T20:11:55+03:00
started-at: 2026-06-09T20:02:37+03:00
completed-at: 2026-06-09T20:11:55+03:00
spec: .planning/work/fast-upload-indexing/SPEC.md
---

## Description

Add unit tests covering all new behavior from this epic so `nx test ai-service` and `nx test api-gateway` pass with the new logic exercised. Cover: async upload returns `202` without awaiting indexing; status transitions (`pending → indexing → ready`, and `→ failed`); the status endpoint (incl. 404); windowed-prompt char bound (prompt length bounded regardless of doc size); tag-content escaping (delimiters not breakable); LLM-timeout fallback (slow chunk → heading-context, document not failed); gateway `504` on abort + `502` on downstream error.

## Acceptance Criteria

- [ ] Test: async upload returns `202` without awaiting indexing (AC-18)
- [ ] Test: status transitions `pending→indexing→ready` and `→failed` (AC-18)
- [ ] Test: `GET /documents/:id/status` returns shape + 404 on unknown id (AC-18)
- [ ] Test: windowed-prompt char bound — prompt length bounded regardless of document size (AC-18)
- [ ] Test: tag-content escaping — `<document>`/`<chunk>` delimiters not breakable by content (AC-18)
- [ ] Test: LLM-timeout fallback — slow chunk → heading-context, document not failed (AC-18)
- [ ] Test: gateway `504` on abort + `502` on downstream non-2xx (AC-18)
- [ ] `nx test ai-service` and `nx test api-gateway` pass

## Technical Notes

- Test files: `apps/ai-service/src/document/document.service.spec.ts`, `document.controller.spec.ts`, `vault/vault-sync.service.spec.ts`, `apps/api-gateway/src/documents/documents.controller.spec.ts`.
- Async-without-await: assert the controller resolves `202` before the background index promise settles (spy on the index method; assert response returned while it is still pending).
- Window bound: feed a large synthetic doc, assert the prompt passed to `chat()` is ≤ `CONTEXT_WINDOW_CHARS` (+ fixed template overhead).
- Escaping: feed content containing `</document>` / `<chunk>`; assert delimiters in the final prompt are intact / content escaped.
- LLM timeout: mock `chat()` to a never-emitting/delayed Observable; assert `timeout()` fires → heading fallback, document still `ready`.
- Gateway: mock `fetch` to abort (AbortError) → expect 504; mock non-2xx → expect 502.
- Final task — exercises TASK-001..007 integrated.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the TASK-008 test deliverables: the new `document.controller.spec.ts` plus modified specs `document.service.spec.ts`, `vault-sync.service.spec.ts`, `api-gateway/documents.controller.spec.ts`, and `embeddings.constants.spec.ts`. Cross-checked each test against its implementation (`document.controller.ts`, `document.service.ts`, `documents.controller.ts`, `vault-sync.service.ts`, `embeddings.constants.ts`) and confirmed all referenced methods, signatures, status keys, and behaviors match. Every acceptance criterion is exercised: async 202-without-await (verified via a controlled pending `scheduleIndexing` promise asserting the response returns before the background job settles), `pending→indexing→ready`/`→failed` transitions, the status endpoint shape + 404, the bounded context-window char limit, tag-content HTML-entity escaping, the per-chunk LLM-timeout heading fallback, and gateway 504-on-abort / 502-on-downstream-error. Tests are isolated, deterministic, and avoid real IO. Minor non-blocking hygiene note: the async-202 test leaves the controller's detached `.then/.finally` microtask chain unawaited after assertion, but mocks make this benign. Overall quality is high and the test coverage is thorough and faithful to the implemented behavior.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

Affected projects: ai-service and api-gateway. The HEAD~1..HEAD diff only touched .planning/ docs, so nx affected (--base=HEAD~1 --head=HEAD) reported no tasks; the TASK-008 source/test deliverables are uncommitted in the working tree, so tests were run via nx affected --files against the task's changed spec/source files.

- api-gateway: 1 suite, 8 tests passed (gateway 504 on abort, 502 on downstream non-2xx exercised).
- ai-service: 20 suites, 251 tests passed (async 202 without await, pending→indexing→ready/→failed transitions, status endpoint shape + 404, windowed-prompt char bound, tag-content escaping, LLM-timeout heading fallback).

Total: 259 tests passed, exit code 0.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=DOWN, auth-service=DOWN, ai-service=DOWN (non-blocking WARN — all three compiled cleanly via webpack; boot DOWN is missing local infra such as DB/Redis, not a code defect).

All acceptance criteria verified against the SPEC AC-18 and the task's per-line ACs. Independently re-ran `nx run-many -t test -p ai-service api-gateway --skip-nx-cache`: api-gateway 8/8 and ai-service 251/251 (259 total) pass, matching the QA receipt. Confirmed each behavior is genuinely exercised, not just asserted in the receipt:
- 202-without-await + @HttpCode(202) + status endpoint shape `{documentId,status,chunksCount}` + 404 — `document.controller.spec.ts` (lines 65, 91, 134, 154).
- Status transitions `pending→indexing→ready` and embed-failure `→failed`, `scheduleIndexing` returns immediately and swallows failures — `document.service.spec.ts` (lines 1063, 1074, 1085, 1102).
- Windowed-prompt char bound regardless of doc size (AC-07/09 line 613) and small-doc-unchanged (AC-08 line 601).
- Tag-content escaping — `</document>`/`</chunk>` delimiters intact, content entity-encoded `&lt;`/`&gt;` with meaning preserved (AC-10 lines 687, 711).
- LLM-timeout heading fallback, doc not failed by one slow chunk (AC-11/12 line 726).
- Gateway 504 on AbortError, 502 on downstream non-2xx / generic failure, 202 body relayed unchanged — `api-gateway/documents.controller.spec.ts` (lines 51, 63, 80, 90, 100).
