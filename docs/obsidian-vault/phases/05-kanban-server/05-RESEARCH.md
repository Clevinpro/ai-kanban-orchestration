# Phase 5: Kanban Server - Research

**Researched:** 2026-05-26
**Domain:** Node.js/Express SSE server, chokidar file watcher, git sub-repo operations
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Stop signal = write `status: stopped` to task frontmatter. Uses the existing `task-state-guard.js` hook infrastructure.
- **D-02:** `task-state-guard.js` must allow `stopped` as a valid destination from any active status: `inProgress`, `inReview`, `inTesting`, `forTeamLeadCheck`. Not from `readyForDevelop` or `done`.
- **D-03:** `execute.md` checks for `status: stopped` at each stage gate (before spawning the next agent). When detected, append `[pipeline] STOPPED` receipt to the task file body, then exit the pipeline.
- **D-04:** Use the task `repo:` field to determine which sub-repo to commit: `be` → `ai-platform/`, `fe` → `ai-platform-fe/`.
- **D-05:** Branch name pattern: `task/<TASK-ID>/stopped`.
- **D-06:** Commit message: `wip(<TASK-ID>): stopped mid-pipeline`.
- **D-07:** Plain JavaScript — no TypeScript, no build step.
- **D-08:** Directory: `kanban-server/` at workspace root.
- **D-09:** Start command: `node kanban-server/index.js` from the workspace root.
- **D-10:** Port via `PORT` env var, fallback `6111`.
- **D-11:** Full task snapshot per event — complete task object every `task-updated` event.
- **D-12:** Single event type: `task-updated`. Used for add, modify, and delete. Deleted tasks include `deleted: true`.
- **D-13:** On SSE connect, emit `task-updated` events for all existing task files as initial snapshot before live updates.

### Claude's Discretion

- Exact chokidar watch options (ignored paths, debounce/throttle timing — must satisfy SC-2: ≤1 second)
- SSE heartbeat interval and client reconnect handling
- Express route structure (e.g., `GET /events` for SSE, `POST /tasks/:id/stop` for stop-and-commit)
- Error handling when a task file has malformed YAML (skip or emit error event)
- `kanban-server/package.json` structure and exact dependency versions

### Deferred Ideas

None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KANBAN-05 | Stop task and commit — user can stop a running task and commit its current code changes to a branch (no PR created) | Stop-and-commit endpoint: write `status: stopped` to task frontmatter, run `git checkout -b task/<ID>/stopped && git add -A && git commit` in target sub-repo dir |

</phase_requirements>

---

## Summary

Phase 5 builds a standalone Express HTTP server at `kanban-server/` that does two things: (1) watches `.planning/work/**/*.md` for task file changes and streams live task state to connected clients via SSE, and (2) exposes a `POST /tasks/:id/stop` endpoint that writes `status: stopped` to the task frontmatter and commits current dirty changes in the relevant sub-repo to a new branch.

The server is entirely self-contained plain CommonJS JavaScript — no TypeScript, no Nx involvement, no build step. It reads `.planning/work/` directly from the filesystem and has a private `package.json` inside `kanban-server/` listing only `express` and `chokidar@3` (the CJS-compatible version). The hook `task-state-guard.js` must be extended to allow the `stopped` status as a destination from active statuses, and `execute.md` must check for `status: stopped` at each stage gate.

**Critical constraint:** `chokidar@5` (npm `latest`) is ESM-only (`"type": "module"`). Since the server must be plain CJS JavaScript runnable with `node kanban-server/index.js` (D-07, D-09), the project must pin `chokidar@3.6.0` — the latest CJS-compatible release. Using `npm install chokidar` without a version pin would install v5 and break `require('chokidar')`.

