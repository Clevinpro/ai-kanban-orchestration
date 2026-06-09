---
id: TASK-005
title: Add unit tests for LmStudioProvider SSE streaming and factory lmstudio dispatch
status: done
priority: medium
repo: be
epic: lmstudio-chat
complexity: 4
created-at: 2026-06-05T15:13:09+03:00
updated-at: 2026-06-05T16:35:37+03:00
started-at: 2026-06-05T16:30:11+03:00
completed-at: 2026-06-05T16:35:37+03:00
spec: .planning/work/lmstudio-chat/SPEC.md
---

## Description

Add `lmstudio.provider.spec.ts` covering `LmStudioProvider` with a mocked SSE stream (axios mocked, emitting raw `data` chunks): single-token stream, multi-chunk stream where one SSE line is split mid-JSON across two chunks, `data: [DONE]` completing the Observable, and error paths (connection refused, HTTP 4xx/5xx with drained error body). Cover role-faithful message mapping (string, `{system,user}`, `ChatMessage[]`) and model resolution (env set, `/models` fallback, no-model throw). Assert no `Authorization` header is sent. Extend `ai-provider.factory.spec.ts` dispatch tests for `AI_PROVIDER=lmstudio`. Run `nx test ai-service` and ensure it passes.

## Acceptance Criteria

- [ ] Single-token test: mocked stream emits one `data: {...delta.content...}` line then `data: [DONE]`; Observable emits the token then completes
- [ ] Split-line test: one SSE JSON line split mid-JSON across two `data` chunk events is buffered and parsed correctly (no JSON.parse error, token emitted once)
- [ ] `[DONE]` test: `data: [DONE]` completes the Observable without emitting
- [ ] Error tests: connection-refused and HTTP error responses surface via `subscriber.error` as `LM Studio chat HTTP <status> (<url>): <detail>`; error-body stream drained
- [ ] Role mapping tests: string → single user message; `{system,user}` → system+user pair; `ChatMessage[]` → 1:1 role passthrough (system/user/assistant preserved)
- [ ] Model resolution tests: env `LMSTUDIO_CHAT_MODEL` wins; else `GET /models` first id; else rejects with the no-model-loaded error
- [ ] Request assertions: POST body is `{ model, messages, stream: true }`; no `Authorization` header
- [ ] Factory dispatch test extended: `lmstudio` returns `LmStudioProvider`; unknown provider still throws
- [ ] `nx test ai-service` passes (and shared lib tests if affected)

## Technical Notes

- Templates: `ai-platform/apps/ai-service/src/ai/providers/ollama.provider.spec.ts` for the mocked-stream technique (likely an EventEmitter/Readable standing in for the axios response stream); `ai-provider.factory.spec.ts` for dispatch structure.
- Simulating the split-line case: emit chunk `'data: {"choices":[{"delta":{"con'` then chunk `'tent":"hi"}}]}\n'` — parser must buffer and emit `hi` once.
- `lmstudio-embedding.provider.spec.ts` (different epic) shows the `RealAxiosError` via `jest.requireActual` pattern for connection-error simulation, including the empty-message ECONNREFUSED case.
- Run from `ai-platform/`: `npx nx test ai-service`.
- Load `ai-platform/CLAUDE.md` before editing.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed two new uncommitted test files (`lmstudio.provider.spec.ts`, `ai-provider.factory.spec.ts`) against the implementation in `lmstudio.provider.ts` and `ai-provider.factory.ts`. The tests faithfully mirror the provider's SSE buffering, role mapping, model resolution, error formatting (including drained Readable error bodies), request shape (asserting no Authorization header), and factory dispatch — covering all nine acceptance criteria. Mocking is sound: real `AxiosError`/`isAxiosError` via `jest.requireActual`, an `EventEmitter`-based `FakeStream`, and `setImmediate` to sequence async `axios.post` resolution before feeding chunks. No bugs, security issues, or quality problems found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected (--base=HEAD~1 --head=HEAD) ran target test for project ai-service. Test Suites: 18 passed, 18 total. Tests: 182 passed, 182 total. Exit code 0.

## TeamLead Check

Status: APPROVED

All nine task acceptance criteria verified against `lmstudio.provider.spec.ts` and `ai-provider.factory.spec.ts`:
- Single-token + `[DONE]` complete: PASS (single token emitted, Observable completes).
- Split-line mid-JSON buffering: PASS (token emitted exactly once).
- `[DONE]`-only stream: PASS (completes with no emission).
- Error paths: PASS (connection-refused, HTTP 4xx string body, HTTP 5xx drained Readable body — all formatted `LM Studio chat HTTP <status> (<url>): <detail>`; plus stream error event).
- Role mapping: PASS (string→user, {system,user}→pair, ChatMessage[] 1:1 role passthrough).
- Model resolution: PASS (env wins with no `/models` call, `/models` first id fallback, no-model throw).
- Request shape: PASS (body `{model, messages, stream:true}`, exact keys, no Authorization header).
- Factory dispatch: PASS (`lmstudio`→LmStudioProvider, unknown throws).
- `nx test ai-service`: PASS (18 suites / 182 tests, exit 0 per QA).
