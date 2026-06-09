---
id: TASK-006
title: Gateway upload proxy — AbortController timeout → 504, downstream non-2xx → 502, relay 202
status: done
priority: medium
repo: be
epic: fast-upload-indexing
complexity: 3
created-at: 2026-06-09T16:11:12Z
updated-at: 2026-06-09T19:55:06+03:00
started-at: 2026-06-09T19:48:09+03:00
completed-at: 2026-06-09T19:55:06+03:00
spec: .planning/work/fast-upload-indexing/SPEC.md
---

## Description

Make the api-gateway upload proxy honest. The proxy currently uses bare `fetch` with no timeout, so a slow/rejected downstream surfaces as a misleading `500`. Add an explicit request timeout (`UPLOAD_PROXY_TIMEOUT_MS`, env) via `AbortController`; map a proxy timeout/abort to **504** (`GatewayTimeoutException`), a non-2xx downstream to **502** (existing `BadGatewayException`), and relay a successful `202` + JSON body (new async shape `{ documentId, status }`) through unchanged including the status code.

## Acceptance Criteria

- [ ] Upload proxy sets an explicit request timeout (`UPLOAD_PROXY_TIMEOUT_MS`, env) on its `fetch` via `AbortController` (AC-13)
- [ ] Proxy timeout/abort → **504** (`GatewayTimeoutException`); non-2xx downstream → **502** (`BadGatewayException`); successful `202` + JSON body relayed unchanged (AC-14)
- [ ] Gateway relays the async response shape `{ documentId, status }` and the `202` status code to the caller (AC-15)
- [ ] `nx test api-gateway` passes

## Technical Notes

- File: `apps/api-gateway/src/documents/documents.controller.ts` (`proxyUploadDocument`).
- Pattern: `const ac = new AbortController(); const t = setTimeout(() => ac.abort(), UPLOAD_PROXY_TIMEOUT_MS); fetch(url, { ..., signal: ac.signal }); finally clearTimeout(t);` — `e.name === 'AbortError'` → `GatewayTimeoutException`.
- Keep the existing `!response.ok` → `BadGatewayException` (502) path.
- Update the proxy return type / status to relay `202` + `{ documentId, status }` (controller currently `@HttpCode(HttpStatus.OK)` and returns `{ documentId, chunksCount }` — align with TASK-002's async shape).
- This is `repo: be` (api-gateway is a backend service). Touch only api-gateway here — ai-service async shape is TASK-002.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the api-gateway upload proxy changes (documents.controller.ts, its new spec, and .env.example). All three acceptance criteria are correctly implemented: AbortController + UPLOAD_PROXY_TIMEOUT_MS timeout (with a validated default), AbortError->504 / generic-failure->502 / non-2xx-downstream->502 mapping, and relay of the `{ documentId, status }` shape with 202 via @HttpCode(ACCEPTED) — matching the ai-service downstream contract. Tests cover every AC, the timeout is cleared in finally, and downstream error bodies are not leaked to the caller. One minor non-blocking note: the proxy forces 202 for any 2xx rather than truly passing through the downstream status, which is harmless given ai-service only returns 202 on success.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

Note: The TASK-006 changes (apps/api-gateway/src/documents/documents.controller.ts and its new documents.controller.spec.ts) are in the working tree, not yet committed, so `nx affected --base=HEAD~1 --head=HEAD` reported no affected projects. Ran nx affected scoped to the changed files instead.

api-gateway test target: PASS — Test Suites: 1 passed, 1 total; Tests: 8 passed, 8 total. The expected ERROR log lines (upload timed out, ECONNREFUSED, downstream 500) are intentional test fixtures, not failures.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway:4000=UP, auth-service:4002=DOWN (infra), ai-service:4001=DOWN (infra). DOWN services are non-blocking local-infra warns; the changed service (api-gateway) compiled and booted clean.

All acceptance criteria verified:
- AC-13: Upload proxy creates an `AbortController` and arms `setTimeout(() => abort(), getUploadProxyTimeoutMs())` (env `UPLOAD_PROXY_TIMEOUT_MS`, validated default 30_000), passing `signal: abortController.signal` to `fetch` — confirmed in documents.controller.ts and the AC-13 spec (signal is AbortSignal, timeout value 1234 honoured).
- AC-14: `error.name === 'AbortError'` → `GatewayTimeoutException` (504); generic fetch failure → `BadGatewayException` (502); `!response.ok` downstream → `BadGatewayException` (502); successful 202 JSON relayed. Covered by the 504/502-generic/502-downstream specs; downstream error body is logged, not leaked.
- AC-15: Controller is `@HttpCode(HttpStatus.ACCEPTED)` and returns `{ documentId, status }` from the relayed body; verified by the AC-15 relay spec.
- nx test api-gateway: PASS (8/8) per QA.

Scope respected: only api-gateway touched (`.env.example` documentation of UPLOAD_PROXY_TIMEOUT_MS belongs to TASK-007 per the SPEC task breakdown).
