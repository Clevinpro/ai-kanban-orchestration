# Research Summary: AI Agent Dev Workflow

**Researched:** 2026-05-20 | **Confidence:** HIGH

## Executive Summary

File-based task state (YAML frontmatter in `.planning/work/TASK-XX.md`), sequential per-task pipeline with rejection loops, per-repo agent isolation via system prompt constraints, and a standalone Express + Vite Kanban server outside the Nx workspace. All four research areas converge on the same architecture — this is an implementation to execute, not a design to debate.

Five confirmed active Claude Code bugs affect this exact use case. The `tools:` array silently dropping first/last positions (bug #60237) and sub-agent output inflating orchestrator context to session crash must be mitigated from the very first agent definition. Phase 1 is the most pitfall-dense phase.

## Stack

- **Agent definitions:** `.claude/agents/<name>.md` YAML frontmatter — git-trackable, supports `tools`, `disallowedTools`, `model`, `maxTurns`
- **Slash commands:** `.claude/skills/<name>/SKILL.md` — current standard (not `.claude/commands/`)
- **Task state:** YAML frontmatter in `.planning/work/TASK-XX.md` — no DB required
- **Kanban server:** Express 4.x + gray-matter 4.0.3 + chokidar 5.0.0 (ESM, Node 18+) + SSE
- **Kanban UI:** Vite 6 + React 19 + Tailwind 4 + dnd-kit — standalone in `tools/kanban-ui/`

**Avoid:** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` (bugs #30703, #29441), `.claude/commands/` (deprecated), `isolation: worktree` in monorepos (bug #39886), any external DB.

## Features (Table Stakes)

- Agent role definitions with YAML frontmatter
- Task files with `status` frontmatter field as state machine
- SPEC.md → TASK-XX.md generation by TeamLead
- Human review gate (`/team-lead:plan`) before any code runs
- Sequential pipeline: Developer → CodeReview → QA → TeamLeadCheck
- Six-state lifecycle: `readyForDevelop → inProgress → inReview → inTesting → forTeamLeadCheck → done`
- Rejection loop: QA → Developer with failure evidence
- Separate FE and BE Developer agents with repo-specific system prompts
- Kanban server reading `.planning/work/` grouped by status
- TeamLead codebase context from `.planning/codebase/`

## Architecture

```
/team-lead:plan [SPEC]     /team-lead:execute [TASK-ID]
(inline in main session — NOT context:fork)
        │                           │
        ▼                           ▼
TeamLead (orchestrator — main session)
  Reads: .planning/codebase/, SPEC.md, task files
  Spawns sequentially: developer → code-reviewer → qa → team-lead-check
        │
        ▼ Agent tool (sequential)
Sub-agents: be-developer | fe-developer | code-reviewer | qa | team-lead-check
  Each reads task file → does work → updates status frontmatter → returns ONE-LINE receipt
        │
        ▼ filesystem
.planning/work/TASK-XX.md  ← single source of truth
        │
        ▼ chokidar watch
tools/kanban-server/  →  SSE  →  tools/kanban-ui/
```

**Non-negotiable:** `/team-lead:execute` runs inline (not `context: fork`). Only main session can spawn sub-agents.

## Critical Pitfalls

1. **`tools:` drops first/last array positions (bug #60237)** — pad every agent with `Glob` at pos 1 and `Grep` at last. Apply to every agent file.
2. **Orchestrator context explosion** — agents return ONLY one-line receipt, never file contents.
3. **Hardcoded dispatch instructions override agent prompt (bug #30730)** — add explicit counter: "Respond with ONLY: STATUS: ... Do not include file contents."
4. **Stop hook infinite loop** — every Stop hook must check `stop_hook_active` and `exit 0` immediately.
5. **CLAUDE.md context contamination** — root under 200 lines; BE conventions in `ai-platform/CLAUDE.md`; FE in `ai-platform-fe/CLAUDE.md`.
6. **chokidar ENOENT card flash** — use `awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }`.

## Suggested Phase Order

| Phase | Scope | Parallel? |
|-------|-------|-----------|
| 1 | Foundation: schema, CLAUDE.md layering, agent prompt patterns | — |
| 2 | TeamLead skills (`/plan`, `/execute`), Stop hook, status ownership | after 1 |
| 3 | Sub-agent definitions (5 agents) | parallel with 5 |
| 4 | End-to-end pipeline integration, real SPEC.md test | after 2+3 |
| 5 | Kanban server (Express + chokidar + SSE) | parallel with 3 |
| 6 | Kanban UI (Vite + React + dnd-kit) | after 4+5 |

Phase 4 needs empirical research during planning — runtime behavior of multi-stage pipeline only reveals itself in real runs.
