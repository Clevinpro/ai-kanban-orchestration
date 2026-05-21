---
name: team-lead:plan
description: Break a SPEC.md epic into TASK-XXX.md files with complexity scores. Pauses for human review before any code executes.
argument-hint: "<path-to-SPEC.md>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

## Constraints (MUST READ BEFORE PLANNING)

- **Max task size: ~10 minutes of execution time.** If a task would take longer, split it. This is enforced by design, not by a timer.
- **Fresh context window per task.** Each task executes in isolation — no state from previous tasks is available. Design tasks to be fully self-contained.
- **Repo isolation.** Set `repo: be` or `repo: fe` per task. Never `repo: both` — split full-stack work into two separate tasks.
- **Status on creation: `readyForDevelop`.** The status guard hook will reject any other initial status.

## Usage

[STUB — full implementation in Phase 2]
