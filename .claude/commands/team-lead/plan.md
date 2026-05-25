---
name: team-lead:plan
description: Break a SPEC.md epic into TASK-XXX.md files with complexity scores. Pauses for human review before writing any files.
argument-hint: "<path-to-SPEC.md> | --new <epic-name>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

## Constraints

- **Max task size: ~10 minutes of execution time.** If a task would take longer, split it into smaller focused tasks.
- **Fresh context window per task.** Each task executes in isolation — no state from previous tasks is available. Every task must be fully self-contained.
- **Repo isolation.** Set `repo: be` or `repo: fe` per task. Never `repo: both` — split full-stack work into two separate tasks.
- **Status on creation: `readyForDevelop`.** The PreToolUse hook (task-state-guard.js) will reject any other initial status.
- **Complexity scoring is required.** Assign an integer 1–10 per task (1 = trivial change, 10 = most complex).
- **Epic slug must match directory.** The `epic` field in every task must equal the directory name used under `.planning/work/`.

---

## STEP 0 — Argument Dispatch

Inspect `$ARGUMENTS`.

**Case A — Template generation (`--new` flag):**

If `$ARGUMENTS` starts with `--new`, treat the next word as `<epic-name>`.

Write a starter SPEC.md template to `./<epic-name>/SPEC.md`. The template must contain exactly these four section headers with placeholder content:

```markdown
## Goal

[Describe the epic goal in 1-2 sentences.]

## User Stories / Requirements

- As a [user], I want [feature] so that [benefit].

## Acceptance Criteria

- [ ] [Criterion 1]
- [ ] [Criterion 2]

## Technical Design

### API Contracts

[Describe API endpoints, request/response shapes.]

### Data Schema

[Describe database schema or data structures.]

### Architecture Notes

[Describe key architecture decisions.]
```

Print: "Written: `<epic-name>/SPEC.md`"

**Stop here.** Do not proceed to task generation.

---

**Case B — Task generation (normal path):**

Treat `$ARGUMENTS` as a file path to an existing SPEC.md. Proceed with STEP 1 below.

---

## STEP 1 — Validate SPEC.md

Read the file at `$ARGUMENTS`.

Use Grep to verify that all four required section headers are present in the file:

- `## Goal`
- `## User Stories / Requirements`
- `## Acceptance Criteria`
- `## Technical Design`

If any header is missing, output a clear error listing which headers are absent (as a bulleted list). **Stop. Do not generate any tasks.**

Example error output:
```
Error: SPEC.md is missing required section headers:
- ## User Stories / Requirements
- ## Technical Design
```

---

## STEP 2 — Derive Epic Slug

Read the text under `## Goal`.

Take the first sentence (or first 5–8 words), then:
1. Convert to lowercase
2. Remove all punctuation
3. Replace spaces with hyphens

**Example:** `"Build a user authentication system"` → `user-authentication-system`

**Fallback:** If `## Goal` is empty or absent, use the parent directory name of the SPEC.md path, converted to kebab-case using the same rules. Example: `my-auth-epic/SPEC.md` → slug `my-auth-epic`.

The derived slug is used as the directory name: `.planning/work/<slug>/`

---

## STEP 3 — Read Codebase Context

Read `.planning/codebase/STRUCTURE.md` and `.planning/codebase/ARCHITECTURE.md` (if they exist).

Use this information to understand:
- Where new code would land in the codebase
- Which sub-repo (`be` or `fe`) each task belongs to
- Natural boundaries for splitting tasks

This informs task granularity and repo assignment.

---

## STEP 4 — Check Existing Task IDs

Use Glob on `.planning/work/<slug>/TASK-*.md` to list all existing task files in this epic's directory.

Find the highest existing ID number (the numeric part after `TASK-`). New task IDs start one above that maximum, zero-padded to three digits.

**If no tasks exist yet:** start at `TASK-001`.

**Example:** If `TASK-003.md` exists, the next ID is `TASK-004`.

---

## STEP 5 — Generate Task List

Reason carefully about the SPEC.md content. Derive a flat ordered list of tasks in recommended execution order (no wave grouping). Each task should represent a single focused action that takes approximately 10 minutes to execute.

For each task, prepare the full TASK-XXX.md file content:

**Frontmatter fields (all 9 required):**

```yaml
---
id: TASK-NNN
title: <focused action title — one action, ~10 min>
status: readyForDevelop
priority: medium
repo: be
epic: <slug>
complexity: N
created-at: <current ISO8601 timestamp>
updated-at: <same as created-at>
spec: <path-to-SPEC.md>
---
```

Field rules:
- `id`: three-digit zero-padded, starting from the next available ID (STEP 4)
- `title`: one clear action verb + object (e.g., "Add JWT validation middleware to api-gateway")
- `status`: always `readyForDevelop` — no exceptions
- `priority`: `medium` by default; use `high` for critical-path items; use `low` for optional polish
- `repo`: `be` or `fe` — **never `repo: both`** — split full-stack work into separate tasks
- `epic`: must equal `<slug>` (the directory name derived in STEP 2)
- `complexity`: integer 1–10 where 1 = trivial config change, 10 = most architecturally complex
- `created-at` and `updated-at`: current ISO8601 timestamp (same value on creation)

**Body sections:**

```markdown
## Description

<One paragraph describing what the developer must build or change.>

## Acceptance Criteria

- [ ] <Verifiable criterion>
- [ ] <Verifiable criterion>

## Technical Notes

<Implementation hints, relevant file paths, patterns to follow, or edge cases to watch.>
```

---

## STEP 6 — Display Review Table

**Before writing any files to disk**, print the following review table with one row per task:

| ID | Title | Complexity | Repo | Epic |
|----|-------|------------|------|------|
| TASK-001 | ... | 3 | be | `<slug>` |

Then print exactly:

```
Write these tasks? [y/N]
```

Wait for the user's response before proceeding.

---

## STEP 7 — Write on Confirmation

**If the user replies `y` or `Y`:**

Write each TASK-XXX.md file to `.planning/work/<slug>/` using the Write tool.

For each file written, print: `Written: TASK-XXX.md`

**If the user replies with anything else (including pressing Enter without input):**

Print: `Aborted. No files written.`

Stop without writing any files.