**Primary recommendation:** Use Express 5.2.1 + chokidar 3.6.0 + js-yaml 4.1.1 (all CJS-compatible). Extend `task-state-guard.js` with `stopped` transitions as a separate, clearly delimited block. Add a `stopped` check to each stage gate in `execute.md` using a re-read pattern.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Task file watching | Server process | — | chokidar watches `.planning/work/` on the same filesystem as the task files |
| SSE event streaming | API / Backend | — | Server holds a list of active response objects; pushes on file change |
| Task state parsing | API / Backend | — | Server re-reads and parses YAML frontmatter on each file event |
| Stop signal delivery | API / Backend | Filesystem | Endpoint writes `status: stopped` to disk; pipeline reads the file |
| Git branch + commit | API / Backend | — | Server runs `git -C <repo-dir>` shell commands via `child_process` |
| Hook transition guard | Filesystem hook | — | `task-state-guard.js` PreToolUse validates `stopped` transition before write lands |
| Pipeline stopped check | Pipeline orchestrator | — | `execute.md` reads task file at each stage gate and exits if `stopped` |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `express` | `5.2.1` | HTTP server, routing, middleware | Industry standard; v5 stable as of 2024; no breaking changes for this use case [VERIFIED: npm registry] |
| `chokidar` | `3.6.0` | File watching with debounce, cross-platform | v3 is CJS-compatible; v4/v5 are ESM-only — cannot use `require()` [VERIFIED: npm registry] |
| `js-yaml` | `4.1.1` | YAML frontmatter parsing | Same library pattern as `task-state-guard.js` uses conceptually; v4 is CJS [VERIFIED: npm registry] |

**Version constraint warning:** `chokidar` latest on npm is `5.0.0` which is `"type": "module"` (ESM-only). Installing `chokidar` without an explicit version pin installs v5, which breaks `require('chokidar')` in a plain CJS file. Pin must be `"chokidar": "3.6.0"` in `kanban-server/package.json`. [VERIFIED: npm registry — `npm view chokidar@5 type` returns `module`]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `child_process` | built-in | Run `git` shell commands | Stop-and-commit endpoint — no extra package needed |
| Node.js `fs` | built-in | Read task files synchronously | Both initial snapshot and YAML parsing |
| Node.js `path` | built-in | Path normalization | Resolving sub-repo dirs from task `repo:` field |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `chokidar@3` | Node.js `fs.watch` | `fs.watch` lacks recursive watching on Linux, no debounce; chokidar more reliable cross-platform |
| `chokidar@3` | `chokidar@5` + `.mjs` extension | Would require changing `index.js` to `index.mjs` and breaking D-09 start command |
| `express` | plain `http` module | Express saves boilerplate; no meaningful overhead for this server size |
| `js-yaml` | regex-only YAML parsing | Existing `task-state-guard.js` uses custom regex; reusing that pattern works for simple frontmatter |

**Installation:**
```bash
# From workspace root — this installs into kanban-server/node_modules only
cd kanban-server && npm install
# Or from workspace root:
npm install --prefix kanban-server
```

**Version verification (confirmed 2026-05-26):**
```bash
npm view express version          # → 5.2.1
npm view chokidar@3 version       # → 3.6.0 (latest v3; v5 is ESM-only latest)
npm view js-yaml version          # → 4.1.1
```

---

## Package Legitimacy Audit

> slopcheck was unavailable at research time. All packages verified via npm registry, official GitHub repositories, and download counts. Packages are tagged [OK-MANUAL] where evidence is strong.

| Package | Registry | Age | Downloads/wk | Source Repo | slopcheck | Disposition |
|---------|----------|-----|--------------|-------------|-----------|-------------|
| `express` | npm | ~15 yrs (2010) | 103M | github.com/expressjs/express | [OK-MANUAL] | Approved |
| `chokidar` | npm | ~14 yrs (2012) | 173M | github.com/paulmillr/chokidar | [OK-MANUAL] | Approved — **pin to `3.6.0`** |
| `js-yaml` | npm | ~15 yrs (2011) | 223M | github.com/nodeca/js-yaml | [OK-MANUAL] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none

**Packages flagged as suspicious [SUS]:** none

**Postinstall check:**
- `express` — no postinstall script [VERIFIED: npm registry]
- `chokidar` — no postinstall script [VERIFIED: npm registry]
- `js-yaml` — no postinstall script [VERIFIED: npm registry]

*slopcheck was unavailable. All packages confirmed against official GitHub repositories and download counts >100M/week. Treat as `[ASSUMED]` for strict provenance purposes — manual verification above is strong but not automated.*

---

## Architecture Patterns

### System Architecture Diagram

