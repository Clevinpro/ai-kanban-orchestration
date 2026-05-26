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
const { execSync } = require('child_process');

// D-10: port configured via PORT env var with fallback 6111
// Guard against non-numeric values (e.g. PORT=abc) that parseInt returns NaN for,
// which causes app.listen(NaN) to bind to a random OS-assigned port silently.
const rawPort = parseInt(process.env.PORT, 10);
const PORT = (!process.env.PORT || isNaN(rawPort)) ? 6111 : rawPort;

// Task files live at .planning/work/<epic>/*.md (relative to workspace root)
const WORK_DIR = path.resolve('.planning/work');

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
    const repoDir = task.repo === 'be' ? 'ai-platform' : 'ai-platform-fe';

    // D-05: branch name pattern
    const branch = 'task/' + taskId + '/stopped';
    // D-06: commit message pattern
    const msg = 'wip(' + taskId + '): stopped mid-pipeline';

    // Empty working tree guard: skip commit if nothing to commit
    let diffOutput = '';
    try {
      diffOutput = execSync('git diff --stat HEAD', { cwd: repoDir, stdio: 'pipe' }).toString().trim();
    } catch {
      // git diff failed — skip commit
      return res.json({ ok: true, branch, committed: false });
    }
    if (!diffOutput) {
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
    // D-12: deleted tasks include deleted: true flag
    pushEvent({ id: path.basename(f, '.md'), deleted: true });
  });

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(PORT, function () {
  console.log('kanban-server listening on :' + PORT);
});
