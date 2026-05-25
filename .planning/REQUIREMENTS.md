# Requirements: AI Agent Dev Workflow

**Defined:** 2026-05-20
**Core Value:** One command triggers a full dev→review→test→approve chain per task; Kanban board shows real-time progress

## v1 Requirements

### Foundation

- [x] **FOUND-01**: Task file schema defined — `.planning/work/TASK-XX.md` with YAML frontmatter fields: `id`, `title`, `status`, `priority`, `repo` (be|fe|both), `epic`, `complexity` (1-10), `created-at`, `updated-at`
- [x] **FOUND-02**: Six-state status lifecycle enforced: `readyForDevelop → inProgress → inReview → inTesting → forTeamLeadCheck → done`
- [x] **FOUND-03**: Root CLAUDE.md constitution created — cross-repo rules only, under 200 lines, references sub-repo CLAUDE.md files
- [x] **FOUND-04**: `ai-platform/CLAUDE.md` created — NestJS/BE-specific context and path restrictions
- [x] **FOUND-05**: `ai-platform-fe/CLAUDE.md` created — React/FE-specific context and path restrictions
- [x] **FOUND-06**: Each task scoped to max ~10 minutes of execution time — TeamLead enforces atomic, focused task size
- [x] **FOUND-07**: Each task executes in a fresh context window — no accumulated state between tasks

### TeamLead Skills

- [x] **TL-01**: `/team-lead:plan` skill reads SPEC.md + `.planning/codebase/`, generates TASK-XX.md files with complexity scoring, outputs list for human review before any execution
- [x] **TL-02**: `/team-lead:execute TASK-ID` skill runs full automated pipeline per task: Developer → CodeReview → QA → TeamLeadCheck → Done
- [x] **TL-03**: SPEC.md format defined — single file per epic containing both product requirements (user stories, AC) and technical design (API contracts, DB schema, architecture decisions)
- [x] **TL-04**: TeamLead assigns complexity score 1-10 per generated task and surfaces it in the plan review output

### Sub-Agents

- [x] **AGENT-01**: `be-developer` agent defined in root `.claude/agents/be-developer.md` — restricted to `ai-platform/` via system prompt, returns one-line receipt, `tools:` array padded with Glob/Grep
- [x] **AGENT-02**: `fe-developer` agent defined in root `.claude/agents/fe-developer.md` — restricted to `ai-platform-fe/` via system prompt, returns one-line receipt, `tools:` array padded with Glob/Grep
- [ ] **AGENT-03**: `code-reviewer` agent defined — `disallowedTools: Write, Edit, Bash`, appends APPROVED/CHANGES_REQUESTED block to task file body, returns one-line receipt
- [ ] **AGENT-04**: `qa-be` agent — runs `nx test` for `ai-platform/` via Bash, records pass/fail in task file, triggers rejection loop to developer on failure
- [ ] **AGENT-05**: `qa-fe` agent — runs `nx test` for `ai-platform-fe/` via Bash, records pass/fail in task file, triggers rejection loop to developer on failure
- [ ] **AGENT-06**: `team-lead-check` agent — reads original SPEC.md + full task file history, verifies alignment with spec, marks `done` or rejects back to developer

### Pipeline Automation

- [ ] **PIPE-01**: Sequential orchestration — TeamLead spawns sub-agents one at a time via Agent tool; each stage gates the next based on receipt status
- [ ] **PIPE-02**: Rejection loop — QA failure sends task back to Developer with failure evidence appended to task file body; loop repeats until pass or manual intervention
- [ ] **PIPE-03**: TeamLeadCheck gate — final verification against SPEC.md before `done`; can reject back to developer
- [x] **PIPE-04**: Stop hook guard — every Stop hook checks `stop_hook_active` and exits immediately to prevent infinite loop
- [x] **PIPE-05**: Status transition guard — PostToolUse hook on `.planning/work/*.md` validates only allowed transitions proceed

### Kanban UI

- [ ] **KANBAN-01**: Board displays six status columns — `readyForDevelop / inProgress / inReview / inTesting / forTeamLeadCheck / Done`
- [ ] **KANBAN-02**: Auto-refresh via SSE — task cards update live without page refresh as agents write task files
- [ ] **KANBAN-03**: Task card shows: title, complexity (1-10), repo (FE/BE/both), epic name
- [ ] **KANBAN-04**: Drag-and-drop status override — user can manually move a card between columns; writes updated status to task file frontmatter
- [ ] **KANBAN-05**: Stop task and commit — user can stop a running task and commit its current code changes to a branch (no PR created)

## v2 Requirements

### Enhanced Pipeline

- **PIPE-v2-01**: Parallel task execution across multiple `/execute` calls — run independent tasks simultaneously
- **PIPE-v2-02**: TeamLeadCheck rejection loop to QA (not just to Developer) for test-coverage gaps
- **PIPE-v2-03**: Per-agent persistent memory (`memory: project`) — accumulate codebase patterns across sessions

### Enhanced TeamLead

- **TL-v2-01**: SPEC.md auto-generation from one-liner description
- **TL-v2-02**: SPEC.md schema validator before plan generation

### Enhanced Kanban

- **KANBAN-v2-01**: Task history log view — full pipeline audit trail per task
- **KANBAN-v2-02**: Filter by epic, repo, complexity

## Out of Scope

| Feature | Reason |
|---------|--------|
| External tracker integration (Linear, Jira, GitHub Projects) | Breaks local-first model; markdown files are the source of truth |
| Cloud Kanban deployment | Dev tool only; local server is sufficient |
| CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS | Active bugs #30703, #29441; one-team-at-a-time limit |
| isolation: worktree for FE/BE separation | Confirmed monorepo bug #39886; system prompt isolation is sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Complete |
| FOUND-05 | Phase 1 | Complete |
| FOUND-06 | Phase 1 | Complete |
| FOUND-07 | Phase 1 | Complete |
| TL-01 | Phase 2 | Complete |
| TL-02 | Phase 2 | Complete |
| TL-03 | Phase 2 | Complete |
| TL-04 | Phase 2 | Complete |
| PIPE-04 | Phase 2 | Complete |
| PIPE-05 | Phase 2 | Complete |
| AGENT-01 | Phase 3 | Complete |
| AGENT-02 | Phase 3 | Complete |
| AGENT-03 | Phase 3 | Pending |
| AGENT-04 | Phase 3 | Pending |
| AGENT-05 | Phase 3 | Pending |
| AGENT-06 | Phase 3 | Pending |
| PIPE-01 | Phase 4 | Pending |
| PIPE-02 | Phase 4 | Pending |
| PIPE-03 | Phase 4 | Pending |
| KANBAN-05 | Phase 5 | Pending |
| KANBAN-01 | Phase 6 | Pending |
| KANBAN-02 | Phase 6 | Pending |
| KANBAN-03 | Phase 6 | Pending |
| KANBAN-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-20*
*Last updated: 2026-05-23 after Phase 2 complete — TL-01, TL-02, TL-03, TL-04 marked complete*