```
Filesystem (.planning/work/**/*.md)
          |
          | chokidar watch (add/change/unlink)
          v
  [kanban-server/index.js]
          |
          |--- parseTaskFile(filePath) ---> { id, title, status, repo, ... }
          |
          |--- SSE client registry (array of res objects)
          |         |
          |         v
          |    pushEvent(clients, taskObj)
          |    "event: task-updated\ndata: {...}\n\n"
          |
          |--- GET /events  ←── SSE client connects
          |         |
          |         └── emit initial snapshot (all tasks), then subscribe to live events
          |
          └--- POST /tasks/:id/stop  ←── user action
                    |
                    |-- read task file → get repo: field + current status
                    |-- validate status is stoppable (active, not done/readyForDevelop)
                    |-- write status: stopped to frontmatter  (triggers task-state-guard.js)
                    |-- git -C <repo-dir> checkout -b task/<TASK-ID>/stopped
                    |-- git -C <repo-dir> add -A
                    |-- git -C <repo-dir> commit -m "wip(<TASK-ID>): stopped mid-pipeline"
                    └── return JSON { ok: true, branch: "task/<ID>/stopped" }
```

### Recommended Project Structure

```
kanban-server/
├── index.js          # Express app setup, chokidar watcher, SSE registry
├── taskParser.js     # YAML frontmatter parsing (reuse task-state-guard.js pattern)
├── gitOps.js         # stop-and-commit git operations (child_process.execSync)
└── package.json      # { "express": "5.2.1", "chokidar": "3.6.0", "js-yaml": "4.1.1" }
```

Files modified outside `kanban-server/`:

```
.claude/hooks/task-state-guard.js     # Extend VALID_TRANSITIONS with stopped entries (D-02)
.claude/commands/team-lead/execute.md  # Add stopped check at each stage gate (D-03)
.planning/task-schema.yaml            # Add stopped to valid status values list
```

### Pattern 1: SSE Client Registry

**What:** Maintain an in-memory array of active response objects. On file change, iterate and write to each. Remove on client disconnect.

**When to use:** Every time a task file changes.

```javascript
// Source: [ASSUMED] — standard SSE pattern for Node.js/Express
const clients = [];

// GET /events
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Initial snapshot — emit all existing tasks
  const allTasks = loadAllTasks(); // reads .planning/work/**/*.md
  for (const task of allTasks) {
    res.write(`event: task-updated\ndata: ${JSON.stringify(task)}\n\n`);
  }

  clients.push(res);
  req.on('close', () => {
    const i = clients.indexOf(res);
    if (i !== -1) clients.splice(i, 1);
  });
});

function pushEvent(task) {
  const payload = `event: task-updated\ndata: ${JSON.stringify(task)}\n\n`;
  for (const res of clients) res.write(payload);
}
```

### Pattern 2: chokidar v3 Watcher (CJS require)

**What:** Watch `.planning/work/**/*.md` recursively with debounce. Must use v3 (CJS).

**When to use:** Server startup.

```javascript
// Source: [VERIFIED: github.com/paulmillr/chokidar README, v3]
const chokidar = require('chokidar');

const watcher = chokidar.watch('.planning/work/**/*.md', {
  persistent: true,
  ignoreInitial: true,   // initial snapshot handled separately at SSE connect
  awaitWriteFinish: {
    stabilityThreshold: 200,  // ms — wait for writes to complete
    pollInterval: 100,
  },
});

watcher
  .on('add',    filePath => handleFileChange(filePath, false))
  .on('change', filePath => handleFileChange(filePath, false))
  .on('unlink', filePath => handleFileChange(filePath, true));
```

**Note on `ignoreInitial: true`:** Use this flag so chokidar does not emit `add` events for files already present at startup. The initial snapshot is emitted directly to each SSE client on connect (D-13), not via chokidar events.

### Pattern 3: YAML Frontmatter Parsing (reuse task-state-guard.js pattern)

**What:** Parse `---\nkey: value\n---` blocks from `.md` files.

**When to use:** Both the server's initial snapshot and chokidar change events.

```javascript
// Source: [VERIFIED: existing .claude/hooks/task-state-guard.js lines 140-145]
function extractFrontmatterField(content, field) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const searchIn = fmMatch ? fmMatch[1] : content;
  const m = searchIn.match(new RegExp(`^${field}:\\s*(\\S+)`, 'm'));
  return m ? m[1] : undefined;
}

// Extended to parse full frontmatter as object using js-yaml:
const yaml = require('js-yaml');
function parseTaskFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null; // malformed — skip
  try {
    return yaml.load(fmMatch[1]);
  } catch (e) {
    return null; // malformed YAML — skip per Claude's Discretion
  }
}
```

### Pattern 4: Stop-and-Commit (git -C subdir)

**What:** Run git commands in a sub-repo directory without `cd`.

**When to use:** `POST /tasks/:id/stop` endpoint.

