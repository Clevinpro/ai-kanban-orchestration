---
phase: 01-foundation
plan: 05
subsystem: hooks
tags: [gap-closure, bug-fix, documentation, task-state-guard]
dependency_graph:
  requires: [01-01-PLAN.md, 01-03-PLAN.md, 01-04-PLAN.md]
  provides: [correct-edit-timestamp-injection, requirements-complete-state]
  affects: [task-state-guard.js, REQUIREMENTS.md, ROADMAP.md]
tech_stack:
  added: []
  patterns: [PreToolUse-modifiedInput-keyed-by-tool-name]
key_files:
  created: []
  modified:
    - .claude/hooks/task-state-guard.js
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
decisions:
  - "Edit allow path in task-state-guard.js now returns modifiedInput.new_string — only the replaced snippet receives timestamp injection, not the full reconstructed file"
  - "finalContent variable is retained for repo validation only; it is NOT used in modifiedInput on either path"
metrics:
  duration: 8 min
  completed: 2026-05-22
  tasks_completed: 2
  tasks_total: 2
---

# Phase 01 Plan 05: Gap Closure (CR-01 Fix + Documentation) Summary

**One-liner:** Fixed Edit allow path in task-state-guard.js to return `modifiedInput.new_string` (CR-01), and marked FOUND-04/FOUND-05 complete in REQUIREMENTS.md while correcting ROADMAP.md SC-2 hook label from PostToolUse to PreToolUse.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix Edit allow path in task-state-guard.js | 17c87a9 | `.claude/hooks/task-state-guard.js` |
| 2 | Update REQUIREMENTS.md and ROADMAP.md to close documentation gaps | 96e9d3c | `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` |

## What Was Built

### Task 1: CR-01 Bug Fix — Edit Allow Path

The ALLOW block in `task-state-guard.js` was using a single `modifiedInput: { content: updatedContent }` for both Write and Edit tool calls. The Claude Code Edit tool ignores `content` on modifiedInput — it only reads `new_string`. This meant every status transition made via an Edit call silently dropped the timestamp injection, leaving stale `updated-at` values in task files.

The fix splits the ALLOW block into two branches keyed on `tool_name`:
- **Write path**: unchanged behavior — applies timestamp regex to `tool_input.content`, returns `modifiedInput: { content: updatedContent }`
- **Edit path**: new behavior — applies timestamp regex to `tool_input.new_string` (the replacement snippet only, not the full reconstructed file), returns `modifiedInput: { new_string: updatedNewString }`

The `finalContent` variable (reconstructed full file) is kept for the repo `both` validation in step 7 but is no longer used as modifiedInput source on either path.

Also fixed stray comment on line 29: "only Watch Write and Edit" → "only handle Write and Edit" (IN-04 cosmetic fix from verification report).

### Task 2: Documentation Gap Closure

Three targeted edits to close documentation gaps identified in the Phase 1 verification report:

1. `REQUIREMENTS.md` Foundation checklist: unchecked `[ ]` → checked `[x]` for FOUND-04 and FOUND-05
2. `REQUIREMENTS.md` Traceability table: status column changed from `Pending` → `Complete` for FOUND-04 and FOUND-05 rows
3. `ROADMAP.md` Phase 1 SC-2: "PostToolUse hook" → "PreToolUse hook" (the hook is a PreToolUse hook — it prevents writes before they reach disk)

## Verification Results

All automated checks passed:

| Check | Result |
|-------|--------|
| `new_string: updatedNewString` present in hook | PASS |
| `content: updatedContent` present in hook | PASS |
| `tool_name === 'Write'` branch present | PASS |
| Edit smoke test: output has `new_string` key with fresh timestamp | PASS |
| Write smoke test: output has `content` key with fresh timestamp | PASS |
| FOUND-04 checkbox `[x]` in REQUIREMENTS.md | PASS |
| FOUND-05 checkbox `[x]` in REQUIREMENTS.md | PASS |
| FOUND-04 traceability row shows Complete | PASS |
| FOUND-05 traceability row shows Complete | PASS |
| ROADMAP SC-2 contains `PreToolUse hook` | PASS |
| ROADMAP SC-2 does NOT contain `PostToolUse hook` | PASS |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. The hook change is purely an output key correction within the existing PreToolUse trust boundary.

## Self-Check: PASSED

Files verified:
- FOUND: `.claude/hooks/task-state-guard.js` (modified)
- FOUND: `.planning/REQUIREMENTS.md` (modified)
- FOUND: `.planning/ROADMAP.md` (modified)

Commits verified:
- FOUND: 17c87a9 (fix Edit allow path)
- FOUND: 96e9d3c (documentation gap closure)
