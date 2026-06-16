# SPEC: Chat Agent Fast-Path Routing & Provider Split

**Epic:** `chat-agent-fast-path-and-provider-split`
**Created:** 2026-06-16
**Status:** Ready for Planning
**Repo:** `be`

---

## Problem

Every non-capability query runs the full reason→act loop in `runChatFlow`
([ai.service.ts](ai-platform/apps/ai-service/src/ai/ai.service.ts)). Even a
deterministic "count tags" pays an LLM planning round-trip + RAG hybrid search +
a second LLM round-trip to phrase the answer — ~8s observed for a query that is a
one-line DB count. Three structural gaps:

1. No fast path: deterministic queries (count/list) go through the LLM.
2. Timeout default is `120_000` ms — the "complex ≤30s" budget is not enforced.
3. The RAG tool searches the whole index (`rag-search.tool.ts` calls
   `similaritySearch(input)` with no prefix), so "API/technical" and "capability"
   questions are not scoped to their own doc sets.

Provider choice is also unsettled. Session research (deep-research, 2026-06-16)
confirmed: Ollama/LM Studio are single-user dev tools, not high-concurrency
production serving (Ollama p99 24.7s at 50 concurrent vs vLLM ~3s) — so local
LLMs belong in dev, paid API in production.

## Goal

Make the chat agent route each query into the cheapest correct lane — answering
deterministic queries with no LLM call and bounding complex queries to a 30s
budget — and make the dev-local / prod-paid-API provider choice a config-only
switch.

## User Stories / Requirements

### US-01: Instant deterministic answers
> As a user, I want "list all tags" / "count tags" answered instantly, so a
> simple count does not wait on an LLM.

### US-02: Bounded complex latency
> As a user, I want complex multi-step questions to either answer or fail within
> 30 seconds, so I am never left waiting indefinitely.

### US-03: Correctly-scoped knowledge
> As a user, I want "what can I do here" answered only from capability docs and
> API/technical questions answered only from technical docs, with no cross-leak.

### US-04: Config-only provider switch
> As an operator, I want to run a free local LLM in dev and a paid API in prod by
> changing config only, with no code edits in business logic.

## Acceptance Criteria

- [ ] AC-01: A structured query ("count tags", "list all tags", "count X")
  produces an answer with **zero** `provider.chat()` invocations on that path
  (asserted by a spy in an integration test).
- [ ] AC-02: The structured lane resolves via a direct DB-backed tool (no RAG
  similarity search, no LLM round-trip) registered through `ToolRegistry`.
- [ ] AC-03: With no per-request override, the complex lane uses a 30s wall-clock
  budget (`DEFAULT_TIMEOUT_MS = 30_000`); an explicit `timeoutMs` still overrides.
- [ ] AC-04: A technical/API query calls `similaritySearch` with the
  technical-docs `filePathPrefix` only — never the whole index (asserted via spy).
- [ ] AC-05: A capability ("what can I do here") query retrieves only the
  capability-vault prefix and never falls through to general RAG.
- [ ] AC-06: Router unit tests classify representative queries into the four lanes
  (meta / structured / technical / complex) correctly.
- [ ] AC-07: Switching the active provider (dev local ↔ prod paid API) requires a
  config/env change only — no edit to `AiService`/loop logic (asserted via
  `AiProviderFactory` test).
- [ ] AC-08: All four safeguards (IterationCap, Timeout, TokenBudget, KillSwitch)
  remain constructed and checked for the complex lane, and the `AgentEvent` SSE
  payload shape is unchanged (existing tests stay green).
- [ ] AC-09: Tests pass (`nx test ai-service`).

## Technical Design

### Files touched

```
ai-platform/apps/ai-service/src/ai/ai.service.ts            # router before runChatFlow; DEFAULT_TIMEOUT_MS 120000→30000
ai-platform/apps/ai-service/src/ai/query-router.service.ts  # NEW — classify query into lane
ai-platform/apps/ai-service/src/ai/tools/tag-query.tool.ts   # NEW — direct DB list/count tags tool
ai-platform/apps/ai-service/src/ai/tools/rag-search.tool.ts # accept + pass filePathPrefix
ai-platform/apps/ai-service/src/ai/tools/tool-registry.ts   # register new tool (unchanged contract)
ai-platform/apps/ai-service/src/ai/ai.module.ts             # wire router + tag tool providers
ai-platform/apps/ai-service/src/ai/capability-detector.service.ts # confirm no general-RAG fall-through
ai-platform/apps/ai-service/src/search/search.service.ts    # (reuse) similaritySearch already takes filePathPrefix
ai-platform/libs/shared/src/lib/types/ai.types.ts           # (reuse) IAIConfig provider selection
```

### Routing flow

`processMessage` → `QueryRouterService.classify(message)` → one of:

| Lane | Detection | Path | LLM? |
|------|-----------|------|------|
| meta | existing `CapabilityDetectorService` (embedding cosine ≥0.75) | capability-vault prefix RAG | yes (answer only) |
| structured | tag/count intent (reuse `QueryNormalizer.isTagQuery` + count keywords) | `tag-query.tool` direct DB | **no** |
| technical | technical/API intent | `rag-search.tool` w/ technical prefix | yes |
| complex | fallthrough | existing `runChatFlow` loop, 30s budget | yes |

Router must itself be fast — prefer rules / cached-embedding similarity over an
LLM classification call.

### Provider split (Option C)

`AiProviderFactory.getProvider()` already selects on `IAIConfig.provider`
(`claude | ollama | lmstudio`). Drive it by env: dev=`ollama`/`lmstudio`,
prod=`claude`. No business-logic branching. Optional two-tier model selector
(fast vs strong) — see Open Questions.

## Out of Scope

| Feature | Reason |
|---------|--------|
| vLLM / self-hosted production serving | Research: only if volume justifies; paid API is the lower-risk default |
| Two-tier (fast/strong) model selector | Optional; deferred unless confirmed in scope |
| Cost break-even analysis (GPU VM vs API) | Unresolved by research; separate investigation |
| Any FE change | Backend-only epic; SSE shape held stable |

## Open Questions

- [ ] Where are tags canonically stored for the direct DB tool — a dedicated
  table, or derived from chunk metadata? Determines the count/list query.
- [ ] What `filePathPrefix` holds API/technical docs (analogous to the capability
  prefix `docs/obsidian-vault/project/`)?
- [ ] Router mechanism for the structured/technical/complex split — rules vs
  cached-embedding similarity vs a cheap LLM call? (Must stay fast.)
- [ ] Is the two-tier fast/strong model selector in scope for this epic or a
  follow-up?

## Constraints

- Single repo (`be`) — no cross-service work in one task.
- Within `ai-platform/`; follow `be-conventions`.
- All four safeguards intact; streaming + `AgentEvent` SSE shape stable for the FE.
- New tools register via the existing `ToolRegistry` / `Tool` contract.
