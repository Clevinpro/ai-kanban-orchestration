# Roadmap: AI Agent Dev Workflow

## Overview

This roadmap builds a Claude Code multi-agent development automation system on top of an existing Nx monorepo. Starting with the file schema and CLAUDE.md layering that every other phase depends on, the system grows phase-by-phase: TeamLead orchestration skills come next, followed by the sub-agent library and Kanban server (parallelizable), then full end-to-end pipeline integration, and finally the live Kanban UI. Each phase delivers a coherent, verifiable capability before the next begins.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Task schema, CLAUDE.md layering, and context isolation rules that every phase depends on
- [ ] **Phase 2: TeamLead Skills** - `/team-lead:plan` and `/team-lead:execute` slash commands with safety guards
- [ ] **Phase 3: Sub-Agents** - Six agent definitions (be-developer, fe-developer, code-reviewer, qa-be, qa-fe, team-lead-check)
- [ ] **Phase 4: Pipeline Integration** - End-to-end sequential orchestration with rejection loops and final check gate
- [ ] **Phase 5: Kanban Server** - Standalone Express + chokidar + SSE server that reads task files and exposes stop/commit
- [ ] **Phase 6: Kanban UI** - Vite + React board with six status columns, live SSE updates, and drag-and-drop

## Phase Details

### Phase 1: Foundation

**Goal**: The task file schema, status lifecycle, and CLAUDE.md layering exist and are enforced — every subsequent phase builds on this contract
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, FOUND-07
**Success Criteria** (what must be TRUE):

  1. A TASK-XX.md file written by hand with valid YAML frontmatter (id, title, status, priority, repo, epic, complexity, created-at, updated-at) is accepted without errors by any downstream tool
  2. Writing an invalid status transition to a task file's frontmatter is blocked by the PreToolUse hook
  3. The root CLAUDE.md loads without triggering BE or FE-specific conventions in a neutral context
  4. Opening `ai-platform/` in Claude Code surfaces only NestJS/BE rules; opening `ai-platform-fe/` surfaces only React/FE rules
  5. TeamLead agent definition acknowledges the max ~10 min / fresh-context-window constraint when sizing task breakdowns

**Plans**: 5 plans

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Task file schema (.planning/task-schema.yaml) and PreToolUse enforcement hook (task-state-guard.js)
- [x] 01-02-PLAN.md — Root CLAUDE.md routing constitution rewrite and TeamLead stub slash commands

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-03-PLAN.md — BE isolation: ai-platform/CLAUDE.md rewrite (allowlist-first) and be-conventions SKILL.md
- [x] 01-04-PLAN.md — FE isolation: ai-platform-fe/CLAUDE.md creation (allowlist-first) and fe-conventions SKILL.md

**Gap Closure**

- [x] 01-05-PLAN.md — CR-01 fix (Edit allow path returns modifiedInput.new_string) + documentation gap closure (FOUND-04/05, ROADMAP SC-2 label)

### Phase 2: TeamLead Skills

**Goal**: A user can run `/team-lead:plan SPEC.md` to get a reviewed task list and `/team-lead:execute TASK-ID` to launch the automated pipeline, with Stop hook guards preventing infinite loops
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: TL-01, TL-02, TL-03, TL-04, PIPE-04, PIPE-05
**Success Criteria** (what must be TRUE):

  1. Running `/team-lead:plan` against a SPEC.md produces TASK-XX.md files in `.planning/work/` and pauses for human review before any code executes
  2. Each generated task includes a complexity score (1-10) visible in the plan review output
  3. A SPEC.md file holds both product requirements (user stories, AC) and technical design (API contracts, DB schema) in one file
  4. Running `/team-lead:execute TASK-ID` launches the Developer → CodeReview → QA → TeamLeadCheck pipeline without manual steps
  5. Every Stop hook checks `stop_hook_active` and exits immediately, confirmed by a forced-exit test

**Plans**: 3 plans

Plans:
**Wave 1** *(all plans parallel — no shared files)*

