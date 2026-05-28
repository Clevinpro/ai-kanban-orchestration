---
phase: 05-kanban-server
fixed_at: 2026-05-26T00:00:00Z
review_path: .planning/phases/05-kanban-server/05-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-05-26T00:00:00Z
**Source review:** .planning/phases/05-kanban-server/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (3 Critical + 4 Warning; Info excluded per instruction)
- Fixed: 7
- Skipped: 0

## Fixed Issues

### CR-01: Annotation gate regex false-positive — wrong-section match

**Files modified:** `.claude/hooks/task-state-guard.js`
**Commit:** 82a0e4e
**Applied fix:** Replaced `[\s\S]*?` with `[^#]*` in both annotation gate regexes (QA Results and TeamLead Check). The new pattern stops matching at the next `##` heading character, preventing text in a later section (such as a REVIEW-BLOCK that contains `Status: FAIL`) from satisfying the gate prematurely. Added clarifying comments explaining the `[^#]*` anchor behaviour.

---

### CR-02: PORT env var silently produces NaN — server crashes or binds to wrong port

**Files modified:** `kanban-server/index.js`
**Commit:** b451830
**Applied fix:** Replaced single-expression `PORT` assignment with a two-step parse: `rawPort = parseInt(process.env.PORT, 10)` then `PORT = (!process.env.PORT || isNaN(rawPort)) ? 6111 : rawPort`. Non-numeric values (e.g. `PORT=abc`) now fall back to 6111 instead of producing `NaN`.

---

### CR-03: git operations use unvalidated relative `cwd` path from task frontmatter

**Files modified:** `kanban-server/index.js`
**Commit:** 397a306
**Applied fix:** Replaced the silent ternary `task.repo === 'be' ? 'ai-platform' : 'ai-platform-fe'` with a `VALID_REPOS` lookup map. Returns HTTP 422 for unknown `task.repo` values and HTTP 500 when the resolved directory does not exist. Used `path.resolve(repoDirName)` to produce an absolute `repoDir` so git operations are not sensitive to the server's working directory.

---

### WR-01: POST /tasks/:id/stop endpoint has no CORS headers — browser preflight will fail

**Files modified:** `kanban-server/index.js`
**Commit:** f82a11b
**Applied fix:** Added a global CORS middleware block immediately after `app.use(express.json())` and before all route definitions. The middleware sets `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods`, and `Access-Control-Allow-Headers` on every response, and replies 204 to OPTIONS preflight requests. This also covers any future endpoints added to the server.

---

### WR-02: `stopped` status has no resume path in execute.md pipeline

**Files modified:** `.claude/commands/team-lead/execute.md`
**Commit:** 2f2be97
**Applied fix:** Added an explicit `stopped` row to the "Status → Resume at stage" table in STEP 2. The row directs the agent to print `"Task <id> is stopped. Reset to readyForDevelop or inProgress manually, then re-run."` and stop, preventing undefined fall-through behaviour.

---

### WR-03: `git diff --stat HEAD` gates commits on working-tree-only changes — misses committed-but-not-pushed state

**Files modified:** `kanban-server/index.js`
**Commit:** fc7c399
**Applied fix:** After the existing `git diff --stat HEAD` check, added a `git log --oneline @{u}..HEAD` command (with `|| git log --oneline HEAD` fallback when no upstream is configured) to detect commits that are present locally but not yet pushed. The early-return `committed: false` path now requires both `diffOutput` and `aheadOutput` to be empty.

---

### WR-04: `task-state-guard.js` `updated-at` injection comment is misleading

**Files modified:** `.claude/hooks/task-state-guard.js`
**Commit:** 2f3418b
**Applied fix:** Replaced the comment on the Edit-tool `updated-at` injection path to accurately state that the timestamp update is a no-op for normal pipeline Edit calls (which only replace the `status:` line). The comment now clarifies that injection only takes effect when `updated-at` is explicitly present in `new_string`. No logic was changed.

---

_Fixed: 2026-05-26T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
