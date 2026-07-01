---
id: TASK-001
title: Add Tool interface + ToolRegistry to ai-service (+ spec)
status: done
priority: high
repo: be
epic: chat-agent-mode-be-refactor
complexity: 3
created-at: 2026-06-15T12:00:00.000Z
updated-at: 2026-06-15T15:52:54+03:00
started-at: 2026-06-15T15:49:21+03:00
completed-at: 2026-06-15T15:52:54+03:00
spec: .planning/work/chat-agent-mode-be-refactor/SPEC.md
---

## Description

Introduce the pluggable-tool foundation. Add a `Tool` interface and a `ToolRegistry` so the
agent loop can resolve and dispatch tools by name instead of hardcoding `similaritySearch`.
Pure code — no NestJS DI logic in the registry itself beyond being instantiable as a provider
later (TASK-004).

## Acceptance Criteria

- [ ] New file `ai-platform/apps/ai-service/src/ai/tools/tool.interface.ts` exports
      `interface Tool { name: string; description: string; run(input: string, ctx: ToolContext): Promise<string>; }`
      plus a `ToolContext` type (carry `conversationId?` and anything the loop already has).
- [ ] New file `ai-platform/apps/ai-service/src/ai/tools/tool-registry.ts` exports a
      `ToolRegistry` class with `register(tool: Tool): void`, `get(name: string): Tool | undefined`,
      `list(): Tool[]`, and `describe(): string` (a planner-friendly enumeration of registered
      tool names + descriptions).
- [ ] `register` rejects (throws) on duplicate tool name; `get` returns undefined for unknown.
- [ ] `tool-registry.spec.ts` covers register/get/list/describe, duplicate-name throw, and
      unknown-name undefined.
- [ ] `nx test ai-service` passes.

## Technical Notes

- Folder `ai-platform/apps/ai-service/src/ai/tools/` is new — create it (mirrors the existing
  `safeguards/` folder). Do NOT create a new Nest module (SPEC constraint).
- Keep `ToolRegistry` framework-agnostic (plain class); it is wired as a provider in TASK-004.
- `describe()` output is consumed by the planner prompt in TASK-005 — keep it deterministic
  (stable ordering, e.g. registration order).
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed all three new files: `tool.interface.ts`, `tool-registry.ts`, and `tool-registry.spec.ts`. The `Tool`/`ToolContext` interfaces and the `ToolRegistry` class (register/get/list/describe) match the acceptance criteria exactly — duplicate-name throws, unknown-name returns undefined, and `describe()` is deterministic via Map insertion order. Code is framework-agnostic, well-documented in English, and the spec covers all required cases plus a sensible empty-registry edge case. No bugs, security, or quality concerns.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected --target=test (base=HEAD~1, head=HEAD) succeeded for 5 projects. ai-service: 280 tests passed (22 suites). api-gateway: 18 passed. auth-service: 1 passed. shared and kafka: no tests (passWithNoTests). Exit code 0.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway:4000=UP, auth-service:4002=UP, ai-service:4001=UP.

All acceptance criteria verified against the on-disk implementation:
- AC-1 (tool.interface.ts): `Tool { name; description; run(input, ctx): Promise<string> }` plus `ToolContext { conversationId? }` exported — confirmed.
- AC-2 (tool-registry.ts): `ToolRegistry` exports `register`, `get`, `list`, `describe`; `describe()` is deterministic via Map insertion order — confirmed.
- AC-3: `register` throws on duplicate name; `get` returns undefined for unknown — confirmed.
- AC-4 (tool-registry.spec.ts): covers register/get/list/describe, duplicate-name throw, unknown-name undefined, plus empty-registry edge — confirmed.
- AC-5 (`nx test ai-service`): QA reported exit 0, 280 ai-service tests across 22 suites including the new spec.

Note: this TASK-001 is the scoped tool foundation slice (SPEC AC-01); the broader SPEC ACs (AC-02..AC-08) are deferred to later tasks per the task's Technical Notes, so the task-level criteria are the correct gate here.
