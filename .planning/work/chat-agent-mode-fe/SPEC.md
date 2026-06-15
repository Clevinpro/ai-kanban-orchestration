# SPEC: Chat Agent Mode — Frontend (Agent Toggle & Live Visualization in Existing Chat)

**Epic:** `chat-agent-mode-fe`
**Created:** 2026-06-14
**Status:** Ready for Planning
**Repo:** `fe`

---

## Problem

The chat MFE (`/chat`) renders a single-shot RAG answer over the existing SSE stream
(`useChat` → `useStreamConnection` → `/ai/chat/stream`). A previous attempt shipped a
*separate* `/agent` page + `useAgent` hook + dedicated `libs/ui` components; all were
deleted because the agent UX must live **inside the existing chat page**, fed by the
existing stream.

## Goal

Add an opt-in agent mode to the existing `/chat` page: a chat|agent toggle that sends
safeguard limits with the message and renders the backend's live step / budget / tool-call
events from the existing chat SSE — with no new route, no new hook, and no second
EventSource.

## User Stories / Requirements

### US-01: Mode toggle in the existing chat
> As a user, on `/chat` I switch between plain chat and agent mode and (in agent mode) set
> iteration / token / time limits before sending.

### US-02: Live agent visualization
> As a user, while the agent works I see a step timeline, three budget bars
> (iterations / tokens / time), and the list of tool calls, with the final answer streaming
> in as text — all in the chat view.

### US-03: One transport
> As a maintainer, agent events arrive on the same `/ai/chat/stream` the chat already uses;
> there is no `/agent` route, no `useAgent` hook, and no second `EventSource`.

## Acceptance Criteria

- [ ] AC-01: The `/chat` page exposes a `chat | agent` toggle; agent mode reveals
      `maxIterations`, `tokenBudget`, `timeoutMs` inputs.
- [ ] AC-02: Sending in agent mode posts `mode` + the three limits to the existing
      `POST /ai/chat` (`@libs/api` `sendMessage`); plain chat sends as today.
- [ ] AC-03: `useStreamConnection` parses agent events from the existing `/ai/chat/stream`
      SSE; no new `EventSource`, no `/agent` route, no `useAgent` hook are added.
- [ ] AC-04: `AgentSteps` (timeline), `BudgetIndicator` (3 bars, green→yellow→red), and
      `ToolCallList` are (re)added to `@libs/ui` and render live from the stream; the final
      answer renders via the existing `chunk` path.
- [ ] AC-05: Plain chat mode is behaviorally unchanged.
- [ ] AC-06: tests pass (`nx test chat ui api`).

## Technical Design

### Files touched

```
ai-platform-fe/libs/api/src/types/chat.types.ts            # IChatRequest: mode + limits; agent event & budget view types
ai-platform-fe/libs/api/src/endpoints/chat.api.ts          # sendMessage forwards mode+limits
ai-platform-fe/apps/chat/src/hooks/useStreamConnection.ts  # AiSsePayload + StreamHandlers: agent events
ai-platform-fe/apps/chat/src/hooks/useChat.ts              # agent state (steps/toolCalls/budget); pass mode+limits
ai-platform-fe/apps/chat/src/routes/chat.tsx               # chat|agent toggle + config inputs + agent panels
ai-platform-fe/libs/ui/src/components/AgentSteps/AgentSteps.tsx (+ stories)
ai-platform-fe/libs/ui/src/components/BudgetIndicator/BudgetIndicator.tsx (+ stories)
ai-platform-fe/libs/ui/src/components/ToolCallList/ToolCallList.tsx (+ stories)
ai-platform-fe/libs/ui/src/index.ts                        # re-export the three components
```

### Flow

- `chat.tsx` holds mode + limits state; passes them through `useChat` →
  `@libs/api sendMessage` (`POST /ai/chat`).
- `useStreamConnection` extends `AiSsePayload`/`StreamHandlers` with agent events and routes
  them to new `useChat` state (`steps`, `toolCalls`, `budget`); `chunk` still feeds the
  assistant message text.
- The three `@libs/ui` components are reintroduced (view-only, backend-agnostic) and mounted
  in the chat view when mode = agent.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Separate `/agent` route / `useAgent` hook / 2nd EventSource | Explicitly rejected — reuse chat stream |
| Backend loop, safeguards, event contract | Lives in `chat-agent-mode-be` |
| Persisting agent runs separately | Out of scope for this epic |

## Open Questions

- [ ] Layout of agent panels within the chat view — inline inside the assistant message
      bubble vs. a side/below panel?
- [ ] Final agent-event JSON shape depends on `chat-agent-mode-be`'s Open Question (new
      `event: 'agent'` vs extra `stage` values); FE parsing must match the chosen shape.

## Constraints

- Single repo (`fe`) — no BE edits. Depends on the `chat-agent-mode-be` event contract;
  plan/execute this epic **after** that one lands.
- English-only comments/docs; `nx test <project>` (Vitest) before done (CLAUDE.md).
- Do not create new MFE apps/libs without checking `ai-platform-fe/nx.json` (reuse `chat`
  app + `@libs/ui`, `@libs/api`).
