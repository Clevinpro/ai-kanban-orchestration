---
id: TASK-007
title: Bump INDEX_RECIPE_VERSION + document new knobs in .env.example
status: done
priority: high
repo: be
epic: fast-upload-indexing
complexity: 2
created-at: 2026-06-09T16:11:12Z
updated-at: 2026-06-09T20:02:21+03:00
started-at: 2026-06-09T19:55:24+03:00
completed-at: 2026-06-09T20:02:21+03:00
spec: .planning/work/fast-upload-indexing/SPEC.md
---

## Description

The windowed context prompt (TASK-004) changes stored chunk content, so bump `INDEX_RECIPE_VERSION` so the existing `(provider, model, recipe_version)` fingerprint auto-truncates chunks and reindexes the vault into the new recipe on next boot — now via the background index path. Document the new env knobs in `.env.example`: `CONTEXT_WINDOW_CHARS`, `CONTEXT_LLM_TIMEOUT_MS`, `UPLOAD_PROXY_TIMEOUT_MS`, the async-upload behaviour (`202` + `GET /documents/:id/status` polling), and a note that `CONTEXTUAL_RETRIEVAL_ENABLED` can be returned to `true` after this epic. Land late so the single auto-reindex captures the windowed recipe from prior tasks.

## Acceptance Criteria

- [ ] `INDEX_RECIPE_VERSION` is bumped so first boot after deploy auto-truncates chunks + reindexes via the `(provider, model, recipe_version)` fingerprint (AC-16)
- [ ] `.env.example` documents `CONTEXT_WINDOW_CHARS`, `CONTEXT_LLM_TIMEOUT_MS`, `UPLOAD_PROXY_TIMEOUT_MS`, the async-upload `202` + status-polling behaviour, and the `CONTEXTUAL_RETRIEVAL_ENABLED=true` re-enable note (AC-17)
- [ ] `nx test ai-service` passes

## Technical Notes

- Files: `apps/ai-service/src/embeddings/embeddings.constants.ts` (`INDEX_RECIPE_VERSION`), `.env.example`.
- Bump the recipe constant (e.g. `v2` → `v3`) — single source of truth; the vault-sync fingerprint does the rest on boot.
- Append the new knobs near the existing `CONTEXTUAL_RETRIEVAL_*` block in `.env.example` (see SPEC ".env.example additions").
- Must land AFTER TASK-004 (window) — the bump should capture the windowed recipe so only one reindex runs.
- Do NOT flip `CONTEXTUAL_RETRIEVAL_ENABLED` here — `.env` stays `false` until TASK-008 passes; this only documents the re-enable in `.env.example`.

---REVIEW-BLOCK-START---
## Code Review

Status: CHANGES_REQUESTED

**Issues:**
- `ai-platform/.env.example:46 — Active value is `CONTEXTUAL_RETRIEVAL_ENABLED=true`, which (a) directly contradicts the NOTE comment immediately above it (lines 43-45: "This epic ships with .env set to false to gate the rollout; once ... tests pass, return it to true"), (b) violates the explicit task Technical Note "Do NOT flip `CONTEXTUAL_RETRIEVAL_ENABLED` here — `.env` stays `false` until TASK-008 passes; this only documents the re-enable", and (c) violates SPEC Constraint (lines 264-265) "`CONTEXTUAL_RETRIEVAL_ENABLED` stays `false` ... flip to `true` only after AC-18 passes". The active value must be `CONTEXTUAL_RETRIEVAL_ENABLED=false`; the `=true` re-enable belongs only in the commented note on line 45. BLOCKER

The `INDEX_RECIPE_VERSION` bump to `v3` is correct, single-sourced, and well-documented; its spec (`embeddings.constants.spec.ts`) asserts the new value cleanly. The new env knob docs (`CONTEXT_WINDOW_CHARS`, `CONTEXT_LLM_TIMEOUT_MS`, `UPLOAD_PROXY_TIMEOUT_MS`, async-upload 202/status-polling) are accurate. The sole blocker is the self-contradicting, instruction-violating `CONTEXTUAL_RETRIEVAL_ENABLED=true` active value, which must stay `false`.
---REVIEW-BLOCK-END---

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Re-reviewed the three changed files after the prior CHANGES_REQUESTED cycle. The blocker is resolved: `.env.example:46` now has the active value `CONTEXTUAL_RETRIEVAL_ENABLED=false`, with the `=true` re-enable appearing only in the commented NOTE (line 45), satisfying the task Technical Note and SPEC constraint. The `INDEX_RECIPE_VERSION` bump to `v3` is correct, single-sourced, and well-documented, with a matching spec assertion; the new env-knob docs (`CONTEXT_WINDOW_CHARS`, `CONTEXT_LLM_TIMEOUT_MS`, `UPLOAD_PROXY_TIMEOUT_MS`, async-upload 202/status-polling) are accurate. No new issues.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit 0) — the task changes are uncommitted in the working tree, so the committed HEAD~1..HEAD range shows no affected projects. The uncommitted changes affect `ai-service`; ran its suite directly to confirm coverage: 19 suites passed, 243 tests passed, 0 failed (exit 0). The bumped `INDEX_RECIPE_VERSION` (v3) assertion in `embeddings.constants.spec.ts` passes.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=DOWN, auth-service=DOWN, ai-service=DOWN (all non-blocking — services build cleanly from cache; DOWN reflects missing local infra such as Postgres/Kafka, not a code defect).

All acceptance criteria verified:
- AC-16 (`INDEX_RECIPE_VERSION` bumped): `embeddings.constants.ts:32` bumps `v2` → `v3`, single-sourced, with docs noting the windowed-context recipe change auto-truncates chunks and reindexes the vault via the `(provider, model, recipe_version)` fingerprint on next boot. PASS.
- AC-17 (`.env.example` docs): documents `CONTEXT_WINDOW_CHARS` (L55), `CONTEXT_LLM_TIMEOUT_MS` (L59), `UPLOAD_PROXY_TIMEOUT_MS` (L26), the async-upload `202` + `GET /:id/status` polling behaviour (L15-26), and the `CONTEXTUAL_RETRIEVAL_ENABLED=true` re-enable note (L43-45) while the active value stays `false` (L46) per the task Technical Note and SPEC constraint. PASS.
- `nx test ai-service`: QA confirmed 19 suites / 243 tests pass, including the v3 assertion in `embeddings.constants.spec.ts`. PASS.

The prior code-review blocker (active `CONTEXTUAL_RETRIEVAL_ENABLED=true`) is resolved — active value is now `false`, re-enable lives only in the comment.
