# SPEC: Agent Runtime — Safeguarded Tool-Using Loop with Live Visualization

**Epic:** `agent-runtime`
**Created:** 2026-06-03
**Status:** Ready for Planning

---

## Goal

Build an agentic loop on top of the existing Claude provider + hybrid `SearchService`.
A user submits a task; the backend runs a bounded reason→act loop (Claude plans, calls
the `search` tool, observes, repeats until done) and streams a typed event log over SSE.
The frontend renders that stream live: a step timeline, three budget progress bars
(iterations / tokens / time), the list of tool calls, and the final answer token-by-token.

Hard safety is the point: the loop **cannot** run away. Token budget, iteration cap,
wall-clock timeout, and a manual kill-switch each abort the run with a typed error that
surfaces to the UI as `AGENT_ERROR`.

This epic spans **both repos** — backend (`ai-platform/`) and frontend
(`ai-platform-fe/`). Per project rules each task is single-repo (`repo: be` or
`repo: fe`); no task edits across services.

---

## User Stories / Requirements

### US-01: Bounded Agent Run
> As a user, I give the agent a task and it autonomously plans, searches the knowledge
> base, and answers — without me approving each step.

### US-02: Live Step Timeline
> As a user, while the agent works I see each step appear in a vertical timeline with a
> spinner on the active step, so I know it is making progress and not hung.

### US-03: Budget Transparency
> As a user, I see three progress bars — iterations used, tokens used, time elapsed —
> each turning green→yellow→red as it approaches its limit, so I understand why a run
> stopped.

### US-04: Tool-Call Visibility
> As a user, I see which tools the agent invoked and with what parameters, each marked
> done when its result returns, so the reasoning is auditable.

### US-05: Streamed Final Answer
> As a user, the final answer streams in token-by-token rather than appearing all at
> once.

### US-06: Hard Safeguards
> As an operator, I am guaranteed the loop aborts when it exceeds token budget, max
> iterations, or timeout — and that I can kill an in-flight run immediately.

### US-07: Reusable Visualization Components
> As a frontend developer, the timeline, budget indicator, and tool-call list are
> shared `@libs/ui` components with Storybook stories, so they are reusable and
> visually testable in isolation.

---

## Acceptance Criteria

### Backend — shared types (`ai-platform/libs/shared/`)

- [ ] AC-01: `libs/shared/src/lib/types/agent.types.ts` defines `AgentEventType` enum
      with members `AGENT_START, STEP, TOOL_CALL, TOOL_RESULT, BUDGET, TOKEN,
      AGENT_DONE, AGENT_ERROR`
- [ ] AC-02: Same file defines generic `IAgentEvent<T = unknown>` (`type:
      AgentEventType`, `data: T`, `timestamp: number`), `IAgentConfig`
      (`maxIterations`, `tokenBudget`, `timeoutMs` — all `number`), `IBudgetState`
      (`iteration`, `tokensUsed`, `elapsedMs` — all `number`), `IToolCall` (`tool:
      string`, `input: Record<string, unknown>`)
- [ ] AC-03: All five symbols are re-exported from `libs/shared/src/index.ts`; the file
      adds **types/enum only** — no runtime logic, no NestJS imports

### Backend — safeguards (`ai-platform/apps/ai-service/src/agent/safeguards/`)

- [ ] AC-04: `errors.ts` exports `BudgetExceededError`, `MaxIterationsError`,
      `TimeoutError`, `AgentKilledError` — each extends `Error`, sets `name`, and is
      `instanceof Error`
- [ ] AC-05: `token-budget.ts` — `class TokenBudget` ctor `(limit: number)`;
      `track(tokens: number): void` accumulates and throws `BudgetExceededError` when
      cumulative total **exceeds** `limit`; `getState(): { used: number; limit: number }`
- [ ] AC-06: `iteration-cap.ts` — `class IterationCap` ctor `(max: number)`;
      `increment(): void` throws `MaxIterationsError` when count would exceed `max`;
      `get current(): number`
- [ ] AC-07: `timeout.ts` — `class Timeout` ctor `(ms: number)` records start time;
      `check(): void` throws `TimeoutError` when `elapsed > ms`; `get elapsed(): number`
