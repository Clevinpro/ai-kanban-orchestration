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
- It does **not** change any **existing** task `status:` field. Never edit existing task frontmatter from this command. On a FAIL verdict it MAY create **new** fix task files (STEP 7) — that is the only task-file write it performs.
- **Re-run semantics:** if a previous report exists with `Verdict: FAIL`, only the previously failed ACs are re-verified; PASS rows are carried over. A previous `Verdict: PASS` means the epic is closed — the kanban server blocks re-launch until `TEST-REPORT.md` is deleted.

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

## STEP 3.5 — Detect Re-Run (previous FAIL report)

Determine whether this is a re-run after a failed gate:

1. Read `<dir>/TEST-REPORT.md` if it exists.
   - `Verdict: FAIL` → this is a re-run; the previous report is this file.
   - `Verdict: IN-PROGRESS` (the kanban launch marker) → read `<dir>/TEST-REPORT.prev.md`; if it exists with `Verdict: FAIL`, this is a re-run and the previous report is the prev file. (The kanban server copies the old report to `TEST-REPORT.prev.md` before writing the marker.)
   - `Verdict: PASS` → print `Epic <epic> already passed. Delete TEST-REPORT.md to force a full re-run.` and stop.
2. No previous report (or no verdict line) → full run, verify every AC.

On a re-run, parse the previous `## Acceptance Criteria` table and split ACs into:
- **carried** — previously PASS; do NOT re-verify, copy the row with Result `PASS (carried)`.
- **re-verify** — previously FAIL; verify these in STEP 5.

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

**On a re-run (STEP 3.5):** verify only the **re-verify** set; carried ACs keep their previous PASS result without re-checking.

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
| 3 | <AC text> | PASS (carried) | Verified in previous run (re-run skips passed ACs) |

## Summary

<One paragraph: overall verdict and, if FAIL, which ACs are missing and the likely follow-up tasks needed.>
```

Verdict is `PASS` only if every AC is PASS or PASS (carried); otherwise `FAIL`.

After writing the report, delete `<dir>/TEST-REPORT.prev.md` if it exists (re-run consumed it).

---

## STEP 7 — On FAIL: Create Fix Tasks and Launch

Skip this step entirely when the verdict is PASS.

When the verdict is FAIL, turn the open ACs into fix tasks — **one task per repo, never combined**:

1. Group the failed ACs by which service their fix touches: `ai-platform/` → `repo: be`, `ai-platform-fe/` → `repo: fe`. An AC spanning both produces an entry in both groups (backend part in the be task, frontend part in the fe task).
2. For each non-empty group create `<dir>/TASK-NNN.md` with the next free task numbers (continue the epic's numbering). Frontmatter follows the standard task format:

```yaml
---
id: TASK-NNN
title: "fix(<epic>): <short summary of the failed ACs for this repo>"
status: readyForDevelop
priority: high
repo: be | fe
epic: <epic>
complexity: <1-5 estimate>
created-at: <now ISO8601>
updated-at: <now ISO8601>
started-at: null
completed-at: null
spec: <path-to-SPEC.md>
---
```

   Body: `## Description` explaining what is missing (reference the TEST-REPORT findings) and `## Acceptance Criteria` containing exactly the failed AC texts for that repo.
3. Create the `be` task with the lower number — tasks run sequentially per epic (task-state-guard), so be → fe.
4. **Launch the first fix task immediately** via the kanban server (it opens an iTerm tab running the pipeline):

```bash
curl -s -X PATCH http://localhost:6111/tasks/<epic>/<first-TASK-ID>/status \
  -H 'Content-Type: application/json' -d '{"status":"inProgress"}'
```

   If the curl fails (kanban server not running), print the manual fallback instead:
   `Run: /team-lead:execute <first-TASK-ID>`

   The remaining fix task chains automatically when kanban auto-run is on; otherwise it is started from the board or via `/team-lead:execute`.

---

## STEP 8 — Return Receipt

Print exactly one of:

- `[team-lead:test] PASS — all <M> acceptance criteria verified across <N> tasks. See <dir>/TEST-REPORT.md`
- `[team-lead:test] FAIL — <k> of <M> acceptance criteria not met. Created fix task(s): <TASK-IDs>; launched <first-TASK-ID>. See <dir>/TEST-REPORT.md`
