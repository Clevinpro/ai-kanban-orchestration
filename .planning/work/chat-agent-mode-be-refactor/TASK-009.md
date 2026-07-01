---
id: TASK-009
title: Add tests — fake-tool dispatch (AC-07) + unified path + cancel
status: done
priority: high
repo: be
epic: chat-agent-mode-be-refactor
complexity: 5
created-at: 2026-06-15T12:00:00.000Z
updated-at: 2026-06-15T16:50:24+03:00
started-at: 2026-06-15T16:45:09+03:00
completed-at: 2026-06-15T16:50:24+03:00
spec: .planning/work/chat-agent-mode-be-refactor/SPEC.md
---

## Description

Close the refactor's acceptance gate with integration-level tests over the unified tool-use
chat. Prove a tool can be added by registration alone (AC-07), that the single `/ai/chat` path
dispatches a registered tool, and that cancel terminates a run. Per-unit specs for the registry
and RAG tool already ship in TASK-001/002.

## Acceptance Criteria

- [ ] Extensibility (AC-07): a test registers a fake `Tool` in the `ToolRegistry`, drives the
      provider mock to emit a `TOOL <fakeName>:` decision, and asserts the loop dispatches the
      fake tool's `run` and feeds its observation back — with NO edits to the loop body.
- [ ] Unified path: a test sends a normal request (no `mode`) and asserts it runs the loop with
      the RAG tool registered — direct-answer (zero tool calls) and one-search paths both work.
- [ ] Cancel: tripping the run's `KillSwitch` (simulating `AI_CANCEL`) aborts the run with the
      typed kill-switch reason surfaced as an `error` event.
- [ ] Streamed `tool_call` / `tool_result` events carry the dynamic tool name; budget snapshots
      well-formed.
- [ ] `nx test ai-service shared api-gateway` all pass.

## Technical Notes

- Likely file: `ai-platform/apps/ai-service/src/ai/ai.service.spec.ts` (and/or a focused
  loop spec). Mock `AiProviderFactory.getProvider().chat` to script decisions; mock
  `SearchService.similaritySearch` for the RAG tool.
- For AC-07 use a stub `Tool` with a unique `name`/`description`; assert dispatch happens purely
  via the registry.
- Use an injected fake clock for any timeout assertions (no real timers).
- This is the AC-08 gate: ensure the full `nx test ai-service shared api-gateway` command is green
  before marking done.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the integration test suite in `ai-platform/apps/ai-service/src/ai/ai.service.spec.ts` against the production source (`ai.service.ts`, `rag-search.tool.ts`, `tool.interface.ts`, `ai.types.ts`). All assertions accurately reflect real loop behavior: AC-07 fake-tool dispatch (run signature `run(input, ctx)` and `tool_call.tool` match source), the strengthened happy-path `tool_result` name/input checks, the unified direct-answer/one-search paths, the kill-switch cancel (typed `KillSwitchTrippedError` / `kill_switch` reason), the bounded iteration-cap, and well-formed budget snapshots. Tests are deterministic (async stream + injected mocks, no real timers) with English-only comments. No bugs, security issues, or quality concerns found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" / no affected projects — the HEAD~1..HEAD commit diff only touches a non-project file, and this task's source/spec changes are still in the working tree. Per D-06, no affected tests is not a failure.

Verified the relevant projects directly via `nx run-many --target=test --projects=ai-service,shared,api-gateway`: all green.
- ai-service: 23 suites, 287 tests passed
- api-gateway: 3 suites, 22 tests passed
- shared: no tests (passWithNoTests)

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=DOWN (infra), auth-service=DOWN (infra), ai-service=UP. Build cached/green for all three; the two DOWN services are missing local infra (Kafka/DB), not code defects.

All acceptance criteria verified against `ai-platform/apps/ai-service/src/ai/ai.service.spec.ts`:
- Extensibility (AC-07): test registers a fake `Tool` ("fakeTool"), scripts the provider to emit `TOOL fakeTool:`, asserts `run(input, ctx)` dispatched via registry with no loop edits and RAG untouched.
- Unified path: plain no-mode question answers directly (zero tool calls); one-search happy path dispatches RAG and feeds the observation back.
- Cancel: tripping the run KillSwitch aborts at the next checkpoint with typed `KillSwitchTrippedError` / `reason: 'kill_switch'` surfaced as an `error` event.
- Dynamic tool name on `tool_call` / `tool_result` events and well-formed budget snapshots asserted.
- `nx run-many --target=test --projects=ai-service,shared,api-gateway` re-run with `--skip-nx-cache`: ai-service 287, api-gateway 22 passed; shared passWithNoTests. All green.
