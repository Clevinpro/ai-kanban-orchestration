---
phase: 01-foundation
plan: "01"
subsystem: infra
tags: [claude-code-hooks, yaml-schema, task-lifecycle, pretooluse]

requires: []
provides:
  - ".planning/task-schema.yaml — machine-readable YAML schema with 9 required fields and 6-state lifecycle"
  - ".planning/work/ — task file root directory (placeholder)"
  - ".claude/hooks/task-state-guard.js — PreToolUse hook that validates status transitions and repo field, injects updated-at"
  - ".claude/settings.json — hook registered under PreToolUse Write|Edit matcher"
affects:
  - 01-02
  - 01-03
  - 01-04
  - team-lead-agent
  - all phases that write task files

tech-stack:
  added: []
  patterns:
    - "PreToolUse hook with permissionDecision:deny blocks invalid writes before they reach disk"
    - "modifiedInput.content used to inject updated-at timestamp on every allowed write"
    - "Hook reconstructs full final content for Edit calls (diskContent + old_string replacement) to validate repo field"
    - "YAML frontmatter parsed via inline regex — zero external dependencies"
    - "3-second stdin timeout + try/catch ensures hook never blocks Claude Code"

key-files:
  created:
    - .planning/task-schema.yaml
    - .planning/work/.gitkeep
    - .claude/hooks/task-state-guard.js
  modified:
    - .claude/settings.json

key-decisions:
  - "Used PreToolUse hook (not PostToolUse) — PostToolUse cannot revert files; PreToolUse prevents the write entirely"
  - "Read current task file from disk via fs.readFileSync in PreToolUse — disk content IS the previous state before the write"
  - "Hook reconstructs full final content on Edit path to validate repo field against two-step injection attack"
  - "Inline regex for YAML frontmatter parsing — no yaml npm dependency needed"
  - "modifiedInput.content returns full reconstructed file content on both Write and Edit allow paths"

patterns-established:
  - "Hook stdin/stdout/exit contract: shebang + 3s timeout + try/catch + process.stdout.write(JSON) + exit(0)"
  - "Path filter as first guard inside hook — exit 0 immediately if path not in .planning/work/ or not .md"
  - "deny() helper function outputs hookSpecificOutput with permissionDecision:deny and exits 0"

requirements-completed: [FOUND-01, FOUND-02]

duration: 6min
completed: "2026-05-21"
---

# Phase 01 Plan 01: Task Schema and State Guard Summary

**PreToolUse hook enforcing 6-state task lifecycle with updated-at injection, plus YAML schema documenting all 9 required task fields**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-21T13:57:05Z
- **Completed:** 2026-05-21T14:03:11Z
- **Tasks:** 2
- **Files modified:** 4 (2 created in .planning/ gitignored, 1 new hook, 1 updated config)

## Accomplishments

- Task schema YAML documents all 9 required frontmatter fields and the full 6-state lifecycle with allowed transitions
- `.planning/work/` directory established as the task file root
- `task-state-guard.js` PreToolUse hook validates status transitions (blocks invalid), rejects `repo: both`, and injects current ISO timestamp into `updated-at` on every allowed write
- Hook registered in `.claude/settings.json` PreToolUse array — all existing hooks preserved

## Task Commits

Each task was committed atomically:

1. **Task 1: Create task schema and work directory** — files in `.planning/` are gitignored; no git commit (filesystem only)
2. **Task 2: Create task-state-guard.js and register in settings.json** — `adf31ce` (feat)

**Plan metadata:** filesystem only (SUMMARY.md not git-committed per .gitignore)

## Files Created/Modified

- `.planning/task-schema.yaml` — YAML schema: version 1, task_id_format, 9 fields, 6-state lifecycle with allowed_next arrays
- `.planning/work/.gitkeep` — empty placeholder establishing task file root directory
- `.claude/hooks/task-state-guard.js` — PreToolUse hook: path filter, status validation, repo check, updated-at injection via modifiedInput
- `.claude/settings.json` — new PreToolUse entry added for task-state-guard.js (Write|Edit matcher, timeout 5)

## Decisions Made

- Used PreToolUse (not PostToolUse) as the hook type — PostToolUse fires after the write and cannot revert the file. PreToolUse prevents the write entirely.
- Read current file from disk via `fs.readFileSync` rather than `git show HEAD` — workspace root has no git repo; disk content before the PreToolUse fires IS the previous state.
- On the Edit allow path, reconstruct the full final file content (`diskContent.replace(old_string, new_string)`) and return it via `modifiedInput.content` — this guarantees `updated-at` is injected even when the agent's `new_string` contains only the status line.
- Validate `repo` field from the reconstructed final content (not just `new_string`) — blocks a two-step attack where a valid Write is followed by an Edit that introduces `repo: both`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The research correctly identified all pitfalls (PostToolUse vs PreToolUse, no git repo at workspace root, regex vs yaml dependency). Implementation followed the pre-researched patterns directly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Task schema and enforcement hook are complete. Phase 01 Plan 02 (CLAUDE.md hierarchy) can proceed.
- Any agent writing to `.planning/work/**/*.md` will have status transitions validated and `updated-at` auto-stamped.
- All six downstream phases that create or modify task files depend on this hook being registered.

## Self-Check

**Created files exist:**
- `.planning/task-schema.yaml` — FOUND
- `.planning/work/.gitkeep` — FOUND
- `.claude/hooks/task-state-guard.js` — FOUND

**Commits exist:**
- `adf31ce` — FOUND (feat(01-01): add task-state-guard hook and register in settings.json)

## Self-Check: PASSED

---
*Phase: 01-foundation*
*Completed: 2026-05-21*
