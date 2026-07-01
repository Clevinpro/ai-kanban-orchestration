---
id: TASK-002
title: Implement RAG search tool wrapping SearchService (+ spec)
status: done
priority: high
repo: be
epic: chat-agent-mode-be-refactor
complexity: 3
created-at: 2026-06-15T12:00:00.000Z
updated-at: 2026-06-15T16:04:50+03:00
started-at: 2026-06-15T15:53:16+03:00
completed-at: 2026-06-15T16:04:50+03:00
spec: .planning/work/chat-agent-mode-be-refactor/SPEC.md
---

## Description

Reimplement the existing similarity-search step as the first registered `Tool`. The RAG tool
wraps `SearchService.similaritySearch` + `formatContext` behind the `Tool` interface so the
loop dispatches it through the registry rather than via a hardcoded branch.

## Acceptance Criteria

- [ ] New file `ai-platform/apps/ai-service/src/ai/tools/rag-search.tool.ts` exports a factory
      or class implementing `Tool` (from TASK-001) with a stable `name` (e.g. `similaritySearch`)
      and a clear `description` for the planner.
- [ ] `run(query, ctx)` calls `searchService.similaritySearch(query)` then
      `searchService.formatContext(chunks)` and returns the formatted observation string.
- [ ] The tool takes `SearchService` as a constructor/closure dependency (no direct DB access).
- [ ] `rag-search.tool.spec.ts` mocks `SearchService` and asserts: query forwarded, formatContext
      applied, observation string returned, empty-results handled gracefully.
- [ ] `nx test ai-service` passes.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/ai/tools/rag-search.tool.ts` (+ `.spec.ts`).
- Depends on the `Tool` interface (TASK-001) and the existing `SearchService`
  (`ai-platform/apps/ai-service/src/ai/.../search/search.service.ts`) — reuse
  `similaritySearch` + `formatContext` exactly as `runRagFlow`/`executeAgentLoop` do today.
- Keep the `name` identical to the tool name the current loop emits (`similaritySearch`) so the
  streamed `tool` field is stable for the FE.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: CHANGES_REQUESTED

**Issues:**
- ai-platform/apps/ai-service/src/ai/tools/rag-search.tool.ts:1 — Import path is wrong: `import ... from '../../search/search.service'` resolves to `src/ai/search/search.service` which does not exist. The actual SearchService lives at `src/search/search.service.ts`, so the correct path from `src/ai/tools/` is `'../../../search/search.service'` (three levels up). This breaks module resolution and TypeScript compilation, so `nx test ai-service` cannot pass. BLOCKER
- ai-platform/apps/ai-service/src/ai/tools/rag-search.tool.spec.ts:1 — Same broken import path (`'../../search/search.service'` instead of `'../../../search/search.service'`) for the `SearchService` / `SimilaritySearchResult` type imports. BLOCKER

The tool's logic correctly satisfies the acceptance criteria: it wraps `similaritySearch` + `formatContext` behind the `Tool` interface, takes `SearchService` as a closure dependency with no direct DB access, keeps the stable name `similaritySearch`, and the spec covers query forwarding, formatContext application, return value, and empty results. However, both source and spec import SearchService from a non-existent path, which is a compile-blocking defect that fails the `nx test ai-service` criterion. Fix the relative import depth in both files.
---REVIEW-BLOCK-END---

> ORCHESTRATOR NOTE: This CHANGES_REQUESTED is a verified FALSE POSITIVE. The file lives at `src/ai/tools/`; `../../search/` resolves to `src/search/` (two levels up = `src/`), which is exactly where `search.service.ts` exists. The reviewer miscounted depth — `../../../` would point to `apps/ai-service/search` (wrong). Verified by filesystem check and by running `nx test ai-service --testFile=rag-search.tool.spec.ts` → 4/4 pass. Import is correct; no developer fix applied.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `rag-search.tool.ts` and `rag-search.tool.spec.ts` in `ai-platform/apps/ai-service/src/ai/tools/`. The import path `'../../search/search.service'` correctly resolves to `src/search/search.service.ts` (verified against the filesystem and the actual `SearchService`/`SimilaritySearchResult` definitions); the prior BLOCKER was a verified false positive from miscounting relative-path depth. The tool wraps `similaritySearch` + `formatContext` behind the `Tool` interface as a closure dependency with no direct DB access, keeps the stable name `similaritySearch`, and the spec correctly covers query forwarding, formatContext application, return value, and the empty-results sentinel that matches the real implementation. All acceptance criteria are satisfied; no bugs or quality issues found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected (--base=HEAD~1 --head=HEAD) ran target test for 5 projects, all succeeded (exit code 0):
- ai-service: 23 suites, 284 tests passed (includes rag-search.tool.spec.ts)
- api-gateway: 3 suites, 18 tests passed
- auth-service: 1 suite, 1 test passed
- shared: no tests (passWithNoTests)
- kafka: no tests (passWithNoTests)

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=DOWN (infra), auth-service=DOWN (infra), ai-service=UP. Build compiled successfully for all services; api-gateway/auth-service boot-DOWN is non-blocking (missing local infra such as DB/Redis), and ai-service — the service this task touches — booted UP.

All acceptance criteria verified:
- AC-1 (new `rag-search.tool.ts` exports `createRagSearchTool` returning a `Tool` with stable name `similaritySearch` and a planner description): PASS.
- AC-2 (`run` calls `searchService.similaritySearch(input)` then `searchService.formatContext(chunks)` and returns the observation string): PASS — source lines 37-40.
- AC-3 (`SearchService` injected as a closure/constructor dependency, no direct DB access): PASS — factory parameter only.
- AC-4 (`.spec.ts` mocks SearchService, asserts query forwarded, formatContext applied, observation returned, empty results handled): PASS — 4 test cases cover all assertions.
- AC-5 (`nx test ai-service` passes): PASS — rag-search spec 4/4 green; QA confirmed full ai-service suite (284 tests) passes.

Note: the prior CodeReview CHANGES_REQUESTED on the import path was a verified false positive — `'../../search/search.service'` from `src/ai/tools/` correctly resolves to `src/search/search.service.ts` (confirmed on filesystem). Final CodeReview APPROVED and tests pass.
