# Phase 5: Kanban Server - Pattern Map

**Mapped:** 2026-05-26
**Files analyzed:** 5 (3 new, 2 modified)
**Analogs found:** 5 / 5

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `kanban-server/index.js` | service (HTTP server) | event-driven + request-response | `.claude/hooks/task-state-guard.js` | role-partial — same CJS Node.js pattern; no Express analog exists yet |
| `kanban-server/package.json` | config | — | `.claude/package.json` | role-match — standalone CJS package manifest |
| `.claude/hooks/task-state-guard.js` | middleware (hook) | request-response | `.claude/hooks/gsd-workflow-guard.js` | exact — same hook stdin/stdout pattern |
| `.claude/commands/team-lead/execute.md` | config (pipeline orchestrator) | event-driven | `.claude/commands/team-lead/execute.md` (itself) | self — modify existing file |
| `.planning/task-schema.yaml` | config (schema) | — | `.planning/task-schema.yaml` (itself) | self — modify existing file |

---

## Pattern Assignments

### `kanban-server/index.js` (service, event-driven + request-response)

**Analog:** `.claude/hooks/task-state-guard.js` (CJS Node.js require pattern, file I/O, path usage)

**Imports pattern** (lines 1-8 of task-state-guard.js):
```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
```

New file extends this with:
```javascript
const express = require('express');
const chokidar = require('chokidar');   // MUST be 3.6.0 — v5 is ESM-only
const yaml = require('js-yaml');
const { execSync } = require('child_process');
```

**YAML frontmatter parsing pattern** (lines 140-145 of task-state-guard.js — the reuse anchor):
```javascript
function extractFrontmatterField(content, field) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const searchIn = fmMatch ? fmMatch[1] : content;
  const m = searchIn.match(new RegExp(`^${field}:\\s*(\\S+)`, 'm'));
  return m ? m[1] : undefined;
}
```

For the server's `parseTaskFile`, extend this pattern to return the full YAML object using js-yaml:
```javascript
function parseTaskFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;
    return yaml.load(fmMatch[1]);
  } catch {
    return null;  // malformed — skip per Claude's Discretion
  }
}
```

**Error handling pattern** (lines 123-126 of task-state-guard.js):
```javascript
  } catch (e) {
    // Silent fail — never block tool execution
    process.exit(0);
  }
```

For the server: wrap endpoint handlers in try/catch; return error JSON rather than crashing:
```javascript
app.post('/tasks/:id/stop', (req, res) => {
  try {
    // ... handler body ...
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**SSE client registry + chokidar watcher core pattern** (from RESEARCH.md Pattern 1 + 2 — no codebase analog exists; use these directly):
```javascript
const clients = [];

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

function pushEvent(taskObj) {
  const data = `event: task-updated\ndata: ${JSON.stringify(taskObj)}\n\n`;
  for (const res of clients) res.write(data);
}

const WORK_DIR = path.resolve('.planning/work');
chokidar.watch(`${WORK_DIR}/**/*.md`, {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
})
  .on('add',    f => { const t = parseTaskFile(f); if (t) pushEvent(t); })
  .on('change', f => { const t = parseTaskFile(f); if (t) pushEvent(t); })
  .on('unlink', f => { pushEvent({ id: path.basename(f, '.md'), deleted: true }); });
```

**Stop-and-commit pattern using `child_process` + `cwd` option** (from RESEARCH.md Pattern 4 — no codebase analog for git sub-repo ops; use this):
```javascript
const stoppable = ['inProgress', 'inReview', 'inTesting', 'forTeamLeadCheck'];