```javascript
// Source: [ASSUMED] — standard child_process.execSync with cwd option
const { execSync } = require('child_process');

function stopAndCommit(taskId, repoField) {
  const repoDir = repoField === 'be' ? 'ai-platform' : 'ai-platform-fe';
  const branch = `task/${taskId}/stopped`;
  const msg = `wip(${taskId}): stopped mid-pipeline`;
  // D-04, D-05, D-06
  execSync(`git checkout -b ${branch}`, { cwd: repoDir });
  execSync(`git add -A`, { cwd: repoDir });
  execSync(`git commit -m "${msg}"`, { cwd: repoDir });
  return branch;
}
```

**Note:** `execSync` throws on non-zero exit. Wrap in try/catch and return error JSON to the client.

### Pattern 5: task-state-guard.js Extension for `stopped`

**What:** Add `stopped` as a valid destination from all active statuses.

**When to use:** Extend the `VALID_TRANSITIONS` map (D-02). No annotation-presence check needed — the server is the legitimate initiator.

```javascript
// Source: [VERIFIED: existing .claude/hooks/task-state-guard.js lines 10-17]
// BEFORE:
const VALID_TRANSITIONS = {
  readyForDevelop: ['inProgress'],
  inProgress:      ['inReview', 'readyForDevelop'],
  inReview:        ['inTesting', 'inProgress'],
  inTesting:       ['forTeamLeadCheck', 'inProgress'],
  forTeamLeadCheck: ['done', 'inProgress'],
  done:            [],
};

// AFTER (add stopped to active statuses, D-02):
const VALID_TRANSITIONS = {
  readyForDevelop: ['inProgress'],
  inProgress:      ['inReview', 'readyForDevelop', 'stopped'],
  inReview:        ['inTesting', 'inProgress', 'stopped'],
  inTesting:       ['forTeamLeadCheck', 'inProgress', 'stopped'],
  forTeamLeadCheck: ['done', 'inProgress', 'stopped'],
  done:            [],
  stopped:         [],
};
```

**Note:** `readyForDevelop` and `done` intentionally excluded from `stopped` transitions per D-02.

### Pattern 6: execute.md Stage Gate Check for `stopped`

**What:** At each stage gate in `execute.md`, re-read the task file and exit if `status: stopped`.

**When to use:** Before each Agent invocation in the pipeline (D-03).

```markdown
<!-- Insert before each Agent invocation in execute.md STEP 3 -->

**Stopped check:** Before invoking the next agent, re-read the task file at `<task_path>`.
If frontmatter `status` is `stopped`:
  - Append to task file body: `[pipeline] STOPPED`
  - Print: `Pipeline stopped by user at [stage name]. Task <id> is on branch task/<id>/stopped.`
  - Stop pipeline (do not advance).
```

### Anti-Patterns to Avoid

- **Using `chokidar@5` (npm latest):** Latest tag resolves to v5, which is ESM-only. `require('chokidar')` will throw `ERR_REQUIRE_ESM`. Always pin `chokidar@3.6.0`.
- **Polling with `setInterval`:** Node.js `fs.watch` and polling do not satisfy the ≤1 second SC-2 constraint reliably on all platforms. Use chokidar.
- **Blocking the event loop in SSE handler:** Never use synchronous file I/O inside the SSE handler for live events. Parse file on chokidar event, push pre-parsed object to clients.
- **Not removing disconnected clients:** Without `req.on('close')` cleanup, the clients array leaks response objects. SSE writes to a closed connection throw uncaught errors.
- **Running `git add -A` from workspace root:** The sub-repos (`ai-platform/`, `ai-platform-fe/`) are independent git repos. Running `git add -A` from the workspace root (which has its own `.git`) would stage the wrong content. Always use `cwd: repoDir` or `git -C <repoDir>`.
- **Missing `awaitWriteFinish` in chokidar:** Without this option, chokidar may emit a `change` event while the write is still in progress, causing a partial YAML read. Use `stabilityThreshold: 200`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File system watching with debounce | Custom `setInterval` + `fs.stat` polling | `chokidar@3` | Cross-platform reliability; atomic-write detection; built-in debounce via `awaitWriteFinish` |
| YAML frontmatter parsing | Complex regex chains | `js-yaml` + frontmatter block split OR reuse `task-state-guard.js` regex pattern | YAML edge cases (multi-line, quoted values); existing pattern already proven |
| Git command execution | Custom git protocol | `child_process.execSync` with `cwd` option | Git protocol is complex; shell passthrough is standard for simple scripted operations |

