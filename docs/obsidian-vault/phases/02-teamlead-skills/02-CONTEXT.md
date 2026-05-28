# Phase 2: TeamLead Skills - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the two TeamLead slash commands (`/team-lead:plan`, `/team-lead:execute`) and the Stop hook infinite-loop guard. Sub-agents (Phase 3) and pipeline wiring (Phase 4) are out of scope — execute uses stubbed agent calls. The existing stubs at `.claude/commands/team-lead/plan.md` and `execute.md` are replaced with full implementations.

</domain>

<decisions>
## Implementation Decisions

### SPEC.md Format & Location

- **D-01:** SPEC.md is user-supplied. Usage: `/team-lead:plan path/to/SPEC.md`. No convention-enforced location — the file can live anywhere in the repo.
- **D-02:** Required sections with free-form content. The plan command validates that all four section headers are present: `## Goal`, `## User Stories / Requirements`, `## Acceptance Criteria`, `## Technical Design`. Content inside each section is free-form prose.
- **D-03:** Template generation supported. Running `/team-lead:plan --new <epic-name>` writes a starter SPEC.md with all four section headers to disk. User fills it in, then runs the real plan command.
- **D-04:** Epic directory inferred from SPEC.md. TeamLead reads `## Goal` (or falls back to filename slug if Goal is absent) to derive the epic slug. Tasks land in `.planning/work/<slug>/`. No `--epic` flag required.

### Plan Review Output & Timing

- **D-05:** Preview-first, confirm-to-write. The plan command prints a review table and asks "Write these tasks? [y/N]" before any TASK-XX.md files are written to disk. Human review gate is explicit.
- **D-06:** Markdown table format for the review output: `| ID | Title | Complexity | Repo | Epic |`. Scannable, consistent with task schema fields.
- **D-07:** Flat ordered list — tasks output in recommended execution order. No wave grouping in Phase 2. Wave assignment is a Phase 4 concern.

### Execute Pipeline Control Flow

- **D-08:** Phase 2 implements full orchestration logic with stubbed agent calls. Stage gates, status transitions (readyForDevelop → inProgress → inReview → inTesting → forTeamLeadCheck → done), and rejection logic are all present. Agent invocations log `[Stage stub — Phase 3 plugs in real agent]` instead of spawning real agents.
- **D-09:** On any failure (CodeReview rejection or QA failure), pipeline always pauses for user. Prompt: "Stage failed: [reason]. Retry / Skip / Abort?". User decides; no automatic retry loop in Phase 2.
- **D-10:** Stage-by-stage progress trail. Each stage prints on completion: `[Developer] Done ✓`, `[CodeReview] APPROVED ✓`, etc. User sees progress in real time.

### Stop Hook Guard

- **D-11:** Automated test script for PIPE-04. A test script (e.g., `test-stop-guard.sh`) sets `CLAUDE_STOP_HOOK_ACTIVE=1`, invokes the hook with a mock stop payload, and asserts exit 0. Satisfies the ROADMAP SC-5 forced-exit test criterion.

### Claude's Discretion

- Stop hook architecture: shared `stop-guard.js` registered in `.claude/settings.json` as a `Stop` hook. The hook reads `process.env.CLAUDE_STOP_HOOK_ACTIVE` — if set, exits 0 immediately. The execute orchestrator sets this env var before spawning any sub-agent call. Follows the existing Node.js hook pattern.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — TL-01, TL-02, TL-03, TL-04, PIPE-04, PIPE-05 (exact acceptance criteria for Phase 2)
- `.planning/ROADMAP.md` — Phase 2 goal, success criteria SC-1 through SC-5
- `.planning/PROJECT.md` — Key decisions: agent isolation model, markdown task files, pipeline entry points

### Existing Infrastructure to Extend
- `.claude/commands/team-lead/plan.md` — Current stub (replace with full implementation)
- `.claude/commands/team-lead/execute.md` — Current stub (replace with full implementation)
- `.claude/hooks/task-state-guard.js` — PreToolUse hook already enforcing status transitions and `repo: both` rejection — execute orchestrator must respect these constraints
- `.claude/settings.json` — Where the new Stop hook must be registered (follow existing hook registration pattern)

### Task Schema
- `.planning/task-schema.yaml` — All YAML frontmatter fields, allowed transitions, `repo` values
- `.planning/phases/01-foundation/01-CONTEXT.md` — Phase 1 decisions D-09 through D-18 (status transition rules, schema constraints)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.claude/hooks/task-state-guard.js` — Node.js hook pattern: read stdin, parse JSON hook payload, validate, exit 0/1. New `stop-guard.js` follows identical structure.
- `.claude/hooks/gsd-validate-commit.sh` — Alternate bash hook pattern (bash option available if simpler).

### Established Patterns
- All existing hooks are Node.js (`#!/usr/bin/env node`), registered in `.claude/settings.json` with `matcher` and `timeout` fields. Stop hook registration follows the same JSON structure.
- Sub-repo isolation enforced via system prompt (not worktree — bug #39886 out of scope). Execute orchestrator must not touch `ai-platform/` and `ai-platform-fe/` directly; it delegates to agents.
- One-line receipts from sub-agents (FOUND-07): orchestrator context stays minimal. Each stubbed agent call should log a one-line receipt matching what the real agent will return.

### Integration Points
- `.planning/work/<epic>/` — Plan command writes TASK-XXX.md here after confirmation. Execute command reads task files from here.
- `.claude/settings.json` `hooks.Stop` array — New `stop-guard.js` registered here.
- Task file frontmatter `status` field — Execute orchestrator transitions status at each stage gate; the PreToolUse hook (task-state-guard.js) validates each transition automatically.

</code_context>

<specifics>
## Specific Ideas

- SPEC.md template (from `--new`) must include placeholder text under each required section header so users know what to write
- Plan review table should show all five fields visible at a glance without horizontal scrolling on a standard terminal width
- Execute progress trail format: `[Stage] Status ✓/✗` — consistent, machine-readable if needed later

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 2-TeamLead Skills*
*Context gathered: 2026-05-22*
