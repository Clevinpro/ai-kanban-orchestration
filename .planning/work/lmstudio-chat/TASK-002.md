---
id: TASK-002
title: Implement LmStudioProvider with SSE streaming chat, role-faithful messages, model resolution
status: done
priority: high
repo: be
epic: lmstudio-chat
complexity: 5
created-at: 2026-06-05T15:13:09+03:00
updated-at: 2026-06-05T16:21:30+03:00
started-at: 2026-06-05T15:18:48+03:00
completed-at: 2026-06-05T16:21:30+03:00
spec: .planning/work/lmstudio-chat/SPEC.md
---

## Description

Create `LmStudioProvider` at `ai-platform/apps/ai-service/src/ai/providers/lmstudio.provider.ts`, implementing `IAIProvider` (`chat(message: AiChatMessage): Observable<string>` + `getActiveModel(): Promise<string>`). Clone `ollama.provider.ts` as the structural template (axios `responseType: 'stream'`, Observable wrapper, line-buffered chunk parsing, stream teardown on unsubscribe, drained error bodies), but replace the endpoint with OpenAI-shape `POST <LMSTUDIO_CHAT_URL>/chat/completions` `{ model, messages, stream: true }`, replace newline-JSON parsing with SSE parsing (`data: ` prefix strip, `[DONE]` completes, emit `choices[0].delta.content`), map `AiChatMessage` to OpenAI messages with native `system`/`user`/`assistant` role passthrough, and resolve the model via `LMSTUDIO_CHAT_MODEL` env → `GET /models` first id → clear throw.

## Acceptance Criteria

- [ ] `LmStudioProvider` implements `IAIProvider` — `chat(): Observable<string>` + `getActiveModel(): Promise<string>`
- [ ] Reads `LMSTUDIO_CHAT_URL` (default `http://localhost:1234/v1`) via `ConfigService`; no hardcoded default model
- [ ] `chat()` POSTs to `<LMSTUDIO_CHAT_URL>/chat/completions` with `{ model, messages, stream: true }` — no `Authorization` header
- [ ] SSE parsing: split on `\n` with partial-line buffering across chunks (Ollama buffer technique), strip `data: ` prefix, ignore empty/non-data lines, `data: [DONE]` → `subscriber.complete()`, otherwise `JSON.parse` and emit `choices[0].delta.content` when present
- [ ] Message mapping preserves roles natively: string → `[{role:'user'}]`; `{system,user}` → two messages; `ChatMessage[]` → 1:1 role passthrough
- [ ] Model resolution: `LMSTUDIO_CHAT_MODEL` env if set, else `GET <LMSTUDIO_CHAT_URL>/models` first `data[].id`, else throw `No LM Studio model loaded — set LMSTUDIO_CHAT_MODEL or load a model in LM Studio`
- [ ] Stream errors surface as `LM Studio chat HTTP <status> (<url>): <detail>` via `subscriber.error`; error-body Readable drained, no socket/stack leak
- [ ] Observable unsubscribe destroys the underlying HTTP stream (teardown), matching Ollama
- [ ] Chat request logged with provider name + resolved model

## Technical Notes

- Template: `ai-platform/apps/ai-service/src/ai/providers/ollama.provider.ts` — closest analog (local HTTP streaming). Differences table is in SPEC.md "Why clone Ollama, not Claude".
- SSE parser sketch: SPEC.md "SSE parsing (the one new mechanic)". Do NOT copy Ollama's `chunk.done` logic — LM Studio ends with `data: [DONE]`.
- Message mapping sketch: SPEC.md "Message mapping (role-faithful)". Unlike Ollama, do NOT collapse roles to `user`.
- Model resolution sketch: SPEC.md "Model resolution".
- Error formatting: mirror Ollama's `formatAxiosErrorBody` (drain the error Readable).
- Do NOT touch factory or module — wiring is TASK-003. TASK-001 added `AI_PROVIDER.LMSTUDIO` to shared if needed for typing.
- Load `ai-platform/CLAUDE.md` before editing.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `lmstudio.provider.ts` (new) against the Ollama template and all 9 acceptance criteria, plus the TASK-001 carryover edits to `ai.constants.ts` and `ai.types.ts`. The implementation faithfully clones the Ollama structure (stream teardown, partial-line buffering, drained error-body formatting, Observable wrapper) while correctly applying the LM Studio-specific changes: OpenAI-shape POST to `/chat/completions`, SSE `data:` parsing with `[DONE]` completion, role-faithful message mapping, env→`/models`→throw model resolution, and the exact error message format. No `Authorization` header, no hardcoded default model. All ACs are met.

**Non-blocking notes:**
- `lmstudio.provider.ts:108` — `JSON.parse` inside the `stream.on('data')` handler is unguarded; a malformed `data:` payload would throw as an uncaught exception rather than routing through `subscriber.error`. This risk is inherited directly from the approved Ollama template and the task explicitly mandated cloning it, so it is acceptable as-is. WARNING.
- After `data: [DONE]` the stream is not destroyed; completion relies on the server closing the connection and on RxJS `complete()` idempotency (the `'end'` handler also completes). This matches the Ollama pattern and is safe.

Overall quality is high — clean, idiomatic, and a precise structural match to the template.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected --target=test (base=HEAD~1 head=HEAD) ran project ai-service. Test Suites: 16 passed, 16 total. Tests: 159 passed, 159 total. Exit code 0.

## TeamLead Check

Status: APPROVED

All 9 task-scoped acceptance criteria verified against `lmstudio.provider.ts`:
- AC1 (implements IAIProvider — chat + getActiveModel): PASS
- AC2 (LMSTUDIO_CHAT_URL via ConfigService, default :1234/v1, no hardcoded model): PASS
- AC3 (POST /chat/completions, {model,messages,stream:true}, no Authorization): PASS
- AC4 (SSE parse: \n buffering, data: strip, [DONE] complete, emit choices[0].delta.content): PASS
- AC5 (role-faithful mapping: string/user, {system,user}/two, ChatMessage[]/1:1): PASS
- AC6 (model resolution env → /models first id → exact throw message): PASS
- AC7 (errors as "LM Studio chat HTTP <status> (<url>): <detail>", Readable drained): PASS
- AC8 (unsubscribe destroys stream + closed-flag race guard): PASS
- AC9 (chat logged with provider name + resolved model): PASS

Code Review APPROVED, QA PASS (159/159). Non-blocking unguarded JSON.parse note is acceptable — it mirrors the mandated Ollama template. SPEC ACs 07/08/09/12/14 belong to sibling tasks (TASK-001/003/004/005), correctly out of scope here.
