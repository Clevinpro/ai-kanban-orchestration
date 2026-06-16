# SPEC: Chat Agent Mode — Backend Refactor (RAG-as-Tool, Bounded Tool-Use Chat)

**Epic:** `chat-agent-mode-be-refactor`
**Created:** 2026-06-15
**Status:** Ready for Planning
**Repo:** `be`

---

## Problem

`chat-agent-mode-be` shipped agent behavior as a separate opt-in `mode: 'agent'` branch in
`AiService.processMessage`, with a single hardcoded tool (`similaritySearch`) wired directly
into the loop via a `SEARCH:`/`FINAL:` marker protocol. The product direction changed: the
**existing** RAG chat itself must carry safeguard limits, live metrics, and a stop control —
not a separate agent request — and RAG must become a **pluggable tool** so more tools (e.g. a
tag-based full-table fetch) can be added later without touching the loop. The dual-mode split
and the hardcoded single tool block both.

## Goal

Refactor the chat backend so the single `POST /ai/chat` flow is a bounded **tool-use loop**
with RAG (similarity search) as the first registered tool: safeguards, streamed metrics, and an
in-flight stop apply to the normal chat request, and a tool-registry abstraction lets future
tools be added by registration alone. The `mode: 'chat' | 'agent'` duality is removed.

## User Stories / Requirements

### US-01: Tool-use chat (no separate mode)
> As a user, my normal chat answer can call the RAG search tool (or answer directly) within
> enforced limits — there is no separate "agent" mode or request.

### US-02: Pluggable tools
> As a maintainer, I register a tool in a registry and the loop can dispatch it with no edits to
> the loop body — so a future tag-fetch tool is an additive change.

### US-03: Limits, metrics, stop on the chat
> As an operator/user, every chat run is bounded by token / iteration / time limits, streams
> budget and tool-call metrics, and can be stopped in flight.

## Acceptance Criteria

- [ ] AC-01: A `Tool` abstraction and a `ToolRegistry` exist; tools resolve by name and the loop
      dispatches tool calls through the registry, not a hardcoded `similaritySearch` branch.
- [ ] AC-02: RAG search is implemented as a registered tool wrapping
      `SearchService.similaritySearch` + `formatContext`, registered at module wiring.
- [ ] AC-03: The `mode: 'chat' | 'agent'` duality is removed; the single `/ai/chat` flow runs the
      unified bounded tool-use loop (the old `runRagFlow` / agent-branch split collapses to one).
- [ ] AC-04: The four existing safeguards (`TokenBudget`, `IterationCap`, `Timeout`,
      `KillSwitch`) wrap the unified flow; limits arrive optionally on the normal chat request and
      default sensibly when omitted.
- [ ] AC-05: Tool/agent events (planning, tool_call, tool_result, budget snapshot) stream over the
      existing `AI_RESPONSE` topic with `tool` carrying the **dynamic** tool name; the final answer
      streams as `event: 'chunk'`; the run ends `complete` / `error` (contract reused).
- [ ] AC-06: A cancel endpoint `POST /ai/chat/cancel` (keyed by `conversationId`) publishes
      `AI_CANCEL`, tripping the active run's `KillSwitch` and ending it with an `error` event.
- [ ] AC-07: Adding a second tool requires only registering it (interface + registry entry) — no
      loop-body edits; proven by a test that registers a fake tool the planner can dispatch.
- [ ] AC-08: tests pass (`nx test ai-service shared api-gateway`), including tool-registry unit
      tests, a RAG-tool test, and a loop test that dispatches a registered tool.

## Technical Design

### Files touched

```
ai-platform/apps/ai-service/src/ai/tools/tool.interface.ts            # Tool, ToolContext, ToolResult types
ai-platform/apps/ai-service/src/ai/tools/tool-registry.ts (+ .spec)   # register / get / list; planner tool descriptions
ai-platform/apps/ai-service/src/ai/tools/rag-search.tool.ts (+ .spec) # RAG as a registered tool over SearchService
ai-platform/apps/ai-service/src/ai/ai.service.ts                      # unify chat path; loop dispatches via registry; drop mode branch + SEARCH-only protocol
ai-platform/apps/ai-service/src/ai/ai.module.ts                       # provide ToolRegistry + register RAG tool; default chat path = loop
ai-platform/apps/api-gateway/src/ai/ai.dto.ts                         # relax/remove `mode`; limits stay optional on the normal chat request
ai-platform/apps/api-gateway/src/ai/ai.controller.ts                  # forward limits on the normal request; add POST /ai/chat/cancel
ai-platform/libs/shared/src/lib/types/ai.types.ts                     # AgentEvent.tool = dynamic string; AgentRunConfig drops `mode` (limits only)
```

### Tool abstraction

- `interface Tool { name: string; description: string; run(input: string, ctx: ToolContext): Promise<string>; }`
  returning an observation string.
- `ToolRegistry`: `register(tool)`, `get(name)`, `list()`; supplies tool descriptions to the
  planner prompt so registered tools are self-describing.
- Planner protocol generalized from the fixed `SEARCH:` to a tool-dispatch form (e.g.
  `TOOL <name>: <input>`) plus `FINAL: <answer>`; exact marker format chosen in planning, must stay
  deterministically parseable.

### Loop & flow

- A single `runChatFlow` (rename of `runAgentFlow`) is the chat entry point. Each iteration:
  `IterationCap.increment` → `Timeout.check` → `KillSwitch.checkpoint` → plan → dispatch a tool
  via the registry (or `FINAL`) → `TokenBudget.track` → emit events.
- The RAG tool wraps `searchService.similaritySearch(query)` + `formatContext`.
- Existing `DEFAULT_MAX_ITERATIONS` / `DEFAULT_TOKEN_BUDGET` / `DEFAULT_TIMEOUT_MS` apply when
  limits are omitted, preserving today's behavior for plain questions.

### Cancel

- `POST /ai/chat/cancel { conversationId }` (gateway, JWT-guarded) publishes `AI_CANCEL` keyed by
  `conversationId`; the existing ai-service `AI_CANCEL` consumer trips the run's `KillSwitch`.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Tag-based full-table fetch tool | Future epic — registry must only be able to accept it |
| Capability-query path redesign | Keep or fold later (see Open Questions) |
| Frontend metrics / limits / stop UI | Lives in `chat-agent-mode-fe` |

## Open Questions

- [ ] Keep `CapabilityDetectorService` as a pre-step, or make capability lookup a registered tool?
- [ ] Multi-tool dispatch marker format (`TOOL <name>:` vs per-tool markers).
- [ ] Fully remove `mode` from the shared contract vs keep it accepted-but-ignored for
      back-compat with the already-deployed gateway DTO (`chat-agent-mode-be` TASK-011).

## Constraints

- Single repo (`be`) — no FE edits.
- English-only comments/docs; `nx test <project>` before done (CLAUDE.md).
- No new Nest module: put tools in an in-`AiModule` `tools/` folder (mirroring `safeguards/`),
  check `ai-platform/nx.json` first.
