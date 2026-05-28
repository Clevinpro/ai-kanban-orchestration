# Phase 6: Kanban UI - Research

**Researched:** 2026-05-26
**Domain:** Vite + React SPA, @hello-pangea/dnd, SSE client, Tailwind CSS v4, Express static serving, PATCH endpoint
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Source location: `kanban-server/client/` — Vite + React source lives inside the kanban-server directory, not a separate workspace-root dir.
- **D-02:** Build output: `kanban-server/public/` — `npm run build` (Vite) outputs to `kanban-server/public/`; Express serves this directory as static files in production.
- **D-03:** Single process: `node kanban-server/index.js` serves both the API and the built UI. No second process needed in production.
- **D-04:** Dev workflow: Vite dev server on port 5173 with HMR. Vite proxy config forwards `/events`, `/tasks`, `/health` to Express on port 6111. Run `npm run dev` inside `kanban-server/` for live editing.
- **D-05:** Add `PATCH /tasks/:id/status` endpoint to `kanban-server/index.js`. Body: `{ status: string }`. Validates status is a valid lifecycle value, reads the task file, updates the `status:` frontmatter field, writes back. Reuses the `parseTaskFile()` + YAML stringify pattern already in the file.
- **D-06:** Update CORS middleware in `kanban-server/index.js` to allow `PATCH` method (currently only `GET, POST, OPTIONS`). Add `PATCH` to `Access-Control-Allow-Methods`.
- **D-07:** Library: `@hello-pangea/dnd`. Use `<DragDropContext>`, `<Droppable>` per column, `<Draggable>` per card.
- **D-08:** Update strategy: **optimistic**. On drop, immediately update local React state (card moves to new column). Fire `PATCH /tasks/:id/status` with the new status. On failure (non-2xx or network error), revert card to its original column in local state.
- **D-09:** Drag is only allowed between valid status columns (not arbitrary). All six status values are valid drop targets: `readyForDevelop`, `inProgress`, `inReview`, `inTesting`, `forTeamLeadCheck`, `done`.
- **D-10:** Tailwind CSS. Standard Vite + React + Tailwind setup.
- **D-11:** Compact dev tool density — all 6 columns visible without horizontal scroll at 1440px width. Tight card padding, small font size. Prioritize information density over visual polish.

### Claude's Discretion

- Column header labels (e.g., "Ready" vs "readyForDevelop" vs "Ready for Dev") — Claude picks readable labels
- Card badge colors for repo label (FE/BE/both)
- SSE reconnect logic in the browser (auto-reconnect on EventSource close/error)
- Error state when kanban-server is unreachable (empty board with status message)
- Vite config file structure and proxy configuration details
- Whether to use React `useState` or `useReducer` for board state

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KANBAN-01 | Board displays six status columns — `readyForDevelop / inProgress / inReview / inTesting / forTeamLeadCheck / Done` | Architecture Pattern 1 (Board layout); Standard Stack (React, @hello-pangea/dnd, Tailwind) |
| KANBAN-02 | Auto-refresh via SSE — task cards update live without page refresh as agents write task files | Architecture Pattern 2 (SSE hook); Pitfall 1 (SSE buffering via Vite proxy) |
| KANBAN-03 | Task card shows: title, complexity (1-10), repo (FE/BE/both), epic name | Code Examples section (Card data shape from SSE) |
| KANBAN-04 | Drag-and-drop status override — user can manually move a card between columns; writes updated status to task file frontmatter | Architecture Pattern 3 (Optimistic DnD); Standard Stack (@hello-pangea/dnd); D-05 (PATCH endpoint) |

</phase_requirements>

---

## Summary

Phase 6 builds a browser-based Kanban board as a Vite + React SPA inside `kanban-server/client/`. It connects to the existing Express server via SSE for live updates and via a new `PATCH /tasks/:id/status` endpoint for drag-and-drop status writes. The UI renders six fixed columns; cards arrive via SSE initial snapshot and live `task-updated` events. @hello-pangea/dnd handles drag-and-drop with optimistic state updates.

The most significant technical decision is how to structure the Vite client inside an existing CommonJS Node.js directory. The client gets its own `package.json` with `"type": "module"` under `kanban-server/client/`, while the parent `kanban-server/package.json` keeps `"type": "commonjs"`. Vite's dev server proxies `/events`, `/tasks`, `/health` to Express on port 6111. A known SSE buffering issue with the Vite proxy requires adding `X-Accel-Buffering: no` to the server's SSE response — this header is already absent from `index.js` and must be added.

Tailwind CSS v4 introduced the `@tailwindcss/vite` plugin which replaces the old PostCSS + `tailwind.config.js` approach. The 2026-05-24 release is current and well-suited here: no `tailwind.config.js` or `postcss.config.js` needed; a single `@import "tailwindcss"` in the CSS file plus the plugin in `vite.config.js` covers the setup.

