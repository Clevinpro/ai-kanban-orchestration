---
name: team-lead:execute
description: Run the full automated pipeline (Developer → CodeReview → QA → TeamLeadCheck → Done) for a single task.
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
---

## Constraints (MUST READ BEFORE PLANNING)

- **Max task size: ~10 minutes of execution time.** If a task would take longer, split it. This is enforced by design, not by a timer.
- **Fresh context window per task.** Each task executes in isolation — no state from previous tasks is available. Design tasks to be fully self-contained.
- **Repo isolation.** Set `repo: be` or `repo: fe` per task. Never `repo: both` — split full-stack work into two separate tasks.
- **Status on creation: `readyForDevelop`.** The status guard hook will reject any other initial status.

## Pipeline Stages

- Developer
- CodeReview
- QA
- TeamLeadCheck
- Done

## Usage

[STUB — full implementation in Phase 2]
