---
id: TASK-003
title: Extend vault-sync with (provider, model) fingerprint detection + .env.example
status: done
priority: high
repo: be
epic: multilingual-embeddings
complexity: 4
created-at: 2026-06-09T00:00:00Z
updated-at: 2026-06-09T12:25:35+03:00
started-at: 2026-06-09T12:20:25+03:00
completed-at: 2026-06-09T12:25:35+03:00
spec: .planning/work/multilingual-embeddings/SPEC.md
---

## Description

Extend `vault-sync.service.ts` so provider-change detection fires on a composite `(provider, model)` fingerprint, not provider name alone. Add `resolveActiveModel(provider)` that maps the active provider to its model env var using the **same default strings the providers expose** (import them — do not re-hardcode). Persist and read both `provider` and `model` in the stored state. When either differs from the stored row, truncate `chunks` and delete the vault documents so the next boot re-indexes. Update `.env.example` with bge-m3 defaults and the 1024-dim notes.

## Acceptance Criteria

- [ ] `detectAndHandleProviderChange()` compares `(provider, model)` composite; truncate + delete-vault-docs fires when **either** differs
- [ ] `resolveActiveModel(provider)` maps `ollama→OLLAMA_EMBEDDING_MODEL` (`bge-m3`), `openai→OPENAI_EMBEDDING_MODEL` (`text-embedding-3-small`), `lmstudio→LMSTUDIO_EMBEDDING_MODEL` (`bge-m3`), reusing the provider default strings (no second copy)
- [ ] Stored-state upsert/read persist and return both `provider` and `model`
- [ ] `.env.example` updated: bge-m3 defaults for lmstudio + ollama, 1024-dim requirement note, OpenAI `dimensions: 1024` note, bge-m3 must be loaded/pulled before boot
- [ ] (AC-04, AC-05, AC-09, AC-11)

## Technical Notes

- Files: `ai-platform/apps/ai-service/src/vault/vault-sync.service.ts`, `ai-platform/.env.example`.
- Reuse the provider default model strings from TASK-002 — single source of truth, no drift.
- See SPEC "Fingerprint detection (vault-sync.service.ts)" for the reference shape of `detectAndHandleProviderChange()` and the provider→env→default table.
- On first boot after deploy the fingerprint differs from the stored row → auto truncate + re-index (no manual step).
- Load `ai-platform/CLAUDE.md` before editing.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `vault-sync.service.ts` (+spec), `embeddings.constants.ts`, `openai-embedding.provider.ts`, and `.env.example` against TASK-003 and the SPEC. The composite `(provider, model)` fingerprint detection, `resolveActiveModel()` reusing the single-sourced default constants (`DEFAULT_MULTILINGUAL_EMBEDDING_MODEL`, `DEFAULT_OPENAI_EMBEDDING_MODEL` — no hardcoded duplication), the nullable `model` column persistence/read, the truncate+delete-vault-docs on either-differs, and the `.env.example` updates (bge-m3 defaults, 1024-dim note, OpenAI `dimensions: 1024` note, load/pull-before-boot warning) all match the acceptance criteria. Unit tests cover first-boot no-op, unchanged no-op, provider-change, model-only-change, and the default-provider path.

Minor note (non-blocking): `resolveActiveModel()` reads `process.env[...]` directly while the provider classes read via `ConfigService.get()`. NestJS ConfigModule normally hydrates `process.env`, so they agree in practice, but a `.env` value loaded only through ConfigService (not exported to `process.env`) could make the fingerprint resolve to the default while the provider uses the configured value. Worth a follow-up for strict parity, but the default strings are correctly single-sourced as the task required, so this does not block.

Overall quality is high: clear documentation comments, correct SQL ordering in the migration, and faithful adherence to the SPEC reference shape.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

Ran `nx affected --target=test` for the ai-service project (task changes are in the working tree; affected resolved against the modified files `vault-sync.service.ts` and `embeddings.constants.ts`). All tests green: 18 test suites passed (18 total), 187 tests passed (187 total), 0 failures. Coverage includes the vault-sync composite `(provider, model)` fingerprint detection cases (first-boot no-op, unchanged no-op, provider-change, model-only-change, default-provider path) and the embedding provider default-model constants.

Note: `nx affected --base=HEAD~1 --head=HEAD` reported "No tasks were run" because this task's implementation changes are still uncommitted in the working tree (HEAD~1..HEAD contains only planning files). Ran against the changed source files directly to obtain real coverage.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:
- AC-04: `detectAndHandleProviderChange()` compares the composite `(provider, model)` fingerprint and fires truncate-chunks + delete-vault-docs when either differs (vault-sync.service.ts:77-98). `resolveActiveModel()` resolves the active model from the per-provider env var with single-sourced defaults imported from `embeddings.constants.ts` (no re-hardcoding).
- AC-05: `readStoredState()` selects both `provider` and `model`; `upsertStoredState()` persists both (vault-sync.service.ts:128-145).
- AC-09: First boot stores `model = NULL` (nullable column), so the resolved `bge-m3` fingerprint differs → truncate + automatic re-index via the startup scan, no manual step.
- AC-11: `.env.example` carries bge-m3 defaults for lmstudio + ollama, the 1024-dim requirement notes, the OpenAI `dimensions: 1024` (Matryoshka) note, and the load/pull-before-boot warnings.

Code review APPROVED and QA PASS (18 suites, 187 tests, 0 failures, including the composite-fingerprint cases). The code-reviewer's `process.env` vs `ConfigService` note is non-blocking and the default strings are correctly single-sourced as required.