app.post('/tasks/:id/stop', (req, res) => {
  const taskId = req.params.id;
  if (!/^TASK-\d{3}$/.test(taskId)) {
    return res.status(400).json({ error: 'Invalid task ID format' });
  }
  // ... find + parse task file ...
  if (!stoppable.includes(task.status)) {
    return res.status(409).json({ error: `Cannot stop task in status: ${task.status}` });
  }
  // Write status + updated-at (hook does NOT fire for server fs writes — must set both)
  const now = new Date().toISOString();
  let content = fs.readFileSync(found, 'utf8');
  content = content.replace(/^status:\s*\S+/m,      'status: stopped');
  content = content.replace(/^updated-at:\s*.+/m,   `updated-at: ${now}`);
  fs.writeFileSync(found, content, 'utf8');
  // git -C <repoDir> checkout -B + add -A + commit
  const repoDir = task.repo === 'be' ? 'ai-platform' : 'ai-platform-fe';
  const branch  = `task/${taskId}/stopped`;
  const msg     = `wip(${taskId}): stopped mid-pipeline`;
  try {
    execSync(`git checkout -b ${branch}`, { cwd: repoDir, stdio: 'pipe' });
  } catch {
    execSync(`git checkout -B ${branch}`, { cwd: repoDir, stdio: 'pipe' });
  }
  execSync('git add -A',             { cwd: repoDir, stdio: 'pipe' });
  execSync(`git commit -m "${msg}"`, { cwd: repoDir, stdio: 'pipe' });
  res.json({ ok: true, branch });
});
```

**Server entry point + port pattern** (no analog — new pattern for this project):
```javascript
const PORT = process.env.PORT || 6111;   // D-10
app.listen(PORT, () => console.log(`kanban-server listening on :${PORT}`));
```

---

### `kanban-server/package.json` (config, standalone CJS package)

**Analog:** `.claude/package.json` (lines 1-1):
```json
{"type":"commonjs"}
```

The new `kanban-server/package.json` extends this minimal pattern with named dependencies. Copy the `"type": "commonjs"` key. Add `name`, `version`, `scripts.start`, and `dependencies`:

```json
{
  "name": "kanban-server",
  "version": "1.0.0",
  "type": "commonjs",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express":  "5.2.1",
    "chokidar": "3.6.0",
    "js-yaml":  "4.1.1"
  }
}
```

**Critical constraint:** `"chokidar": "3.6.0"` must be pinned exactly. `npm install chokidar` without a pin installs v5 (ESM-only), which breaks `require('chokidar')`.

---

### `.claude/hooks/task-state-guard.js` — MODIFY: add `stopped` to VALID_TRANSITIONS

**Analog:** The file itself (lines 10-17 for the current VALID_TRANSITIONS map, line 129-138 for the `deny` function pattern).

**Current VALID_TRANSITIONS** (lines 10-17 — read-only reference):
```javascript
const VALID_TRANSITIONS = {
  readyForDevelop: ['inProgress'],
  inProgress:      ['inReview', 'readyForDevelop'],
  inReview:        ['inTesting', 'inProgress'],
  inTesting:       ['forTeamLeadCheck', 'inProgress'],
  forTeamLeadCheck: ['done', 'inProgress'],
  done:            [],
};
```

**Target state after edit** (D-02 — add `stopped` to all active status arrays; add `stopped: []` terminal entry):
```javascript
const VALID_TRANSITIONS = {
  readyForDevelop:  ['inProgress'],
  inProgress:       ['inReview', 'readyForDevelop', 'stopped'],
  inReview:         ['inTesting', 'inProgress', 'stopped'],
  inTesting:        ['forTeamLeadCheck', 'inProgress', 'stopped'],
  forTeamLeadCheck: ['done', 'inProgress', 'stopped'],
  done:             [],
  stopped:          [],
};
```

**No annotation check needed for `stopped`:** The annotation-gated blocks (lines 71-82) guard only rejection reversals (`inReview → inProgress` and `forTeamLeadCheck → inProgress`). The `stopped` destination requires no annotation — the server is the legitimate initiator (D-02, per CONTEXT.md specifics).

**Hook stdin/stdout pattern** (lines 19-22, 122-126 — must be preserved unchanged):
```javascript
let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    // ... body ...
  } catch (e) {
    process.exit(0);  // silent fail
  }
});
```

---

### `.claude/commands/team-lead/execute.md` — MODIFY: add `stopped` check at each stage gate

**Analog:** The file itself. The existing gate structure (STEP 3) already follows a consistent pattern: Edit status → invoke Agent → check receipt signal. The `stopped` check inserts before each Agent invocation.

**Existing gate pattern to follow** (lines 105-129 — Developer Stage structure):
```markdown
Edit the task file: change `status: readyForDevelop` to `status: inProgress`.
...
Invoke Agent with `subagent_type = developer_agent`. Include the stage context preamble...
```

**Pattern to insert before each `Invoke Agent` line** (D-03, following the `[pipeline] SIGNAL` receipt format from phases 03 and 04):
```markdown
**Stopped check:** Re-read the task file at `<task_path>`. If frontmatter `status` is `stopped`:
  - Append to task file body: `[pipeline] STOPPED`
  - Print: `Pipeline stopped by user at [stage name]. Task <id> is on branch task/<id>/stopped.`
  - Stop pipeline (do not advance to the next agent).
