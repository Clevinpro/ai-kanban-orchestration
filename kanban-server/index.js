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

// Terminal-spawn dedup: track tasks for which we've already opened an iTerm tab,
// so a re-sent inProgress (page reload, multiple browser tabs, autoRun race) does
// NOT spawn a second terminal that would conflict with the running agent.
// uid -> timestamp(ms). Cleared when the task leaves a running status (see chokidar).
const spawnedTasks = new Map();
// Cooldown covers the window between spawning the terminal and the agent writing
// `status: inProgress` to the file — during which the on-disk guard alone is blind.
const SPAWN_COOLDOWN_MS = 5 * 60 * 1000;

// A task is considered "no longer running" (terminal closed / pipeline ended) in
// these statuses — used to release the spawn guard so the task can be re-run later.
const NOT_RUNNING = ['done', 'stopped', 'readyForDevelop'];

// Epic-test dedup: track epics for which we've already opened a /team-lead:test
// terminal, so a re-fire (reload, multiple tabs) does not spawn duplicate gates.
// epic -> timestamp(ms).
const testedEpics = new Map();
const TEST_COOLDOWN_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Epic test report (TEST-REPORT.md) helpers
// ---------------------------------------------------------------------------

/**
 * Read the Verdict line from an epic's TEST-REPORT.md.
 * Returns 'IN-PROGRESS' | 'PASS' | 'FAIL' | null (no report / unreadable).
 */
function readTestVerdict(epic) {
  try {
    const content = fs.readFileSync(path.join(WORK_DIR, epic, 'TEST-REPORT.md'), 'utf8');
    const m = content.match(/^Verdict:\s*(\S+)/m);
    return m ? m[1].toUpperCase() : null;
  } catch {
    return null; // no report yet
  }
}

/**
 * Full test info for an epic: verdict + start/end timestamps.
 * - startedAt: from the .test-started sidecar (written at kanban launch); falls
 *   back to the report's Generated line while the marker is still IN-PROGRESS.
 * - endedAt: the final report's Generated line (PASS/FAIL only).
 * Returns { verdict, startedAt, endedAt } — all nullable.
 */
function getTestInfo(epic) {
  let verdict = null;
  let generated = null;
  try {
    const content = fs.readFileSync(path.join(WORK_DIR, epic, 'TEST-REPORT.md'), 'utf8');
    const vm = content.match(/^Verdict:\s*(\S+)/m);
    verdict = vm ? vm[1].toUpperCase() : null;
    const gm = content.match(/^Generated:\s*(\S+)/m);
    generated = gm ? gm[1] : null;
  } catch {
    return { verdict: null, startedAt: null, endedAt: null };
  }
  let startedAt = null;
  try {
    startedAt = fs.readFileSync(path.join(WORK_DIR, epic, '.test-started'), 'utf8').trim() || null;
  } catch {
    // no sidecar (manual /team-lead:test run) — fall back below
  }
  if (!startedAt && verdict === 'IN-PROGRESS') startedAt = generated;
  const endedAt = verdict === 'PASS' || verdict === 'FAIL' ? generated : null;
  return { verdict, startedAt, endedAt };
}

/**
 * Write the IN-PROGRESS marker report at test launch. /team-lead:test will
 * overwrite this file with the final PASS/FAIL report when it finishes.
 * A previous report (FAIL re-run) is preserved as TEST-REPORT.prev.md so the
 * test command can re-verify only the ACs that failed last time.
 * Capitalized `Verdict:` — never a lowercase `status:` line, so the
 * task-state-guard hook ignores this file (same rule as the test command).
 */
function writeInProgressReport(epic) {
  const filePath = path.join(WORK_DIR, epic, 'TEST-REPORT.md');
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, path.join(WORK_DIR, epic, 'TEST-REPORT.prev.md'));
  }
  // Sidecar persists the launch time — the final report overwrites the marker
  // (and its Generated line), which would otherwise lose the start timestamp.
  fs.writeFileSync(path.join(WORK_DIR, epic, '.test-started'), new Date().toISOString(), 'utf8');
  const content = [
    '# Epic Test Report — ' + epic,
    '',
    'Verdict: IN-PROGRESS',
    'Generated: ' + new Date().toISOString(),
    '',
    'Launched /team-lead:test from the kanban board. Awaiting results...',
    '',
  ].join('\n');
  fs.writeFileSync(filePath, content, 'utf8');
}

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

/**
 * Push an epic-test SSE event to all connected clients.
 * Payload: { epic, verdict, startedAt, endedAt } — verdict is
 * IN-PROGRESS | PASS | FAIL | null (report deleted); timestamps nullable.
 */
