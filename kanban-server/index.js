#!/usr/bin/env node
// kanban-server/index.js
// Standalone Express + chokidar SSE server for the AI Agent Dev Workflow Kanban board.
// D-07: plain CommonJS JavaScript — no TypeScript, no build step.
// D-08: lives at workspace root in kanban-server/ directory, outside Nx workspace.
// D-09: start command is `node kanban-server/index.js` from workspace root.

'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar'); // MUST be 3.6.0 — v5 is ESM-only (ERR_REQUIRE_ESM)
const yaml = require('js-yaml');
const { execSync, spawn } = require('child_process');

// D-10: port configured via PORT env var with fallback 6111
// Guard against non-numeric values (e.g. PORT=abc) that parseInt returns NaN for,
// which causes app.listen(NaN) to bind to a random OS-assigned port silently.
const rawPort = parseInt(process.env.PORT, 10);
const PORT = (!process.env.PORT || isNaN(rawPort)) ? 6111 : rawPort;

// Task files live at .planning/work/<epic>/*.md (workspace root, two levels up from __dirname)
// Use __dirname so WORK_DIR resolves correctly regardless of the process CWD.
const WORK_DIR = path.join(__dirname, '..', '.planning', 'work');

// STOPPABLE statuses: active statuses that allow a stopped transition (D-02)
// readyForDevelop and done are intentionally excluded.
const STOPPABLE = ['inProgress', 'inReview', 'inTesting', 'forTeamLeadCheck'];

// ---------------------------------------------------------------------------
// Task file parsing
// ---------------------------------------------------------------------------

/**
 * Parse a task markdown file and return its frontmatter as a plain object.
 * Returns null if the file is missing, unreadable, or has malformed frontmatter.
 * Pattern reused from .claude/hooks/task-state-guard.js lines 140-145.
 */
function parseTaskFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null; // no frontmatter — skip malformed files
    return yaml.load(fmMatch[1]);
  } catch {
    return null; // malformed YAML — skip per Claude's Discretion (T-05-09)
  }
}

/**
 * Locate a task file by ID (e.g. "TASK-001") anywhere under WORK_DIR.
 * Reads all epic subdirectories and returns the first matching .md path.
 * Returns null if not found.
 */
function findTaskFile(taskId) {
  try {
    const epics = fs.readdirSync(WORK_DIR, { withFileTypes: true });
    for (const entry of epics) {
      if (!entry.isDirectory()) continue;
      const epicDir = path.join(WORK_DIR, entry.name);
      const files = fs.readdirSync(epicDir);
      for (const file of files) {
        if (file === taskId + '.md') {
          return path.join(epicDir, file);
        }
      }
    }
  } catch {
    // WORK_DIR not readable — return null
  }
  return null;
}

/**
 * Load all task files from WORK_DIR for the initial SSE snapshot (D-13).
 * Returns an array of parsed task objects (nulls skipped).
 */