- [ ] AC-08: `kill-switch.ts` — `class KillSwitch`; `kill(): void` sets killed flag;
      `checkpoint(): void` throws `AgentKilledError` when killed
- [ ] AC-09: Every safeguard class is pure (no I/O, no NestJS DI) and unit-tested in a
      co-located `*.spec.ts` covering both the pass path and the throw path

### Backend — agent runner (`ai-platform/apps/ai-service/src/agent/`)

- [ ] AC-10: `agent-runner.service.ts` — `@Injectable() class AgentRunnerService`
      exposes `run(task: string, config: IAgentConfig): Observable<IAgentEvent>`
- [ ] AC-11: First emission is `AGENT_START` carrying the resolved `IAgentConfig`;
      last successful emission is `AGENT_DONE`; the Observable then completes
- [ ] AC-12: Each loop turn, in order: `killSwitch.checkpoint()` → `timeout.check()` →
      `iterationCap.increment()` → emit `STEP { iteration, status }` → Claude plans →
      `budget.track(tokens)` → emit `BUDGET` with current `IBudgetState`
- [ ] AC-13: When the plan requires the search tool: emit `TOOL_CALL` (`IToolCall`),
      invoke `SearchService.similaritySearch`, emit `TOOL_RESULT` with the result
- [ ] AC-14: When the plan is final: stream the answer via repeated `TOKEN` events,
      then `break`
- [ ] AC-15: Any thrown safeguard/provider error is caught and emitted as a single
      `AGENT_ERROR { reason: string }`; the Observable completes (does **not** error
      out the subscriber) so the client always sees a terminal event
- [ ] AC-16: Unsubscribing the Observable triggers the kill-switch / aborts the
      in-flight Claude stream (teardown wired in the `Observable` cleanup function)
- [ ] AC-17: An SSE endpoint exposes the run to the browser at a path the frontend hits
      as `/ai/agent/stream` (see Technical Design — transport decision); each
      `IAgentEvent` is sent as one `MessageEvent` with JSON `data`
- [ ] AC-18: `AgentRunnerService` is provided by the agent module and wired into the
      ai-service module graph; `ai-service` boots with no DI errors

### Frontend — shared UI (`ai-platform-fe/libs/ui/`)

- [ ] AC-19: `components/AgentSteps/AgentSteps.tsx` — props `{ steps: IAgentStep[] }`,
      renders an Ant Design `Timeline`; active step shows a spinner; statuses map to
      icons; `AgentSteps.stories.tsx` has `Running`, `Completed`, `WithError` stories
- [ ] AC-20: `components/BudgetIndicator/BudgetIndicator.tsx` — props `{ iteration,
      maxIterations, tokensUsed, tokenBudget, elapsedMs, timeoutMs }`, renders three AntD
      `Progress` bars; color thresholds green `<60%` → yellow `<85%` → red `≥85%`;
      `BudgetIndicator.stories.tsx` has `Low`, `Medium`, `NearLimit`
- [ ] AC-21: `components/ToolCallList/ToolCallList.tsx` — props `{ toolCalls:
      IToolCall[] }`, lists each tool name + params, check mark when resolved;
      `ToolCallList.stories.tsx` has `Empty`, `WithCalls`
- [ ] AC-22: All three components + their prop types are exported from
      `libs/ui/src/index.ts`; the lib edits touch **no `apps/`**
- [ ] AC-23: `IAgentStep` type is defined where the UI lib can consume it without a
      circular dep (see Technical Design — type ownership)

### Frontend — chat hook + page (`ai-platform-fe/apps/chat/`)

- [ ] AC-24: `apps/chat/src/hooks/useAgent.ts` exposes `{ steps, toolCalls, budget,
      status, finalResponse, runAgent }` where `status` is
      `'idle' | 'running' | 'done' | 'error'`
