---
id: TASK-003
title: Update .env.example and verify provider-switch re-index for lmstudio
status: done
priority: medium
repo: be
epic: lmstudio-embeddings
complexity: 2
created-at: 2026-06-05T10:29:52Z
updated-at: 2026-06-05T13:47:31+03:00
started-at: 2026-06-05T13:42:57+03:00
completed-at: 2026-06-05T13:47:31+03:00
spec: .planning/work/lmstudio-embeddings/SPEC.md
---

## Description

Document the LM Studio provider in `.env.example`: add `lmstudio` to the `EMBEDDING_PROVIDER` options comment, add `LMSTUDIO_URL` and `LMSTUDIO_EMBEDDING_MODEL` with defaults, and document that the model MUST output 768-dim vectors (LM Studio cannot truncate via `dimensions`; non-768 breaks pgvector inserts). Then verify (by code inspection and/or a targeted test) that the existing `embedding_provider_state` switch-detection machinery treats `lmstudio` as a provider change — truncating chunks and triggering vault re-index at boot — with no new migration or logic required.

## Acceptance Criteria

- [ ] `.env.example` documents `EMBEDDING_PROVIDER=lmstudio` as an option (comment lists `ollama | openai | lmstudio`)
- [ ] `.env.example` adds `LMSTUDIO_URL=http://localhost:1234/v1` and `LMSTUDIO_EMBEDDING_MODEL=text-embedding-nomic-embed-text-v1.5` with the 768-dim model requirement noted
- [ ] Verified that `embedding_provider_state` detection fires when provider switches to `lmstudio` (chunk truncate + vault re-index on next boot) — provider name flows through existing logic unchanged, no new migration
- [ ] No changes to switch-detection logic itself — verification only; if a gap is found, document it in the task file rather than patching out of scope

## Technical Notes

- Exact `.env.example` block is in SPEC.md "Env vars (.env.example additions)" — use that wording.
- Switch-detection lives in the `fast-embeddings` epic machinery around `embedding_provider_state`; grep `ai-platform/apps/ai-service/src` for `embedding_provider_state` to find it.
- Expected outcome: detection compares stored provider string vs current `EMBEDDING_PROVIDER` — `lmstudio` is just a new string value, so it works without changes. Confirm and note where.
- Load `ai-platform/CLAUDE.md` before editing.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the two in-scope TASK-003 files against the production switch-detection logic in vault-sync.service.ts. `.env.example` correctly documents `lmstudio` in the `EMBEDDING_PROVIDER` comment and adds `LMSTUDIO_URL` / `LMSTUDIO_EMBEDDING_MODEL` with the 768-dim requirement noted. The new spec test (`switching to lmstudio`) accurately exercises the existing detection path — asserting TRUNCATE, vault-doc DELETE, and the `ollama → lmstudio` warn log — and matches actual production behavior with no logic changes, satisfying the verification-only AC. Quality is good and scope is respected.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task. `nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit 0); `nx show projects --affected` returned `[]`. The HEAD~1..HEAD commit range contains no ai-platform source changes, so no projects were affected. Per D-06, no affected tests is not a failure.

## TeamLead Check

Status: APPROVED

All in-scope acceptance criteria verified against the implementation:
- `.env.example` documents `EMBEDDING_PROVIDER=lmstudio` (comment lists `ollama | openai | lmstudio`) — verified at `ai-platform/.env.example:26`.
- `.env.example` adds `LMSTUDIO_URL=http://localhost:1234/v1` and `LMSTUDIO_EMBEDDING_MODEL=text-embedding-nomic-embed-text-v1.5` with the 768-dim model requirement noted — verified at `ai-platform/.env.example:35-40`.
- Switch-detection (AC-07) fires for `lmstudio`: confirmed in `vault-sync.service.ts` `detectAndHandleProviderChange` (lines 64-100) — reads `EMBEDDING_PROVIDER`, compares `stored !== active` as plain strings, truncates chunks + deletes vault docs on any difference. `lmstudio` flows through as a new string value with no special-casing.
- No changes to switch-detection logic (verification-only AC): logic untouched; no new migration. Verified by the added test `vault-sync.service.spec.ts:277` ("switching to lmstudio") asserting TRUNCATE, vault-doc delete, and the `ollama → lmstudio` warn log.