function loadAllTasks() {
  const tasks = [];
  try {
    const epics = fs.readdirSync(WORK_DIR, { withFileTypes: true });
    for (const entry of epics) {
      if (!entry.isDirectory()) continue;
      const epicDir = path.join(WORK_DIR, entry.name);
      const files = fs.readdirSync(epicDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const task = parseTaskFile(path.join(epicDir, file));
        if (task) tasks.push(task);
      }
    }
  } catch {
    // WORK_DIR not accessible — return empty array
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// SSE client registry (T-05-08: connection leak prevention)
// ---------------------------------------------------------------------------

const clients = [];

/**
 * Push a task-updated SSE event to all connected clients (D-11, D-12).
 * Full task snapshot per event — complete task object every time.
 */
function pushEvent(taskObj) {
  const data = `event: task-updated\ndata: ${JSON.stringify(taskObj)}\n\n`;
  for (const res of clients) {
    res.write(data);
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// Global CORS middleware — allows browser clients (Phase 6 Vite) to reach all endpoints.
// Without this, POST /tasks/:id/stop fails the browser preflight (OPTIONS returns 404).
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// GET /health — liveness probe
app.get('/health', (req, res) => {
  res.json({ ok: true, port: PORT });
});

// GET /events — SSE endpoint (D-11, D-12, D-13)
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*'); // CORS for Phase 6 Vite client
  res.setHeader('X-Accel-Buffering', 'no'); // Pitfall 1: prevent Vite proxy SSE buffering
  res.flushHeaders();

  // D-13: emit initial snapshot before subscribing to live updates
  const allTasks = loadAllTasks();
  for (const task of allTasks) {
    res.write(`event: task-updated\ndata: ${JSON.stringify(task)}\n\n`);
  }

  clients.push(res);

  // T-05-08: remove client on disconnect to prevent SSE connection leak (Pitfall 4)
  req.on('close', () => {
    const i = clients.indexOf(res);
    if (i !== -1) clients.splice(i, 1);
  });

  // 30-second heartbeat to keep connection alive through proxies and timeouts
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 30000);
  req.on('close', () => clearInterval(heartbeat));
});

// POST /tasks/:id/stop — stop-and-commit endpoint (SC-3, D-04, D-05, D-06)
app.post('/tasks/:id/stop', (req, res) => {
  try {
    const taskId = req.params.id;

    // T-05-05, T-05-06: validate taskId — prevents path traversal and shell injection (ASVS V5)
    if (!/^TASK-\d{3}$/.test(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID format. Expected TASK-NNN.' });
    }

    // Locate the task file
    const found = findTaskFile(taskId);
    if (!found) {
      return res.status(404).json({ error: 'Task not found: ' + taskId });
    }

    // Parse the task file
    const task = parseTaskFile(found);
    if (!task) {
      return res.status(422).json({ error: 'Malformed task file' });
    }

    // Check that the task is in a stoppable status (not readyForDevelop or done)
    if (!STOPPABLE.includes(task.status)) {
      return res.status(409).json({ error: 'Cannot stop task in status: ' + task.status });
    }

    // Write status: stopped + updated-at to the task file.
    // Pitfall 5: hook does NOT fire for server fs writes — must set both fields explicitly.
    const now = new Date().toISOString();
    let content = fs.readFileSync(found, 'utf8');
    content = content.replace(/^status:\s*\S+/m, 'status: stopped');
    content = content.replace(/^updated-at:\s*.+/m, 'updated-at: ' + now);
    fs.writeFileSync(found, content, 'utf8');

    // Determine sub-repo directory (D-04): be → ai-platform/, fe → ai-platform-fe/
    // T-05-07: always pass { cwd: repoDir } to execSync — workspace root has its own .git
    // Validated lookup prevents unknown task.repo values from silently running git in the wrong dir.
    const VALID_REPOS = { be: 'ai-platform', fe: 'ai-platform-fe' };
    const repoDirName = VALID_REPOS[task.repo];
    if (!repoDirName) {
      return res.status(422).json({ error: 'Unknown repo value in task: ' + task.repo });
    }
    const repoDir = path.join(__dirname, '..', repoDirName); // absolute path relative to server file
    if (!fs.existsSync(repoDir)) {
      return res.status(500).json({ error: 'Sub-repo directory not found: ' + repoDirName });
    }

    // D-05: branch name pattern
    const branch = 'task/' + taskId + '/stopped';
    // D-06: commit message pattern
    const msg = 'wip(' + taskId + '): stopped mid-pipeline';

    // Empty working tree guard: skip commit if nothing to commit.
    // Also checks for commits that exist locally but haven't been pushed yet —
    // git diff --stat HEAD only shows uncommitted working-tree changes, so a
    // developer agent that already committed its work would produce empty diffOutput
    // even though there are new commits that should be preserved on the stop branch.
    let diffOutput = '';
    try {
      diffOutput = execSync('git diff --stat HEAD', { cwd: repoDir, stdio: 'pipe' }).toString().trim();
    } catch {
      // git diff failed — skip commit
      return res.json({ ok: true, branch, committed: false });
    }
    // Check for commits ahead of the remote (committed-but-not-pushed state).
    // Falls back to listing all HEAD commits when no upstream is configured.
    const aheadOutput = execSync(
      'git log --oneline @{u}..HEAD 2>/dev/null || git log --oneline HEAD',
      { cwd: repoDir, stdio: 'pipe' }
    ).toString().trim();
    if (!diffOutput && !aheadOutput) {
      return res.json({ ok: true, branch, committed: false });
    }

    // Pitfall 6: branch already exists guard — try checkout -b, fall back to -B (force-create)
    try {
      execSync('git checkout -b ' + branch, { cwd: repoDir, stdio: 'pipe' });
    } catch {
      execSync('git checkout -B ' + branch, { cwd: repoDir, stdio: 'pipe' });
    }
    execSync('git add -A', { cwd: repoDir, stdio: 'pipe' });
    execSync('git commit -m "' + msg + '"', { cwd: repoDir, stdio: 'pipe' });

    return res.json({ ok: true, branch, committed: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// VALID_STATUSES: drag-droppable status values — all pipeline columns except 'stopped'
// D-09: 'stopped' is excluded from drag-drop targets; set only by POST /tasks/:id/stop
const VALID_STATUSES = new Set([
  'readyForDevelop', 'inProgress', 'inReview',
  'inTesting', 'forTeamLeadCheck', 'done'
  // 'stopped' intentionally excluded — set only via POST /tasks/:id/stop
]);

// PATCH /tasks/:id/status — update task status via drag-and-drop (D-05, D-06)
app.patch('/tasks/:epic/:id/status', (req, res) => {
  try {
    const { epic, id: taskId } = req.params;

    // T-06-01: validate epic name — no path traversal (only word chars and hyphens)
    if (!/^[\w-]+$/.test(epic)) {
      return res.status(400).json({ error: 'Invalid epic name.' });
    }

    // T-06-01: validate taskId format — prevents path traversal
    if (!/^TASK-\d{3}$/.test(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID format. Expected TASK-NNN.' });
    }

    // T-06-02: validate status against VALID_STATUSES before any file I/O (ASVS V5)
    const { status } = req.body;
    if (!status || !VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid status: ' + status });
    }

    // Locate the task file directly using epic dir (avoids cross-epic ID ambiguity)
    const found = path.join(WORK_DIR, epic, taskId + '.md');
    if (!fs.existsSync(found)) {
      return res.status(404).json({ error: 'Task not found: ' + epic + '/' + taskId });
    }

    if (status === 'inProgress') {
      // Don't write file — agent sets inProgress itself. Board shows it optimistically.
      // No --auto-next: kanban autoRun handles chaining via SSE done-detection;
      // terminal users pass --auto-next manually for same-session chaining.
      const script = path.join(__dirname, 'run-task.sh');
      spawn('osascript', [
        '-e', `tell application "iTerm"`,
        '-e', `  tell current window`,
        '-e', `    create tab with default profile`,
        '-e', `    tell current session`,
        '-e', `      write text "bash '${script}' ${epic}/${taskId}"`,
        '-e', `    end tell`,
        '-e', `  end tell`,
        '-e', `end tell`,
      ], { detached: true, stdio: 'ignore' }).unref();
      const task = parseTaskFile(found);
      return res.json({ ok: true, task });
    }

    // Regex-replace write pattern — same as stop endpoint (lines 194-197)
    const now = new Date().toISOString();
    let content = fs.readFileSync(found, 'utf8');
    content = content.replace(/^status:\s*\S+/m, 'status: ' + status);
    content = content.replace(/^updated-at:\s*.+/m, 'updated-at: ' + now);
    fs.writeFileSync(found, content, 'utf8');

    // Return updated task object
    const task = parseTaskFile(found);
    return res.json({ ok: true, task });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// chokidar watcher — live file change events (D-11, D-12, SC-2)
// Pattern 2 from RESEARCH.md: ignoreInitial:true; initial snapshot handled per SSE connect (D-13)
// awaitWriteFinish mitigates Pitfall 3 (partial YAML read on rapid writes): T-05-09
// ---------------------------------------------------------------------------

chokidar.watch(WORK_DIR + '/**/*.md', {
  persistent: true,
  ignoreInitial: true, // initial snapshot emitted on SSE connect, not via chokidar
  awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
})
  .on('add', function (f) {
    const t = parseTaskFile(f);
    if (t) pushEvent(t);
  })
  .on('change', function (f) {
    const t = parseTaskFile(f);
    if (t) pushEvent(t);
  })
  .on('unlink', function (f) {
    // D-12: deleted tasks include deleted: true flag; emit epic so taskUid resolves correctly
    pushEvent({ id: path.basename(f, '.md'), epic: path.basename(path.dirname(f)), deleted: true });
  });

// ---------------------------------------------------------------------------
// Static file serving and SPA catch-all (D-02, D-03)
// MUST come after all API routes to avoid shadowing API endpoints.
// ---------------------------------------------------------------------------

// Serve Vite build output from kanban-server/public/ (D-02)
app.use(express.static(path.join(__dirname, 'public')));

// SPA catch-all — serves index.html for any unmatched GET route (client-side routing)
// Express 5 path-to-regexp rejects bare '*'; use middleware filtered to GET instead.
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'UI not built. Run: npm run build --prefix client' });
  }
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(PORT, function () {
  console.log('kanban-server listening on :' + PORT);
});
