---
id: TASK-004
title: Provide ToolRegistry in AiModule + register RAG tool at init
status: done
priority: high
repo: be
epic: chat-agent-mode-be-refactor
complexity: 4
created-at: 2026-06-15T12:00:00.000Z
updated-at: 2026-06-15T16:19:05+03:00
started-at: 2026-06-15T16:14:48+03:00
completed-at: 2026-06-15T16:19:05+03:00
spec: .planning/work/chat-agent-mode-be-refactor/SPEC.md
---

## Description

Wire the tool foundation into NestJS DI before the loop consumes it, so dependency injection
resolves at every later step. Provide `ToolRegistry` as a singleton provider and register the
RAG search tool against the existing `SearchService` at module initialization.

## Acceptance Criteria

- [ ] `ToolRegistry` (TASK-001) is registered as a provider in
      `ai-platform/apps/ai-service/src/ai/ai.module.ts` (or a small `tools` provider wiring it
      exports), available for injection into `AiService`.
- [ ] At init the RAG tool (TASK-002) is constructed with the injected `SearchService` and
      `registry.register(ragTool)` is called exactly once.
- [ ] `ToolRegistry` is exported from the module if `AiService` (different file) injects it.
- [ ] App boots cleanly (`nx build ai-service` / smoke boot) with the registry populated; no
      duplicate-registration errors.
- [ ] `nx test ai-service` passes.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/ai/ai.module.ts`. Use a factory provider (or
  `useFactory` with `SearchService` injected) so the RAG tool instance gets the real service.
- Register on construction or `onModuleInit` — pick one and keep it idempotent.
- This task only does DI wiring; `AiService` does not yet consume the registry (that is TASK-005).
  Keeping wiring first guarantees DI is valid when TASK-005 injects `ToolRegistry`.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the ToolRegistry DI wiring in ai.module.ts and the accompanying ai.module.spec.ts against all five acceptance criteria. The factory provider (lines 49-61) correctly injects SearchService from the imported SearchModule, constructs a singleton ToolRegistry, and registers the RAG tool exactly once — the singleton factory pattern makes duplicate registration structurally impossible. ToolRegistry is exported (line 64) for TASK-005's AiService injection. Verified against tool-registry.ts (no-arg constructor), rag-search.tool.ts (matching factory signature), and search.module.ts (exports SearchService). All ACs met; comments are English-only. Minor non-blocking note: the spec adds no direct test asserting the RAG tool is registered exactly once (AC #2), but the factory-singleton design guarantees this structurally.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected test ran for 5 projects (ai-service, api-gateway, shared, auth-service, kafka), all passed. ai-service: 23 suites / 284 tests passed. api-gateway: 3 suites / 18 tests passed. auth-service: 1 suite / 1 test passed. shared and kafka: no tests (passWithNoTests). Exit code 0.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK — ai-service=UP (4001); api-gateway=DOWN (4000), auth-service=DOWN (4002), non-blocking WARN (missing local infra, not a code defect). All services compiled.

All acceptance criteria verified against ai.module.ts, tool-registry.ts, rag-search.tool.ts, and search.module.ts:
- AC #1 (ToolRegistry registered as provider, injectable): PASS — factory provider `provide: ToolRegistry` at ai.module.ts lines 49-61.
- AC #2 (RAG tool built with injected SearchService, registered exactly once): PASS — factory injects SearchService (line 60), calls `registry.register(createRagSearchTool(searchService))` once (line 57); singleton factory runs once, so registration is structurally idempotent.
- AC #3 (ToolRegistry exported for AiService injection): PASS — `exports: [..., ToolRegistry]` at line 64.
- AC #4 (boots cleanly, no duplicate-registration errors): PASS — smoke BUILD_OK, ai-service booted UP.
- AC #5 (nx test ai-service passes): PASS — QA reports 23 suites / 284 tests, exit code 0.
DI resolves cleanly: SearchService is exported by SearchModule, which AiModule imports.
