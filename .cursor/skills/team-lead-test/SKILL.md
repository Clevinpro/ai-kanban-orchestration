---
name: team-lead-test
description: "Holistic epic verification — confirms every task is done, then verifies all SPEC.md acceptance criteria across the whole epic. Writes TEST-REPORT.md."
---

<cursor_skill_adapter>
## A. Skill Invocation
- This skill is invoked when the user mentions `team-lead-test` or asks to run the epic acceptance gate.
- Treat all user text after the skill mention as `{{ARGS}}` — `<epic-name>` or `.planning/work/<epic-name>`.
- If no epic is present, ask which epic to verify.

## B. User Prompting
Prompt conversationally in your response text when input is needed — never block on raw stdin.

## C. Tool Usage
- `Read`, `Write`, `Glob`, `Grep`, `Shell` for evidence gathering and report writing.
- Use `StrReplace` to edit existing files.

## D. Browser / Live Verification
- For live UI verification, use whatever browser-automation MCP is connected (e.g. a Chrome/Playwright MCP). If none is available, fall back to evidence-only verification and say so in the report.
</cursor_skill_adapter>

## Constraints

- This skill runs **after every task in the epic is `done`** — it is the final epic-level acceptance gate. If any task is not `done`, it stops without verifying.
- It verifies the epic **holistically** — every acceptance criterion in the SPEC.md is checked against the aggregated evidence from all task files (Description, Code Review, QA Results, TeamLead Check), not task-by-task.
- It does **not** change any **existing** task `status:` field. Never edit existing task frontmatter from this skill. On a FAIL verdict it MAY create **new** fix task files (STEP 7) — that is the only task-file write it performs.
- **Re-run semantics:** if a previous report exists with `Verdict: FAIL`, only the previously failed ACs are re-verified; PASS rows are carried over. A previous `Verdict: PASS` means the epic is closed — delete `TEST-REPORT.md` to force a full re-run.
- **Live verification:** when the app is running and a browser MCP is connected, UI-observable ACs are verified against the **running app** in a real browser (host shell at `localhost:3000`), not by reading task evidence alone. When the app is not live, or no browser MCP is available, fall back to evidence-only verification and say so in the report.

---

## STEP 1 — Resolve Epic Directory

Take `{{ARGS}}`. Strip any trailing slash.

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

Finish them first: team-lead-execute <TASK-ID>
```

Only proceed when **all** tasks are `done`.

---

## STEP 3.5 — Detect Re-Run (previous FAIL report)

Determine whether this is a re-run after a failed gate:

1. Read `<dir>/TEST-REPORT.md` if it exists.
   - `Verdict: FAIL` → this is a re-run; the previous report is this file.
   - `Verdict: IN-PROGRESS` (a launch marker) → read `<dir>/TEST-REPORT.prev.md`; if it exists with `Verdict: FAIL`, this is a re-run and the previous report is the prev file.
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

## STEP 4.5 — Live Browser Verification (when the app is up)

The full stack, when running, exposes:
backend (gateway **4000**, ai-service 4001, auth 4002) and
frontend (shell **3000**, auth 3001, chat 3002, docs 3003).
The shell at **`http://localhost:3000`** is the module-federation host — verify there.

**Gate this step:**
- If `$TEAMLEAD_APP_LIVE` is `1`, the app is up — do live verification.
- Otherwise probe once with Shell: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`. If it answers, proceed; if not, **skip this step**, mark live verification `SKIPPED (app not running)` and fall back to STEP 4 evidence for every AC.

**Drive the running app via a connected browser MCP** (e.g. a Chrome/Playwright MCP). If no browser MCP is connected, mark live verification `SKIPPED (no browser connected)` and fall back to evidence-only. **Do not fail the gate solely because the browser was missing.**

1. Decide which ACs are **UI-observable** (something a user can see/do in the browser: a page renders, a control appears, a flow completes, an API call succeeds end-to-end). Non-UI ACs (pure backend contracts, migrations, internal types) stay evidence-based from STEP 4.
2. For each UI-observable AC, exercise it against `http://localhost:3000`:
   - Navigate to the route the AC concerns (e.g. `http://localhost:3000/chat`).
   - Inspect page text / interactive elements to assert presence/content.
   - Interact (click, type, submit) to drive flows; confirm end-to-end results (the API call to gateway:4000 returned 2xx) where the AC implies a round-trip.
   - Check for runtime breakage: console errors on a screen an AC depends on count as evidence **against** that AC.
