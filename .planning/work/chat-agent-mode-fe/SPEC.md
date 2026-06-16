# SPEC: Chat Agent Mode — Frontend (Tool-Use Metrics, Limits & Stop in Existing Chat)

**Epic:** `chat-agent-mode-fe`
**Created:** 2026-06-15
**Status:** Ready for Planning
**Repo:** `fe`

---

## Problem

The chat MFE (`/chat`) renders a single-shot answer over the existing SSE stream
(`useChat` → `useStreamConnection` → `/ai/chat/stream`). The backend
(`chat-agent-mode-be-refactor`) now runs the chat as a bounded **tool-use loop** that emits
budget / tool-call metrics, accepts safeguard limits on the normal chat request, and supports an
in-flight cancel. The FE must surface those — metrics, optional limits, stop — **inside the
existing chat page**, with no separate agent mode, route, hook, or second EventSource.

## Goal

Add live tool-use metrics, optional limit inputs, and a stop control to the existing `/chat`
page, rendering the backend's step / budget / tool-call events from the existing chat SSE — with
no chat|agent toggle, no new route, no new hook, and no second `EventSource`.

## User Stories / Requirements

### US-01: Limits on the existing chat
> As a user, on `/chat` I can optionally set iteration / token / time limits before sending —
> without switching to a separate mode.

### US-02: Live tool-use visualization
> As a user, while the chat works I see a step timeline, three budget bars
> (iterations / tokens / time), and the list of tool calls, with the final answer streaming in as
> text — all in the chat view.

### US-03: Stop in flight
> As a user, I can stop a running chat from the UI and it ends promptly.

### US-04: One transport
> As a maintainer, events arrive on the same `/ai/chat/stream` the chat already uses; there is no
> `/agent` route, no `useAgent` hook, and no second `EventSource`.

## Acceptance Criteria

- [ ] AC-01: The `/chat` composer exposes optional `maxIterations`, `tokenBudget`, `timeoutMs`
      inputs; there is NO chat|agent mode toggle.
- [ ] AC-02: `sendMessage` (`@libs/api`) forwards the limits to `POST /ai/chat` when set; omitting
      them sends exactly as today.
- [ ] AC-03: `useStreamConnection` parses tool/budget events from the existing `/ai/chat/stream`
      SSE; no new `EventSource`, no `/agent` route, no `useAgent` hook are added.
- [ ] AC-04: `AgentSteps` (timeline), `BudgetIndicator` (3 bars, green→yellow→red), and
      `ToolCallList` are (re)added to `@libs/ui` and render live from the stream; the final answer
      renders via the existing `chunk` path; the tool-call list shows dynamic tool names.
- [ ] AC-05: A stop control calls a cancel endpoint (`POST /ai/chat/cancel`) and the run ends.
- [ ] AC-06: A plain chat (no limits, no tool calls) is behaviorally unchanged.
- [ ] AC-07: tests pass (`nx test chat ui api`).

## Technical Design

### Files touched

```
ai-platform-fe/libs/api/src/types/chat.types.ts            # IChatRequest limits; tool event & budget view types
ai-platform-fe/libs/api/src/endpoints/chat.api.ts          # sendMessage forwards limits; cancelMessage -> POST /ai/chat/cancel
ai-platform-fe/apps/chat/src/hooks/useStreamConnection.ts  # AiSsePayload + StreamHandlers: tool/budget events
ai-platform-fe/apps/chat/src/hooks/useChat.ts              # steps/toolCalls/budget state; pass limits; stop()
ai-platform-fe/apps/chat/src/routes/chat.tsx               # limit inputs + metrics panels + stop button (no toggle)
ai-platform-fe/libs/ui/src/components/AgentSteps/AgentSteps.tsx (+ stories + spec)
ai-platform-fe/libs/ui/src/components/BudgetIndicator/BudgetIndicator.tsx (+ stories + spec)
ai-platform-fe/libs/ui/src/components/ToolCallList/ToolCallList.tsx (+ stories + spec)
ai-platform-fe/libs/ui/src/index.ts                        # re-export the three components
```

### Flow

- `chat.tsx` holds optional limits state and drives stop; passes limits through `useChat` →
  `@libs/api sendMessage` (`POST /ai/chat`).
- `useStreamConnection` extends `AiSsePayload` / `StreamHandlers` with `event: 'agent'` tool/budget
  events and routes them to new `useChat` state (`steps`, `toolCalls`, `budget`); `chunk` still
  feeds the assistant message text.
- The three `@libs/ui` components are reintroduced (view-only, backend-agnostic) and mounted in the
  chat view; they render whenever tool/budget events arrive (no mode gate).
- `stop()` calls `cancelMessage(conversationId)` → `POST /ai/chat/cancel`.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backend loop, tools, safeguards, cancel endpoint | Lives in `chat-agent-mode-be-refactor` |
| Separate `/agent` route / `useAgent` hook / 2nd EventSource | Explicitly rejected — reuse chat stream |
| Tag-fetch tool UI | Future epic |

## Open Questions

- [ ] Panel layout within the chat view — inline in the assistant bubble vs a side/below panel.
- [ ] Limit inputs always visible vs behind a collapsible "advanced" disclosure.
- [ ] Final tool-event JSON shape is pinned by `chat-agent-mode-be-refactor`; FE parsing must match.

## Constraints

- Single repo (`fe`) — no BE edits. Depends on the `chat-agent-mode-be-refactor` event contract;
  plan/execute this epic **after** that one lands.
- English-only comments/docs; `nx test <project>` (Vitest) before done (CLAUDE.md).
- Reuse the `chat` app + `@libs/ui` / `@libs/api`; no new MFE app/lib without checking
  `ai-platform-fe/nx.json`.
