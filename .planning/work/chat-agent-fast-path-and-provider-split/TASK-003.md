---
id: TASK-003
title: Create direct DB-backed tag-query.tool (list/count) implementing the Tool contract
status: done
priority: high
repo: be
epic: chat-agent-fast-path-and-provider-split
complexity: 5
created-at: 2026-06-16T10:52:11Z
updated-at: 2026-06-16T14:47:48+03:00
started-at: 2026-06-16T14:33:29+03:00
completed-at: 2026-06-16T14:47:48+03:00
spec: .planning/work/chat-agent-fast-path-and-provider-split/SPEC.md
---

## Description

Create a new `tag-query.tool.ts` that answers structured tag queries
("list all tags", "count tags") directly from the database with **no LLM
round-trip and no RAG similarity search**. It implements the existing `Tool`
contract so it dispatches through `ToolRegistry` like any other tool. Tags are
not a dedicated table — they live inside indexed document content (tag-shaped
markers such as `<faq>`), so the tool derives the tag set from the `documents`/
`chunks` tables via a parameterized Prisma raw query.

## Acceptance Criteria

- [ ] New file `ai-platform/apps/ai-service/src/ai/tools/tag-query.tool.ts`
  exporting a factory (e.g. `createTagQueryTool`) returning a `Tool`.
- [ ] The tool supports both "list" and "count" intents and returns a formatted
  observation string; it performs zero `provider.chat()` calls and no
  `similaritySearch` call.
- [ ] Tag extraction runs against the DB (Prisma) using a parameterized query —
  no string interpolation of user input.
- [ ] Tool `name`/`description` are stable identifiers suitable for the
  `ToolRegistry`.
- [ ] `tag-query.tool.spec.ts` covers list and count with a mocked DB layer.
- [ ] `nx test ai-service` passes.

## Technical Notes

- Follow the closure/factory pattern in `rag-search.tool.ts` and the `Tool`
  interface in `tools/tool.interface.ts`.
- Tag storage is an open question in the SPEC: there is no `tags` table
  (`schema.prisma`). Derive tags from tag-shaped markers in `documents.content`
  / `chunks.content`. Reuse `QueryNormalizer.isTagQuery` regex
  (`/^<[a-z][a-z0-9-]*\/?>$/i`) as the canonical tag shape.
- Inject a DB dependency (e.g. `PrismaService` from `@ai-platform/database`) via
  the factory closure, mirroring how `SearchService` is injected into the RAG tool.
- Distinguish list vs count from the tool input string (the router will pass a
  normalized intent/input).
- Maps to AC-02.

## QA Results

Status: PASS

Cycle: 1 of 3

Ran `npx nx test ai-service` in `ai-platform/`. Exit code 0 — 24 test suites, 302 tests passed (2.5s).

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported no affected projects (changes uncommitted); full ai-service suite run per task AC.

Static AC verification:
- `createTagQueryTool(prismaService)` factory returns a `Tool` with `name`, `description`, and `run`.
- List and count intents via `parseTagQueryIntent`; observations from `$queryRaw` only — no `provider.chat()` or `similaritySearch`.
- Tag extraction uses `Prisma.sql` with constant `TAG_EXTRACTION_PATTERN`; user input not interpolated into SQL.
- Stable registry identifiers: `TAG_QUERY_TOOL_NAME` (`tagQuery`) and `TAG_QUERY_TOOL_DESCRIPTION`.
- `tag-query.tool.spec.ts` covers list (populated + empty), count (with row + zero fallback), and mocked DB layer.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; BOOT=[api-gateway:4000=DOWN, auth-service:4002=DOWN, ai-service:4001=UP] (DOWN services are infra/port contention — non-blocking)

All task acceptance criteria verified:
- `createTagQueryTool(prismaService)` factory in `tag-query.tool.ts` returns a `Tool` with `name`, `description`, and `run` (lines 73–122).
- List and count intents via `parseTagQueryIntent`; observations from `$queryRaw` only — no `provider.chat()` or `similaritySearch` in tool code.
- Tag extraction uses `Prisma.sql` with constant `TAG_EXTRACTION_PATTERN`; user input drives intent only, not SQL interpolation.
- Stable registry identifiers: `TAG_QUERY_TOOL_NAME` (`tagQuery`) and `TAG_QUERY_TOOL_DESCRIPTION`.
- `tag-query.tool.spec.ts` covers list (populated + empty), count (with row + zero fallback), and mocked `$queryRaw` layer.
- `nx test ai-service` — 24 suites, 302 tests passed (independently confirmed).
- Delivers AC-02 tool mechanism per task scope; ToolRegistry registration and structured-lane routing deferred to TASK-005/TASK-006.