- [x] 02-01-PLAN.md — Stop hook guard: stop-guard.js + settings.json registration + scripts/test-stop-guard.sh (PIPE-04)
- [ ] 02-02-PLAN.md — Full plan.md command: SPEC.md validation, task generation, review table, confirm gate (TL-01, TL-03, TL-04)
- [ ] 02-03-PLAN.md — Full execute.md command: pipeline orchestration stubs + PIPE-05 verification (TL-02, PIPE-05)

### Phase 3: Sub-Agents

**Goal**: All six sub-agent files exist with correct YAML frontmatter, tool constraints, repo isolation, and one-line receipt protocol — the pipeline can invoke any of them without crashing the orchestrator context
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, AGENT-06
**Success Criteria** (what must be TRUE):

  1. `be-developer` and `fe-developer` agents, when invoked, only read/write within their designated sub-repo and return a single-line receipt
  2. `code-reviewer` agent cannot invoke Write, Edit, or Bash — attempting to do so is blocked — and appends an APPROVED or CHANGES_REQUESTED block to the task file
  3. `qa-be` runs `nx test` scoped to `ai-platform/` and records pass/fail in the task file; `qa-fe` does the same for `ai-platform-fe/`
  4. `team-lead-check` reads the original SPEC.md plus full task file history and either marks the task `done` or rejects back to developer with a reason
  5. Every agent definition pads the `tools:` array with Glob at position 1 and Grep at the last position (bug #60237 mitigation)

**Plans**: TBD

### Phase 4: Pipeline Integration

**Goal**: A real SPEC.md task travels through the full Developer → CodeReview → QA → TeamLeadCheck → Done sequence end-to-end, with rejection loops working correctly and the status lifecycle enforced at every gate
**Mode:** mvp
**Depends on**: Phase 2, Phase 3
**Requirements**: PIPE-01, PIPE-02, PIPE-03
**Success Criteria** (what must be TRUE):

  1. Running `/team-lead:execute TASK-ID` on a real task completes the full pipeline in one uninterrupted run, with each stage gating on the receipt from the previous
  2. A deliberately failing QA test triggers the rejection loop: the task returns to Developer with failure evidence appended, the developer re-fixes, and QA re-runs until pass
  3. TeamLeadCheck rejects a task that does not align with the original SPEC.md, sending it back to the developer; a correctly implemented task is marked `done`

**Plans**: TBD

### Phase 5: Kanban Server

**Goal**: A standalone Express server watches `.planning/work/` and streams live task state over SSE; a user can stop a running task and commit its current changes to a branch via the server API
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: KANBAN-05
**Success Criteria** (what must be TRUE):

  1. The Kanban server starts with a single command outside the Nx workspace and serves current task data without requiring any Nx build step
  2. When a task file's frontmatter is updated on disk, the server pushes the change to connected SSE clients within one second
  3. A user can call the stop-and-commit endpoint for a running task and the current code changes are committed to a new branch (no PR created)

**Plans**: TBD

### Phase 6: Kanban UI

**Goal**: A live browser-based Kanban board shows all six status columns with real-time updates, and a user can manually move a task card between columns or stop a task from the UI
**Mode:** mvp
**Depends on**: Phase 4, Phase 5
**Requirements**: KANBAN-01, KANBAN-02, KANBAN-03, KANBAN-04
**Success Criteria** (what must be TRUE):

  1. Opening the Kanban UI shows all task cards grouped into six columns (readyForDevelop, inProgress, inReview, inTesting, forTeamLeadCheck, Done) without a page reload
  2. When an agent updates a task file's status, the card moves to the correct column live in the browser via SSE — no manual refresh needed
  3. Each task card displays title, complexity score (1-10), repo label (FE/BE/both), and epic name
  4. Dragging a card to a different column writes the updated status to the task file's YAML frontmatter

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order. Phases 3 and 5 can begin as soon as Phase 1 is complete (parallel with Phase 2). Phase 4 requires both Phase 2 and Phase 3. Phase 6 requires Phase 4 and Phase 5.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 5/5 | Complete    | 2026-05-22 |
| 2. TeamLead Skills | 1/3 | In progress | - |
| 3. Sub-Agents | 0/TBD | Not started | - |
| 4. Pipeline Integration | 0/TBD | Not started | - |
| 5. Kanban Server | 0/TBD | Not started | - |
| 6. Kanban UI | 0/TBD | Not started | - |
