---
id: TASK-005
title: "fix(ai-write-idempotency-and-abort-persistence): exclude *.e2e-spec.ts from api-gateway production build so backend boots"
status: done
priority: high
repo: be
epic: ai-write-idempotency-and-abort-persistence
complexity: 2
created-at: 2026-06-23T20:43:01Z
updated-at: 2026-06-24T13:06:53+03:00
started-at: 2026-06-24T13:01:43+03:00
completed-at: 2026-06-24T13:06:53+03:00
spec: .planning/work/ai-write-idempotency-and-abort-persistence/SPEC.md
---

## Description

The epic test gate (`TEST-REPORT.md`) found AC-07 FAIL: the api-gateway production
build is broken, so `npm start` never boots gateway (4000) or ai-service (4001) and
the chat flow is non-functional end-to-end.

Root cause: the new e2e spec `apps/api-gateway/src/ai/ai.e2e-spec.ts` (added in this
epic alongside `jest.e2e.config.ts` and `src/testing/`) lives under `src/` and uses
jest globals (`expect`, `it`). The production build (`webpack-cli build`) compiles
`src/**/*.ts`, and `apps/api-gateway/tsconfig.app.json` only excludes `src/**/*.spec.ts`
and `src/**/*.test.ts` — **not** `src/**/*.e2e-spec.ts`. The pattern `*.spec.ts` does
not match `ai.e2e-spec.ts` (suffix is `-spec.ts`, not `.spec.ts`), so the file is
included and the build fails with 11 `TS2304/TS2593` errors (`Cannot find name 'expect'`
/ `'it'`). Evidence: `.test-evidence/AC-07-gateway-build-fail.txt`.

Fix:
- Add `src/**/*.e2e-spec.ts` to the `exclude` array in
  `apps/api-gateway/tsconfig.app.json` (mirror the existing `*.spec.ts` / `*.test.ts`
  exclusions).
- Audit sibling app tsconfigs (e.g. `apps/ai-service/tsconfig.app.json`,
  `apps/auth-service/tsconfig.app.json`) for the same gap and exclude `*.e2e-spec.ts`
  wherever an e2e spec lives under `src/`, so the production bundle never compiles a
  jest e2e file.
- Confirm the e2e spec is still picked up by its `jest.e2e.config.ts` runner (do not
  break the e2e test target).
- Verify `npm start` boots gateway (4000) and ai-service (4001), and the existing
  ai-service suite still passes (`nx test ai-service`).

Scope: build/test config only — do NOT touch the idempotency/abort-persistence
runtime code (AC-01–06 already pass). `be` repo.

## Acceptance Criteria

- [ ] Existing chat/agent flows still persist exactly one user turn and one assistant
      turn per successful run (no regression). Concretely: the api-gateway production
      build (`webpack-cli build --node-env=production`) compiles without errors,
      `npm start` boots gateway (4000) and ai-service (4001), and a chat request flows
      end-to-end.
- [ ] `src/**/*.e2e-spec.ts` is excluded from `apps/api-gateway/tsconfig.app.json`
      (and any sibling app tsconfig that would otherwise compile e2e specs into the
      production bundle).
- [ ] The e2e spec still runs under its dedicated `jest.e2e.config.ts` target.
- [ ] `nx test ai-service` passes and ai-service type-checks
      (`npx tsc --noEmit -p apps/ai-service/tsconfig.app.json`).

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the working-tree config changes: `src/**/*.e2e-spec.ts` was added to the `exclude` array in `apps/api-gateway/tsconfig.app.json` (line 18), `apps/ai-service/tsconfig.app.json` (line 18), and `apps/auth-service/tsconfig.app.json` (line 13), mirroring the existing `*.spec.ts`/`*.test.ts` exclusions. This correctly removes the jest e2e spec from the production webpack build that was causing the `TS2304`/`TS2593` errors (AC-07). The e2e test target is preserved — `jest.e2e.config.ts` transforms via `tsconfig.spec.json`, which still includes `src/**/*.e2e-spec.ts`, and `testMatch`/`testPathIgnorePatterns` keep unit and e2e runs non-overlapping. Change is config-only and does not touch runtime idempotency/abort code, matching the task scope. No bugs, security, or quality issues found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

Unit: `nx affected --base=HEAD~1 --head=HEAD` reported "No tasks were run" — the task's config changes (`tsconfig.app.json` exclusions) are uncommitted in the working tree, so the HEAD~1..HEAD range only contained unrelated research docs. Verified the fix directly instead: api-gateway production build (`nx build api-gateway --node-env=production`) compiled successfully (webpack OK — confirms `src/**/*.e2e-spec.ts` is now excluded from the prod bundle, the AC-07 TS2304/TS2593 failure is resolved). `nx test ai-service` 346/346 passed; `nx test api-gateway` 22/22 passed. All three app tsconfigs (api-gateway, ai-service, auth-service) carry the `src/**/*.e2e-spec.ts` exclusion.
E2E: PASS — `nx e2e api-gateway` ran `apps/api-gateway/src/ai/ai.e2e-spec.ts` (3/3 passed), confirming the e2e spec is still picked up by its dedicated `jest.e2e.config.ts` target (AC-03). The spec boots the real AppModule via supertest and asserts both the HTTP body (201 + `{status:'processing', conversationId}`) and the persisted side effect (exact AI_REQUEST Kafka payload, DTO-trimmed message), plus reuse of a provided conversationId and 400 validation short-circuit (no publish). Real assertions on the actual chat flow — not hollow.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway:4000=UP, auth-service:4002=UP, ai-service:4001=UP. All three webpack production builds compiled successfully — confirms the `*.e2e-spec.ts` exclusion fixed the AC-07 TS2304/TS2593 gateway build break.

All acceptance criteria verified:
- AC-1 (no regression / prod build boots gateway 4000 + ai-service 4001): smoke boot BUILD_OK, both services UP; webpack `--node-env=production` compiled clean for all three apps.
- AC-2 (`*.e2e-spec.ts` excluded from app tsconfigs): confirmed in `exclude` arrays of `apps/api-gateway/tsconfig.app.json`, `apps/ai-service/tsconfig.app.json`, and `apps/auth-service/tsconfig.app.json`.
- AC-3 (e2e spec still runs under dedicated target): `nx e2e api-gateway` ran `ai.e2e-spec.ts` 3/3; `tsconfig.spec.json` still includes `src/**/*.e2e-spec.ts`, so unit/e2e runs stay non-overlapping.
- AC-4 (`nx test ai-service` + type-check): 346/346 unit tests passed; `tsc --noEmit -p apps/ai-service/tsconfig.app.json` exited 0.
