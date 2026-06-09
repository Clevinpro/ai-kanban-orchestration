---
id: TASK-004
title: Document AI_PROVIDER=lmstudio, LMSTUDIO_CHAT_URL, LMSTUDIO_CHAT_MODEL in .env.example
status: done
priority: medium
repo: be
epic: lmstudio-chat
complexity: 1
created-at: 2026-06-05T15:13:09+03:00
updated-at: 2026-06-05T16:29:47+03:00
started-at: 2026-06-05T16:26:39+03:00
completed-at: 2026-06-05T16:29:47+03:00
spec: .planning/work/lmstudio-chat/SPEC.md
---

## Description

Document the LM Studio chat provider in `ai-platform/.env.example`: add `lmstudio` to the `AI_PROVIDER` options comment (`claude | ollama | lmstudio`), and add `LMSTUDIO_CHAT_URL=http://localhost:1234/v1` plus blank `LMSTUDIO_CHAT_MODEL=` with a comment explaining that blank auto-picks the first model loaded in LM Studio, that the URL is the OpenAI-compatible base (include `/v1`), no API key is needed, and the loaded model must be a chat/instruct model (an embedding model will fail `/chat/completions`).

## Acceptance Criteria

- [ ] `AI_PROVIDER` comment lists `claude | ollama | lmstudio`
- [ ] `LMSTUDIO_CHAT_URL=http://localhost:1234/v1` added with OpenAI-compatible-base note (include `/v1`)
- [ ] `LMSTUDIO_CHAT_MODEL=` added blank with auto-pick-first-loaded-model note
- [ ] Comment notes: no API key required; model must be a chat/instruct model, not an embedding model
- [ ] No other `.env.example` entries changed (the `lmstudio-embeddings` block stays untouched)

## Technical Notes

- Exact block wording is in SPEC.md "Env vars (.env.example additions)" — use it, extending with the chat-model warning from SPEC Constraints.
- Keep the chat vars (`LMSTUDIO_CHAT_*`) clearly separate from the existing embeddings vars (`LMSTUDIO_URL` / `LMSTUDIO_EMBEDDING_MODEL`) — different subsystems, different env keys.
- Load `ai-platform/CLAUDE.md` before editing.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the single documentation change to `ai-platform/.env.example`. All five acceptance criteria are met: the `AI_PROVIDER` comment lists `claude | ollama | lmstudio`, the new `LMSTUDIO_CHAT_URL` and blank `LMSTUDIO_CHAT_MODEL` vars are added with accurate notes (OpenAI-compatible `/v1` base, auto-pick-first-model, no API key, chat/instruct model required), the chat vars use distinct keys cleanly separated from the untouched embeddings block, and no secrets are introduced. Documentation-only, low risk, no issues found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected --target=test (base=HEAD~1 head=HEAD) ran project ai-service: 16 test suites passed (16 total), 159 tests passed (159 total). Exit code 0.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified against ai-platform/.env.example (maps to SPEC AC-12):
- AC1 — `AI_PROVIDER` comment lists `'claude' | 'ollama' | 'lmstudio'` (line 15). PASS
- AC2 — `LMSTUDIO_CHAT_URL=http://localhost:1234/v1` added with OpenAI-compatible-base note including `/v1` (lines 27, 31). PASS
- AC3 — `LMSTUDIO_CHAT_MODEL=` added blank with auto-pick-first-loaded-model note (lines 27-28, 32). PASS
- AC4 — comment notes no API key required (line 26) and model must be a chat/instruct model, not an embedding model (lines 29-30). PASS
- AC5 — no other entries changed; the `lmstudio-embeddings` block (`LMSTUDIO_URL` / `LMSTUDIO_EMBEDDING_MODEL`, lines 43-48) stays untouched and uses distinct keys. PASS
