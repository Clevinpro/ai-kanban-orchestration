---
id: TASK-005
title: Wire QueryRouterService and tag-query tool providers in ai.module
status: done
priority: high
repo: be
epic: chat-agent-fast-path-and-provider-split
complexity: 3
created-at: 2026-06-16T10:52:11Z
updated-at: 2026-06-16T18:37:37+03:00
started-at: 2026-06-16T18:26:09+03:00
completed-at: 2026-06-16T18:37:37+03:00
spec: .planning/work/chat-agent-fast-path-and-provider-split/SPEC.md
---

## Description

Register the new building blocks in `ai.module.ts`: add `QueryRouterService`
(TASK-004) as a provider, and register the `tag-query.tool` (TASK-003) into the
`ToolRegistry` factory alongside the existing RAG tool. Keep the `ToolRegistry`
contract unchanged — only extend the factory body to register the additional
tool. Do not change `AiService` routing logic here (that is TASK-006).

## Acceptance Criteria

- [ ] `QueryRouterService` is declared in the `AiModule` `providers` array.
- [ ] The `ToolRegistry` `useFactory` registers both the RAG search tool and the
  new tag-query tool (each registered exactly once).
- [ ] Required dependencies for the tag tool (e.g. `PrismaService`) are available
  to the factory via `inject`.
- [ ] Module compiles and existing module/DI tests pass.
- [ ] `nx test ai-service` passes.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/ai/ai.module.ts`.
- The `ToolRegistry` provider is a `useFactory` (currently injects
  `SearchService` and registers `createRagSearchTool`). Extend `inject` and the
  factory to also `registry.register(createTagQueryTool(...))`.
- `PrismaService` is exported from `@ai-platform/database`; confirm the database
  module is importable here (SearchModule already depends on Prisma).
- Avoid duplicate-registration: `ToolRegistry.register` throws on duplicate names.
- Supports AC-02 wiring; no AiService edits in this task.

## QA Results

Status: PASS

Cycle: 1 of 3

Ran `npx nx test ai-service` in `ai-platform/`. Exit code 0 — 25 test suites, 314 tests passed (2.8s).

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported no affected projects (changes uncommitted); full ai-service suite run per task AC.

Static AC verification:
- QueryRouterService declared in AiModule providers array.
- ToolRegistry useFactory registers RAG search and tag-query tools once each.
- inject supplies SearchService and PrismaService for the factory.
- No AiService routing changes in this task (scope respected).
