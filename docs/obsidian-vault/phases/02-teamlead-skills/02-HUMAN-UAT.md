---
status: partial
phase: 02-teamlead-skills
source: [02-VERIFICATION.md]
started: 2026-05-23T11:35:00Z
updated: 2026-05-23T11:35:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Review gate appears before file writes; TASK files written with all 9 fields after y/Y
expected: Running `/team-lead:plan <SPEC.md>` prints `| ID | Title | Complexity | Repo | Epic |` table and prompts "Write these tasks? [y/N]" before writing any TASK-XXX.md files. After confirming `y`, files are written with all 9 required frontmatter fields.
result: [pending]

### 2. Missing SPEC header triggers error and stops
expected: Running `/team-lead:plan <SPEC.md>` against a SPEC.md missing one or more of `## Goal`, `## User Stories / Requirements`, `## Acceptance Criteria`, `## Technical Design` prints an error listing missing headers and halts — no TASK files written.
result: [pending]

### 3. --new flag writes SPEC.md template with 4 headers, no task generation
expected: Running `/team-lead:plan --new epic-name` writes a SPEC.md template containing all 4 required section headers and stops without generating any TASK-XXX.md files.
result: [pending]

### 4. Full pipeline run produces 5 stage progress lines; final status is "done"
expected: Running `/team-lead:execute TASK-001` advances a task through all 5 stages (Developer → CodeReview → QA → TeamLeadCheck → Done), printing a progress trail line for each stage, and the final task file status is `done`.
result: [pending]

### 5. Bare integer normalizes to TASK-001
expected: Running `/team-lead:execute 1` (or `01`, `TASK-1`) correctly resolves to `TASK-001` and reads the right task file.
result: [pending]

### 6. Failure gate prompts Retry/Skip/Abort and does not auto-retry
expected: When a stage is simulated to fail, Claude pauses and presents the prompt `Stage failed: [reason]. Retry / Skip / Abort?` without automatically retrying.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