**Primary recommendation:** Use `useReducer` for board state (handles SSE events, drag state, and optimistic revert as distinct action types cleanly); use `@tailwindcss/vite` v4 plugin (no PostCSS config); add `X-Accel-Buffering: no` header to the `/events` SSE endpoint in `index.js`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Six-column board layout | Browser/Client (React) | — | Pure UI rendering — no server state needed |
| Live task state (SSE) | Browser/Client (React hook) | API/Backend (existing GET /events) | Client subscribes; server already pushes full snapshots |
| Drag-and-drop gesture | Browser/Client (@hello-pangea/dnd) | — | DnD is purely browser interaction |
| Status write on drop | API/Backend (new PATCH /tasks/:id/status) | Browser/Client (optimistic state) | Server is source of truth; client updates optimistically |
| Task card display | Browser/Client (React component) | — | SSE payload already contains all required card fields |
| Stop task button | API/Backend (existing POST /tasks/:id/stop) | Browser/Client (button) | Endpoint already exists from Phase 5 |
| Static file serving (prod) | API/Backend (Express static middleware) | CDN/Static (none — local tool) | Single-process: Express serves built Vite output |
| Dev HMR + API proxy | Browser/Client (Vite dev server) | API/Backend (Express :6111) | Vite proxies /events, /tasks, /health to Express |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vite | 8.0.14 [VERIFIED: npm registry] | Build tool + dev server + HMR | Industry standard for React SPAs; fastest dev server |
| react | 19.2.6 [VERIFIED: npm registry] | UI component framework | Locked by project ecosystem |
| react-dom | 19.2.6 [VERIFIED: npm registry] | React DOM renderer | Paired with react |
| @vitejs/plugin-react | 6.0.2 [VERIFIED: npm registry] | React JSX transform + Fast Refresh | Official Vite plugin for React |
| @hello-pangea/dnd | 18.0.1 [VERIFIED: npm registry] | Drag-and-drop for lists/columns | Locked by D-07; maintained fork of react-beautiful-dnd |
| tailwindcss | 4.3.0 [VERIFIED: npm registry] | Utility-first CSS framework | Locked by D-10 |
| @tailwindcss/vite | 4.3.0 [VERIFIED: npm registry] | Tailwind v4 Vite plugin | Replaces PostCSS approach in v4 — no tailwind.config.js needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| postcss | 8.5.15 [VERIFIED: npm registry] | CSS processing | Required by `@tailwindcss/vite` as a peer dep; installed automatically |
| autoprefixer | 10.5.0 [VERIFIED: npm registry] | CSS vendor prefixes | Only if postcss.config.js approach is used (not needed with @tailwindcss/vite) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @tailwindcss/vite plugin | tailwindcss v3 + postcss.config.js | v3 requires `tailwind.config.js` + `postcss.config.js`; v4 plugin is simpler but content paths must be auto-detected or declared in CSS |
| useReducer for board state | useState | useReducer handles multiple action types (SSE_UPDATE, DRAG_OPTIMISTIC, DRAG_REVERT) cleanly; useState requires multiple state vars and manual coordination |
| Native EventSource | Custom hook with reconnect | Native EventSource auto-reconnects by default on network errors; a thin wrapper adds only the retry delay and cleanup |

**Installation (inside `kanban-server/client/`):**
```bash
npm create vite@latest . -- --template react
npm install @hello-pangea/dnd tailwindcss @tailwindcss/vite
```

**Version verification:** All versions confirmed via `npm view <pkg> version` against npm registry on 2026-05-26.

---

## Package Legitimacy Audit

> slopcheck was not available at research time — all packages are tagged `[ASSUMED]` below. The planner must gate each install behind a `checkpoint:human-verify` task before first use.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| vite | npm | ~5 yrs | Very high | github.com/vitejs/vite | N/A (slopcheck unavailable) | [ASSUMED] — well-known, official |
| react | npm | ~10 yrs | Very high | github.com/facebook/react | N/A | [ASSUMED] — well-known, official |
| react-dom | npm | ~10 yrs | Very high | github.com/facebook/react | N/A | [ASSUMED] — well-known, official |
| @vitejs/plugin-react | npm | ~3 yrs | Very high | github.com/vitejs/vite-plugin-react | N/A | [ASSUMED] — official Vite org |
| @hello-pangea/dnd | npm | ~3 yrs | Substantial | github.com/hello-pangea/dnd | N/A | [ASSUMED] — maintained fork, verify before install |
| tailwindcss | npm | ~6 yrs | Very high | github.com/tailwindlabs/tailwindcss | N/A | [ASSUMED] — well-known, official |
| @tailwindcss/vite | npm | ~5 mo | High | github.com/tailwindlabs/tailwindcss | N/A | [ASSUMED] — official Tailwind org |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none identified by manual review

*All packages above are tagged `[ASSUMED]` because slopcheck was unavailable. Planner must gate each install behind a `checkpoint:human-verify` task.*

