---
phase: 02-teamlead-skills
reviewed: 2026-05-23T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - .claude/hooks/stop-guard.js
  - scripts/test-stop-guard.sh
  - .claude/settings.json
  - .claude/commands/team-lead/plan.md
  - .claude/commands/team-lead/execute.md
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-05-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Five files were reviewed: the `stop-guard.js` hook, its test script, the Claude settings file, and the two team-lead slash commands (`plan.md`, `execute.md`). The hook logic itself is structurally sound for its stated purpose, but the test suite has a machine-specific hardcoded path that breaks on any other developer machine. The settings file carries the same machine-locked node path repeated across nine hook entries, making the project non-portable as a whole. The command files reveal two behavioral correctness gaps: the `execute.md` command never uses the `Edit` tool (only listed in allowed-tools as a missing dependency), and the `plan.md` fallback for empty `## Goal` has an edge case that silently produces a collision-prone slug. These are detailed below.

---

## Critical Issues

### CR-01: Hardcoded absolute Node path in `test-stop-guard.sh` breaks on every non-owner machine

**File:** `scripts/test-stop-guard.sh:8`
**Issue:** `NODE` is set to `/Users/tarasbannyi/.nvm/versions/node/v22.18.0/bin/node`. This path does not exist on any other developer's machine, on CI, or even on the same machine after an nvm version upgrade. When the path is absent, the test silently fails with "command not found" rather than a meaningful error. Because `set -e` is active, the first test exits immediately — the test suite produces a misleading non-zero exit code and no coverage.
**Fix:**
```bash
# Replace line 8 with a portable lookup:
NODE="$(command -v node)"
if [ -z "$NODE" ]; then
  echo "ERROR: node not found in PATH" >&2
  exit 1
fi
```

---

### CR-02: Hardcoded absolute Node path in `settings.json` makes every hook non-functional on other machines

**File:** `.claude/settings.json:8,24,35,45,66,78,88,98,108`
**Issue:** All nine hook `command` entries hard-code `/Users/tarasbannyi/.nvm/versions/node/v22.18.0/bin/node`. Any collaborator who clones this repository, or CI that runs the hooks, will find every hook failing immediately with "No such file or directory". This silently disables all guardrails (prompt-guard, read-guard, workflow-guard, task-state-guard, stop-guard) — exactly the hooks that prevent destructive operations. This is a security/correctness gap: protection hooks become no-ops.
**Fix:** Replace the absolute path with `node` (resolved from `$PATH`) in every command. Because the Claude settings file does not support shell variable expansion for the binary, the canonical fix is to wrap each hook in a small launcher script or use `env node`:
```json
"command": "env node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/stop-guard.js"
```
Apply the same pattern to all nine entries.

---

## Warnings

### WR-01: `stop-guard.js` — both branches of the `if/else` are identical; the guard logic is dead code

**File:** `.claude/hooks/stop-guard.js:14-18`
**Issue:** The comment at line 13 says "CRITICAL: if already in forced-continuation state, let Claude stop." Both the `if (data.stop_hook_active === true)` branch and the fall-through else both call `process.exit(0)`. There is no difference in behavior between the two code paths. The guard that was meant to break an infinite loop by returning a non-zero exit code (or a block response) does nothing distinguishable. If the intent was to return a `decision: block` or `exit(2)` in the *non-active* branch to force continuation, that logic is absent.
**Fix:** Clarify the intent. If the hook's only job is "always allow stop", the entire `if` block should be removed. If the hook is supposed to *force* the agent to continue when `stop_hook_active` is false, the non-active branch must emit a different exit code or a JSON block response, not `exit(0)`:
```js
if (data.stop_hook_active === true) {
  // Loop-breaker already active — allow stop unconditionally.
  process.exit(0);
}
// Not yet in forced-continuation: block stop to trigger continuation.
process.stdout.write(JSON.stringify({ decision: 'block', reason: 'Forcing continuation pass.' }));
process.exit(0);
```
The correct logic depends on the Claude hooks API contract. As written, the `stop_hook_active` check is unreachable dead code.

---

### WR-02: `test-stop-guard.sh` — test assertions are exit-code only; no output content is verified

**File:** `scripts/test-stop-guard.sh:12-17`
**Issue:** Both tests only verify that the hook exits 0 (via `set -e`). They do not assert anything about the JSON the hook writes to stdout. If the hook starts emitting a `decision: block` payload while still exiting 0, the tests continue to "pass" even though the behavior has changed. The `PASS:` print lines are also only reached on exit 0, so they add no additional safety.
**Fix:** Capture stdout and assert its content:
```bash
OUTPUT=$(echo "$PAYLOAD" | "$NODE" "$HOOK")
EXIT=$?
[ $EXIT -eq 0 ] || { echo "FAIL: expected exit 0, got $EXIT"; exit 1; }
# If hook must produce no output on allow:
[ -z "$OUTPUT" ] || { echo "FAIL: unexpected output: $OUTPUT"; exit 1; }
echo "PASS: stop_hook_active=true exits 0 with no output"
```