- [ ] AC-25: `runAgent(task)` opens an `EventSource` on the agent stream and dispatches
      by `event.type`: `AGENT_START`→config+`running`; `STEP`→push step;
      `TOOL_CALL`→push toolCall; `TOOL_RESULT`→update last toolCall;
      `BUDGET`→replace budget; `TOKEN`→append to `finalResponse`;
      `AGENT_DONE`→`done`+close; `AGENT_ERROR`→`error`+close
- [ ] AC-26: The `EventSource` is closed on terminal events and on unmount; no leaked
      connections; the hook touches **no `libs/`**
- [ ] AC-27: `apps/chat/src/routes/agent.tsx` renders the layout below using
      `@libs/ui` `AgentSteps`, `BudgetIndicator`, `ToolCallList`, `ChatInput`,
      `ChatMessage`; submitting `ChatInput` calls `runAgent`
- [ ] AC-28: The new route is registered in the chat router so `/agent` is reachable

### Gate

- [ ] AC-29: `nx test ai-service` and `nx test shared` pass — 0 TS errors, 0 failures
- [ ] AC-30: `nx affected -t lint test` passes for both `ai-platform/` and
      `ai-platform-fe/`; Storybook builds the three new stories without error
- [ ] AC-31: Manual smoke: submit a task on `/agent`; observe steps appear, budget bars
      advance, ≥1 tool call shown, final answer streams; then trigger an over-budget run
      and confirm a red bar + `AGENT_ERROR` message render

---

## Technical Design

### Event flow (end to end)

```
Browser /agent route
   │  ChatInput.onSubmit(task)
   ▼
useAgent.runAgent(task)
   │  new EventSource('/ai/agent/stream?task=...')
   ▼
SSE endpoint  ──subscribes──►  AgentRunnerService.run(task, config): Observable<IAgentEvent>
   │                                   │
   │   each IAgentEvent                │ AGENT_START → loop{ STEP, BUDGET, TOOL_CALL, TOOL_RESULT } → TOKEN* → AGENT_DONE
   │   = one MessageEvent(JSON)        │ (any throw) → AGENT_ERROR
   ▼                                   ▼
es.onmessage → JSON.parse → switch(type) → React state → @libs/ui components re-render
```

### Agent loop skeleton (`AgentRunnerService`)

```typescript
run(task: string, config: IAgentConfig): Observable<IAgentEvent> {
  return new Observable<IAgentEvent>((subscriber) => {
    const emit = <T>(type: AgentEventType, data: T) =>
      subscriber.next({ type, data, timestamp: Date.now() });

    const budget = new TokenBudget(config.tokenBudget);
    const cap = new IterationCap(config.maxIterations);
    const timeout = new Timeout(config.timeoutMs);
    const kill = new KillSwitch();

    (async () => {
      try {
        emit(AgentEventType.AGENT_START, config);
        let done = false;
        while (!done) {
          kill.checkpoint();
          timeout.check();
          cap.increment();
          emit(AgentEventType.STEP, { iteration: cap.current, status: 'planning' });

          const plan = await this.planNextAction(task, /* history */);
          budget.track(plan.tokens);
          emit(AgentEventType.BUDGET, {
            iteration: cap.current,
            tokensUsed: budget.getState().used,
            elapsedMs: timeout.elapsed,
          } satisfies IBudgetState);

          if (plan.kind === 'tool') {
            emit(AgentEventType.TOOL_CALL, plan.toolCall satisfies IToolCall);
            const result = await this.search.similaritySearch(plan.toolCall.input.query as string);
            emit(AgentEventType.TOOL_RESULT, { tool: plan.toolCall.tool, result });
          } else {
            for await (const tok of this.streamFinal(task /* + context */)) {
              emit(AgentEventType.TOKEN, tok);
            }
            done = true;
          }
        }
        emit(AgentEventType.AGENT_DONE, {});
        subscriber.complete();
      } catch (err) {
        emit(AgentEventType.AGENT_ERROR, { reason: (err as Error).message });
        subscriber.complete(); // terminal event always delivered (AC-15)
      }
    })();

    return () => kill.kill(); // teardown on unsubscribe (AC-16)
  });
}
```

