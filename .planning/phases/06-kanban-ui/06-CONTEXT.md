# Phase 6: Kanban UI - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Kanban board browser UI: a Vite + React app inside `kanban-server/client/` that connects to the existing kanban-server via SSE (`GET /events`) and a new `PATCH /tasks/:id/status` endpoint. Shows six status columns with live updates from SSE; supports drag-and-drop to move cards (writes status to task file via the PATCH endpoint). Express in production serves the built UI as static files from `kanban-server/public/`. Dev mode uses Vite's proxy to forward API calls to Express with HMR.

</domain>

<decisions>
## Implementation Decisions

### App Structure
- **D-01:** Source location: `kanban-server/client/` — Vite + React source lives inside the kanban-server directory, not a separate workspace-root dir.
- **D-02:** Build output: `kanban-server/public/` — `npm run build` (Vite) outputs to `kanban-server/public/`; Express serves this directory as static files in production.
- **D-03:** Single process: `node kanban-server/index.js` serves both the API and the built UI. No second process needed in production.
- **D-04:** Dev workflow: Vite dev server on port 5173 with HMR. Vite proxy config forwards `/events`, `/tasks`, `/health` to Express on port 6111. Run `npm run dev` inside `kanban-server/` for live editing.

### Server Extension (required for drag-and-drop — Phase 6 adds to kanban-server)
- **D-05:** Add `PATCH /tasks/:id/status` endpoint to `kanban-server/index.js`. Body: `{ status: string }`. Validates status is a valid lifecycle value, reads the task file, updates the `status:` frontmatter field, writes back. Reuses the `parseTaskFile()` + YAML stringify pattern already in the file.
- **D-06:** Update CORS middleware in `kanban-server/index.js` to allow `PATCH` method (currently only `GET, POST, OPTIONS`). Add `PATCH` to `Access-Control-Allow-Methods`.

### Drag-and-Drop
- **D-07:** Library: `@hello-pangea/dnd`. Use `<DragDropContext>`, `<Droppable>` per column, `<Draggable>` per card.
- **D-08:** Update strategy: **optimistic**. On drop, immediately update local React state (card moves to new column). Fire `PATCH /tasks/:id/status` with the new status. On failure (non-2xx or network error), revert card to its original column in local state.
- **D-09:** Drag is only allowed between valid status columns (not arbitrary). All six status values are valid drop targets: `readyForDevelop`, `inProgress`, `inReview`, `inTesting`, `forTeamLeadCheck`, `done`.

### Styling
- **D-10:** Tailwind CSS. Standard Vite + React + Tailwind setup (`tailwind.config.js`, `postcss.config.js`, import in `client/src/index.css`).
- **D-11:** Compact dev tool density — all 6 columns visible without horizontal scroll at 1440px width. Tight card padding, small font size. Prioritize information density over visual polish.

### Claude's Discretion
- Column header labels (e.g., "Ready" vs "readyForDevelop" vs "Ready for Dev") — Claude picks readable labels
- Card badge colors for repo label (FE/BE/both)
- SSE reconnect logic in the browser (auto-reconnect on EventSource close/error)
- Error state when kanban-server is unreachable (empty board with status message)
- Vite config file structure and proxy configuration details
- Whether to use React `useState` or `useReducer` for board state

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` — Phase 6 goal, SC-1 through SC-4 (success criteria for the board)
- `.planning/REQUIREMENTS.md` — KANBAN-01 (six columns), KANBAN-02 (SSE live updates), KANBAN-03 (card fields), KANBAN-04 (drag-and-drop status write)
- `.planning/PROJECT.md` — Standalone Kanban server decision; task file schema overview

### Existing Server (Phase 6 extends this)
- `kanban-server/index.js` — Full source of the Express + SSE server. Phase 6 adds `PATCH /tasks/:id/status` endpoint here and extends CORS. Read before modifying. Reuse `parseTaskFile()` and `findTaskFile()` patterns.
- `kanban-server/package.json` — Current deps (express, chokidar, js-yaml, node-yaml-front-matter or similar). New client deps go in `kanban-server/package.json` under a `client` workspace or separate `kanban-server/client/package.json`.

### Task File Infrastructure
- `.planning/task-schema.yaml` — All valid status values and lifecycle. `PATCH /tasks/:id/status` must reject any status not in this schema.
- `.claude/hooks/task-state-guard.js` — YAML frontmatter parsing pattern reused by kanban-server. The PATCH endpoint follows the same parse-modify-write pattern.

### Prior Phase Context
- `.planning/phases/05-kanban-server/05-CONTEXT.md` — Server design decisions D-01 through D-13: SSE event payload schema (task-updated, full snapshot), heartbeat, stop endpoint, STOPPABLE statuses, CORS rationale.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `kanban-server/index.js` `parseTaskFile(filePath)` — Parses YAML frontmatter from a task .md file; returns plain object or null on error. Client receives these objects via SSE — same field names.
- `kanban-server/index.js` `loadAllTasks()` — Returns array of all parsed task objects. SSE on-connect sends these as initial snapshot. Client should handle the same object shape.
- SSE `task-updated` event payload: `{ id, title, status, priority, repo, epic, complexity, 'created-at', 'updated-at', deleted? }` — client renders these fields directly.

### Established Patterns
- Server uses plain CommonJS JavaScript (D-07 from Phase 5). `kanban-server/client/` is a separate Vite+React app with its own `package.json` — Vite compiles it to `kanban-server/public/`.
- Task status is lowercase camelCase: `readyForDevelop`, `inProgress`, `inReview`, `inTesting`, `forTeamLeadCheck`, `done`.
- CORS headers already set on all responses via global middleware — Phase 6 adds `PATCH` to the allowed methods.

### Integration Points
- `GET /events` (port 6111) → React `EventSource` in the UI connects here; handles `task-updated` events to update board state.
- `PATCH /tasks/:id/status` (new endpoint added in Phase 6) → called on drag-and-drop drop with `{ status: newStatus }`.
- `POST /tasks/:id/stop` (existing) → called from the Stop button on a task card (KANBAN-05, already implemented in Phase 5 on the server side).
- `kanban-server/public/` → Express serves this as static root; `index.html` is the SPA entry point.

</code_context>

<specifics>
## Specific Ideas

- `kanban-server/client/` holds the Vite app: `package.json`, `vite.config.js`, `src/App.jsx` (or `.tsx`), `src/index.css` (Tailwind import), `index.html`.
- `vite.config.js` proxy config: forward `/events`, `/tasks`, `/health` to `http://localhost:6111` so the dev server can call the API without CORS issues.
- `kanban-server/index.js` additions: (1) `app.use(express.static(path.join(__dirname, 'public')))` for serving the SPA; (2) `PATCH /tasks/:id/status` endpoint; (3) `PATCH` added to CORS allowed methods.
- Six columns in display order: `readyForDevelop → inProgress → inReview → inTesting → forTeamLeadCheck → done`.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 6-Kanban-UI*
*Context gathered: 2026-05-26*
