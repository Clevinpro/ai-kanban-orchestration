# AI Agent Dev Workflow

## What This Is

A Claude Code multi-agent development automation system built on top of an existing Nx monorepo (`ai-platform` BE + `ai-platform-fe` FE). A TeamLead agent reads a SPEC.md (epic/feature), breaks it into task files, then an automated pipeline (Developer → CodeReview → QA → TeamLeadCheck → Done) executes each task. Progress is tracked in a local Kanban web UI.

## Core Value

Automated development lifecycle per task: one command triggers the full dev→review→test→approve chain, with a human-readable Kanban board showing real-time progress.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] TeamLead agent reads SPEC.md and creates `.planning/work/TASK-XX.md` files with structured task definitions
- [ ] `/team-lead:plan` command — user reviews generated tasks before execution
- [ ] `/team-lead:execute TASK-XX` command — fully automated pipeline per task
- [ ] Automated pipeline: Developer → CodeReview → QA → TeamLeadCheck → Done
- [ ] Task status lifecycle: `readyForDevelop → inProgress → inReview → inTesting → forTeamLeadCheck → Done`
- [ ] Separate Developer and QA agents per repo (FE: `ai-platform-fe/.claude/agents/`, BE: `ai-platform/.claude/agents/`)
- [ ] TeamLead agent has full codebase context via `.planning/codebase/`
- [ ] Local Kanban web UI (standalone dev server) reads `.planning/work/` files and shows task board
- [ ] SPEC.md format supports both product requirements and technical design in one file

### Out of Scope

- External task tracker integration (Linear, Jira, GitHub Projects) — local-first approach
- Real-time multi-user collaboration — single developer workflow
- Cloud deployment of Kanban — local dev tool only

## Context

- Existing Nx monorepo with two workspaces: `ai-platform` (NestJS BE: api-gateway, auth-service, ai-service) and `ai-platform-fe` (FE: auth, chat, docs, shell apps)
- Codebase map already exists at `.planning/codebase/`
- Claude Code agent runtime (claude)
- Agents defined as CLAUDE.md-style agent definitions saved inside each sub-project
- Root-level TeamLead agent coordinates both FE and BE agents
- Tasks stored as markdown files — no external DB required

## Constraints

- **Tech stack**: Nx monorepo — agents must respect workspace structure
- **Isolation**: FE agents operate only on `ai-platform-fe/`, BE agents only on `ai-platform/`
- **Local-only**: Kanban UI runs locally, no cloud hosting required
- **Claude Code runtime**: Agents are Claude Code slash commands / CLAUDE.md agent definitions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Agents stored per-repo | FE and BE have different codebases, contexts, and tech stacks — isolation prevents cross-contamination | — Pending |
| Markdown task files | No DB dependency, git-trackable, readable by agents directly | — Pending |
| Separate plan vs execute commands | User reviews tasks before automation starts — quality gate without slowing down execution | — Pending |
| Standalone Kanban server | Not part of ai-platform-fe to keep dev tooling separate from product code | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-26 — Phase 5 complete (kanban-server: stopped-status hook, pipeline gate, Express SSE server)*