`planNextAction` / `streamFinal` build on the existing
[`ClaudeProvider.chat`](ai-platform/apps/ai-service/src/ai/providers/claude.provider.ts:27)
(already returns `Observable<string>` from `anthropic.messages.stream`). Reuse
`AiProviderFactory` to obtain the active provider; do **not** re-implement streaming.

### Transport decision (pick ONE during planning)

The existing chat stream is
[`@Sse('chat/stream')`](ai-platform/apps/api-gateway/src/ai/ai.controller.ts:61) in the
**api-gateway**, bridged to ai-service over Kafka. The agent loop is a request-scoped,
per-event Observable — pumping every `TOKEN`/`STEP` through Kafka is heavy and ordering-
fragile.

- **Option A (recommended):** Add `@Sse('agent/stream')` to a controller that can call
  `AgentRunnerService.run(...)` directly and map `IAgentEvent → MessageEvent`. If the
  controller lives in api-gateway, expose `AgentRunnerService` (or a thin client) so the
  gateway can subscribe in-process; if ai-service runs its own HTTP server, host the SSE
  endpoint there. Frontend hits `/ai/agent/stream` either way (gateway proxy or direct).
- **Option B:** Stream `IAgentEvent`s over a dedicated Kafka topic keyed by a `runId`,
  gateway `@Sse` filters by `runId` (mirrors current chat pattern). Heavier; choose only
  if direct in-process access is impossible.

Whichever is chosen, the browser-facing contract is fixed: `EventSource` on
`/ai/agent/stream`, one JSON-encoded `IAgentEvent` per `MessageEvent`.

### Type ownership (`IAgentStep`)

`IAgentEvent`, `IAgentConfig`, `IBudgetState`, `IToolCall`, `AgentEventType` live in
**`ai-platform/libs/shared`** (backend source of truth). The frontend `@libs/ui`
components need `IAgentStep` (a view-model: `{ iteration, status, label? }`) and
`IToolCall`. Decide during planning:

- **Recommended:** define the UI-facing view types (`IAgentStep`, and a local
  `IToolCall` mirror) inside `libs/ui` to keep the UI lib dependency-free of backend
  packages and avoid a cross-repo import. Keep field names identical to the backend
  event payloads so the `useAgent` mapping is trivial.

`AgentEventType` string values are the SSE contract — the frontend `switch` compares
against the **same string literals** (`'AGENT_START'`, …). Keep enum values === member
names so JSON survives the boundary.

### Files Changed / Added

| File | Repo | Change |
|------|------|--------|
| `ai-platform/libs/shared/src/lib/types/agent.types.ts` | be | NEW — enum + interfaces |
| `ai-platform/libs/shared/src/index.ts` | be | export agent types |
| `ai-platform/apps/ai-service/src/agent/safeguards/errors.ts` | be | NEW — 4 error classes |
| `ai-platform/apps/ai-service/src/agent/safeguards/token-budget.ts` | be | NEW |
| `ai-platform/apps/ai-service/src/agent/safeguards/iteration-cap.ts` | be | NEW |
| `ai-platform/apps/ai-service/src/agent/safeguards/timeout.ts` | be | NEW |
| `ai-platform/apps/ai-service/src/agent/safeguards/kill-switch.ts` | be | NEW |
| `ai-platform/apps/ai-service/src/agent/safeguards/*.spec.ts` | be | NEW — per-class unit tests |
| `ai-platform/apps/ai-service/src/agent/agent-runner.service.ts` | be | NEW — the loop |
| `ai-platform/apps/ai-service/src/agent/agent.module.ts` | be | NEW — provides runner; imports Ai + Search modules |
| `ai-platform/apps/ai-service/src/agent/agent-runner.service.spec.ts` | be | NEW — loop + error-path tests |
| `ai-platform/apps/ai-service/src/app/*.module.ts` | be | register `AgentModule` |
| SSE controller (gateway or ai-service per transport decision) | be | NEW `@Sse('agent/stream')` |
| `ai-platform-fe/libs/ui/src/components/AgentSteps/AgentSteps.tsx` (+ stories) | fe | NEW |
| `ai-platform-fe/libs/ui/src/components/BudgetIndicator/BudgetIndicator.tsx` (+ stories) | fe | NEW |
| `ai-platform-fe/libs/ui/src/components/ToolCallList/ToolCallList.tsx` (+ stories) | fe | NEW |
| `ai-platform-fe/libs/ui/src/index.ts` | fe | export 3 components + types |
| `ai-platform-fe/apps/chat/src/hooks/useAgent.ts` | fe | NEW — EventSource state machine |
| `ai-platform-fe/apps/chat/src/routes/agent.tsx` | fe | NEW — page layout |
| `ai-platform-fe/apps/chat/src/router.ts` | fe | register `/agent` route |

