# Phase 6: Kanban UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Phase:** 6-Kanban-UI
**Areas discussed:** App structure, Drag-and-drop library, Styling approach

---

## App structure

### Q1: Where does the Kanban UI live and how do you start it?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate `kanban-ui/` dir | Vite dev server on port 5173, kanban-server on 6111. Two processes. CORS already wired. | |
| Single process — Express serves built UI | Vite builds to `kanban-server/public/`, Express serves static files. One start command. | ✓ |
| kanban-server serves UI via Vite middleware | Use vite as middleware in Express. One process with HMR. More complex. | |

**User's choice:** Single process — Express serves built UI

---

### Q2: Where does the Kanban UI source code live?

| Option | Description | Selected |
|--------|-------------|----------|
| `kanban-ui/` at workspace root | Source separate from server, builds into `kanban-server/public/`. | |
| Inside `kanban-server/client/` | Source inside kanban-server directory, builds to `kanban-server/public/`. | ✓ |

**User's choice:** Inside `kanban-server/client/`

---

### Q3: During development, how do you want to iterate on the UI?

| Option | Description | Selected |
|--------|-------------|----------|
| npm run build + restart | Simple rebuild when UI changes. No HMR. | |
| Vite proxy mode for HMR | Vite dev server with HMR proxying API calls to Express. | ✓ |
| You decide | Claude picks approach. | |

**User's choice:** Vite proxy mode for HMR

---

## Drag-and-drop library

### Q1: Which drag-and-drop library for moving cards between columns?

| Option | Description | Selected |
|--------|-------------|----------|
| @hello-pangea/dnd | Maintained fork of react-beautiful-dnd. Ergonomic API. ~50KB gzip. | ✓ |
| @dnd-kit/core | Modern, accessible, modular. More verbose setup. ~30KB core. | |
| HTML5 native drag-and-drop | Zero deps, but no touch support, no animation. | |

**User's choice:** @hello-pangea/dnd

---

### Q2: When a card is dragged to a new column, how should the status write work?

| Option | Description | Selected |
|--------|-------------|----------|
| Optimistic update + server write | Card moves immediately, PATCH fires, revert on failure. | ✓ |
| Server-first update | Wait for PATCH success before showing card in new column. | |
| You decide | Claude picks update strategy. | |

**User's choice:** Optimistic update + server write

---

## Styling approach

### Q1: How should the Kanban UI be styled?

| Option | Description | Selected |
|--------|-------------|----------|
| Tailwind CSS | Utility classes, Vite integration, fast to build board UI. | ✓ |
| Plain CSS / CSS modules | No extra dep, write layout from scratch. | |
| Inline styles | Zero setup, gets messy quickly. | |

**User's choice:** Tailwind CSS

---

### Q2: What visual density should the board have?

| Option | Description | Selected |
|--------|-------------|----------|
| Compact dev tool | Dense cards, all 6 columns visible at 1440px. | ✓ |
| Comfortable readable | More padding, may require horizontal scroll. | |
| You decide | Claude picks based on dev tool context. | |

**User's choice:** Compact dev tool

---

## Claude's Discretion

- Column header label formatting (readable labels vs exact status keys)
- Card badge colors for repo label (FE/BE/both)
- SSE auto-reconnect logic on EventSource error
- Error state display when kanban-server is unreachable
- Vite config file structure and proxy configuration details
- React state management approach (useState vs useReducer) for board state

## Deferred Ideas

None — discussion stayed within phase scope.
