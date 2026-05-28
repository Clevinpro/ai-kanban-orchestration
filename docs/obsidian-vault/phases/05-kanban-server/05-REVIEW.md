---
phase: 05-kanban-server
reviewed: 2026-05-26T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - .claude/commands/team-lead/execute.md
  - .claude/hooks/task-state-guard.js
  - kanban-server/index.js
  - kanban-server/package.json
  - scripts/test-kanban-guard.sh
findings:
  critical: 3
  warning: 4
  info: 2
  total: 9
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-05-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Five files were reviewed: the pipeline execute command, the PreToolUse hook, the kanban Express/SSE server, its package.json, and the shell test harness. The core state-machine logic is sound and the task-ID validation in the HTTP endpoint is correctly implemented. Three blockers were identified: the annotation gate in the hook uses a regex that can be satisfied by text in the wrong section of the document, the git operations in the stop endpoint run against a relative path that is never validated, and invalid PORT environment values silently produce NaN causing the server to fail at start. Several additional warnings cover a CORS gap on the stop endpoint, a missing resume case for `stopped` tasks in execute.md, an always-`ai-platform-fe` fallback when `repo` is absent, and an issue with the git diff command used to gate commits.

---

## Critical Issues

### CR-01: Annotation gate regex false-positive — wrong-section match

**File:** `.claude/hooks/task-state-guard.js:74`

**Issue:** The QA gate regex `## QA Results[\s\S]*?Status: FAIL` uses a non-greedy `[\s\S]*?` that matches from the `## QA Results` header to the *first* occurrence of the literal string `Status: FAIL` anywhere in the file after that header. If the code-reviewer REVIEW-BLOCK (appended to the task file by execute.md before any QA run) contains the text `Status: FAIL` in its body — which is common in review reports that describe failing tests — the hook will grant the `inReview → inProgress` transition even though the QA agent never wrote a failure annotation. The same structural issue exists for the `## TeamLead Check[\s\S]*?Status: REJECTED` gate at line 80.

**Fix:** Anchor the match to the target section by stopping at the next `##` heading:

```javascript
// QA gate — must not bleed into subsequent sections
if (!diskContent.match(/## QA Results\b[^#]*Status: FAIL/)) {
  deny('Status regression inReview → inProgress requires ## QA Results block with Status: FAIL');
}

// TLC gate
if (!diskContent.match(/## TeamLead Check\b[^#]*Status: REJECTED/)) {
  deny('Status regression forTeamLeadCheck → inProgress requires ## TeamLead Check block with Status: REJECTED');
}
```

`[^#]*` matches any character except `#`, so the search stops when the next `##` heading begins.

---

### CR-02: PORT env var silently produces NaN — server crashes or binds to wrong port

**File:** `kanban-server/index.js:18`

**Issue:** `process.env.PORT ? parseInt(process.env.PORT, 10) : 6111` evaluates the env string for truthiness before parsing it. A non-empty but non-numeric value such as `PORT=abc` is truthy, so `parseInt('abc', 10)` returns `NaN`. `app.listen(NaN)` in Node.js/Express does not throw; it silently binds to a random OS-assigned port, making the server undiscoverable without a log grep.

```
PORT=abc node kanban-server/index.js
# prints: kanban-server listening on :NaN
# actual bound port is OS-assigned, not 6111
```

**Fix:**

```javascript
const rawPort = parseInt(process.env.PORT, 10);
const PORT = (!process.env.PORT || isNaN(rawPort)) ? 6111 : rawPort;
```

---

### CR-03: git operations use unvalidated relative `cwd` path from task frontmatter

**File:** `kanban-server/index.js:188`

**Issue:** `repoDir` is derived directly from the `task.repo` frontmatter field via a ternary that treats any value other than `'be'` as `'ai-platform-fe'`. This value is then passed as `cwd` to every `execSync` call. Three problems:

1. If `task.repo` is absent or any unexpected value (`null`, `both`, `fe-staging`, etc.), `repoDir` silently becomes `'ai-platform-fe'` and git operations run in the wrong sub-repo.
2. `repoDir` is a *relative* string. If the server process is not started from the workspace root (violating D-09), all `execSync` calls target the wrong absolute directory without any error until git itself complains.
3. There is no check that `repoDir` actually exists before invoking git, so a missing sub-repo produces a confusing `ENOENT` 500 error.

**Fix:**

```javascript
const VALID_REPOS = { be: 'ai-platform', fe: 'ai-platform-fe' };
const repoDirName = VALID_REPOS[task.repo];
if (!repoDirName) {
  return res.status(422).json({ error: 'Unknown repo value in task: ' + task.repo });
}
const repoDir = path.resolve(repoDirName); // absolute, avoids cwd drift
if (!fs.existsSync(repoDir)) {
  return res.status(500).json({ error: 'Sub-repo directory not found: ' + repoDirName });
}
```

---

## Warnings

### WR-01: POST /tasks/:id/stop endpoint has no CORS headers — browser preflight will fail

**File:** `kanban-server/index.js:152`

