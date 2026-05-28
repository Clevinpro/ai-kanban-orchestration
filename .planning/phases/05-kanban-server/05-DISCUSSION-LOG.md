# Phase 5: Kanban Server - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Phase:** 5-kanban-server
**Areas discussed:** Stop signal mechanism, Commit scope, Server scaffolding, SSE event payload

---

## Stop Signal Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Sentinel file | Server writes .planning/work/<epic>/TASK-XXX.stop; execute.md polls for it at each stage gate | |
| Status write to task file | Server writes status: stopped to task frontmatter; reuses task-state-guard.js infrastructure | ✓ |
| Fire-and-forget | No signal — server commits dirty files, in-flight agent finishes naturally | |

**User's choice:** Status write to task file

**Follow-up 1 — Which statuses can transition to stopped?**

| Option | Description | Selected |
|--------|-------------|----------|
| Any active status → stopped | inProgress, inReview, inTesting, forTeamLeadCheck can all be stopped | ✓ |
| inProgress only | Simpler guard, but can't stop mid-QA or mid-review | |

**User's choice:** Any active status → stopped

**Follow-up 2 — What does execute.md do on detecting stopped?**

| Option | Description | Selected |
|--------|-------------|----------|
| Abort silently | Exit pipeline, leave status as stopped | |
| Log a receipt + exit | Append [pipeline] STOPPED receipt to task file body before exiting | ✓ |

**User's choice:** Log a receipt + exit

---

## Commit Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Use task repo: field | be → ai-platform/, fe → ai-platform-fe/ | ✓ |
| Commit all dirty repos | Run git status in both sub-repos, commit whichever has changes | |

**User's choice:** Use task repo: field

**Follow-up 1 — Branch name pattern?**

| Option | Description | Selected |
|--------|-------------|----------|
| task/<TASK-ID>/stopped | Simple, predictable | ✓ |
| task/<TASK-ID>/stopped-<timestamp> | Unique per stop event, useful for multiple stops | |
| stopped/<TASK-ID> | Namespace-first grouping | |

**User's choice:** task/<TASK-ID>/stopped

**Follow-up 2 — Commit message?**

| Option | Description | Selected |
|--------|-------------|----------|
| wip(<TASK-ID>): stopped mid-pipeline | Conventional commit style, clear WIP | ✓ |
| chore: stop-and-commit TASK-ID | Simpler, less structured | |
| You decide | Claude picks | |

**User's choice:** wip(<TASK-ID>): stopped mid-pipeline

---

## Server Scaffolding

| Option | Description | Selected |
|--------|-------------|----------|
| Plain JS | No build step; satisfies SC-1; consistent with existing hooks | ✓ |
| TypeScript with tsx | Direct run with tsx, type safety, adds tsx dev dependency | |

**User's choice:** Plain JS

**Follow-up 1 — Start command?**

| Option | Description | Selected |
|--------|-------------|----------|
| node kanban-server/index.js | Zero deps beyond Node.js; run from workspace root | ✓ |
| npm start from kanban-server/ | Conventional but requires cd first | |

**User's choice:** node kanban-server/index.js

**Follow-up 2 — Port?**

| Option | Description | Selected |
|--------|-------------|----------|
| 3001 | Avoids conflict with api-gateway | |
| PORT env var with fallback | Flexible for different environments | ✓ (fallback: 6111) |
| You decide | Claude picks | |

**User's choice:** PORT env var, fallback **6111**

---

## SSE Event Payload

| Option | Description | Selected |
|--------|-------------|----------|
| Full task snapshot | Entire parsed task object on every chokidar event; stateless client | ✓ |
| Minimal delta | Only changed fields; efficient but client must maintain local state | |

**User's choice:** Full task snapshot

**Follow-up 1 — Event types?**

| Option | Description | Selected |
|--------|-------------|----------|
| task-updated only | One event type for all changes (add, modify, delete) | ✓ |
| task-added / task-updated / task-removed | Three distinct types; more client control | |

**User's choice:** task-updated only

**Follow-up 2 — Initial snapshot on connect?**

| Option | Description | Selected |
|--------|-------------|----------|
| Initial snapshot of all tasks | Server immediately sends task-updated for all existing tasks on connect | ✓ |
| Nothing — client fetches via GET /tasks | Two separate calls; clean separation | |

**User's choice:** Initial snapshot of all tasks

---

## Claude's Discretion

- Exact chokidar watch options and debounce timing (must meet SC-2: ≤1 second)
- SSE heartbeat interval and reconnect handling
- Express route structure (GET /events, POST /tasks/:id/stop, etc.)
- Error handling for malformed YAML task files
- kanban-server/package.json structure and dependency versions

## Deferred Ideas

None — discussion stayed within phase scope.
