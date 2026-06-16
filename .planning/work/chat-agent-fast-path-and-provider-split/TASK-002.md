---
id: TASK-002
title: Extend rag-search.tool to accept and pass filePathPrefix to similaritySearch
status: done
priority: high
repo: be
epic: chat-agent-fast-path-and-provider-split
complexity: 3
created-at: 2026-06-16T10:52:11Z
updated-at: 2026-06-16T14:33:10+03:00
started-at: 2026-06-16T14:26:10+03:00
completed-at: 2026-06-16T14:33:10+03:00
spec: .planning/work/chat-agent-fast-path-and-provider-split/SPEC.md
---

## Description

Allow the RAG search tool to scope retrieval to a document subset by forwarding
a `filePathPrefix` to `SearchService.similaritySearch` (which already accepts a
third `filePathPrefix` argument). This is the mechanism the technical/API lane
will use to search only technical docs instead of the whole index. Keep the
existing tool name and the `Tool` contract unchanged so the streamed
`AgentEvent.tool` shape stays stable for the FE.

## Acceptance Criteria

- [ ] `createRagSearchTool` accepts an optional `filePathPrefix` and passes it as
  the third argument to `searchService.similaritySearch`.
- [ ] When a prefix is provided, `similaritySearch` is called with that prefix
  (asserted via a spy); when absent, behaviour is unchanged (whole index).
- [ ] Tool name (`similaritySearch`) and description remain unchanged; `Tool`
  contract is preserved.
- [ ] `rag-search.tool.spec.ts` covers both prefixed and non-prefixed calls.
- [ ] `nx test ai-service` passes.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/ai/tools/rag-search.tool.ts`.
- `SearchService.similaritySearch(query, limit = 6, filePathPrefix?)` already
  supports the prefix — reuse it; do not modify `search.service.ts`.
- Prefer a factory signature like
  `createRagSearchTool(searchService, filePathPrefix?)` so the module can wire a
  technical-scoped instance. Keep the default (no prefix) tool working for the
  complex lane.
- Maps to AC-04 (mechanism).

## QA Results

Status: PASS

Cycle: 1 of 3

Ran `npx nx test ai-service --skip-nx-cache` in `ai-platform/`. Exit code 0 — 23 test suites, 292 tests passed (2.4s).

Static AC verification:
- `createRagSearchTool(searchService, filePathPrefix?)` accepts optional prefix; forwards as third arg to `similaritySearch(input, 6, filePathPrefix)` when defined, otherwise calls `similaritySearch(input)` unchanged.
- Tool name (`similaritySearch`) and `RAG_SEARCH_TOOL_DESCRIPTION` unchanged; `Tool` contract preserved (`name`, `description`, `run`).
- `rag-search.tool.spec.ts` covers prefixed call (spy asserts `toHaveBeenCalledWith(query, 6, prefix)`) and non-prefixed call (spy asserts two-arg form only).

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; BOOT=[api-gateway:4000=DOWN, auth-service:4002=DOWN, ai-service:4001=UP] (DOWN services are infra/port contention — non-blocking)

All task acceptance criteria verified:
- createRagSearchTool(searchService, filePathPrefix?) forwards prefix as third arg to similaritySearch(input, 6, filePathPrefix) when defined; two-arg call when omitted (rag-search.tool.ts:35-48).
- Spy tests assert prefixed (toHaveBeenCalledWith(query, 6, prefix)) and non-prefixed (toHaveBeenCalledWith(query)) paths in rag-search.tool.spec.ts:73-97.
- Tool name (similaritySearch), description constant, and Tool contract (name, description, run) unchanged.
- nx test ai-service — 23 suites, 292 tests passed (independently confirmed).
- Delivers AC-04 mechanism per task scope; full AC-04 routing integration is deferred to downstream tasks.
