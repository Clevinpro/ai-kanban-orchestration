---
id: TASK-014
title: Add useAgent EventSource state-machine hook
status: done
priority: high
repo: fe
epic: agent-runtime
complexity: 6
created-at: 2026-06-03T12:00:00Z
updated-at: 2026-06-03T12:00:00Z
started-at: null
completed-at: null
spec: .planning/work/agent-runtime/SPEC.md
---

## Description

Add the `useAgent` hook in the chat app: it opens an `EventSource` on the agent stream and dispatches incoming events by `event.type` into React state, exposing the timeline, tool calls, budget, status, and streamed final response. The connection is closed on terminal events and on unmount with no leaked connections. The hook must not import from `libs/`.

## Acceptance Criteria

- [ ] `ai-platform-fe/apps/chat/src/hooks/useAgent.ts` exposes `{ steps, toolCalls, budget, status, finalResponse, runAgent }` where `status` is `'idle' | 'running' | 'done' | 'error'`
- [ ] `runAgent(task)` opens an `EventSource` on the agent stream (`/ai/agent/stream?task=...`)
- [ ] Dispatch by `event.type`: `AGENT_START`→set config + `running`; `STEP`→push step; `TOOL_CALL`→push toolCall; `TOOL_RESULT`→update last toolCall; `BUDGET`→replace budget; `TOKEN`→append to `finalResponse`; `AGENT_DONE`→`done` + close; `AGENT_ERROR`→`error` + close
- [ ] `EventSource` is closed on terminal events and on unmount — no leaked connections
- [ ] Hook touches **no `libs/`**
- [ ] `nx affected -t lint test` passes for ai-platform-fe

## Technical Notes

- Mirror the existing SSE client conventions in `ai-platform-fe/apps/chat/src/hooks/useStreamConnection.ts` (EventSource lifecycle, cleanup in `useEffect` return / on terminal events).
- Each `MessageEvent.data` is a JSON-encoded `IAgentEvent`; `JSON.parse` then `switch` on `type` against the string literals (`'AGENT_START'`, …) — must match the backend enum values exactly.
- Define the hook's local state shapes inline (no `libs/` import); keep field names aligned with the backend event payloads.
- Close + null the `EventSource` ref on `AGENT_DONE`/`AGENT_ERROR` and on unmount.
- AC reference: AC-24, AC-25, AC-26.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `ai-platform-fe/apps/chat/src/hooks/useAgent.ts` against TASK-014 acceptance criteria and the reference `useStreamConnection.ts` hook. The hook correctly exposes `{ steps, toolCalls, budget, status, finalResponse, runAgent }` with the right status union, opens an `EventSource` on `/ai/agent/stream?task=...`, and dispatches all 8 event types whose string literals match the backend `AgentEventType` enum exactly. Connection teardown is correct on `AGENT_DONE`/`AGENT_ERROR`, transport `onerror`, run restart, and unmount (`useEffect(() => closeConnection)`) — no leaked connections. It imports only from `react` (no `libs/`), and faithfully replicates `@libs/api` URL/env conventions inline. Defensive `Number(...)` parsing and JSON-parse guards are sound. No bugs or security concerns found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

Ran `nx affected --target=test --base=HEAD~1 --head=HEAD` in `ai-platform-fe/`. Exit code 0; nx reported "No tasks were run" and `nx show projects --affected` returned `[]`. No affected tests found — no test coverage for this task. Per D-06, no affected tests is not a failure.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified against `ai-platform-fe/apps/chat/src/hooks/useAgent.ts`:
- AC-24 PASS — `UseAgentResult` exposes `{ steps, toolCalls, budget, status, finalResponse, runAgent }`; `AgentStatus` is exactly `'idle' | 'running' | 'done' | 'error'`.
- AC-25 PASS — `runAgent` opens an `EventSource` on `/ai/agent/stream?task=...` and the `switch` handles all 8 event types with the correct state transitions (AGENT_START→config+running, STEP→push, TOOL_CALL→push, TOOL_RESULT→resolve last, BUDGET→replace, TOKEN→append, AGENT_DONE→done+close, AGENT_ERROR→error+close); literals match the backend `AgentEventType` enum exactly.
- AC-26 PASS — connection closed on terminal events, transport `onerror`, run restart, and unmount (`useEffect(() => closeConnection)`); imports only from `react`, no `libs/` import.
- Gate (AC-30 subset) PASS — `nx affected -t lint test` exit 0; no affected tests (D-06 not a failure).
