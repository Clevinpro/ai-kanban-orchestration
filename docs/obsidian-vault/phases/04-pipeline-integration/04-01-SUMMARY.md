---
phase: 04-pipeline-integration
plan: "01"
subsystem: pipeline-guard
tags: [hook, annotation-gate, test, task-schema]
dependency_graph:
  requires: []
  provides: [annotation-gated-reverse-transitions, pipeline-guard-tests, task-test-fixture]
  affects: [.claude/hooks/task-state-guard.js, scripts/test-pipeline-guard.sh, .planning/task-schema.yaml, .planning/work/test-pipeline/TASK-TEST.md]
tech_stack:
  added: []
  patterns: [PreToolUse hook annotation check, bash test script with tmp fixture files]
key_files:
  created:
    - scripts/test-pipeline-guard.sh
    - .planning/work/test-pipeline/TASK-TEST.md
  modified:
    - .claude/hooks/task-state-guard.js
    - .planning/task-schema.yaml
decisions:
  - "D-06: Annotation-gated reverse transitions added to task-state-guard.js — inReview→inProgress requires ## QA Results Status: FAIL block; forTeamLeadCheck→inProgress requires ## TeamLead Check Status: REJECTED block"
  - "VALID_TRANSITIONS map left unchanged — both reverse transitions already present; annotation check is a conditional on existing allowed transitions"
  - "Test fixture files placed inside .planning/work/ subdirectory path in tmpdir so hook path filter passes during testing"
metrics:
  duration: "8 min"
  completed: "2026-05-25"
  tasks_completed: 2
  files_modified: 4
---

# Phase 04 Plan 01: Annotation-Gated Reverse Transitions Summary

**One-liner:** Hook-enforced annotation gates on inReview→inProgress and forTeamLeadCheck→inProgress using regex checks for ## QA Results Status: FAIL and ## TeamLead Check Status: REJECTED blocks.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend task-state-guard.js with annotation-gated reverse transition checks (D-06) | 8e03a96 | .claude/hooks/task-state-guard.js |
| 2 | Write test-pipeline-guard.sh (4-case unit test) and TASK-TEST.md fixture | a924111 | scripts/test-pipeline-guard.sh, .planning/work/test-pipeline/TASK-TEST.md, .planning/task-schema.yaml |

## What Was Built

**task-state-guard.js extension:** Inserted a two-block annotation check immediately after the `!allowed.includes(newStatus)` deny block (line 68) and before the repo check (line 71). The checks use:
- `/## QA Results[\s\S]*?Status: FAIL/` — required for inReview → inProgress
- `/## TeamLead Check[\s\S]*?Status: REJECTED/` — required for forTeamLeadCheck → inProgress

Both use capital S ("Status: FAIL", "Status: REJECTED") matching the hook-safe annotation format that qa-be/qa-fe and team-lead-check agents write. VALID_TRANSITIONS map was NOT changed — both reverse transitions were already present.

**test-pipeline-guard.sh:** 4-case bash unit test mirroring the test-stop-guard.sh pattern. Creates 4 fixture files in a tmp directory that includes `.planning/work/` in the path (required by the hook's path filter). Tests exit 0 with all PASS lines printed.

**TASK-TEST.md:** Fixture task file at `.planning/work/test-pipeline/TASK-TEST.md` with `status: readyForDevelop`.

**task-schema.yaml:** Added `notes:` sub-keys to `inReview` and `forTeamLeadCheck` lifecycle entries documenting the annotation gate enforcement.

## Verification Results

```
PASS: Case A — bare inReview → inProgress correctly denied
PASS: Case B — annotated inReview → inProgress correctly allowed
PASS: Case C — bare forTeamLeadCheck → inProgress correctly denied
PASS: Case D — annotated forTeamLeadCheck → inProgress correctly allowed
All tests passed.
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixture path did not include .planning/work/ in path**
- **Found during:** Task 2
- **Issue:** Initial test script placed fixture files in a bare tmpdir (e.g., `/tmp/XXXXX/`). The hook's path filter exits early unless the file path includes `.planning/work/`, causing all hook invocations to return no output and test assertions to fail.
- **Fix:** Changed fixture directory to `$TMPDIR/.planning/work/test-pipeline/` so the hook path filter passes.
- **Files modified:** scripts/test-pipeline-guard.sh
- **Commit:** a924111 (same task commit — fixed before committing)

## Known Stubs

None — all functionality is fully wired and tested.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. The hook modification is a tightening of an existing enforcement point (T-04-01 mitigated as planned).

## Self-Check: PASSED

- .claude/hooks/task-state-guard.js: FOUND (modified, annotation checks present)
- scripts/test-pipeline-guard.sh: FOUND (created, passes all 4 cases)
- .planning/work/test-pipeline/TASK-TEST.md: FOUND (created, status: readyForDevelop)
- .planning/task-schema.yaml: FOUND (modified, Rejection-only notes present)
- Commit 8e03a96: FOUND
- Commit a924111: FOUND