```

**Insert this block before Agent invocations at these four points:**
1. Before Developer Stage Agent invocation (after the Edit `readyForDevelop → inProgress`)
2. Before CodeReview Stage Agent invocation (after Git Diff Stage)
3. Before QA Stage Agent invocation (after Status Advance `inProgress → inReview`)
4. Before TeamLeadCheck Stage Agent invocation (after Status Advance `inReview → inTesting → forTeamLeadCheck`)

**Receipt format reference** (from phase 04 annotation convention — consistent `[agent-name] SIGNAL` pattern seen throughout execute.md):
- `[pipeline] STOPPED` — no block header needed, just a plain appended line.

---

### `.planning/task-schema.yaml` — MODIFY: add `stopped` to status enum

**Analog:** The file itself (lines 19-23 for status field definition, lines 55-70 for lifecycle section).

**Current status field** (lines 19-23):
```yaml
  status:
    type: enum
    values: [readyForDevelop, inProgress, inReview, inTesting, forTeamLeadCheck, done]
    required: true
    initial: readyForDevelop
```

**Target state after edit:**
```yaml
  status:
    type: enum
    values: [readyForDevelop, inProgress, inReview, inTesting, forTeamLeadCheck, done, stopped]
    required: true
    initial: readyForDevelop
```

**Current lifecycle section** (lines 55-70 — terminal statuses `done` sets `allowed_next: []`):
```yaml
  done:
    allowed_next: []
```

**Append `stopped` lifecycle entry after `done`:**
```yaml
  stopped:
    allowed_next: []
    notes:
      description: "Terminal status set by kanban-server stop-and-commit endpoint. Pipeline halts without advancing."
```

---

## Shared Patterns

### CJS Hook stdin/stdout Bootstrap
**Source:** `.claude/hooks/task-state-guard.js` lines 19-27 and 123-126
**Apply to:** Any new `.claude/hooks/*.js` file (not directly needed for Phase 5, but the pattern is the hook contract)
```javascript
let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    // ... handler ...
  } catch (e) {
    process.exit(0); // silent fail — never block tool execution
  }
});
```

### YAML Frontmatter Parsing
**Source:** `.claude/hooks/task-state-guard.js` lines 140-145
**Apply to:** `kanban-server/index.js` `parseTaskFile` function
```javascript
function extractFrontmatterField(content, field) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const searchIn = fmMatch ? fmMatch[1] : content;
  const m = searchIn.match(new RegExp(`^${field}:\\s*(\\S+)`, 'm'));
  return m ? m[1] : undefined;
}
```

### Deny Response Pattern
**Source:** `.claude/hooks/task-state-guard.js` lines 129-138
**Apply to:** Any hook that needs to deny a tool call
```javascript
function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}
```

### Shell Test Script Structure
**Source:** `scripts/test-pipeline-guard.sh` lines 1-12 + 116-163 (fixture setup + run_hook helper + assert pattern)
**Apply to:** `scripts/test-kanban-guard.sh` (Wave 0 gap — new test script needed per RESEARCH.md)

Key patterns to copy:
- `set -e` at top
- `HOOK="$(dirname "$0")/../.claude/hooks/task-state-guard.js"` for hook path
- `mktemp -d` + `FIXTURE_DIR` inside `.planning/work/` path (so hook path filter passes)
- `trap 'rm -rf "$TMPDIR"' EXIT` for cleanup
- `run_hook()` helper using `printf ... | node "$HOOK"`
- `grep -q '"permissionDecision":"allow"'` / `'"permissionDecision":"deny"'` assertions

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `kanban-server/index.js` (Express SSE + chokidar portions) | service | event-driven streaming | No Express server or SSE pattern exists in this workspace. Server patterns sourced from RESEARCH.md code examples (ASSUMED — standard Node.js/Express SSE). |
| `kanban-server/` (directory structure) | — | — | First standalone plain-JS server in this workspace. All other server code is in Nx-managed TypeScript sub-repos. |

---

## Metadata

**Analog search scope:** `.claude/hooks/`, `scripts/`, workspace root (`package.json`, `CLAUDE.md`), `.planning/task-schema.yaml`, `.claude/commands/team-lead/execute.md`
**Files scanned:** 10 (task-state-guard.js, stop-guard.js, gsd-workflow-guard.js, gsd-check-update.js, test-pipeline-guard.sh, test-stop-guard.sh, execute.md, task-schema.yaml, .claude/package.json, workspace package.json)
**Pattern extraction date:** 2026-05-26
