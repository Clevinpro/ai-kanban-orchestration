---
id: TASK-002
title: Parse agent tool/budget events in useStreamConnection from existing SSE
status: done
priority: high
repo: fe
epic: chat-agent-mode-fe
complexity: 4
created-at: 2026-06-15T12:00:00.000Z
updated-at: 2026-06-15T16:58:56+03:00
started-at: 2026-06-15T16:54:50+03:00
completed-at: 2026-06-15T16:58:56+03:00
spec: .planning/work/chat-agent-mode-fe/SPEC.md
---

## Description

Teach the existing chat stream hook to recognize agent tool/budget events. Extend
`AiSsePayload` and `StreamHandlers` so `event: 'agent'` payloads from the existing
`/ai/chat/stream` are routed to a new handler, while `status` / `chunk` / `complete` / `error`
behave exactly as today. No new `EventSource`, route, or hook.

## Acceptance Criteria

- [ ] `AiSsePayload` (`ai-platform-fe/apps/chat/src/hooks/useStreamConnection.ts`) gains optional
      `event: 'agent'` and an optional `agent` field (the agent event type from `@libs/api`,
      TASK-001).
- [ ] `StreamHandlers` gains `onAgentEvent: (event: AgentEvent) => void`.
- [ ] In `es.onmessage`, a payload with `event === 'agent'` calls `handlers.onAgentEvent(payload.agent)`
      and returns; all other branches (status/chunk/complete/error/fallback) are unchanged.
- [ ] No second `EventSource` is created; `streamMessage` is still the only stream source; no
      `/agent` route or `useAgent` hook is added.
- [ ] `nx test chat` passes.

## Technical Notes

- File: `ai-platform-fe/apps/chat/src/hooks/useStreamConnection.ts`.
- Add the `'agent'` branch BEFORE the generic `result` chunk handling so agent events are not
  mistaken for chunk tokens. Guard against a missing `payload.agent`.
- Keep the idle-timeout / reconnect logic untouched.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `useStreamConnection.ts` and `useChat.ts`. All acceptance criteria are met: `AiSsePayload` gains `'agent'` and an optional typed `agent` field, `StreamHandlers` gains `onAgentEvent`, the `event === 'agent'` branch is correctly placed before generic chunk handling and guards a missing `payload.agent`, and no second `EventSource`/route/hook was introduced. `AgentEvent` is properly exported from `@libs/api`, and `useChat` supplies a no-op placeholder handler with English-only comments. Idle-timeout/reconnect logic is untouched. Clean, focused, low-risk change.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` ran from `ai-platform-fe/` and reported "No tasks were run" (exit code 0). The HEAD~1..HEAD diff contains no `ai-platform-fe/` files — the task's changes (`apps/chat/src/hooks/useStreamConnection.ts`, `apps/chat/src/hooks/useChat.ts`, `libs/api/...`) are present in the working tree but not yet committed, so no projects were affected for the given range. No affected tests found — no test coverage for this task (D-06: not a failure).

## TeamLead Check

Status: APPROVED

Smoke boot (fe): BUILD_OK; shell:3000=UP, auth:3001=UP, chat:3002=UP, docs:3003=UP.

All acceptance criteria verified against `apps/chat/src/hooks/useStreamConnection.ts`:
- AC-1: `AiSsePayload` gains optional `event: 'agent'` and `agent?: AgentEvent` (from `@libs/api`). PASS
- AC-2: `StreamHandlers` gains `onAgentEvent: (event: AgentEvent) => void`. PASS
- AC-3: `es.onmessage` routes `event === 'agent'` to `handlers.onAgentEvent(payload.agent)` (guarded against missing body) and returns; status/chunk/complete/error/fallback branches unchanged. PASS
- AC-4: No second `EventSource` (only the existing `streamMessage` source); no `/agent` route or `useAgent` hook added — confirmed via grep. PASS
- AC-5: `nx test chat` passes (1 file, 1 test). PASS

The `'agent'` branch is correctly placed before generic chunk handling; idle-timeout/reconnect logic untouched; comments English-only.