**Key insight:** The SSE mechanism itself (streaming text over HTTP) is intentionally hand-rolled — it is a simple protocol requiring no library. The complexity is in file watching and YAML parsing, which have battle-tested libraries.

---

## Runtime State Inventory

> This is a new server (not a rename/refactor phase). However, it modifies existing runtime state in two files.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — server is stateless; task files are the store | None |
| Live service config | `task-state-guard.js` VALID_TRANSITIONS map — hardcoded in the hook | Code edit to add `stopped` entries (D-02) |
| Live service config | `execute.md` pipeline stage gates — currently no stopped check | Code edit to add stopped check at each gate (D-03) |
| Live service config | `task-schema.yaml` status enum — currently lists 6 statuses | Code edit to add `stopped` to valid values |
| OS-registered state | None | None |
| Secrets/env vars | `PORT` env var — new, optional, fallback 6111 (D-10) | None — no existing state to migrate |
| Build artifacts | None — no build step in this project | None |

---

## Common Pitfalls

### Pitfall 1: chokidar v5 ESM Import Error

**What goes wrong:** `require('chokidar')` throws `ERR_REQUIRE_ESM: require() of ES module node_modules/chokidar/index.js not supported` at server startup.

**Why it happens:** `npm install chokidar` without a version pin installs v5.0.0 (npm `latest` tag), which has `"type": "module"` in its package.json. Plain CJS `require()` cannot load ESM modules.

**How to avoid:** Pin `"chokidar": "3.6.0"` explicitly in `kanban-server/package.json`. Verify with `npm view chokidar dist-tags` — latest is v5 but v3 is the last CJS release.

**Warning signs:** Server exits immediately at startup; error message contains `ERR_REQUIRE_ESM`.

### Pitfall 2: Git Operations in Wrong Repository

**What goes wrong:** `git add -A && git commit` runs from the workspace root, staging workspace-level files (`.planning/`, `.claude/`) instead of sub-repo files.

**Why it happens:** The workspace root has its own `.git` directory. The sub-repos (`ai-platform/`, `ai-platform-fe/`) are separate git repositories with their own `.git` directories. Running git without specifying the sub-repo dir commits to the wrong repo.

**How to avoid:** Always use `execSync('git ...', { cwd: repoDir })` where `repoDir` is the absolute or relative path to `ai-platform/` or `ai-platform-fe/`. Verify `repoDir` exists and is a git repo before running commit.

**Warning signs:** `git status` in the sub-repo shows no changes; workspace-level git history contains unexpected commits.

### Pitfall 3: Partial YAML Read on Rapid File Writes

**What goes wrong:** chokidar fires a `change` event mid-write; `fs.readFileSync` reads a partial file with malformed YAML; server emits corrupted task data to SSE clients.

**Why it happens:** chokidar without `awaitWriteFinish` fires immediately on inode change notification, which can precede the write completing.

**How to avoid:** Set `awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }` in chokidar options. This satisfies SC-2 (≤1 second) while preventing partial reads (200ms + processing << 1000ms).

**Warning signs:** SSE clients receive events with `null` task data or incomplete frontmatter fields.

### Pitfall 4: SSE Connection Leak

**What goes wrong:** Browser tab closes but the response object stays in the `clients` array. Eventually the array grows unbounded; writes to dead connections throw unhandled errors.

**Why it happens:** `res.write()` on a closed connection throws unless `req.on('close')` cleanup is registered.

**How to avoid:** Always register `req.on('close', () => { clients.splice(clients.indexOf(res), 1); })` immediately when adding a client to the registry.

**Warning signs:** Server slows over time; unhandled error events with `EPIPE` or `ERR_HTTP_HEADERS_SENT`.

### Pitfall 5: `task-state-guard.js` Denies `stopped` from `stop` Endpoint

**What goes wrong:** The stop-and-commit endpoint writes `status: stopped` to the task file via `fs.writeFileSync`. The `task-state-guard.js` PreToolUse hook runs for Write/Edit Claude Code tool calls — but the server writes the file directly via Node.js `fs`, bypassing the hook entirely.

