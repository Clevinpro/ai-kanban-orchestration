---
name: team-lead:test
description: Holistic epic verification — confirms every task is done, then verifies all SPEC.md acceptance criteria across the whole epic. Writes TEST-REPORT.md.
argument-hint: "<epic-name> | .planning/work/<epic-name>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

## Constraints

- This command runs **after every task in the epic is `done`** — it is the final epic-level acceptance gate. If any task is not `done`, it stops without verifying.
- It verifies the epic **holistically** — every acceptance criterion in the SPEC.md is checked against the aggregated evidence from all task files (Description, Code Review, QA Results, TeamLead Check), not task-by-task.
- It does **not** change any task `status:` field. It only writes a `TEST-REPORT.md`. Never edit task frontmatter from this command.

---

## STEP 1 — Resolve Epic Directory

Take `$ARGUMENTS`. Strip any trailing slash.

- If it starts with `.planning/work/`, treat it as the epic directory path directly.
- Otherwise treat it as an epic name and build the path: `.planning/work/<epic-name>`.

Use Glob on `<dir>/TASK-*.md` to confirm the directory holds task files.

If no task files are found, print and stop:
```
Error: No task files found in <dir>. Searched: <dir>/TASK-*.md
```

---

## STEP 2 — Locate SPEC.md

- Read `<dir>/SPEC.md`. If it exists, use it.
- If absent, read the `spec:` frontmatter field from the lowest-numbered task file and read the SPEC.md at that path.
- If neither yields a SPEC.md, print and stop:
```
Error: SPEC.md not found for epic <epic>. Looked at <dir>/SPEC.md and the spec: field of the first task.
```

---

## STEP 3 — Gate: All Tasks Done

Read the `status:` frontmatter of every `TASK-*.md` in the epic directory (use Grep, e.g. `grep -H "^status:" <dir>/TASK-*.md`).

If **any** task has a status other than `done`, print the blockers and stop:
```
Cannot run epic test for <epic> — <N> task(s) not done:
- TASK-002: inProgress
- TASK-005: readyForDevelop

Finish them first: /team-lead:execute <TASK-ID>
```

Only proceed when **all** tasks are `done`.

---

## STEP 4 — Gather Evidence

Read every task file body in numeric ID order. For each, collect:
- `## Description` — what was built
- `## Code Review` — review findings / APPROVED
- `## QA Results` — test PASS/FAIL
- `## TeamLead Check` — per-task acceptance verdict

Build a combined picture of what the whole epic delivered.

---

## STEP 5 — Verify Acceptance Criteria

Read the `## Acceptance Criteria` section from the SPEC.md. Check **every** criterion against the aggregated evidence from STEP 4. Do not stop at the first pass — verify all of them.

For each AC:
- **PASS**: the aggregated task evidence demonstrates the criterion is met (name which task(s) satisfy it).
- **FAIL**: the criterion is not addressed across any task, or there is evidence it was not satisfied.

---

## STEP 6 — Write TEST-REPORT.md

Write `<dir>/TEST-REPORT.md` with this structure (use capitalized `Verdict:` / `Result:` — never a lowercase `status:` line, so the task-state-guard hook ignores this file):

```markdown
# Epic Test Report — <epic>

Verdict: PASS | FAIL
Generated: <current ISO8601 timestamp>
Tasks verified: <N> (all done)
SPEC: <path-to-SPEC.md>

## Acceptance Criteria

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | <AC text> | PASS   | TASK-003 QA PASS, TASK-004 code review APPROVED |
| 2 | <AC text> | FAIL   | Not addressed by any task |

## Summary

<One paragraph: overall verdict and, if FAIL, which ACs are missing and the likely follow-up tasks needed.>
```

Verdict is `PASS` only if every AC is PASS; otherwise `FAIL`.

---

## STEP 7 — Return Receipt

Print exactly one of:

- `[team-lead:test] PASS — all <M> acceptance criteria verified across <N> tasks. See <dir>/TEST-REPORT.md`
- `[team-lead:test] FAIL — <k> of <M> acceptance criteria not met. See <dir>/TEST-REPORT.md`
