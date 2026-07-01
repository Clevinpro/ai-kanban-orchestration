# SPEC: Chat Agent Mode — Backend (Safeguarded Multi-step Loop in Existing Chat)

**Epic:** `chat-agent-mode-be`
**Created:** 2026-06-14
**Status:** Ready for Planning
**Repo:** `be`

---

## Problem

The platform's chat (`POST /api/ai/chat` → Kafka `AI_REQUEST` → `AiService` → `AI_RESPONSE`
→ SSE `/api/ai/chat/stream`) does a single-shot RAG answer. There is no multi-step
(reason→act) agent and no runtime safeguards. A previous attempt added a *separate*
endpoint/service (`AgentRunnerService`, `/agent/stream`); it has been deleted because the
agent must live **inside the existing chat pipeline**, not as a parallel runtime.

## Goal

Add an opt-in "agent" mode to the existing chat backend: a bounded reason→act loop that
uses the existing hybrid search as its only tool and streams structured step/budget events
over the existing `AI_RESPONSE` Kafka topic — enforced by four safeguards — without
introducing a new service, controller, or SSE endpoint.

## User Stories / Requirements

### US-01: Opt-in agent run on the existing chat
> As a user, I send a chat message with mode=agent and the backend autonomously plans,
> searches the knowledge base, and answers — over the same chat connection I already use.

### US-02: Hard safeguards
> As an operator, I require every agent run to be bounded by token budget, iteration cap,
> wall-clock timeout, and a manual kill-switch, each enforced outside the loop body so a
> runaway loop is impossible.

### US-03: Structured step stream
> As a frontend consumer, I receive typed step / tool-call / budget events on the existing
> `/api/ai/chat/stream`, with the final answer still arriving as `chunk` tokens.

### US-04: Cancel in flight
> As a user, I can cancel a running agent and the backend stops promptly.

## Acceptance Criteria

- [ ] AC-01: `POST /api/ai/chat` accepts optional `mode: 'chat' | 'agent'` plus
      `maxIterations`, `tokenBudget`, `timeoutMs`; the gateway forwards them in the
      `AI_REQUEST` Kafka payload. Omitting them preserves today's behavior (`mode` defaults
      to `chat`).
- [ ] AC-02: In agent mode the reason→act loop lives **inside `AiService`** (e.g.
      `runAgentFlow`); no `AgentRunnerService` class, no `agent` Nest module, and no new
      HTTP/SSE endpoint exist in the repo.
- [ ] AC-03: The loop's only tool is `SearchService.similaritySearch`; observations are fed
      back into the next planning step until the model emits a final answer or a safeguard
      fires.
- [ ] AC-04: Four pure safeguards (`TokenBudget`, `IterationCap`, `Timeout`, `KillSwitch`)
      are enforced outside the loop body; exceeding any limit aborts the run and emits an
      `error` event with a typed reason.
- [ ] AC-05: Agent events (step, tool_call, tool_result, budget snapshot) stream over the
      existing `AI_RESPONSE` topic via the existing publish path; the final answer streams
      as `event: 'chunk'` tokens; the run terminates with `event: 'complete'` or
      `event: 'error'`.
- [ ] AC-06: Publishing to a new `AI_CANCEL` topic keyed by `conversationId` trips the
      run's `KillSwitch`, terminating it with an `error` event.
- [ ] AC-07: Default (non-agent) chat is byte-for-byte behaviorally unchanged
      (status/chunk/complete flow intact).
- [ ] AC-08: tests pass (`nx test ai-service shared api-gateway`), including per-safeguard
      unit tests and an agent-loop test (happy path + budget-exceeded + cancel).

## Technical Design

### Files touched

