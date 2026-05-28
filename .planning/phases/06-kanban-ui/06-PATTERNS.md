# Phase 6: Kanban UI - Pattern Map

**Mapped:** 2026-05-26
**Files analyzed:** 13 (11 new, 2 modified)
**Analogs found:** 9 / 13

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `kanban-server/client/package.json` | config | — | `kanban-server/package.json` | role-match (same dir, different type) |
| `kanban-server/client/vite.config.js` | config | request-response | RESEARCH.md Pattern 1 | no codebase analog |
| `kanban-server/client/index.html` | config | — | `ai-platform-fe/apps/chat/src/index.html` | exact |
| `kanban-server/client/src/main.jsx` | component | request-response | `ai-platform-fe/apps/chat/src/main.tsx` | role-match |
| `kanban-server/client/src/App.jsx` | component | event-driven (SSE) | `ai-platform-fe/apps/shell/src/bootstrap.tsx` | partial |
| `kanban-server/client/src/components/Board.jsx` | component | event-driven | RESEARCH.md Pattern 3 | no codebase analog |
| `kanban-server/client/src/components/Column.jsx` | component | event-driven | RESEARCH.md Pattern 3 | no codebase analog |
| `kanban-server/client/src/components/TaskCard.jsx` | component | request-response | `ai-platform-fe/apps/auth/src/components/GuestRoute.tsx` | partial |
| `kanban-server/client/src/index.css` | config | — | `ai-platform-fe/apps/chat/src/styles.css` | partial |
| `kanban-server/index.js` (modified) | service | CRUD + event-driven | `kanban-server/index.js` itself (existing stop endpoint) | exact |
| `kanban-server/package.json` (modified) | config | — | `kanban-server/package.json` itself | exact |

---

## Pattern Assignments

### `kanban-server/client/package.json` (config)

**Analog:** `kanban-server/package.json` (lines 1-13) — parent config to diverge from

**Key constraint:** Must declare `"type": "module"` to override the parent's `"type": "commonjs"`. Without this, Vite ESM imports fail with `SyntaxError: Cannot use import statement in a module`.

**Parent package.json pattern** (`kanban-server/package.json` lines 1-13):
```json
{
  "name": "kanban-server",
  "version": "1.0.0",
  "type": "commonjs",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "5.2.1",
    "chokidar": "3.6.0",
    "js-yaml": "4.1.1"
  }
}
```

**Client pattern to produce** (from RESEARCH.md Pattern 7):
```json
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

---

### `kanban-server/client/vite.config.js` (config, request-response)

**Analog:** No codebase analog — only `node_modules` vite configs exist. Use RESEARCH.md Pattern 1 directly.

**Vite config pattern** (from RESEARCH.md Pattern 1):
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../public',   // D-02: output to kanban-server/public/
    emptyOutDir: true,     // required — outDir is outside project root (Pitfall 6)
  },
  server: {
    port: 5173,            // D-04
    proxy: {
      '/events': {
        target: 'http://localhost:6111',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Connection', 'keep-alive');
          });
        },
      },
      '/tasks': { target: 'http://localhost:6111', changeOrigin: true },
      '/health': { target: 'http://localhost:6111', changeOrigin: true },
    },
  },
});
```

**Critical:** `emptyOutDir: true` is required because `../public` is outside `client/` root. `changeOrigin: true` is required on all proxy entries or browser sends `Host: localhost:5173` which the Express server may reject.

---

### `kanban-server/client/index.html` (config)

**Analog:** `ai-platform-fe/apps/chat/src/index.html` (lines 1-14) — exact structural match for a Vite SPA entry HTML.

**Pattern to copy** (`ai-platform-fe/apps/chat/src/index.html` lines 1-14):
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Chat</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/x-icon" href="favicon.ico" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

**Adaptation required:** Change `<title>Chat</title>` to `<title>Kanban</title>`. Add `<script type="module" src="/src/main.jsx"></script>` before `</body>` — the FE analog uses an Nx-managed entry, but the standalone Vite app requires the explicit module script tag.

---

### `kanban-server/client/src/main.jsx` (component, request-response)

**Analog:** `ai-platform-fe/apps/chat/src/main.tsx` (lines 1-20) — same role: React entry point that mounts the root component.

**Pattern to copy** (`ai-platform-fe/apps/chat/src/main.tsx` lines 1-20):
```typescript
import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
// ... providers ...
import './styles.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <StrictMode>
    {/* providers wrap root component */}
  </StrictMode>,
);
```

