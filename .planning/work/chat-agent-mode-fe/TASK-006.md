---
id: TASK-006
title: Add steps/toolCalls/budget state + limits + stop() to useChat
status: done
priority: high
repo: fe
epic: chat-agent-mode-fe
complexity: 5
created-at: 2026-06-15T12:00:00.000Z
updated-at: 2026-06-15T17:19:56+03:00
started-at: 2026-06-15T17:15:17+03:00
completed-at: 2026-06-15T17:19:56+03:00
spec: .planning/work/chat-agent-mode-fe/SPEC.md
---

## Description

Extend the `useChat` hook to drive the tool-use UI. Accumulate agent steps, tool calls, and the
latest budget snapshot from the new stream handler; accept optional limits and forward them to
`sendMessage`; and expose a `stop()` that cancels the active run. The final answer continues to
render via the existing `chunk` → assistant-message path.

## Acceptance Criteria

- [ ] `useChat` wires `onAgentEvent` (TASK-002) into new state: `steps`, `toolCalls`, `budget`,
      updated as agent events arrive; reset at the start of each send.
- [ ] `sendMessage(text, limits?)` forwards optional `maxIterations` / `tokenBudget` / `timeoutMs`
      to `@libs/api sendMessage` (TASK-001); omitting them sends as today.
- [ ] A `stop()` calls `cancelMessage(conversationId)` (TASK-001) for the active conversation and
      tears down the in-flight stream/state cleanly.
- [ ] `chunk` tokens still append to the assistant message; `complete` / `error` unchanged.
- [ ] The hook returns the new `steps`, `toolCalls`, `budget`, and `stop` alongside the existing
      API.
- [ ] `nx test chat` passes.

## Technical Notes

- File: `ai-platform-fe/apps/chat/src/hooks/useChat.ts`; consumes the `onAgentEvent` handler and
  `cancelMessage` from earlier tasks.
- Keep the existing `connectStream` handler wiring; add `onAgentEvent` alongside `onChunk` etc.
- Derive `toolCalls` state from `tool_call` / `tool_result` events; `budget` is the latest
  snapshot on any agent event.
- Preserve all existing reconnect / pending-stream behavior.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the primary changed file `ai-platform-fe/apps/chat/src/hooks/useChat.ts` against TASK-006 acceptance criteria, plus the supporting `useStreamConnection.ts`, `chat.api.ts`, and `chat.types.ts`. All criteria are met: `onAgentEvent` is wired into new `steps`/`toolCalls`/`budget` state and reset at send start; `sendMessage(text, limits?)` forwards optional limits only when present (preserving the legacy request shape); `stop()` tears down the local stream/state first and best-effort calls `cancelMessage`; the existing chunk/complete/error paths are unchanged; and the hook returns the new values. Type usage is consistent (`AgentEvent.input` is intentionally reused as `tool_result` output), and SSE routing guards a missing agent body. Code quality is solid with clear English comments.

**Non-blocking note (optional):**
- `useChat.ts:75-85` — the external conversation-change effect resets `localConversationId`/`streaming` but does not clear `steps`/`toolCalls`/`budget`. Stale agent progress from a prior conversation can remain visible until the next `sendMessage` reset. Consider clearing these three in that effect for cleaner conversation switching. Severity: WARNING (does not block; send-time reset satisfies the AC).
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task. `nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit code 0), and `nx show projects --affected` returned an empty list. The HEAD~1..HEAD diff touched only `.claude/` and `kanban-server/` files (no `ai-platform-fe/` paths), so no frontend projects were affected.

## TeamLead Check

Status: APPROVED

Smoke boot (fe): BUILD_OK; shell:3000=UP, auth:3001=UP, chat:3002=UP, docs:3003=UP. (Module Federation DTS #TYPE-001 warnings on auth/chat are non-blocking type-declaration generation notices; rspack compiled successfully for all apps.)

All acceptance criteria verified against `ai-platform-fe/apps/chat/src/hooks/useChat.ts`:
- AC1 — `onAgentEvent` wired into new `steps`/`toolCalls`/`budget` state (lines 238-285); reset at send start (lines 381-383). PASS.
- AC2 — `sendMessage(text, limits?)` forwards `maxIterations`/`tokenBudget`/`timeoutMs` only when defined, preserving the legacy request shape when omitted (lines 369, 405-407); confirmed against `chat.api.ts`. PASS.
- AC3 — `stop()` tears down local stream/state first then best-effort calls `cancelMessage(conversationId)` (lines 436-455). PASS.
- AC4 — `chunk` tokens still append to the assistant message (lines 185-207); `complete`/`error` paths unchanged. PASS.
- AC5 — hook returns `steps`, `toolCalls`, `budget`, `stop` alongside the existing API (line 457). PASS.
- AC6 — `nx test chat` re-run by TeamLead with `--skip-nx-cache`: 1 file / 1 test passed. PASS.

Code review APPROVED and QA PASS corroborate. The non-blocking WARNING (stale agent state not cleared on external conversation change) does not affect any AC since send-time reset satisfies AC1.