---

### WR-03: `execute.md` — `Edit` tool is required by the pipeline but absent from `allowed-tools`

**File:** `.claude/commands/team-lead/execute.md:6-12, 68`
**Issue:** STEP 3 explicitly instructs the agent to use the `Edit` tool ("Write only the `status:` line in the task file frontmatter to the next status value **using the Edit tool**"). However, `allowed-tools` in the command frontmatter lists: `Read`, `Write`, `Bash`, `Glob`, `Grep`, `Agent`. `Edit` is not listed. The agent will be denied use of the `Edit` tool when executing this command, causing every pipeline stage to fail at the status-transition step.
**Fix:**
```yaml
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
```

---

### WR-04: `plan.md` STEP 2 — slug derivation silently produces collision-prone fallback for empty Goal

**File:** `.claude/commands/team-lead/plan.md:108`
**Issue:** The fallback rule states: "If `## Goal` is empty or absent, use the SPEC.md filename (without path or `.md` extension)". SPEC files are often named `SPEC.md` (the template generated by `--new` is written at `./<epic-name>/SPEC.md`, but the filename itself is always `SPEC.md`). Any empty-goal spec falls back to the slug `spec`, and all resulting tasks land in `.planning/work/spec/`. Multiple epics with empty goals would collide in the same directory, with task IDs potentially overwriting each other (TASK-001 from epic A clobbering TASK-001 from epic B).
**Fix:** Require a non-empty `## Goal` rather than silently falling back. If a fallback is needed, use the parent directory name of the spec file rather than its basename:
```
Fallback: extract the parent directory of the SPEC.md path and apply the same kebab-case rules.
Example: path `my-auth-epic/SPEC.md` → slug `my-auth-epic`.
```

---

### WR-05: `execute.md` STEP 2 — "continue from current stage" logic has no mapping table

**File:** `.claude/commands/team-lead/execute.md:56-61`
**Issue:** When the user replies `y` to the non-`readyForDevelop` warning, the command says "proceed to the stage that corresponds to the current status." There is no lookup table or rule provided to derive which stage corresponds to which status. An agent must infer this mapping from the pipeline table in STEP 3, which lists only forward transitions. Status values like `inTesting` or `forTeamLeadCheck` map ambiguously to stages (QA vs. TeamLeadCheck). If the agent guesses incorrectly it could re-run an already-completed stage, double-writing a transition that `task-state-guard.js` will reject.
**Fix:** Add an explicit mapping table in STEP 2:
```
Status → Resume at stage:
  inProgress        → CodeReview
  inReview          → QA
  inTesting         → TeamLeadCheck
  forTeamLeadCheck  → Done
  done              → (already complete — print notice and stop)
```

---

## Info

### IN-01: `stop-guard.js` — `stdinTimeout` of 3000ms is asymmetric with hook timeout of 5s in `settings.json`

**File:** `.claude/hooks/stop-guard.js:6` / `.claude/settings.json:68`
**Issue:** The Stop hook has a `"timeout": 5` (seconds) configured in settings, but the internal stdin timeout fires after 3000ms. While not a bug in isolation, the mismatch means the hook self-terminates before the platform would kill it, which obscures whether hangs are hook-internal or platform-imposed.
**Fix:** Align both values, or document why the internal timeout is intentionally shorter.

---

### IN-02: `settings.json` — Node version pinned to `v22.18.0`; no `.nvmrc` or `engines` field guards compatibility

**File:** `.claude/settings.json:8` (and all hook entries)
**Issue:** The pinned version `v22.18.0` will silently differ from whatever `node` resolves to in a collaborator's shell. No `.nvmrc` or `package.json` `engines` field communicates the intended version.
**Fix:** Add `.nvmrc` at the project root with `22.18.0` (or the minimum required version), and add `"engines": { "node": ">=22" }` to `package.json` if one exists.

---

### IN-03: `plan.md` STEP 6 — confirmation prompt accepts only `y`/`Y`; `yes` is rejected silently

**File:** `.claude/commands/team-lead/plan.md:204-207`
**Issue:** STEP 7 states "If the user replies `y` or `Y`" write files; anything else aborts. A user typing `yes` or `YES` triggers the abort path and sees "Aborted. No files written." which is surprising and provides no hint that `y` is the required input.
**Fix:** Either accept `yes`/`YES` as well, or make the prompt explicit: `Write these tasks? [y/N] (type exactly 'y' to confirm)`.

---

_Reviewed: 2026-05-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