### Page layout (`agent.tsx`)

```
┌──────────────┬─────────────┐
│              │ Budget       │
│ AgentSteps   │ Indicator    │
│ (timeline)   │             │
│              │ ToolCallList │
├──────────────┴─────────────┤
│ Final answer (streamed)     │   ← ChatMessage, fed from finalResponse
├─────────────────────────────┤
│ ChatInput                   │   ← onSubmit → runAgent(task)
└─────────────────────────────┘
```

Use AntD `Row`/`Col` for the split; left column ~16/24, right ~8/24.

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multiple tools beyond `search` | Single-tool loop proves the pattern; add tools later |
| Persisting agent runs to DB / history | Live stream only this epic; no `runs` table |
| Human-in-the-loop step approval | US-01 is explicitly autonomous |
| Multi-agent / sub-agent orchestration | One runner, one loop |
| Auth/role changes for the agent endpoint | Reuse existing gateway auth guard as-is |
| New embedding/model changes | Reuses current providers + hybrid search untouched |
| Real token accounting from provider usage API | `budget.track` may use provider-reported or estimated counts — exact metering is a later refinement |

---

## Constraints

- Safeguard classes MUST be pure (no NestJS DI, no I/O) so they are trivially unit-
  testable — this is the core safety guarantee and must be independently verifiable
- `AgentRunnerService.run` MUST always deliver a terminal event (`AGENT_DONE` or
  `AGENT_ERROR`) and then complete — never leave the subscriber hanging, never call
  `subscriber.error` (the client only listens for typed events)
- Unsubscribe MUST abort the in-flight Claude stream and stop the loop (no orphaned
  background work after the browser disconnects)
- `agent.types.ts` MUST contain types/enums only — no value imports from NestJS or rxjs,
  so `libs/shared` stays framework-neutral
- `AgentEventType` enum values === member names (string enum) so the SSE JSON `type`
  field round-trips to the frontend `switch` without a mapping table
- `@libs/ui` components MUST NOT import from `apps/*` or backend packages — view types
  live in the UI lib (per Type Ownership)
- All new code, comments, and log messages in English
- No task edits more than one service; backend and frontend work split into
  `repo: be` / `repo: fe` tasks (CLAUDE.md routing rule)
- SSE payload is the public contract: one JSON `IAgentEvent` per `MessageEvent`,
  `data` is `JSON.stringify(event)` — keep field names stable across the boundary

---

## Success Criteria

1. `nx test ai-service` + `nx test shared` pass — 0 TS errors, 0 failures
2. `nx affected -t lint test` green for both repos; Storybook renders `AgentSteps`,
   `BudgetIndicator`, `ToolCallList` stories without error
3. Each safeguard class has a unit test proving it throws its specific error at the
   boundary (over-budget, over-iteration, over-time, killed)
4. `AgentRunnerService` unit test proves: (a) happy path emits `AGENT_START …
   AGENT_DONE` in order, (b) a forced over-budget run emits exactly one `AGENT_ERROR`
   then completes, (c) unsubscribe trips the kill-switch
5. Manual smoke on `/agent`: a submitted task produces a visible step timeline,
   advancing budget bars, ≥1 tool call with a check mark, and a token-streamed final
   answer
6. Manual smoke: a deliberately tiny `tokenBudget`/`maxIterations` run shows a red
   budget bar and an `AGENT_ERROR` message in the UI — the loop demonstrably stops
7. Disconnecting the browser mid-run (close tab) stops backend work — no further
   provider calls logged for that run