---

## Architecture Patterns

### System Architecture Diagram

```
Dev Mode:
  Browser (port 5173)
    └─ Vite dev server
         ├─ Serves React app (HMR)
         └─ Proxy: /events, /tasks, /health → http://localhost:6111
              └─ Express kanban-server (port 6111)
                   ├─ GET /events (SSE stream)
                   ├─ GET /tasks (list, optional)
                   ├─ PATCH /tasks/:id/status (new - Phase 6)
                   └─ POST /tasks/:id/stop (existing)

Production Mode:
  Browser
    └─ Express kanban-server (port 6111)
         ├─ express.static('kanban-server/public/')  ← Vite build output
         ├─ GET /events (SSE stream)
         ├─ PATCH /tasks/:id/status
         └─ POST /tasks/:id/stop
```

**Data flow (SSE → UI):**
```
.planning/work/**/*.md changes
  → chokidar detects change
  → parseTaskFile() reads frontmatter
  → pushEvent(taskObj) broadcasts to all SSE clients
  → Browser EventSource receives task-updated event
  → useReducer dispatches SSE_UPDATE action
  → Board re-renders with updated column assignments
```

**Data flow (drag-drop → disk):**
```
User drags card from column A → column B
  → onDragEnd fires with result.destination.droppableId = newStatus
  → useReducer dispatches DRAG_OPTIMISTIC {taskId, newStatus}
  → UI shows card in new column immediately
  → PATCH /tasks/:id/status { status: newStatus } fires
    → Success: SSE confirms state (server canonical)
    → Failure: useReducer dispatches DRAG_REVERT {taskId, originalStatus}
```

### Recommended Project Structure

```
kanban-server/
├── index.js              # Express server (CommonJS) — Phase 6 adds PATCH + static serving
├── package.json          # Server deps (express, chokidar, js-yaml) + scripts.dev = "npm run dev --prefix client"
├── public/               # Vite build output (git-ignored, generated by npm run build)
└── client/               # Vite + React source
    ├── package.json      # Client deps (react, vite, @hello-pangea/dnd, tailwindcss, @tailwindcss/vite)
    ├── vite.config.js    # defineConfig with react() plugin, tailwindcss() plugin, server.proxy
    ├── index.html        # SPA entry point
    └── src/
        ├── main.jsx      # ReactDOM.createRoot entry
        ├── index.css     # @import "tailwindcss"
        ├── App.jsx       # Board root — holds useReducer + useSSE + renders Board
        ├── hooks/
        │   └── useSSE.js # EventSource lifecycle hook with reconnect
        └── components/
            ├── Board.jsx       # Six-column layout using @hello-pangea/dnd DragDropContext
            ├── Column.jsx      # Droppable column with header label
            └── TaskCard.jsx    # Draggable card — title, complexity, repo badge, epic
```

### Pattern 1: Vite Config — Proxy + Plugins

**What:** Single `vite.config.js` wires up the React plugin, Tailwind v4 plugin, and proxy to forward API paths to Express on port 6111.

**When to use:** All dev mode — Vite forwards `/events`, `/tasks`, `/health` so the React app can use relative URLs in both dev and production.

```javascript
// Source: https://vite.dev/config/server-options (verified 2026-05-26)
// kanban-server/client/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../public',    // D-02: output to kanban-server/public/
    emptyOutDir: true,
  },
  server: {
    port: 5173,             // D-04
    proxy: {
      // Forward SSE stream — changeOrigin required to avoid host mismatch
      '/events': {
        target: 'http://localhost:6111',
        changeOrigin: true,
        // SSE buffering fix: set timeout high; backend must send X-Accel-Buffering: no
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Connection', 'keep-alive');
          });
        },
      },
      '/tasks': {
        target: 'http://localhost:6111',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:6111',
        changeOrigin: true,
      },
    },
  },
});
```

**Important:** The backend `index.js` GET /events handler must also send `X-Accel-Buffering: no` to prevent proxy buffering of the SSE stream. [CITED: github.com/vitejs/vite/discussions/10851]

### Pattern 2: SSE Hook with Reconnect

**What:** `useSSE` hook manages the EventSource lifecycle — creates on mount, dispatches events to the board reducer, auto-reconnects on error/close.

**When to use:** App mount. Reconnects with 3s delay to prevent hammering the server.

```javascript
// Source: [ASSUMED] — standard EventSource pattern cross-verified against
// https://developer.mozilla.org/en-US/docs/Web/API/EventSource
import { useEffect, useRef } from 'react';

export function useSSE(url, dispatch) {
  const esRef = useRef(null);
  const retryRef = useRef(null);

  useEffect(() => {
    function connect() {
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('task-updated', (e) => {
        const task = JSON.parse(e.data);
        dispatch({ type: 'SSE_UPDATE', task });
      });

      es.onerror = () => {
        es.close();
        // Reconnect after 3s — browser does not auto-reconnect on error in all cases
        retryRef.current = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      clearTimeout(retryRef.current);
    };
  }, [url, dispatch]);
}
```