3. **Save screenshot evidence** for each UI-observable AC into `<dir>/.test-evidence/AC-NN.jpg` (create the dir first) and reference that path in the report.
4. Record per-AC live result: `LIVE PASS`, `LIVE FAIL`, or `N/A (not UI-observable)`.

---

## STEP 5 — Verify Acceptance Criteria

Read the `## Acceptance Criteria` section from the SPEC.md. Check **every** criterion against the aggregated evidence from STEP 4. Do not stop at the first pass — verify all of them.

**On a re-run (STEP 3.5):** verify only the **re-verify** set; carried ACs keep their previous PASS result without re-checking.

Combine two evidence sources per AC: the aggregated task evidence (STEP 4) and the live browser result (STEP 4.5, when available). For UI-observable ACs the **live result is authoritative** — a `LIVE FAIL` is a FAIL even if the task evidence claims PASS (the running app is the ground truth).

For each AC:
- **PASS**: the criterion is met — for UI-observable ACs this means `LIVE PASS`; for non-UI ACs the aggregated task evidence demonstrates it. Name which task(s) and/or which live check satisfy it.
- **FAIL**: `LIVE FAIL`, or the criterion is not addressed across any task, or there is evidence it was not satisfied.

---

## STEP 6 — Write TEST-REPORT.md

Write `<dir>/TEST-REPORT.md` with this structure (use capitalized `Verdict:` / `Result:` — never a lowercase `status:` line, so the task-state-guard hook ignores this file):

```markdown
# Epic Test Report — <epic>

Verdict: PASS | FAIL
Generated: <current ISO8601 timestamp>
Tasks verified: <N> (all done)
SPEC: <path-to-SPEC.md>
Live verification: ON (browser MCP @ localhost:3000) | SKIPPED (app not running) | SKIPPED (no browser connected)

## Acceptance Criteria

| # | Criterion | Result | Live Check | Evidence |
|---|-----------|--------|-----------|----------|
| 1 | <AC text> | PASS   | LIVE PASS | TASK-003 QA PASS; browser: chat renders + reply streams; `.test-evidence/AC-01.jpg` |
| 2 | <AC text> | FAIL   | LIVE FAIL | Console error on /chat: `TypeError ...`; `.test-evidence/AC-02.jpg` |
| 3 | <AC text> | PASS   | N/A       | Backend contract — TASK-005 QA PASS (not UI-observable) |
| 4 | <AC text> | PASS (carried) | — | Verified in previous run (re-run skips passed ACs) |

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
4. **Launch the first fix task immediately** via the kanban server (it opens a terminal tab running the pipeline):

```bash
curl -s -X PATCH http://localhost:6111/tasks/<epic>/<first-TASK-ID>/status \
  -H 'Content-Type: application/json' -d '{"status":"inProgress"}'
```

   If the curl fails (kanban server not running), print the manual fallback instead:
   `Run: team-lead-execute <first-TASK-ID>`

   The remaining fix task chains automatically when kanban auto-run is on; otherwise it is started from the board or via `team-lead-execute`.

---

## STEP 8 — Return Receipt

Print exactly one of:

- `[team-lead-test] PASS — all <M> acceptance criteria verified across <N> tasks. See <dir>/TEST-REPORT.md`
- `[team-lead-test] FAIL — <k> of <M> acceptance criteria not met. Created fix task(s): <TASK-IDs>; launched <first-TASK-ID>. See <dir>/TEST-REPORT.md`