**Adaptation:** Use JSX (not TSX), no TypeScript cast. No QueryClientProvider or RouterProvider — the Kanban app has no router. Import `./index.css` (not `./styles.css`). Mount `<App />` directly:
```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

---

### `kanban-server/client/src/App.jsx` (component, event-driven)

**Analog:** `ai-platform-fe/apps/shell/src/bootstrap.tsx` (lines 1-17) — closest for root component structure. However, no codebase analog uses `useReducer` with SSE — use RESEARCH.md Patterns 2 and 4.

**Bootstrap pattern reference** (`ai-platform-fe/apps/shell/src/bootstrap.tsx` lines 1-17):
```typescript
import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { queryClient } from '@libs/store';
import { router } from './router';
import './styles.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
```

**Core pattern for App.jsx** — `useReducer` + SSE hook (from RESEARCH.md Pattern 4):
```javascript
const COLUMN_ORDER = [
  'readyForDevelop', 'inProgress', 'inReview',
  'inTesting', 'forTeamLeadCheck', 'done'
];

const initialState = Object.fromEntries(COLUMN_ORDER.map(col => [col, []]));

function boardReducer(state, action) {
  switch (action.type) {
    case 'SSE_UPDATE': {
      const { task } = action;
      if (task.deleted) {
        const next = { ...state };
        for (const col of COLUMN_ORDER) {
          next[col] = next[col].filter((t) => t.id !== task.id);
        }
        return next;
      }
      const next = { ...state };
      for (const col of COLUMN_ORDER) {
        next[col] = next[col].filter((t) => t.id !== task.id);
      }
      if (COLUMN_ORDER.includes(task.status)) {
        next[task.status] = [...(next[task.status] || []), task];
      }
      return next;
    }
    case 'DRAG_OPTIMISTIC': {
      const { taskId, newStatus } = action;
      const next = { ...state };
      let movedTask = null;
      for (const col of COLUMN_ORDER) {
        const found = next[col].find((t) => t.id === taskId);
        if (found) movedTask = found;
        next[col] = next[col].filter((t) => t.id !== taskId);
      }
      if (movedTask) {
        next[newStatus] = [...next[newStatus], { ...movedTask, status: newStatus }];
      }
      return next;
    }
    case 'DRAG_REVERT': {
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

**SSE reconnect hook pattern** (from RESEARCH.md Pattern 2):
```javascript
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

**Note on `dispatch` stability:** `useReducer`'s `dispatch` is referentially stable across renders, so it is safe to include in the `useEffect` dependency array without triggering reconnects.

---

### `kanban-server/client/src/components/Board.jsx` (component, event-driven)

**Analog:** No codebase analog for @hello-pangea/dnd. Use RESEARCH.md Pattern 3 directly.

**DragDropContext pattern** (from RESEARCH.md Pattern 3):
```jsx
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

// droppableId IS the status string — D-09
function Board({ columns, dispatch }) {
  function handleDragEnd(result) {
    const { draggableId, source, destination, reason } = result;
    if (!destination || reason === 'CANCEL') return;
    if (destination.droppableId === source.droppableId) return;

    const newStatus = destination.droppableId;
    const originalStatus = source.droppableId;

    // D-08: optimistic update first
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
      {/* six columns rendered here */}
    </DragDropContext>
  );
}
```

**Column order constant** (from task-schema.yaml and CONTEXT.md D-09):
```javascript
const COLUMN_ORDER = [
  'readyForDevelop', 'inProgress', 'inReview',
  'inTesting', 'forTeamLeadCheck', 'done'
];

const COLUMN_LABELS = {
  readyForDevelop:    'Ready',
  inProgress:         'In Progress',
  inReview:           'In Review',
  inTesting:          'Testing',
  forTeamLeadCheck:   'TL Check',
  done:               'Done',
};
```

---

### `kanban-server/client/src/components/Column.jsx` (component, event-driven)

**Analog:** No codebase analog. Use @hello-pangea/dnd Droppable pattern from RESEARCH.md Pattern 3.

**Droppable pattern** (from RESEARCH.md Pattern 3):
```jsx
import { Droppable } from '@hello-pangea/dnd';

function Column({ status, label, tasks }) {
  return (
    <Droppable droppableId={status}>
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className="flex-1 min-w-0 bg-gray-100 rounded p-1"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1 px-1">
            {label} <span className="text-gray-400">{tasks.length}</span>
          </h2>
          {tasks.map((task, index) => (
            <TaskCard key={task.id} task={task} index={index} />
          ))}
          {provided.placeholder}  {/* REQUIRED — Pitfall 3 in RESEARCH.md */}
        </div>
      )}
    </Droppable>
  );
}
```

**Critical:** `{provided.placeholder}` must be rendered as the last child inside the Droppable container. Omitting it causes layout shifts and incorrect drop position calculations (Pitfall 3, RESEARCH.md line 570).

---

### `kanban-server/client/src/components/TaskCard.jsx` (component, request-response)

**Analog:** `ai-platform-fe/apps/auth/src/components/GuestRoute.tsx` — closest existing single-purpose component, but structurally simple. The task card pattern is primarily from the SSE payload shape in RESEARCH.md.

**SSE task payload shape** (from RESEARCH.md Code Examples, confirmed by `kanban-server/index.js` `pushEvent()` line 109):
```javascript
// Fields available on every task object received via SSE:
{
  id: "TASK-001",          // string — used as Draggable draggableId
  title: "...",             // string — primary display text
  status: "inProgress",    // enum — determines which column
  priority: "high",        // enum: low|medium|high|critical
  repo: "be",              // enum: "be"|"fe" — badge color
  epic: "pipeline-integration",  // string — display on card
  complexity: 5,           // integer 1-10
  "created-at": "...",
  "updated-at": "...",
  deleted: true            // only present on delete events
}
```

**Draggable card pattern** (from RESEARCH.md Pattern 3):
```jsx
import { Draggable } from '@hello-pangea/dnd';

function TaskCard({ task, index }) {
  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className="bg-white rounded shadow-sm p-1.5 mb-1 text-xs"
        >
          <div className="font-medium text-gray-800 truncate">{task.title}</div>
          <div className="flex gap-1 mt-0.5 items-center">
            <span className={`px-1 rounded text-[10px] font-medium ${repoBadge(task.repo)}`}>
              {task.repo.toUpperCase()}
            </span>
            <span className="text-gray-400 truncate">{task.epic}</span>
            <span className="ml-auto text-gray-400">{task.complexity}</span>
          </div>
        </div>
      )}
    </Draggable>
  );
}
```

**Repo badge colors** (from RESEARCH.md Code Examples):
```javascript
function repoBadge(repo) {
  return repo === 'be'
    ? 'bg-blue-100 text-blue-700'
    : 'bg-purple-100 text-purple-700';
}
```

---

### `kanban-server/client/src/index.css` (config)

**Analog:** `ai-platform-fe/apps/chat/src/styles.css` — nearest CSS entry point in the codebase (line 1 is a comment only; Tailwind v3 not present here). The actual pattern comes from RESEARCH.md + official Tailwind v4 docs.

**Tailwind v4 CSS import pattern** (from RESEARCH.md Code Examples):
```css
@import "tailwindcss";
```

**No `tailwind.config.js` or `postcss.config.js` needed.** The `@tailwindcss/vite` plugin declared in `vite.config.js` handles all Tailwind processing. `@import "tailwindcss"` replaces the v3 directives (`@tailwind base; @tailwind components; @tailwind utilities;`).

---

### `kanban-server/index.js` — PATCH endpoint + CORS + static + SSE header (modified)

**Analog:** `kanban-server/index.js` itself — the existing `POST /tasks/:id/stop` endpoint (lines 165-252) is the direct pattern to replicate.

**CORS modification** (existing lines 124-130 — add `PATCH`):
```javascript
// Current (line 126):
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