### Pattern 3: DragDropContext + Droppable + Draggable

**What:** @hello-pangea/dnd three-layer nesting for the six-column board. `onDragEnd` result's `destination.droppableId` is the new status value.

**When to use:** Board component wraps all six columns in one `DragDropContext`. Each column is a `Droppable`. Each card is a `Draggable`.

```jsx
// Source: https://github.com/hello-pangea/dnd/blob/main/docs/guides/responders.md
// (verified API shape 2026-05-26)
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

function Board({ columns, dispatch }) {
  function handleDragEnd(result) {
    const { draggableId, source, destination, reason } = result;
    // No-op: dropped outside a column or drag cancelled
    if (!destination || reason === 'CANCEL') return;
    // No-op: dropped in same column at same index
    if (destination.droppableId === source.droppableId) return;

    const newStatus = destination.droppableId; // droppableId IS the status string
    const originalStatus = source.droppableId;

    // D-08: optimistic update
    dispatch({ type: 'DRAG_OPTIMISTIC', taskId: draggableId, newStatus });

    fetch(`/tasks/${draggableId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    }).then((res) => {
      if (!res.ok) {
        dispatch({ type: 'DRAG_REVERT', taskId: draggableId, originalStatus });
      }
    }).catch(() => {
      dispatch({ type: 'DRAG_REVERT', taskId: draggableId, originalStatus });
    });
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-2 p-2 min-h-screen">
        {COLUMN_ORDER.map((status) => (
          <Droppable droppableId={status} key={status}>
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex-1 min-w-0 bg-gray-100 rounded p-1"
              >
                {columns[status].map((task, index) => (
                  <Draggable draggableId={task.id} index={index} key={task.id}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                      >
                        <TaskCard task={task} />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        ))}
      </div>
    </DragDropContext>
  );
}
```

### Pattern 4: useReducer for Board State

**What:** Single reducer handles three action types: `SSE_UPDATE` (server push), `DRAG_OPTIMISTIC` (immediate local move), `DRAG_REVERT` (revert on PATCH failure).

**When to use:** Preferred over `useState` when SSE events and drag state interact — a single reducer prevents race conditions where an SSE event arrives during a pending PATCH.

```javascript
// Source: [ASSUMED] — standard useReducer pattern
const COLUMN_ORDER = [
  'readyForDevelop', 'inProgress', 'inReview',
  'inTesting', 'forTeamLeadCheck', 'done'
];

function boardReducer(state, action) {
  switch (action.type) {
    case 'SSE_UPDATE': {
      const { task } = action;
      if (task.deleted) {
        // Remove task from all columns
        const next = { ...state };
        for (const col of COLUMN_ORDER) {
          next[col] = next[col].filter((t) => t.id !== task.id);
        }
        return next;
      }
      // Remove from old column, add to correct column
      const next = { ...state };
      for (const col of COLUMN_ORDER) {
        next[col] = next[col].filter((t) => t.id !== task.id);
      }
      const col = task.status;
      if (COLUMN_ORDER.includes(col)) {
        next[col] = [...(next[col] || []), task];
      }
      return next;
    }
    case 'DRAG_OPTIMISTIC': {
      const { taskId, newStatus } = action;
      const next = { ...state };
      let movedTask = null;
      for (const col of COLUMN_ORDER) {
        const found = next[col].find((t) => t.id === taskId);
        if (found) { movedTask = found; }
        next[col] = next[col].filter((t) => t.id !== taskId);
      }
      if (movedTask) {
        next[newStatus] = [...next[newStatus], { ...movedTask, status: newStatus }];
      }
      return next;
    }
    case 'DRAG_REVERT': {
      // SSE confirmation will arrive from the server write; revert immediately
      // to prevent flicker. Same as SSE_UPDATE with original status.
      return boardReducer(state, {
        type: 'SSE_UPDATE',
        task: { id: action.taskId, status: action.originalStatus },
      });
    }
    default:
      return state;
  }
}
```

### Pattern 5: PATCH /tasks/:id/status Endpoint

**What:** New endpoint in `kanban-server/index.js` that validates the new status, updates the task file's frontmatter via regex replace (same pattern used by `POST /tasks/:id/stop`).

**When to use:** Called by the browser on drag-and-drop drop.

```javascript
// Pattern follows existing stop endpoint in kanban-server/index.js (lines 194-197)
const VALID_STATUSES = new Set([
  'readyForDevelop', 'inProgress', 'inReview',
  'inTesting', 'forTeamLeadCheck', 'done', 'stopped'
]);

app.patch('/tasks/:id/status', (req, res) => {
  try {
    const taskId = req.params.id;
    if (!/^TASK-\d{3}$/.test(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID format. Expected TASK-NNN.' });
    }
    const { status } = req.body;
    if (!status || !VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid status: ' + status });
    }
    const found = findTaskFile(taskId);
    if (!found) return res.status(404).json({ error: 'Task not found: ' + taskId });

    const now = new Date().toISOString();
    let content = fs.readFileSync(found, 'utf8');
    content = content.replace(/^status:\s*\S+/m, 'status: ' + status);
    content = content.replace(/^updated-at:\s*.+/m, 'updated-at: ' + now);
    fs.writeFileSync(found, content, 'utf8');

    const task = parseTaskFile(found);
    return res.json({ ok: true, task });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
```

**Note:** The task-state-guard.js PreToolUse hook only fires for Claude tool calls (Write/Edit), not for direct `fs.writeFileSync` calls from the server. The server must validate the status itself (as the stop endpoint already does). [ASSUMED based on hook architecture observed in .claude/hooks/task-state-guard.js]

### Pattern 6: Express Static Serving + SPA Fallback

**What:** Express serves the Vite build output from `kanban-server/public/` as static files. A catch-all route returns `index.html` for any unmatched GET request (SPA routing fallback — not strictly needed since there is no client-side router, but good practice).

**When to use:** Production only. Order matters: API routes first, then `express.static`, then catch-all.

```javascript
// Add to kanban-server/index.js (production serving — D-02, D-03)
// Source: [ASSUMED] — standard Express static + SPA pattern
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all for SPA — must come AFTER all API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
```

### Pattern 7: Nested package.json (client inside server dir)

**What:** `kanban-server/client/package.json` uses `"type": "module"` for the Vite/ESM client. The parent `kanban-server/package.json` stays `"type": "commonjs"` for Express. Node.js respects the nearest `package.json` for module type resolution.

**When to use:** Required. Without a separate `package.json` in `client/`, Vite's ESM imports would conflict with the parent `"type": "commonjs"` declaration.

```json
// kanban-server/client/package.json
{
  "name": "kanban-client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "@hello-pangea/dnd": "^18.0.1"
  },
  "devDependencies": {
    "vite": "^8.0.14",
    "@vitejs/plugin-react": "^6.0.2",
    "tailwindcss": "^4.3.0",
    "@tailwindcss/vite": "^4.3.0"
  }
}
```

### Anti-Patterns to Avoid

- **Placing client/ source in kanban-server root:** Mixes `"type": "commonjs"` (Express) with `"type": "module"` (Vite). Always use a nested `client/` directory with its own `package.json`.
- **Using tailwind.config.js + postcss.config.js with Tailwind v4:** v4 dropped this approach. Use `@tailwindcss/vite` plugin only.
- **Direct EventSource URL to port 6111 in dev:** Works but bypasses the Vite proxy; use relative paths (`/events`) so production and dev code are identical.
- **Forgetting `provided.placeholder` inside Droppable:** @hello-pangea/dnd requires this to maintain correct column height during drag. Omitting it causes layout shifts.
- **Using regex replace without anchoring to start of line:** The existing `content.replace(/^status:\s*\S+/m, ...)` pattern is correct — the `^` + multiline flag prevents replacing a `status` field embedded in the task body.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop between columns | Custom mousedown/mousemove handlers | `@hello-pangea/dnd` | Handles accessibility, keyboard nav, touch, auto-scroll, placeholder sizing — hundreds of edge cases |
| SSE reconnection with backoff | Custom retry loop with setInterval | `EventSource` onerror + setTimeout | Browser's EventSource has built-in reconnect; a simple retry wrapper is sufficient |
| CSS utility classes | Custom BEM stylesheets | Tailwind CSS | 1440px density constraint is better served by utility classes than custom CSS |
| Status validation list | Parsing task-schema.yaml at runtime | Hardcoded `VALID_STATUSES` Set | Schema is locked by Phase 1; runtime YAML parse adds unnecessary I/O and dependency |

**Key insight:** @hello-pangea/dnd is a maintained fork of react-beautiful-dnd with active maintenance (v18.0.1, Feb 2025). It supports React 18 and 19 as peer deps. Building accessible multi-column drag-and-drop from scratch would take 10x the effort.

---

## Common Pitfalls

### Pitfall 1: SSE Stream Buffering Through Vite Proxy
**What goes wrong:** EventSource connects to `/events` via Vite proxy in dev mode; all SSE events are buffered and delivered at once when the server closes the connection, not streamed in real time.
**Why it happens:** Vite's underlying `http-proxy` library buffers responses by default. SSE requires streaming.
**How to avoid:** Add `X-Accel-Buffering: no` header to the Express `/events` response in `kanban-server/index.js` (after the existing `res.setHeader` calls). This signals the proxy to disable buffering. [CITED: github.com/vitejs/vite/discussions/10851]
**Warning signs:** SSE events appear in batch after a timeout instead of appearing individually as files change.

### Pitfall 2: package.json Type Conflict (CommonJS vs ESM)
**What goes wrong:** Vite cannot import ES modules if the parent directory's `package.json` declares `"type": "commonjs"`. Import errors like `SyntaxError: Cannot use import statement in a module`.
**Why it happens:** Node.js walks up the directory tree to find the nearest `package.json` for module type. `kanban-server/package.json` sets `"type": "commonjs"`.
**How to avoid:** The `client/` directory must have its own `package.json` with `"type": "module"`. This overrides the parent for all files in `client/` and below.
**Warning signs:** `vite` or `@vitejs/plugin-react` import errors during `npm run dev`.

### Pitfall 3: @hello-pangea/dnd Missing placeholder in Droppable
**What goes wrong:** Column height collapses when dragging a card out; the drag fails visually or drops in wrong position.
**Why it happens:** `provided.placeholder` adds a spacer that maintains the column height during drag. Omitting it causes layout shifts that confuse the drop position calculation.
**How to avoid:** Always render `{provided.placeholder}` as the last child inside the Droppable container. [CITED: github.com/hello-pangea/dnd/blob/main/docs/guides/responders.md]
**Warning signs:** Column shrinks during drag; card snaps to wrong position on drop.

### Pitfall 4: SSE Race Between Optimistic Update and Server Confirmation
**What goes wrong:** User drags card; optimistic update shows it in column B. SSE event arrives from the server write (triggered by `fs.writeFileSync`) and processes the card's old status, moving it back to column A.
**Why it happens:** `chokidar` fires a `change` event almost immediately after `fs.writeFileSync`. The SSE event arrives while the PATCH response is still in-flight.
**How to avoid:** The `SSE_UPDATE` action in the reducer should overwrite state from the server (server is canonical). Because the PATCH endpoint writes `status: newStatus`, the SSE event will confirm the move to column B, not revert it. Only a PATCH failure triggers `DRAG_REVERT`. This is the correct behavior — no special handling needed beyond what Pattern 4 shows.
**Warning signs:** Cards appear to flicker between columns on drag.

### Pitfall 5: CORS Missing PATCH Method
**What goes wrong:** Browser's OPTIONS preflight for `PATCH /tasks/:id/status` returns a CORS error; the drag-and-drop writes silently fail.
**Why it happens:** The current CORS middleware in `kanban-server/index.js` line 126 only allows `GET, POST, OPTIONS`. PATCH is not listed.
**How to avoid:** D-06 is locked: update `Access-Control-Allow-Methods` to include `PATCH`. This is a single-line change in `index.js`.
**Warning signs:** Browser console shows `CORS policy: Method PATCH is not allowed by Access-Control-Allow-Methods`.

### Pitfall 6: Vite Build outDir Relative Path
**What goes wrong:** `outDir: '../public'` in `vite.config.js` works during build but Vite warns "outDir is not inside project root" and may refuse to empty the directory.
**Why it happens:** By default, Vite only empties `outDir` if it's inside the project root. `../public` is outside `client/`.
**How to avoid:** Set `build: { outDir: '../public', emptyOutDir: true }` — the `emptyOutDir: true` flag explicitly grants permission to empty a directory outside project root. [CITED: https://vite.dev/config/build-options#build-emptyoutdir]
**Warning signs:** `vite build` warns and does not clean stale assets from `public/`.

### Pitfall 7: task-state-guard.js Does Not Fire for Server Writes
**What goes wrong:** The PATCH endpoint writes the task file via `fs.writeFileSync`. The developer assumes the hook will validate the status transition, but it does not — hooks only intercept Claude's Write/Edit tool calls.
**Why it happens:** `task-state-guard.js` is a Claude Code PreToolUse hook, not a filesystem inotify watcher. Direct Node.js fs calls bypass it entirely.
**How to avoid:** The PATCH endpoint must perform its own status validation (check against `VALID_STATUSES` Set) before writing. Pattern 5 above shows this. [ASSUMED — confirmed by reading .claude/hooks/task-state-guard.js source]
**Warning signs:** Invalid status values like `"maybeNext"` written to task files without rejection.

---

## Code Examples

### SSE Initial Snapshot Handling

The server sends `task-updated` events for all existing tasks on connect (D-13 from Phase 5). The React client must handle these identically to live update events — no special `snapshot` event type exists.

```javascript
// kanban-server/index.js GET /events (existing, verified by reading source)
// On connect: emits task-updated for each existing task file
// On file change: emits task-updated with full task object
// On file delete: emits task-updated with { id, deleted: true }
```

### SSE Event Payload Shape (from existing server)

```javascript
// Verified by reading kanban-server/index.js pushEvent() and loadAllTasks()
// Full task object from parseTaskFile() — all frontmatter fields:
{
  id: "TASK-001",
  title: "...",
  status: "inProgress",        // one of 7 valid values (including stopped)
  priority: "high",
  repo: "be",                  // "be" | "fe" (not "both" — prohibited by schema)
  epic: "pipeline-integration",
  complexity: 5,               // integer 1-10
  "created-at": "2026-05-20T...",
  "updated-at": "2026-05-26T...",
  // On delete only:
  deleted: true
}
```

### Tailwind v4 CSS Import

```css
/* kanban-server/client/src/index.css */
/* Source: https://tailwindcss.com/docs/installation/using-vite (verified 2026-05-26) */
@import "tailwindcss";
```

No `tailwind.config.js`, no `postcss.config.js` — the `@tailwindcss/vite` plugin handles everything.

### Column Display Names

Claude's discretion — recommended mapping:

| Status value | Display label |
|---|---|
| readyForDevelop | Ready |
| inProgress | In Progress |
| inReview | In Review |
| inTesting | Testing |
| forTeamLeadCheck | TL Check |
| done | Done |

### Repo Badge Colors (Claude's discretion)

| repo value | Recommended color |
|---|---|
| be | Blue (`bg-blue-100 text-blue-700`) |
| fe | Purple (`bg-purple-100 text-purple-700`) |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind v3 + tailwind.config.js + postcss.config.js | Tailwind v4 + @tailwindcss/vite plugin, CSS-first config | v4 released Jan 2025 | No config files needed; `@import "tailwindcss"` replaces `@tailwind base/components/utilities` |
| react-beautiful-dnd | @hello-pangea/dnd | 2022 (rbd archived) | Drop-in replacement; same API; supports React 18/19; actively maintained |
| Vite `vitejs.dev` docs domain | `vite.dev` | ~2024 | Old domain redirects; use vite.dev |

**Deprecated/outdated:**
- `react-beautiful-dnd`: Archived by Atlassian, unmaintained. Use `@hello-pangea/dnd` instead (locked by D-07).
- `tailwind.config.js + postcss.config.js` for Tailwind v4: Replaced by CSS-first config and `@tailwindcss/vite` plugin.
- `@tailwind base; @tailwind components; @tailwind utilities;` directives: Replaced by single `@import "tailwindcss"` in v4.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `useReducer` is the better choice over `useState` for board state with SSE + optimistic updates | Architecture Patterns (Pattern 4) | Low — either works; `useState` would require more coordination between multiple state values but is viable |
| A2 | task-state-guard.js PreToolUse hook does not fire for `fs.writeFileSync` calls from kanban-server | Pitfall 7, Pattern 5 | Medium — if hook DID fire, validation would be doubled (harmless) but the endpoint code is still correct |
| A3 | The `stopped` status should be excluded from valid drag-drop targets in the UI (user cannot manually drag to `stopped`) | Architecture Patterns | Low — `stopped` is a terminal status set only by the stop endpoint; dragging to it would bypass the stop-and-commit logic |
| A4 | `chokidar` awaitWriteFinish (200ms) in index.js means SSE events from PATCH writes arrive ~200ms after the write | Pitfall 4 | Low — timing detail; optimistic update still shows immediately |

**If this table is empty:** Table is not empty — see entries above.

---

## Open Questions (RESOLVED)

1. **Should `stopped` be a valid drag-drop target?** (RESOLVED: No)
   - What we know: `stopped` is in `VALID_STATUSES` from task-schema.yaml; the stop endpoint (POST /tasks/:id/stop) performs a git commit that drag-drop would not.
   - What's unclear: D-09 says "All six status values are valid drop targets" but does not mention `stopped`. Six status values maps to: readyForDevelop, inProgress, inReview, inTesting, forTeamLeadCheck, done.
   - Resolution: Exclude `stopped` from drag-drop targets. D-09's "six status values" aligns with the six pipeline columns. `stopped` is a seventh value requiring the stop-and-commit flow. Plan 06-01 builds VALID_STATUSES from COLUMN_ORDER (6 values), which excludes `stopped`. The PATCH endpoint rejects `stopped` because it's not in COLUMN_ORDER.

2. **npm workspaces vs. separate package.json for client?** (RESOLVED: `--prefix client` scripts)
   - What we know: D-04 says "Run `npm run dev` inside `kanban-server/`". The current `kanban-server/package.json` has no workspace config.
   - What's unclear: Whether to use npm workspaces to make `npm run dev` work from `kanban-server/` root, or use `--prefix client` in a script.
   - Resolution: Plan 06-01 adds `"dev:client": "npm --prefix client install && npm --prefix client run dev"` and `"build:client": "npm --prefix client run build"` to `kanban-server/package.json`. No workspaces needed — simpler, no `package.json` `workspaces` field required.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vite, React build | ✓ | v22.18.0 | — |
| npm | Package installation | ✓ | 10.9.3 | — |
| Vite (to be installed) | Dev server + build | N/A (not yet installed) | 8.0.14 target | — |
| Express (in kanban-server) | API + static serving | ✓ | 5.2.1 (installed) | — |

**Node.js v22.18.0** satisfies the `^20.19.0 || >=22.12.0` engine requirement for Vite 8.x and @vitejs/plugin-react 6.x. [VERIFIED: npm registry]

**Missing dependencies with no fallback:** Vite and client deps are not yet installed (expected — this is the install phase).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — Phase 6 is a UI/browser phase; automated browser tests are out of scope for MVP |
| Config file | none |
| Quick run command | Manual: `open http://localhost:5173` (dev) or `open http://localhost:6111` (prod) |
| Full suite command | Manual verification against success criteria |

**Rationale for manual-only validation:** Phase 6 is a browser UI. Setting up Playwright or Vitest + jsdom testing infrastructure is a v2 concern. The success criteria (SC-1 through SC-4 in ROADMAP.md) are observable in the browser in under 2 minutes. Nyquist validation is satisfied via structured manual checklist rather than automated tests.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| KANBAN-01 | Six columns visible at 1440px | manual-smoke | — | Open board, verify all 6 column headers visible without scroll |
| KANBAN-02 | SSE live update — card moves on file change | manual-smoke | — | Edit a task file's status; verify card moves within 1 second |
| KANBAN-03 | Card shows title, complexity, repo, epic | manual-smoke | — | Inspect a card; verify all 4 fields visible |
| KANBAN-04 | Drag card between columns → task file updated | manual-smoke | — | Drag card; verify task file frontmatter `status:` field updated |
| KANBAN-04 (error) | PATCH failure reverts card | manual-smoke | — | Stop kanban-server mid-drag (or test with invalid mock); verify card returns to original column |
| D-06 | CORS allows PATCH | manual-smoke | `curl -X OPTIONS http://localhost:6111/tasks/TASK-001/status -H "Access-Control-Request-Method: PATCH" -v` | Verify response includes PATCH in Allow-Methods |
| D-05 | PATCH rejects invalid status | manual-smoke | `curl -X PATCH http://localhost:6111/tasks/TASK-001/status -H "Content-Type: application/json" -d '{"status":"notValid"}' -v` | Verify 400 response |

### Sampling Rate

- **Per plan completion:** Manual smoke test of the implemented component (open browser, verify primary flow)
- **Phase gate:** Full manual checklist against all SC-1 through SC-4 before marking Phase 6 complete

### Wave 0 Gaps

- [ ] `kanban-server/client/` directory and `package.json` — does not exist yet; Wave 1 creates it
- [ ] `kanban-server/public/` directory — generated by `npm run build`; `.gitignore` entry needed
- No test framework install required — manual validation only for Phase 6 MVP

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth — local dev tool |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | Local tool, single user |
| V5 Input Validation | yes | PATCH endpoint validates taskId (regex) + status (Set lookup) |
| V6 Cryptography | no | No sensitive data in transit |

### Known Threat Patterns for Express + browser client

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via taskId | Tampering | Existing `/^TASK-\d{3}$/` regex in stop endpoint; replicate in PATCH |
| Invalid status injection | Tampering | `VALID_STATUSES` Set check in PATCH endpoint before file write |
| CORS misconfiguration | Information Disclosure | CORS already set globally; adding PATCH to allowed methods is safe for local tool |

---

## Sources

### Primary (HIGH confidence)
- `kanban-server/index.js` (verified by reading) — parseTaskFile(), findTaskFile(), pushEvent(), SSE event payload shape, stop endpoint pattern
- `.planning/phases/06-kanban-ui/06-CONTEXT.md` — All locked decisions D-01 through D-11
- `.planning/task-schema.yaml` — Valid status values (7 total including stopped)
- `https://vite.dev/config/server-options` — server.proxy configuration options (fetched 2026-05-26)
- `https://tailwindcss.com/docs/installation/using-vite` — @tailwindcss/vite v4 setup (fetched 2026-05-26)
- npm registry (verified via `npm view` 2026-05-26) — versions for all 7 packages

### Secondary (MEDIUM confidence)
- `https://github.com/hello-pangea/dnd/blob/main/docs/guides/responders.md` — DropResult object shape (fetched 2026-05-26)
- `https://github.com/vitejs/vite/discussions/10851` — SSE buffering fix via X-Accel-Buffering: no (fetched 2026-05-26)

### Tertiary (LOW confidence / ASSUMED)
- useReducer recommendation over useState — cross-verified from react.dev docs + tkdodo.eu blog; not a single authoritative source
- SSE reconnect pattern — verified against MDN EventSource API description; implementation is [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified on npm registry; versions current as of 2026-05-26
- Architecture: HIGH — based on locked decisions (D-01 through D-11) and existing server code read
- Tailwind v4 setup: HIGH — fetched from official tailwindcss.com docs
- SSE buffering fix: MEDIUM — sourced from Vite GitHub discussion, not official docs
- Pitfalls: HIGH — derived from reading existing code and official docs

**Research date:** 2026-05-26
**Valid until:** 2026-06-25 (30 days — stable stack, no fast-moving changes expected)