function pushTestEvent(epic, info) {
  const payload = info
    ? { epic, ...info }
    : { epic, verdict: null, startedAt: null, endedAt: null };
  const data = `event: epic-test\ndata: ${JSON.stringify(payload)}\n\n`;
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

  // Initial epic-test snapshot: emit the current verdict of every TEST-REPORT.md,
  // so a page reload restores button blocked/badge state.
  try {
    for (const entry of fs.readdirSync(WORK_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const info = getTestInfo(entry.name);
      if (info.verdict) {
        res.write(`event: epic-test\ndata: ${JSON.stringify({ epic: entry.name, ...info })}\n\n`);
      }
    }
  } catch {
    // WORK_DIR not readable — skip snapshot
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
      const uid = epic + '/' + taskId;
      const onDisk = parseTaskFile(found);
      const recent = spawnedTasks.get(uid);
      const recentlySpawned = recent && (Date.now() - recent) < SPAWN_COOLDOWN_MS;

      // Dedup guard: a terminal is already running this task if either the file
      // already reads inProgress (agent flipped it) or we spawned one recently.
      // Skip the spawn instead of opening a conflicting second terminal.
      if ((onDisk && onDisk.status === 'inProgress') || recentlySpawned) {
        return res.json({ ok: true, task: onDisk, alreadyRunning: true });
      }

      spawnedTasks.set(uid, Date.now());
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

// POST /epics/:epic/test — launch the epic acceptance gate (/team-lead:test)
// when every task of an epic is done. Spawns one iTerm tab; deduped per epic.
app.post('/epics/:epic/test', (req, res) => {
  try {
    const { epic } = req.params;

    // Validate epic name — no path traversal (only word chars and hyphens).
    if (!/^[\w-]+$/.test(epic)) {
      return res.status(400).json({ error: 'Invalid epic name.' });
    }

    // Epic directory must exist under WORK_DIR.
    const epicDir = path.join(WORK_DIR, epic);
    if (!fs.existsSync(epicDir)) {
      return res.status(404).json({ error: 'Epic not found: ' + epic });
    }

    // Persistent guard (survives server restarts):
    // - IN-PROGRESS: a gate is running — block duplicate launch.
    // - PASS: epic already verified — re-run requires deleting TEST-REPORT.md.
    // - FAIL: allowed — re-run verifies only the previously failed ACs.
    const verdict = readTestVerdict(epic);
    if (verdict === 'IN-PROGRESS') {
      return res.status(409).json({ ok: false, alreadyRunning: true, error: 'Epic test already in progress: ' + epic });
    }
    if (verdict === 'PASS') {
      return res.status(409).json({ ok: false, alreadyPassed: true, error: 'Epic test already passed: ' + epic + '. Delete TEST-REPORT.md to re-run.' });
    }

    // Dedup guard: skip if we launched the test for this epic recently.
    const recent = testedEpics.get(epic);
    if (recent && (Date.now() - recent) < TEST_COOLDOWN_MS) {
      return res.json({ ok: true, alreadyRunning: true });
    }
    testedEpics.set(epic, Date.now());

    // Write the IN-PROGRESS marker before spawning — blocks duplicate launches
    // and is pushed to all boards via the chokidar watcher below.
    writeInProgressReport(epic);

    const script = path.join(__dirname, 'run-test.sh');
    spawn('osascript', [
      '-e', `tell application "iTerm"`,
      '-e', `  tell current window`,
      '-e', `    create tab with default profile`,
      '-e', `    tell current session`,
      '-e', `      write text "bash '${script}' ${epic}"`,
      '-e', `    end tell`,
      '-e', `  end tell`,
      '-e', `end tell`,
    ], { detached: true, stdio: 'ignore' }).unref();

    return res.json({ ok: true, launched: true });
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
    if (path.basename(f) === 'TEST-REPORT.md') {
      const epic = path.basename(path.dirname(f));
      return pushTestEvent(epic, getTestInfo(epic));
    }
    const t = parseTaskFile(f);
    if (t) pushEvent(t);
  })
  .on('change', function (f) {
    if (path.basename(f) === 'TEST-REPORT.md') {
      // /team-lead:test overwrote the marker with the final report — push the
      // new verdict so boards unblock the run button and show PASS/FAIL.
      const epic = path.basename(path.dirname(f));
      const info = getTestInfo(epic);
      // Release the launch cooldown once the gate finished, so a manual re-run
      // right after a PASS/FAIL is not blocked for the remaining cooldown window.
      if (info.verdict !== 'IN-PROGRESS') testedEpics.delete(epic);
      return pushTestEvent(epic, info);
    }
    const t = parseTaskFile(f);
    if (t) {
      // Release the spawn guard once the task is no longer running, so a later
      // re-run (e.g. after stop) is allowed to open a fresh terminal.
      if (t.id && t.epic && NOT_RUNNING.includes(t.status)) {
        spawnedTasks.delete(t.epic + '/' + t.id);
      }
      pushEvent(t);
    }
  })
  .on('unlink', function (f) {
    if (path.basename(f) === 'TEST-REPORT.md') {
      // Report deleted — clear verdict badge and unblock the run button.
      // Drop the start-time sidecar so a stale start never shows for the next run.
      const epic = path.basename(path.dirname(f));
      try { fs.unlinkSync(path.join(WORK_DIR, epic, '.test-started')); } catch { /* already gone */ }
      return pushTestEvent(epic, null);
    }
    // Only TASK-NNN.md deletions are board events — ignore TEST-REPORT.prev.md,
    // SPEC.md and other non-task markdown files.
    if (!/^TASK-\d{3}\.md$/.test(path.basename(f))) return;
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
