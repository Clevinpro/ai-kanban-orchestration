# Phase 5: Kanban Server - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a standalone Express + chokidar + SSE server (`kanban-server/`) that watches `.planning/work/` for task file changes and streams live task state to connected clients. Add a stop-and-commit endpoint: when called, writes `status: stopped` to the task file (signals the pipeline), then commits dirty changes in the relevant sub-repo to a new branch. No Nx involvement — pure Node.js, runnable with a single command.

</domain>

<decisions>
## Implementation Decisions

### Stop Signal Mechanism

- **D-01:** Stop signal = write `status: stopped` to task frontmatter. Uses the existing `task-state-guard.js` hook infrastructure. No separate flag files or process management needed.
- **D-02:** `task-state-guard.js` must allow `stopped` as a valid destination from any active status: `inProgress`, `inReview`, `inTesting`, `forTeamLeadCheck`. Not from `readyForDevelop` or `done`.
- **D-03:** `execute.md` checks for `status: stopped` at each stage gate (before spawning the next agent). When detected, append `[pipeline] STOPPED` receipt to the task file body, then exit the pipeline. In-flight agent stage runs to completion; the pipeline just does not advance.

### Commit Scope

- **D-04:** Use the task `repo:` field to determine which sub-repo to commit: `be` → `ai-platform/`, `fe` → `ai-platform-fe/`. Each is an independent git repo with its own working tree.
- **D-05:** Branch name pattern: `task/<TASK-ID>/stopped` (e.g., `task/TASK-001/stopped`).
- **D-06:** Commit message: `wip(<TASK-ID>): stopped mid-pipeline` (e.g., `wip(TASK-001): stopped mid-pipeline`).

### Server Scaffolding

- **D-07:** Plain JavaScript — no TypeScript, no build step. Satisfies SC-1 (single command, no Nx build step required). Consistent with `.claude/hooks/task-state-guard.js` pattern already in the repo.
- **D-08:** Directory: `kanban-server/` at workspace root (outside Nx workspace, outside `ai-platform/` and `ai-platform-fe/`).
- **D-09:** Start command: `node kanban-server/index.js` from the workspace root.
- **D-10:** Port via `PORT` env var, fallback `6111`.

### SSE Event Payload

- **D-11:** Full task snapshot per event — server parses the full task file (frontmatter + body) and sends the complete task object in every `task-updated` event. Client is stateless; re-renders on every event.
- **D-12:** Single event type: `task-updated`. Used for file add, modify, and delete. Deleted tasks include a `deleted: true` flag so the client can remove the card.
- **D-13:** On SSE connect, server immediately emits `task-updated` events for all existing task files as an initial snapshot, before live updates begin.

### Claude's Discretion

- Exact chokidar watch options (ignored paths, debounce/throttle timing — must satisfy SC-2: ≤1 second)
- SSE heartbeat interval and client reconnect handling
- Express route structure (e.g., `GET /events` for SSE, `POST /tasks/:id/stop` for stop-and-commit)
- Error handling when a task file has malformed YAML (skip or emit error event)
- `kanban-server/package.json` structure and exact dependency versions

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` — Phase 5 goal, SC-1, SC-2, SC-3 (the three success criteria)
- `.planning/REQUIREMENTS.md` — KANBAN-05 (stop task and commit acceptance criteria)
- `.planning/PROJECT.md` — Standalone Kanban server decision; task file schema overview

### Task File Infrastructure
- `.planning/task-schema.yaml` — Status lifecycle, all valid field names, allowed status values. Add `stopped` to the valid status list.
- `.claude/hooks/task-state-guard.js` — Current transition map (forward-only). Extend with `stopped` as a valid destination from active statuses (D-02). Also reuse its YAML frontmatter parsing pattern for the server's task parser.
- `.claude/settings.json` — Hook registration; verify `task-state-guard.js` covers task writes from the server's stop endpoint.

### Pipeline Integration
- `.claude/commands/team-lead/execute.md` — The pipeline orchestrator. Add `stopped` status check at each stage gate (D-03). Read the existing gate logic before modifying.
- `.planning/phases/04-pipeline-integration/04-CONTEXT.md` — D-04/D-05/D-06: status transition patterns, rejection-only annotation conventions. Follow same annotation format for `[pipeline] STOPPED` receipt.

### Prior Phase Context
- `.planning/phases/03-sub-agents/03-CONTEXT.md` — Agent receipt formats; the `[pipeline] STOPPED` receipt should follow the same `[agent-name] SIGNAL` pattern.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.claude/hooks/task-state-guard.js` — Node.js YAML frontmatter parsing logic (reads file, splits on `---`, parses YAML block). Reuse this pattern for the server's task file parser rather than inventing a new one.
- `.planning/work/` — Live task file location. Server watches this directory (recursively, for subdirectory epics like `test-pipeline/TASK-TEST.md`).

### Established Patterns
- Task file format: YAML frontmatter between `---` delimiters, followed by markdown body. Fields: `id`, `title`, `status`, `priority`, `repo`, `epic`, `complexity`, `created-at`, `updated-at`.
- Receipt format: `[agent-name] SIGNAL` appended to task file body as a plain text line. Follow this for `[pipeline] STOPPED`.
- Status transition guard: all task file writes go through `task-state-guard.js` PreToolUse hook. The stop endpoint must write the task file via normal file I/O — hook will validate the transition.

### Integration Points
- `task-state-guard.js` transition table → extend with `stopped` destination entries (D-02).
- `execute.md` stage gate → add status re-read + stopped check before each Agent invocation (D-03).
- `kanban-server/` → new standalone directory; no changes to Nx workspace config needed.

</code_context>

<specifics>
## Specific Ideas

- `task-state-guard.js` stop transition guard: allow `stopped` from `['inProgress', 'inReview', 'inTesting', 'forTeamLeadCheck']` with no annotation-presence requirement (server is the legitimate initiator — no annotation needed unlike rejection reversals).
- The stop-and-commit flow: (1) parse task file to get `id` and `repo:` field, (2) write `status: stopped` to frontmatter, (3) run `git checkout -b task/<TASK-ID>/stopped` in the relevant sub-repo dir, (4) run `git add -A && git commit -m "wip(<TASK-ID>): stopped mid-pipeline"`, (5) return success/error JSON response.
- chokidar should watch `.planning/work/**/*.md` (glob pattern to catch tasks in epic subdirectories).
- SSE response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 5-Kanban-Server*
*Context gathered: 2026-05-26*