```
ai-platform/libs/shared/src/lib/types/ai.types.ts          # extend AiEventType/AiResponsePayload + agent event & budget fields; agent request config type
ai-platform/libs/shared/src/lib/constants/kafka.constants.ts # add AI_CANCEL topic
ai-platform/apps/api-gateway/src/ai/ai.dto.ts              # ChatRequestDto: mode + maxIterations/tokenBudget/timeoutMs
ai-platform/apps/api-gateway/src/ai/ai.controller.ts       # forward mode+limits into AI_REQUEST
ai-platform/apps/ai-service/src/ai/ai.module.ts            # AiRequestPayload: mode+limits; branch agent path; subscribe AI_CANCEL
ai-platform/apps/ai-service/src/ai/ai.service.ts           # runAgentFlow (ReAct loop); ProcessMessageOptions.onAgentEvent
ai-platform/apps/ai-service/src/ai/safeguards/token-budget.ts (+ .spec.ts)
ai-platform/apps/ai-service/src/ai/safeguards/iteration-cap.ts (+ .spec.ts)
ai-platform/apps/ai-service/src/ai/safeguards/timeout.ts (+ .spec.ts)
ai-platform/apps/ai-service/src/ai/safeguards/kill-switch.ts (+ .spec.ts)
ai-platform/apps/ai-service/src/ai/safeguards/errors.ts (+ .spec.ts)
```

### Event contract (extend, don't replace)

`AiResponsePayload` already carries `event: 'status' | 'chunk' | 'complete' | 'error'` with
`stage`, `message`, `result`, `error`. Extend it additively for agent runs:
- Reuse `event: 'chunk'` for final-answer tokens (FE token rendering unchanged).
- Add an `agent` event channel — either a new `event: 'agent'` value or new `stage` values
  (`agent_step`, `agent_tool_call`, `agent_tool_result`, `agent_budget`) carrying a typed
  `agent` field: `{ iteration, status, tool?, input?, budget?: { iteration, tokensUsed, elapsedMs, maxIterations, tokenBudget, timeoutMs } }`.
  Final value chosen in planning; must round-trip as JSON over SSE.

### Loop & safeguards

- `AiService.runAgentFlow(payload, emitStatus, emitAgentEvent)` returns `Observable<string>`
  (final-answer tokens), mirroring `runRagFlow`. Bounded reason→act: plan via
  `provider.chat(...)` → optional `similaritySearch` → observe → repeat.
- Safeguards are pure, DI-free classes checked at each iteration: `TokenBudget.track`,
  `IterationCap.increment`, `Timeout.check`, `KillSwitch.checkpoint`; each throws a typed
  error from `errors.ts`, caught and surfaced as an `error` event.
- `AiModule.streamAiResponse` branches on `value.mode`: agent → `runAgentFlow` wiring
  `onAgentEvent` into `publishResponse`; otherwise the existing path.
- `AI_CANCEL` consumer (keyed by `conversationId`) calls the active run's `KillSwitch.kill()`.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New `AgentRunnerService` / `/agent` endpoint | Explicitly rejected — reuse existing pipeline |
| Tools beyond `similaritySearch` | Single-tool agent for this epic |
| Cost/model routing, prompt caching | Separate vacancy-requirement epic |
| Persisting agent runs as a distinct entity | Runs ride existing conversation/messages |
| Frontend toggle & visualization | Lives in `chat-agent-mode-fe` |

## Open Questions

- [ ] Token accounting source for `TokenBudget`: provider-reported usage (Claude returns it)
      vs. local estimate — Ollama/LMStudio may not report usage. Pick a portable approach.
- [ ] Encode agent events as a new `event: 'agent'` value or as extra `stage` values on the
      existing `event` enum? (Affects FE parsing in the paired epic.)

## Constraints

- Single repo (`be`) — no FE edits in any task. FE consumes this contract in
  `chat-agent-mode-fe`, which must be planned/executed **after** this epic fixes the event shape.
- English-only comments/docs; `nx test <project>` before done (CLAUDE.md).
- Do not create new Nest apps/modules without checking `ai-platform/nx.json` (use an
  in-`AiModule` `safeguards/` folder, not a new module).
