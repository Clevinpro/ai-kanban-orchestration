---
id: TASK-005
title: Prompt-safe content escaping + per-chunk LLM timeout fallback
status: done
priority: medium
repo: be
epic: fast-upload-indexing
complexity: 3
created-at: 2026-06-09T16:11:12Z
updated-at: 2026-06-09T19:47:52+03:00
started-at: 2026-06-09T19:41:06+03:00
completed-at: 2026-06-09T19:47:52+03:00
spec: .planning/work/fast-upload-indexing/SPEC.md
---

## Description

Make the context prompt robust against tag-shaped content and slow LLM calls. Sanitize chunk/window text interpolated into the prompt so it cannot close or inject the `<document>`/`<chunk>` delimiters (escape `<`/`>` in interpolated content, or switch to a non-tag delimiter) — documents full of `<highlight>`, `<note>`, `<warning>`, or a stray `</document>` must not perturb the prompt while preserving the text's meaning for the LLM. Bound each per-chunk `generateContext` call with an explicit timeout (`CONTEXT_LLM_TIMEOUT_MS`, env, default 15000) via rxjs `timeout()`; on timeout the chunk falls back to heading-context (logged `warn`) and the document is not failed by one slow chunk. The existing per-chunk try/catch fallback must be preserved — escape + timeout are additive.

## Acceptance Criteria

- [ ] Interpolated chunk/window text is sanitized so it cannot close/inject `<document>`/`<chunk>` delimiters (escape `<`/`>` or non-tag delimiter); meaning preserved (AC-10)
- [ ] Each `generateContext` call is bounded by `CONTEXT_LLM_TIMEOUT_MS` (env, default 15000) via rxjs `timeout()`; on timeout → heading-context fallback (logged `warn`), document not failed (AC-11)
- [ ] Existing per-chunk try/catch fallback preserved — escape + timeout additive, no regression (AC-12)
- [ ] `nx test ai-service` passes

## Technical Notes

- File: `apps/ai-service/src/document/document.service.ts` — `generateContext` + prompt builder.
- Timeout: `import { lastValueFrom, toArray, timeout } from 'rxjs';` then `provider.chat(prompt).pipe(timeout(CONTEXT_LLM_TIMEOUT_MS), toArray())`. `TimeoutError` is caught by the existing try/catch → `headingFallback` (warn).
- Escaping: prefer minimal `<`→`&lt;` / `>`→`&gt;` on interpolated content, or swap delimiters to a non-tag token — do not heavily strip text (keep context quality).
- Addresses the `contextual-retrieval` TASK-003 review WARNINGs (no explicit timeout; raw tag interpolation).
- Builds on TASK-004 windowed prompt (escape the window + chunk).

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the working-tree changes to `document.service.ts` and `document.service.spec.ts` for TASK-005 (prompt-safe escaping + per-chunk LLM timeout fallback). The implementation correctly satisfies all three acceptance criteria: `escapeForPrompt` neutralizes `<`/`>` on both the windowed document and chunk body inside `buildContextPrompt` (AC-10, meaning preserved via reversible entity encoding); `generateContext` bounds the chat stream with `timeout(this.contextLlmTimeoutMs)` before `toArray()`, with the resulting `TimeoutError` caught by the existing try/catch into the heading fallback logged at `warn` (AC-11, document not failed); and the pre-existing per-chunk fallback is preserved unchanged — both additions are additive (AC-12). Escaping is applied after window offset computation, so it does not perturb `indexOf`-based windowing. Tests cover all paths including timeout fallback, escape structure, escape meaning round-trip, and a within-timeout success. Quality is high.

Minor non-blocking note:
- `ai-platform/.env.example` — neither `CONTEXT_LLM_TIMEOUT_MS` (this task) nor `CONTEXT_WINDOW_CHARS` (TASK-004) is documented alongside the existing `CONTEXTUAL_RETRIEVAL_*` vars. Both have sensible defaults and the task only requires the var to be read (it is), so this is a documentation completeness gap rather than a defect (WARNING).
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported no affected ai-platform projects (exit 0, "No tasks were run") because TASK-005's `document.service.ts`/`document.service.spec.ts` changes are still in the working tree, not in the HEAD~1..HEAD range. Verified the owning project directly with `nx test ai-service`: 19 test suites passed, 243 tests passed, 0 failed. Test coverage includes the escape structure, escape meaning round-trip, per-chunk timeout fallback, and within-timeout success paths described in the task.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=DOWN, auth-service=DOWN, ai-service=DOWN (all webpack builds compiled successfully; boots DOWN due to missing local infra — non-blocking WARN, not a code defect).

All acceptance criteria for this task verified and passed:
- AC-10 (prompt-safe escaping): `escapeForPrompt` entity-encodes `<`→`&lt;`/`>`→`&gt;` applied to both the windowed document and the chunk body inside `buildContextPrompt`, so tag-shaped content (`<highlight>`, `<note>`, stray `</document>`) cannot break the `<document>`/`<chunk>` delimiters; meaning is preserved via reversible encoding (test asserts a decode round-trip).
- AC-11 (per-chunk timeout): `generateContext` bounds `provider.chat(prompt).pipe(timeout(this.contextLlmTimeoutMs), toArray())`; `CONTEXT_LLM_TIMEOUT_MS` is read via config getter (default 15000); the resulting `TimeoutError` is caught into the heading fallback logged at `warn`, and the document is not failed. Tests cover both the timeout-fallback and within-timeout success paths.
- AC-12 (additive, no regression): the pre-existing per-chunk try/catch fallback is preserved unchanged; escape + timeout are layered inside it. Escaping is applied after window-offset computation so it does not perturb `indexOf` windowing.
- `nx test ai-service` passes (19 suites, 243 tests, 0 failures) per QA.
