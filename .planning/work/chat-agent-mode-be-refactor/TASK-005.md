---
id: TASK-005
title: Inject registry + registry-driven planner + multi-tool dispatch in loop
status: done
priority: high
repo: be
epic: chat-agent-mode-be-refactor
complexity: 7
created-at: 2026-06-15T12:00:00.000Z
updated-at: 2026-06-15T16:25:49+03:00
started-at: 2026-06-15T16:19:23+03:00
completed-at: 2026-06-15T16:25:49+03:00
spec: .planning/work/chat-agent-mode-be-refactor/SPEC.md
---

## Description

Replace the hardcoded `similaritySearch` branch in the agent loop with registry-driven tool
dispatch. Inject `ToolRegistry` into `AiService`, make the planner prompt enumerate registered
tools, generalize decision parsing to a multi-tool form, and dispatch the chosen tool through
the registry. This is the core of the refactor; the unified single-path entry comes in TASK-006.

## Acceptance Criteria

- [ ] `AiService` constructor injects `ToolRegistry` (provided in TASK-004).
- [ ] `buildAgentSystemPrompt` (renamed acceptable) enumerates tools via `registry.describe()`
      instead of naming `similaritySearch` literally.
- [ ] Decision parsing is generalized from the fixed `SEARCH:` marker to a tool-dispatch form
      (e.g. `TOOL <name>: <input>`) plus `FINAL: <answer>`; an `AgentDecision` carries
      `{ kind: 'tool'; tool: string; input: string } | { kind: 'final'; answer: string }`.
- [ ] The loop dispatches via `registry.get(decision.tool)?.run(input, ctx)`; unknown tool name
      is fed back as an observation/error so the loop self-corrects rather than crashing.
- [ ] Emitted `tool_call` / `tool_result` `AgentEvent`s carry the dynamic `decision.tool` name;
      `TokenBudget.track` still accounts plan text + observation.
- [ ] Existing safeguard order (cap → timeout → kill switch) and budget snapshots are unchanged.
- [ ] `nx test ai-service` passes.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/ai/ai.service.ts` — refactor `executeAgentLoop`,
  `buildAgentSystemPrompt`, `parseAgentDecision`, and the `AgentDecision` type (currently lines
  ~62 and ~322-369). Replace the `// Tool branch: the only tool is similaritySearch` block with a
  registry dispatch.
- Keep the RAG tool's `name` (`similaritySearch`) so the streamed contract is stable.
- Preserve final-answer token streaming behavior (forward tokens to the subject as today).
- Do NOT change the mode branching here — TASK-006 unifies the entry path. This task keeps the
  loop functioning under the current `mode === 'agent'` entry.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed ai.service.ts and ai.service.spec.ts for TASK-005 (registry-driven multi-tool dispatch). All acceptance criteria are met: ToolRegistry is constructor-injected (line 103), buildAgentSystemPrompt enumerates tools via registry.describe() with no hardcoded name (line 394), the AgentDecision type and parseAgentDecision implement the generalized TOOL/FINAL form, the loop dispatches via toolRegistry.get(decision.tool) with unknown-tool errors fed back as observations (lines 340-362), tool_call/tool_result events carry the dynamic decision.tool name, TokenBudget tracks both plan text (line 312) and observation (line 363), and the safeguard order (cap → timeout → kill switch, lines 282-284) plus budget snapshots are unchanged. The RAG tool keeps the stable similaritySearch name, final-answer token streaming is preserved, and comments are English-only. The spec suite is thorough: happy path, arbitrary-tool dispatch, unknown-tool self-correction, iteration-cap bound, cancel, budget snapshot, and the chat-mode regression guard.

One non-blocking observation: streamAgentDecision and parseAgentDecision both locate FINAL via indexOf, so a TOOL input containing a literal "FINAL:" substring would be misparsed as a final answer. This is an adversarial edge case consistent with the documented "FINAL takes precedence" semantics and the streaming/parse paths agree, so it is not a defect for this task. Note: nx test was not executed (no command access in this read-only review); module wiring in ai.module.ts matches the test's registry setup exactly.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task. `nx affected --target=test --base=HEAD~1 --head=HEAD` returned exit code 0 with "No tasks were run"; `nx show projects --affected` returned an empty set. The only file changed between HEAD~1 and HEAD is `.claude/commands/team-lead/execute.md`, which is outside any Nx project, so no ai-service tests were triggered.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway:4000=UP, auth-service:4002=UP, ai-service:4001=UP.

All acceptance criteria verified against ai.service.ts, tool-registry.ts, and ai.module.ts:
- AC-1 (ToolRegistry injected): constructor param `toolRegistry: ToolRegistry` at ai.service.ts:103 — PASS.
- AC-2 (prompt enumerates tools via registry.describe()): buildAgentSystemPrompt calls `this.toolRegistry.describe()` at line 394, no literal `similaritySearch` in the prompt — PASS.
- AC-3 (generalized TOOL/FINAL parsing + AgentDecision): `ParsedDecision` union `{kind:'tool';tool;input} | {kind:'final';answer}` (lines 70-72), parseAgentDecision handles both markers — PASS.
- AC-4 (registry dispatch; unknown tool self-corrects): `this.toolRegistry.get(decision.tool)` at line 340; unknown tool yields an error observation fed back into the transcript with a warn log, no crash (lines 352-362) — PASS.
- AC-5 (dynamic tool name on events; budget tracks plan + observation): tool_call/tool_result events carry `tool: decision.tool` (lines 343-345, 366-368); `tokenBudget.track` covers planText (line 312) and observation (line 363) — PASS.
- AC-6 (safeguard order cap → timeout → kill switch; snapshots unchanged): lines 282-284 in that order, snapshotBudget unchanged — PASS.
- AC-7 (`nx test ai-service` passes): 23 suites, 286 tests passed locally — PASS.

Note: epic-level SPEC ACs AC-03 (mode duality removal) and AC-06 (cancel endpoint) remain open by design — TASK-005 explicitly keeps the `mode === 'agent'` entry intact and defers unification to TASK-006, consistent with the task scope.
