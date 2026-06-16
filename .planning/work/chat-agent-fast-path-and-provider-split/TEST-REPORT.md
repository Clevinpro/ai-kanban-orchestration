# Epic Test Report — chat-agent-fast-path-and-provider-split

Verdict: PASS
Generated: 2026-06-16T16:33:35.000Z
Tasks verified: 9 (all done)
SPEC: .planning/work/chat-agent-fast-path-and-provider-split/SPEC.md
Live verification: SKIPPED (no browser connected)

## Acceptance Criteria

| # | Criterion | Result | Live Check | Evidence |
|---|-----------|--------|-----------|----------|
| 1 | AC-01: Structured queries ("count tags", "list all tags", "count X") produce an answer with **zero** `provider.chat()` invocations (spy in integration test) | PASS | N/A | `ai.service.spec.ts` "structured lane" tests assert `mocks.chat.not.toHaveBeenCalled()` for `count tags` and `list all tags`; TASK-006 QA + TeamLead Check APPROVED |
| 2 | AC-02: Structured lane resolves via direct DB-backed `tag-query.tool` through `ToolRegistry` — no RAG, no LLM | PASS | N/A | `tag-query.tool.ts` + `ai.module.ts` registers `createTagQueryTool`; `runStructuredLane` calls `toolRegistry.get(TAG_QUERY_TOOL_NAME)`; spec asserts `tagToolRun` only, no `similaritySearch` — TASK-003, TASK-005, TASK-006 |
| 3 | AC-03: Complex lane default 30s wall-clock budget (`DEFAULT_TIMEOUT_MS = 30_000`); explicit `timeoutMs` still overrides | PASS | N/A | `ai.service.ts:32` `DEFAULT_TIMEOUT_MS = 30_000`; `ai.service.spec.ts` "plain question with no mode" asserts `timeoutMs: 30_000`; explicit `timeoutMs: 20` override triggers `TimeoutExceededError` — TASK-001 |
| 4 | AC-04: Technical/API query calls `similaritySearch` with technical-docs `filePathPrefix` only (spy) | PASS | N/A | `AiService.TECHNICAL_DOCS_PREFIX = 'docs/obsidian-vault/codebase/'`; `ai.service.spec.ts` technical lane test asserts third-arg prefix only — TASK-002, TASK-006 |
| 5 | AC-05: Capability query retrieves only capability-vault prefix; no general-RAG fall-through | PASS | N/A | `answerCapabilityQuery` passes `CAPABILITY_VAULT_PREFIX`; meta lane returns before `runChatFlow`; TASK-007 dedicated test + existing capability short-circuit test — TASK-007 |
| 6 | AC-06: Router unit tests classify representative queries into four lanes correctly | PASS | N/A | `query-router.service.spec.ts` covers meta, structured, technical, complex plus precedence ordering — TASK-004 |
| 7 | AC-07: Provider switch (dev local ↔ prod paid API) is config/env only — no `AiService` loop branching | PASS | N/A | `ai-provider.factory.spec.ts` parametrizes `AI_PROVIDER` → provider class; `.env.example` documents dev=`ollama`/`lmstudio`, prod=`claude` — TASK-008 |
| 8 | AC-08: All four safeguards remain constructed/checked for complex lane; `AgentEvent` SSE shape unchanged | PASS | N/A | `runChatFlow` constructs `IterationCap`, `Timeout`, `TokenBudget`, `KillSwitch`; TASK-009 regression gate asserts `AgentEvent` allowed keys and safeguard errors — TASK-009 |
| 9 | AC-09: Tests pass (`nx test ai-service`) | PASS | N/A | Independent run: 25 suites, 321 tests passed (exit 0) |

## Summary

All 9 acceptance criteria are met across 9 completed tasks. The epic delivers four-lane query routing (meta / structured / technical / complex) with zero-LLM structured answers via `tag-query.tool`, scoped RAG prefixes for capability and technical lanes, a 30s default complex-lane timeout, config-only provider switching, intact safeguards, and a stable `AgentEvent` SSE contract. Live browser verification was skipped — this is a backend-only epic with no FE changes; all criteria are verified via unit/integration tests and static code inspection.