**Issue:** `GET /events` sets `Access-Control-Allow-Origin: *`, but `POST /tasks/:id/stop` has no CORS headers at all. Browsers send a preflight `OPTIONS` request for cross-origin POST calls. Because there is no OPTIONS handler and no CORS middleware, the preflight returns a 404 and the actual POST is never sent. Any Phase 6 browser client that calls this endpoint will fail silently.

**Fix:** Add a global CORS middleware above all routes, or register an explicit OPTIONS handler for the stop endpoint:

```javascript
// At the top of the app, before all routes:
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
```

---

### WR-02: `stopped` status has no resume path in execute.md pipeline

**File:** `.claude/commands/team-lead/execute.md:62`

**Issue:** STEP 2's "Status → Resume at stage" table covers `inProgress`, `inReview`, `inTesting`, `forTeamLeadCheck`, and `done`. The `stopped` status is absent. If a user attempts to resume a stopped task with `/team-lead:execute TASK-001`, the agent is instructed to "proceed to the stage that corresponds to the current status using the mapping below" but finds no entry for `stopped`. The resulting behavior is undefined — the agent may improvise incorrectly or silently fall through.

**Fix:** Add an explicit row to the resume table:

```markdown
| `stopped` | (requires manual status reset — print "Task <id> is stopped. Reset to readyForDevelop or inProgress manually, then re-run." and stop) |
```

---

### WR-03: `git diff --stat HEAD` gates commits on working-tree-only changes — misses committed-but-not-pushed state

**File:** `kanban-server/index.js:198`

**Issue:** `git diff --stat HEAD` shows the diff between the working tree (and index) and the HEAD commit. If the developer agent has already committed its changes (the normal end-state of a Developer Stage), the working tree is clean and this command returns empty output, causing `committed: false` to be returned and the stop-branch commit to be silently skipped even when there are new commits that should be preserved on the stop branch. The execute.md pipeline's Git Diff Stage (line 140) correctly uses `git diff --stat HEAD~1..HEAD` to compare commits.

**Fix:** Check for both uncommitted changes and whether HEAD is ahead of the remote:

```javascript
// Check uncommitted changes
diffOutput = execSync('git diff --stat HEAD', { cwd: repoDir, stdio: 'pipe' }).toString().trim();
// Also check for commits not yet on any remote branch
const aheadOutput = execSync('git log --oneline @{u}..HEAD 2>/dev/null || git log --oneline HEAD', 
  { cwd: repoDir, stdio: 'pipe' }).toString().trim();
if (!diffOutput && !aheadOutput) {
  return res.json({ ok: true, branch, committed: false });
}
```

---

### WR-04: `task-state-guard.js` `updated-at` injection only updates the `new_string` snippet for Edit calls — misses the rest of the file

**File:** `.claude/hooks/task-state-guard.js:110`

**Issue:** For the Edit tool path (line 110), the hook applies the `updated-at` timestamp replacement only to `tool_input.new_string` (the replacement snippet). If `updated-at` is in the part of the file *not* being replaced by the Edit call — which is the normal case, since pipeline edits only touch the `status:` line — the timestamp injection has no effect. The `updated-at` field is never updated for Edit-based status transitions.

For the Write tool path (line 105), the entire file content is available and the injection works correctly. The asymmetry means `updated-at` tracks changes only for full-file writes, not for the incremental edits that constitute normal pipeline operation.

**Fix:** On the Edit allow path, apply the timestamp to `diskContent` (the full on-disk content) after applying the edit, then return the complete updated content as `modifiedInput.content` via a Write-style response, or document that `updated-at` is intentionally not maintained for Edit calls and remove the misleading comment.

If maintaining the current approach, at minimum adjust the comment on line 108-109 to state that `updated-at` injection is a no-op for Edit calls that don't include the `updated-at` field in `new_string`.

---

## Info

### IN-01: Unused `NOW` variable in test script

**File:** `scripts/test-kanban-guard.sh:22`

**Issue:** `NOW="2026-05-26T12:00:00.000Z"` is assigned but never referenced anywhere in the script. It was likely intended for use in the fixture heredocs, but those embed the timestamp as a literal string directly.

**Fix:** Remove the unused variable assignment.

---

### IN-02: `TMPDIR` variable shadows the system `$TMPDIR` environment variable

**File:** `scripts/test-kanban-guard.sh:17`

**Issue:** The script assigns `TMPDIR="$(mktemp -d)"`. On macOS, `$TMPDIR` is a system-managed environment variable (typically `/var/folders/.../T/`) used by `mktemp` and other tools. Overwriting it in the script's environment means that if any subsequent command in the same script invokes `mktemp -d` (or any tool that reads `$TMPDIR`), it would look inside the freshly created temp directory. In this specific script there are no such subsequent calls, so no immediate breakage occurs, but it is a fragile pattern.

**Fix:** Use a different variable name:

```bash
WORK_TMPDIR="$(mktemp -d)"
FIXTURE_DIR="$WORK_TMPDIR/.planning/work/test-kanban"
mkdir -p "$FIXTURE_DIR"
trap 'rm -rf "$WORK_TMPDIR"' EXIT
```

---

_Reviewed: 2026-05-26T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
