# Phase 3: Sub-Agents - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Create six Claude Code sub-agent definition files in root `.claude/agents/`: `be-developer`, `fe-developer`, `code-reviewer`, `qa-be`, `qa-fe`, `team-lead-check`. Each file must have correct YAML frontmatter (name, description, tools array), a system prompt that enforces repo isolation, and a one-line receipt protocol. The pipeline in Phase 4 invokes these agents — this phase only defines them, not the orchestration wiring.

</domain>

<decisions>
## Implementation Decisions

### Agent System Prompt Scope

- **D-01:** Lean system prompts — pointers to sub-repo CLAUDE.md and conventions SKILL.md, not embedded inline. `be-developer` prompt: "You are restricted to `ai-platform/` only. Read `ai-platform/CLAUDE.md` and `ai-platform/.claude/skills/be-conventions/SKILL.md` before starting." Same pattern for `fe-developer` → `ai-platform-fe/`.
- **D-02:** Hard STOP isolation language. System prompt includes explicit forbidden language: "NEVER read or write files outside `ai-platform/`. If a task requires touching `ai-platform-fe/`, STOP and return an error receipt: `[be-developer] ERROR: out-of-repo file requested`." Mirrors Phase 1 allowlist-first approach with an explicit stop clause for violations.

### Task File Annotation Format

- **D-03:** All agents append markdown section blocks to the task file body. Consistent format across all agents:
  - `code-reviewer` appends `## Code Review` with `Status: APPROVED` or `Status: CHANGES_REQUESTED` plus a brief summary.
  - `qa-be`/`qa-fe` append `## QA Results` with `Status: PASS` or `Status: FAIL` plus test output summary.
  - `team-lead-check` appends `## TeamLead Check` with `Status: APPROVED` or `Status: REJECTED` plus reason.
- **D-04:** Both receipt AND task file annotation used. Agent returns a one-line stdout receipt (e.g., `[code-reviewer] APPROVED` or `[code-reviewer] CHANGES_REQUESTED: see ## Code Review`). The execute.md orchestrator reads the receipt to gate the next stage; full rationale lives in the task file for human audit.

### QA Test Invocation

- **D-05:** QA agents run `nx affected --target=test`. Requires git diff base — works correctly since each task is committed before QA runs. `qa-be` scoped to `ai-platform/`, `qa-fe` scoped to `ai-platform-fe/`.
- **D-06:** When `nx affected` finds no affected test files: PASS with note. Task file gets: `## QA Results\nStatus: PASS\nNote: No affected tests found — no test coverage for this task.` Receipt: `[qa-be] PASS`. Pipeline continues to TeamLeadCheck.

### Developer Agent Tools

- **D-07:** `be-developer` and `fe-developer` tools: `Glob, Read, Write, Edit, Bash, Grep, WebSearch`. Glob at position 1 and Grep at last position (bug #60237 mitigation per REQUIREMENTS.md SC-5). WebSearch included for looking up docs and APIs during development.
- **D-08:** `code-reviewer` uses `disallowedTools: Write, Edit, Bash` (REQUIREMENTS.md AGENT-03). Tools available: Glob, Read, Grep (only).
- **D-09:** `qa-be` and `qa-fe` tools: `Glob, Read, Write, Bash, Grep` — need Bash for `nx affected --target=test`, Write to append QA Results section.
- **D-10:** `team-lead-check` tools: `Glob, Read, Write, Grep` — Read-heavy (reads SPEC.md + task file history), Write to append TeamLead Check section. No Bash needed. Orchestrator handles the `done` status transition via Edit after receiving APPROVED receipt.

### Claude's Discretion

- Exact wording of system prompts beyond the required isolation rules and pointer format
- Whether to include a `color:` field in agent YAML frontmatter (cosmetic)
- Exact format of the one-line receipt strings (as long as they contain the agent name and APPROVED/CHANGES_REQUESTED/PASS/FAIL/REJECTED/ERROR signal)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — AGENT-01 through AGENT-06 (exact acceptance criteria for Phase 3), SC-5 (Glob/Grep tool array mitigation)
- `.planning/ROADMAP.md` — Phase 3 goal and success criteria SC-1 through SC-5
- `.planning/PROJECT.md` — Key decisions: agent isolation model, one-line receipt protocol, system prompt isolation rationale (bug #39886)

### Existing Infrastructure to Extend
- `.claude/commands/team-lead/execute.md` — Current pipeline stub; Phase 3 agent definitions are what Phase 4 replaces the stubs with. Read to understand the receipt interface the orchestrator expects.
- `.claude/hooks/task-state-guard.js` — PreToolUse hook that validates all task file writes. QA and team-lead-check agents must append body content without touching frontmatter (or use only valid status transitions if touching it).
- `.claude/settings.json` — Where agent tool permissions are registered; follow existing pattern.

### Isolation Context
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-05 through D-08: allowlist-first isolation approach used in sub-repo CLAUDE.md files. Same philosophy applies to agent system prompts.
- `.planning/phases/02-teamlead-skills/02-CONTEXT.md` — D-09: one-line receipt protocol; D-08: current execute stubs log `[Stage stub — Phase 3 plugs in real agent]` — the receipt format the real agents must match.

### Sub-Repo CLAUDE.md Files (agents reference these)
- `ai-platform/CLAUDE.md` — BE isolation rules; `be-developer` system prompt points here
- `ai-platform-fe/CLAUDE.md` — FE isolation rules; `fe-developer` system prompt points here
- `ai-platform/.claude/skills/be-conventions/SKILL.md` — NestJS coding conventions
- `ai-platform-fe/.claude/skills/fe-conventions/SKILL.md` — React/MFE coding conventions

### Task Schema
- `.planning/task-schema.yaml` — All YAML frontmatter fields and allowed status transitions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.claude/agents/gsd-executor.md` — Reference example of a GSD agent definition file (YAML frontmatter + system prompt). Follow the same frontmatter structure: `name`, `description`, `tools`, `color`.
- `.claude/agents/gsd-code-reviewer.md` — Reference for a read-only reviewer agent (no Write/Edit/Bash). Check its `disallowedTools` pattern.

### Established Patterns
- All existing agents in `.claude/agents/` use `tools: Read, Write, Edit, Bash, Grep, Glob` or subsets. New agents follow the same YAML key format.
- Agent `description:` field is shown in the Claude Code UI when selecting agents — write it as a one-sentence capability summary.
- One-line receipts (FOUND-07): `[agent-name] STATUS: brief detail` — orchestrator extracts status from this line.

### Integration Points
- `.planning/work/<epic>/TASK-XXX.md` — Task files that agents read, annotate (body), and the orchestrator transitions (frontmatter status).
- `.claude/commands/team-lead/execute.md` — The orchestrator that spawns these agents via the Agent tool. Each agent definition's `name:` field is what execute.md references in `subagent_type`.

</code_context>

<specifics>
## Specific Ideas

- Receipt string format should encode the agent name and a single uppercase signal word: `[be-developer] DONE`, `[code-reviewer] APPROVED`, `[code-reviewer] CHANGES_REQUESTED: see ## Code Review`, `[qa-be] PASS`, `[qa-be] FAIL: 3 tests failed`, `[team-lead-check] APPROVED`, `[team-lead-check] REJECTED: AC-2 not met`.
- `team-lead-check` reads the SPEC.md path from the task file frontmatter (a `spec` field that plan.md populates) — not a hardcoded path.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 3-Sub-Agents*
*Context gathered: 2026-05-25*
