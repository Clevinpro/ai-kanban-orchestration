---
phase: 02-teamlead-skills
plan: "02"
subsystem: tooling
tags: [slash-command, claude-code, task-generation, spec-validation]

requires:
  - phase: 01-foundation
    provides: task-state-guard.js PreToolUse hook (enforces readyForDevelop on write)
  - phase: 02-01
    provides: stop-guard.js and settings.json Stop hook registration

provides:
  - .claude/commands/team-lead/plan.md full implementation of /team-lead:plan slash command
  - SPEC.md section header validation (4 required headers)
  - Epic slug derivation from ## Goal with filename fallback
  - Complexity scoring 1-10 per generated task
  - Human review gate ("Write these tasks? [y/N]") before any file writes
  - --new flag for SPEC.md template generation

affects: [02-teamlead-skills, plan-command, task-generation]

tech-stack:
  added: []
  patterns:
    - "Slash command body as orchestration instruction — $ARGUMENTS substitution for path dispatch"
    - "Grep-based validation of required section headers before proceeding"
    - "Human review gate: print table first, ask confirmation, write only on y/Y"
    - "Auto-numbering via Glob on existing TASK-*.md files, increment max ID"

key-files:
  created: []
  modified:
    - .claude/commands/team-lead/plan.md

key-decisions:
  - "7-step implementation covers: argument dispatch, SPEC validation, slug derivation, codebase context read, ID check, task generation, review + confirm"
  - "Argument-hint updated to include --new flag; --new writes template SPEC.md and stops without task generation"
  - "Review table format: ID | Title | Complexity | Repo | Epic (per D-06)"
  - "repo: both explicitly prohibited in constraints and task generation instructions"
  - "readyForDevelop is the only allowed initial status — both documented and enforced by task-state-guard.js"

metrics:
  duration: 7min
  completed: 2026-05-23
---

# Phase 2 Plan 02: TeamLead Plan Command Summary

**Full /team-lead:plan slash command replacing stub — 7-step SPEC.md validation, epic slug derivation, codebase-context-aware task generation with complexity scoring, human review table, and write-on-confirmation gate**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-23T11:16:17Z
- **Completed:** 2026-05-23T11:23:13Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Replaced the stub body in `.claude/commands/team-lead/plan.md` with a full 7-step implementation
- STEP 0: `--new <epic-name>` flag writes a 4-header SPEC.md template and stops (no task generation)
- STEP 1: reads the SPEC.md at `$ARGUMENTS`, uses Grep to validate all four required headers (`## Goal`, `## User Stories / Requirements`, `## Acceptance Criteria`, `## Technical Design`); outputs missing headers and stops on failure
- STEP 2: derives epic slug from `## Goal` first sentence (lowercase kebab-case); falls back to filename slug
- STEP 3: reads `.planning/codebase/STRUCTURE.md` and `ARCHITECTURE.md` for task granularity and repo assignment context
- STEP 4: globs existing `TASK-*.md` files to find the max ID; starts new IDs one above that (zero-padded three digits)
- STEP 5: generates all 9 required frontmatter fields per task plus `## Description`, `## Acceptance Criteria`, `## Technical Notes` body sections
- STEP 6: prints `| ID | Title | Complexity | Repo | Epic |` review table **before writing any files**, then asks `Write these tasks? [y/N]`
- STEP 7: writes files on `y/Y`; prints `Aborted. No files written.` on any other response
- Updated `argument-hint` from `"<path-to-SPEC.md>"` to `"<path-to-SPEC.md> | --new <epic-name>"`

## Task Commits

Each task was committed atomically:

1. **Task 1: Write full plan.md instruction body** - `b505d09` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `.claude/commands/team-lead/plan.md` — Full /team-lead:plan slash command replacing stub; 7-step implementation covering TL-01, TL-03, TL-04, D-02 through D-07

## Decisions Made

- Kept all original frontmatter fields; updated `argument-hint` only
- --new flag writes template and stops — prevents partial task generation from an uninitiated SPEC
- repo:both prohibition stated in Constraints section and reinforced in STEP 5 field rules (task-state-guard.js enforces at write time anyway)
- readyForDevelop is the only valid initial status — mentioned twice (Constraints + STEP 5) for clarity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - slash command is immediately available in Claude Code as `/team-lead:plan`.

## Next Phase Readiness

- TL-01 satisfied: plan command reads SPEC.md + codebase context, generates tasks, outputs review list before any execution
- TL-03 satisfied: validates all four required section headers; stops with clear error on missing headers
- TL-04 satisfied: complexity score 1-10 per task, visible in review table and frontmatter
- D-02, D-03, D-04, D-05, D-06, D-07 all satisfied
- Plan 02-03 (execute.md command) can now proceed

---
*Phase: 02-teamlead-skills*
*Completed: 2026-05-23*