**Why this matters:** The hook only intercepts Claude Code tool calls (Write, Edit). The server's direct `fs.writeFileSync` does not go through Claude Code, so the hook never runs. This means:
  1. The server can write `status: stopped` without hook validation — no deny risk.
  2. The `updated-at` timestamp injection (hook's allow path) will NOT fire for server writes — the server must update `updated-at` itself when writing `stopped`.

**How to avoid:** The server's task-write function must:
  1. Read the current file content.
  2. Replace `status: <current>` with `status: stopped`.
  3. Replace `updated-at: <old>` with `updated-at: <ISO_NOW>`.
  4. Write the full updated content back.

**Warning signs:** Task files written by the server endpoint have stale `updated-at` timestamps.

### Pitfall 6: Branch Already Exists on Second Stop

**What goes wrong:** User stops the same task twice. Second `git checkout -b task/TASK-001/stopped` fails because the branch already exists.

**Why it happens:** `git checkout -b` fails if the branch name exists.

**How to avoid:** Use `git checkout -b` in a try/catch. If it fails, check if the branch already exists and either switch to it or use a timestamped suffix. Simplest: use `git checkout -B` (force-create) or prefix with a timestamp.

**Warning signs:** Stop endpoint returns 500 with `fatal: A branch named 'task/TASK-001/stopped' already exists`.

---

## Code Examples

### Express SSE Endpoint (complete)

```javascript
// Source: [ASSUMED] — standard SSE pattern, verified against MDN EventSource docs
const express = require('express');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');  // must be v3 — CJS
const yaml = require('js-yaml');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 6111;  // D-10

const WORK_DIR = path.resolve('.planning/work');
const clients = [];

// Parse a task .md file into a plain object
function parseTaskFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    return yaml.load(match[1]);
  } catch {
    return null;  // malformed — skip per Claude's Discretion
  }
}

// Load all existing tasks for initial snapshot (D-13)
function loadAllTasks() {
  const tasks = [];
  const epics = fs.readdirSync(WORK_DIR, { withFileTypes: true });
  for (const entry of epics) {
    if (!entry.isDirectory()) continue;
    const epicDir = path.join(WORK_DIR, entry.name);
    for (const file of fs.readdirSync(epicDir)) {
      if (!file.endsWith('.md')) continue;
      const task = parseTaskFile(path.join(epicDir, file));
      if (task) tasks.push(task);
    }
  }
  return tasks;
}

// Push task-updated event to all SSE clients (D-11, D-12)
function pushEvent(taskObj) {
  const data = `event: task-updated\ndata: ${JSON.stringify(taskObj)}\n\n`;
  for (const res of clients) res.write(data);
}

// SSE endpoint (D-13 — initial snapshot on connect)
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const allTasks = loadAllTasks();
  for (const task of allTasks) {
    res.write(`event: task-updated\ndata: ${JSON.stringify(task)}\n\n`);
  }

  clients.push(res);
  req.on('close', () => {
    clients.splice(clients.indexOf(res), 1);
  });
});

// chokidar watcher (D-11, D-12)
chokidar.watch(`${WORK_DIR}/**/*.md`, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
}).on('add', f => {
  const t = parseTaskFile(f); if (t) pushEvent(t);
}).on('change', f => {
  const t = parseTaskFile(f); if (t) pushEvent(t);
}).on('unlink', f => {
  // D-12: include deleted:true for deletions
  // Extract task id from file path for the event
  const id = path.basename(f, '.md');
  pushEvent({ id, deleted: true });
});

app.listen(PORT, () => console.log(`kanban-server listening on :${PORT}`));
```

### Stop-and-Commit Endpoint

```javascript
// Source: [ASSUMED]
const { execSync } = require('child_process');

// D-04, D-05, D-06
app.post('/tasks/:id/stop', (req, res) => {
  const taskId = req.params.id;
  // Find the task file
  const found = findTaskFile(taskId);  // glob .planning/work/**/<taskId>.md
  if (!found) return res.status(404).json({ error: `Task ${taskId} not found` });

  const task = parseTaskFile(found);
  if (!task) return res.status(422).json({ error: 'Malformed task file' });

  const stoppable = ['inProgress', 'inReview', 'inTesting', 'forTeamLeadCheck'];
  if (!stoppable.includes(task.status)) {
    return res.status(409).json({ error: `Cannot stop task in status: ${task.status}` });
  }

  // Write status: stopped + update updated-at (bypasses hook — server must set updated-at itself)
  const now = new Date().toISOString();
  let content = fs.readFileSync(found, 'utf8');
  content = content.replace(/^status:\s*\S+/m, 'status: stopped');
  content = content.replace(/^updated-at:\s*.+/m, `updated-at: ${now}`);
  fs.writeFileSync(found, content, 'utf8');

  // Commit dirty changes in sub-repo (D-04)
  const repoDir = task.repo === 'be' ? 'ai-platform' : 'ai-platform-fe';
  const branch = `task/${taskId}/stopped`;  // D-05
  const msg = `wip(${taskId}): stopped mid-pipeline`;  // D-06
  try {
    execSync(`git checkout -b ${branch}`, { cwd: repoDir, stdio: 'pipe' });
  } catch {
    // Branch may already exist — force-create
    execSync(`git checkout -B ${branch}`, { cwd: repoDir, stdio: 'pipe' });
  }
  execSync('git add -A', { cwd: repoDir, stdio: 'pipe' });
  execSync(`git commit -m "${msg}"`, { cwd: repoDir, stdio: 'pipe' });

  res.json({ ok: true, branch });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling for file changes | chokidar with `awaitWriteFinish` | ~2014 | Sub-second reliable cross-platform watching |
| SSE with third-party lib | Native `res.write()` with `Content-Type: text/event-stream` | Node.js maturity | No dependency needed for SSE protocol |
| Express 4 (LTS) | Express 5 (stable, latest) | Oct 2024 | Async error handling improvements; no breaking changes for simple routing |

**Deprecated/outdated:**
- `chokidar@4` / `chokidar@5`: ESM-only, cannot use with `require()` in plain CJS files. Use `chokidar@3.6.0`.
- `yamljs` npm package: Historically used for YAML parsing but largely superseded by `js-yaml`. Do not use.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SSE client registry as a plain array of response objects is sufficient (no Redis pub/sub needed) | Architecture Patterns | Minimal — this is a local dev tool with at most 1-2 concurrent SSE clients |
| A2 | `execSync` with `cwd` option is sufficient for git operations (no async needed) | Pattern 4, Stop-and-Commit | Low — synchronous git is standard for scripted commit flows; failure throws synchronously |
| A3 | `awaitWriteFinish: { stabilityThreshold: 200 }` satisfies SC-2 (≤1 second) | Pattern 2, chokidar | Low — 200ms + file read + JSON serialize + network << 1000ms under normal load |
| A4 | The server write via `fs.writeFileSync` bypasses `task-state-guard.js` hook | Pitfall 5 | HIGH if wrong — if the hook somehow intercepts server-side writes, the `stopped` transition needs to be in the hook's VALID_TRANSITIONS (still needed per D-02) |
| A5 | `git checkout -B` (force-create) is acceptable behavior when branch already exists | Pattern 4 | Low — this is a dev tool; overwriting a stopped branch is acceptable |

**If this table is empty:** Not empty — A4 is HIGH risk if the assumption is incorrect. However, Claude Code PreToolUse hooks only intercept Claude Code tool calls (Write/Edit tools in Claude's context), not `fs.writeFileSync` calls made by external Node.js processes. This is confirmed by the hook mechanism design.

---

## Open Questions

1. **Heartbeat interval for SSE keep-alive**
   - What we know: SSE connections time out if no data is sent (typically 30-120s depending on client/proxy)
   - What's unclear: Whether the UI client (Phase 6) or its HTTP infrastructure has aggressive timeout behavior
   - Recommendation: Add a 30-second heartbeat (`: ping\n\n` comment line) in the SSE handler at Claude's Discretion

2. **CORS headers for SSE endpoint**
   - What we know: The Kanban UI (Phase 6) will run on a different port (Vite dev server, likely 5173 or similar)
   - What's unclear: Whether Phase 5 needs CORS headers now or if Phase 6 will add them
   - Recommendation: Add `Access-Control-Allow-Origin: *` to the SSE endpoint response headers in Phase 5 to avoid blocking Phase 6 development

3. **Behavior when the sub-repo has no staged/unstaged changes**
   - What we know: `git commit` fails if there is nothing to commit
   - What's unclear: Whether the server should still create the branch even if nothing to commit
   - Recommendation: Run `git diff --stat HEAD` before committing; if empty, create the branch but skip the commit, return `{ ok: true, branch, committed: false }`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `node kanban-server/index.js` | ✓ | v22.18.0 | — |
| npm | `kanban-server/package.json` install | ✓ | 10.9.3 | — |
| git | stop-and-commit endpoint | ✓ | (confirmed — sub-repo git ops tested) | — |
| `ai-platform/` as git repo | stop-and-commit (repo: be) | ✓ | independent git repo | — |
| `ai-platform-fe/` as git repo | stop-and-commit (repo: fe) | ✓ | independent git repo | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bash shell scripts (same as `scripts/test-stop-guard.sh` and `scripts/test-pipeline-guard.sh`) |
| Config file | none — scripts are self-contained |
| Quick run command | `bash scripts/test-kanban-guard.sh` |
| Full suite command | `bash scripts/test-kanban-guard.sh && bash scripts/test-pipeline-guard.sh && bash scripts/test-stop-guard.sh` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KANBAN-05 / SC-3 | Stop endpoint writes `status: stopped` to task frontmatter | unit (shell) | `bash scripts/test-kanban-guard.sh` | ❌ Wave 0 |
| KANBAN-05 / SC-3 | `task-state-guard.js` allows `stopped` from active statuses | unit (shell) | `bash scripts/test-kanban-guard.sh` | ❌ Wave 0 |
| SC-1 | Server starts with `node kanban-server/index.js` | smoke (shell) | `bash scripts/test-kanban-guard.sh` | ❌ Wave 0 |
| SC-2 | SSE event delivered within 1 second of file change | integration (manual) | manual only — requires timing measurement | — |
| D-03 | execute.md checks for `status: stopped` at stage gates | integration (manual) | manual — requires pipeline run | — |

### Sampling Rate
- **Per task commit:** `bash scripts/test-kanban-guard.sh`
- **Per wave merge:** `bash scripts/test-kanban-guard.sh && bash scripts/test-pipeline-guard.sh && bash scripts/test-stop-guard.sh`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `scripts/test-kanban-guard.sh` — covers KANBAN-05 unit tests (stopped transitions, server smoke test)

---

## Security Domain

> `security_enforcement` not explicitly set to false in config.json — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Internal dev tool — no auth required |
| V3 Session Management | No | SSE is stateless; no sessions |
| V4 Access Control | No | Local tool; no multi-user access control |
| V5 Input Validation | Yes | Validate `taskId` param in stop endpoint — only allow `TASK-\d{3}` format |
| V6 Cryptography | No | No sensitive data |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `taskId` param | Tampering | Validate `taskId` against `TASK-\d{3}` regex before constructing file path |
| Arbitrary git branch injection | Tampering | Same regex validation — branch name is derived from `taskId` |
| Shell injection in `execSync` | Elevation of Privilege | Use `execSync` with array args or validate `taskId` before interpolation into shell string |

---

## Project Constraints (from CLAUDE.md)

- **Multi-repo isolation:** Never edit across both `ai-platform/` and `ai-platform-fe/` in a single task. Phase 5 modifies workspace-level files (`kanban-server/`, `.claude/hooks/task-state-guard.js`, `.claude/commands/team-lead/execute.md`) — these are workspace-level files, not sub-repo files. Git commit scope per task must stay within one repo boundary.
- **Task files live at `.planning/work/<epic-name>/TASK-XXX.md`** — server watches this exact path.
- **Each task executes in a fresh context window** — `kanban-server/` code must be self-contained with no assumed prior context.

---

## Sources

### Primary (HIGH confidence)
- `npm view chokidar@5 type` → `module` (ESM-only confirmed, 2026-05-26)
- `npm view chokidar@3.6.0` → CJS, no `type` field (CommonJS confirmed, 2026-05-26)
- `npm view express version` → `5.2.1` (2026-05-26)
- `npm view js-yaml version` → `4.1.1` (2026-05-26)
- Existing `.claude/hooks/task-state-guard.js` — YAML parsing pattern, VALID_TRANSITIONS map
- Existing `.claude/commands/team-lead/execute.md` — stage gate structure for D-03 integration
- Existing `scripts/test-pipeline-guard.sh` — test script pattern for Wave 0 gap

### Secondary (MEDIUM confidence)
- github.com/paulmillr/chokidar README (v3) — `awaitWriteFinish` option, `ignoreInitial` option
- npm download counts — express 103M/wk, chokidar 173M/wk, js-yaml 223M/wk (api.npmjs.org, 2026-05-26)

### Tertiary (LOW confidence)
- SSE heartbeat and CORS patterns — [ASSUMED] from standard Node.js/Express SSE documentation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registry verified, ESM/CJS constraint confirmed by `type` field inspection
- Architecture: HIGH — based on locked decisions from CONTEXT.md and existing codebase patterns
- Pitfalls: HIGH — chokidar v5/ESM pitfall verified empirically; others derived from code analysis
- Git operations: HIGH — tested `git -C` pattern against actual sub-repos in workspace

**Research date:** 2026-05-26
**Valid until:** 2026-06-25 (stable ecosystem — 30 days)