// Modified (D-06):
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
```

**X-Accel-Buffering header addition** (existing lines 138-143 — add one header):
```javascript
// Current GET /events handler headers:
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.setHeader('Access-Control-Allow-Origin', '*');

// Add (Pitfall 1 fix — SSE buffering through Vite proxy):
res.setHeader('X-Accel-Buffering', 'no');
res.flushHeaders();
```

**VALID_STATUSES constant** (new — derives from task-schema.yaml lines 21-22):
```javascript
// task-schema.yaml status.values = [readyForDevelop, inProgress, inReview,
//                                    inTesting, forTeamLeadCheck, done, stopped]
// D-09: drag-drop targets are only the 6 pipeline columns; 'stopped' excluded from UI
// but PATCH endpoint permits it so the stop endpoint is consistent.
const VALID_STATUSES = new Set([
  'readyForDevelop', 'inProgress', 'inReview',
  'inTesting', 'forTeamLeadCheck', 'done'
  // 'stopped' intentionally excluded — set only via POST /tasks/:id/stop
]);
```

**PATCH endpoint pattern** (modeled directly on `POST /tasks/:id/stop`, lines 165-252):
```javascript
app.patch('/tasks/:id/status', (req, res) => {
  try {
    const taskId = req.params.id;

    // Same validation as stop endpoint (lines 170-172):
    if (!/^TASK-\d{3}$/.test(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID format. Expected TASK-NNN.' });
    }

    const { status } = req.body;
    if (!status || !VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid status: ' + status });
    }

    // Same findTaskFile pattern (lines 175-179):
    const found = findTaskFile(taskId);
    if (!found) return res.status(404).json({ error: 'Task not found: ' + taskId });

    // Same regex-replace write pattern (lines 194-197):
    const now = new Date().toISOString();
    let content = fs.readFileSync(found, 'utf8');
    content = content.replace(/^status:\s*\S+/m, 'status: ' + status);
    content = content.replace(/^updated-at:\s*.+/m, 'updated-at: ' + now);
    fs.writeFileSync(found, content, 'utf8');

    // Return updated task (matches stop endpoint response pattern):
    const task = parseTaskFile(found);
    return res.json({ ok: true, task });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
```

**Express static + SPA fallback** (new addition, must come AFTER all API routes, from RESEARCH.md Pattern 6):
```javascript
// Serve Vite build output (D-02, D-03) — add before app.listen()
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback — must be LAST route
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'UI not built. Run: npm run build --prefix client' });
  }
});
```

**Route ordering constraint:** Express processes routes in registration order. The static middleware and catch-all `app.get('*', ...)` MUST come after all API route registrations (`/health`, `/events`, `/tasks/:id/stop`, `/tasks/:id/status`), or API routes will be shadowed by the static file handler.

---

### `kanban-server/package.json` (modified)

**Analog:** `kanban-server/package.json` itself (lines 1-13) — add dev/build/preview scripts.

**Current scripts block** (line 5-7):
```json
"scripts": {
  "start": "node index.js"
}
```

**Modified scripts block** (from RESEARCH.md Open Question 2 recommendation):
```json
"scripts": {
  "start": "node index.js",
  "dev":   "npm run dev --prefix client",
  "build": "npm run build --prefix client",
  "preview": "npm run preview --prefix client"
}
```

`--prefix client` makes npm run the script inside `kanban-server/client/` without requiring `cd`. This is simpler than npm workspaces and satisfies D-04 ("Run `npm run dev` inside `kanban-server/`").

---

## Shared Patterns

### Frontmatter Read-Modify-Write
**Source:** `kanban-server/index.js` lines 194-197 (inside `POST /tasks/:id/stop`)
**Apply to:** `PATCH /tasks/:id/status` endpoint
```javascript
const now = new Date().toISOString();
let content = fs.readFileSync(found, 'utf8');
content = content.replace(/^status:\s*\S+/m, 'status: ' + status);
content = content.replace(/^updated-at:\s*.+/m, 'updated-at: ' + now);
fs.writeFileSync(found, content, 'utf8');
```
The `^` anchor + `/m` multiline flag is critical — prevents replacing a `status` word embedded in the task body text. The same pattern must be replicated exactly in the PATCH endpoint.

### Task ID Validation
**Source:** `kanban-server/index.js` lines 170-172
**Apply to:** `PATCH /tasks/:id/status` endpoint
```javascript
if (!/^TASK-\d{3}$/.test(taskId)) {
  return res.status(400).json({ error: 'Invalid task ID format. Expected TASK-NNN.' });
}
```
Prevents path traversal. Must appear as the first check before any file I/O.

### Error Response Shape
**Source:** `kanban-server/index.js` — used consistently across all endpoints
**Apply to:** `PATCH /tasks/:id/status` endpoint
```javascript
// All error responses: { error: string }
// All success responses: { ok: true, ... }
return res.status(400).json({ error: 'message here' });
return res.json({ ok: true, task });
```

### React Entry Point Mount
**Source:** `ai-platform-fe/apps/chat/src/main.tsx` lines 10-11
**Apply to:** `kanban-server/client/src/main.jsx`
```javascript
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<StrictMode><App /></StrictMode>);
```
Use `createRoot` (React 18+ API), not the legacy `ReactDOM.render`. Always wrap in `<StrictMode>`.

### SSE Initial Snapshot Handling
**Source:** `kanban-server/index.js` lines 145-149 (GET /events handler)
**Apply to:** `useSSE` hook in `kanban-server/client/src/App.jsx`

The server sends `task-updated` events for ALL existing tasks on initial connect (not a separate snapshot event type). The browser-side `task-updated` event handler in `useSSE` handles both initial load and live updates identically — there is no special `snapshot` event to distinguish.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `kanban-server/client/vite.config.js` | config | request-response | No vite.config files in codebase (FE uses Nx/webpack); only node_modules copies exist |
| `kanban-server/client/src/components/Board.jsx` | component | event-driven | No @hello-pangea/dnd usage anywhere in codebase |
| `kanban-server/client/src/components/Column.jsx` | component | event-driven | No Droppable/Draggable components in codebase |

These three files should be built directly from RESEARCH.md Patterns 1, 3, and 4.

---

## Metadata

**Analog search scope:** `kanban-server/`, `ai-platform-fe/apps/`, `ai-platform-fe/libs/`
**Files scanned:** 14 source files read; 4 bash searches
**Pattern extraction date:** 2026-05-26
