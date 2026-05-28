# Architecture Research: AI Agent Dev Workflow

**Confidence:** HIGH

## System Architecture

```
Entry Layer:
  /team-lead:plan [SPEC]     /team-lead:execute [TASK-ID]
  (skill runs inline in main session — NOT context:fork)
          │                           │
          ▼                           ▼
Orchestration Layer (TeamLead — main Claude Code session):
  Reads: .planning/codebase/, SPEC.md, task files
  Writes: .planning/work/TASK-XX.md (create on plan, status updates on execute)
  Spawns: be-developer | fe-developer → code-reviewer → qa (sequentially)
          │
          ▼ (Agent tool, sequential)
Sub-Agent Layer (.claude/agents/ at monorepo root):
  be-developer   → restricted to ai-platform/ via system prompt
  fe-developer   → restricted to ai-platform-fe/ via system prompt
  code-reviewer  → read-only (disallowedTools: Write, Edit, Bash)
  qa             → Bash + Read only (runs nx test, records result)
  Each agent reads task file, does work, updates status frontmatter, returns summary
          │
          ▼ (Read/Write/Edit tools on filesystem)
State Layer (.planning/work/TASK-XX.md):
  YAML frontmatter: id, title, status, priority, repo, epic, timestamps
  Status lifecycle: readyForDevelop → inProgress → inReview → inTesting → forTeamLeadCheck → done
  Markdown body: context, requirements, acceptance criteria, review notes (appended by code-reviewer)
          │
          ▼ (chokidar watches .planning/work/)
Observation Layer (tools/ — separate from Nx product workspaces):
  kanban-server/ (Express + chokidar + gray-matter + SSE):
    - Scans .planning/work/ on startup
    - chokidar fires add/change/unlink → re-parse → SSE broadcast
    - GET /api/tasks → initial task list JSON
    - PATCH /api/tasks/:id → gray-matter.stringify() → write file
  kanban-ui/ (Vite + React + Tailwind + dnd-kit):
    - GET /api/tasks on mount → initial board render
    - SSE stream → useTaskStream hook → React state updates
    - Drag-and-drop → PATCH /api/tasks/:id → server writes frontmatter
```

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `/team-lead:plan` skill | Parse SPEC.md, create TASK-XX.md files, return list for review | Writes `.planning/work/`; runs inline in main session |
| `/team-lead:execute` skill | Validate status, bootstrap pipeline in TeamLead context | Reads task file; TeamLead spawns agents |
| TeamLead (orchestrator) | Pipeline coordination, go/no-go decisions | All sub-agents via Agent tool; task files; `.planning/codebase/` |
| `be-developer` | Implement task in `ai-platform/` only | Reads task file; writes/edits BE source; updates status |
| `fe-developer` | Implement task in `ai-platform-fe/` only | Reads task file; writes/edits FE source; updates status |
| `code-reviewer` | Read-only analysis; appends review notes to task markdown body | Reads task file + changed source files; returns APPROVED/CHANGES_REQUESTED |
| `qa` | Run tests via Bash; record pass/fail; update task status | Reads task; runs `nx test`; updates frontmatter |
| Task file | Single source of truth: state + requirements + results | Written by all pipeline participants; read by Kanban server |
| `kanban-server` | Parse files, watch for changes, push SSE, handle PATCH writes | Reads `.planning/work/`; serves kanban-ui |
| `kanban-ui` | Visualize board; drag-and-drop status changes | Connects to kanban-server SSE + REST |

## Key Architectural Decisions

1. **Sub-agents cannot spawn sub-agents** — `/team-lead:execute` must run inline in main session (no `context: fork`). TeamLead is the orchestrator.

2. **Sequential pipeline only** — Developer → CodeReview → QA is strictly sequential. Parallel only valid for independent BE+FE work on full-stack tasks.

3. **Frontmatter as shared state** — YAML `status` field is single source of truth. Agents use Edit (not Write) to update only the status line.

4. **`isolation: worktree` has known monorepo bug** (GitHub #39886 — silently fails). Enforce BE/FE path isolation via agent system prompt instead.

5. **Kanban outside Nx workspace** — `tools/kanban-server/` and `tools/kanban-ui/` are standalone, not part of `ai-platform-fe/` apps.

## Suggested Build Order

**Phase 1 — Task Schema + Foundation**
- Define task file format (frontmatter schema, status enum, naming)
- Create root CLAUDE.md constitution (workspace structure, no cross-repo writes)
- Initialize `.planning/work/` directory

**Phase 2 — TeamLead Skills**
- `.claude/skills/team-lead-plan/SKILL.md`
- `.claude/skills/team-lead-execute/SKILL.md`

**Phase 3 — Sub-Agent Definitions** (parallel with Phase 5)
- `.claude/agents/be-developer.md`, `fe-developer.md`, `code-reviewer.md`, `qa.md`
- code-reviewer: `disallowedTools: Write, Edit, Bash`
- qa: `disallowedTools: Write, Edit`

**Phase 4 — End-to-End Pipeline Integration**
- Wire execute skill → TeamLead → sub-agents → status transitions
- Test with real SPEC.md against existing `ai-platform/`

**Phase 5 — Kanban Server** (parallel with Phase 3)
- `tools/kanban-server/` — chokidar + gray-matter + SSE + REST (~150 LOC)

**Phase 6 — Kanban UI**
- `tools/kanban-ui/` — Vite + React + Tailwind + dnd-kit

Critical path: 1 → 2 → 3 → 4. Phases 5-6 parallel to 3-4.

## Anti-Patterns

| Anti-Pattern | Consequence | Prevention |
|--------------|-------------|-----------|
| `context: fork` on execute skill | Forked sub-agent cannot spawn agents — pipeline broken | Execute runs inline; TeamLead is main session |
| Parallel spawn of Developer + Reviewer + QA | Race conditions on task file writes | Sequential only |
| Separate DB/JSON index for task state | Two sources of truth; index drifts | Files are the only source of truth |
| Raw YAML in Kanban PATCH handler | Corrupts frontmatter | Always use `gray-matter.stringify()` |
| Kanban UI inside Nx workspace | Couples dev tool to product Nx config | Standalone `tools/kanban-ui/` |
| `isolation: worktree` for BE/FE separation | Silent failure in monorepos | System prompt path restrictions |
