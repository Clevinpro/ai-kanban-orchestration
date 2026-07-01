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
  - mcp__Claude_in_Chrome
---

## Constraints

- This command runs **after every task in the epic is `done`** — it is the final epic-level acceptance gate. If any task is not `done`, it stops without verifying.
- It verifies the epic **holistically** — every acceptance criterion in the SPEC.md is checked against the aggregated evidence from all task files (Description, Code Review, QA Results, TeamLead Check), not task-by-task.
- It does **not** change any **existing** task `status:` field. Never edit existing task frontmatter from this command. On a FAIL verdict it MAY create **new** fix task files (STEP 7) — that is the only task-file write it performs.
- **Re-run semantics:** if a previous report exists with `Verdict: FAIL`, only the previously failed ACs are re-verified; PASS rows are carried over. A previous `Verdict: PASS` means the epic is closed — the kanban server blocks re-launch until `TEST-REPORT.md` is deleted.
- **App lifecycle is owned by this command, not the wrapper.** STEP 3.7 boots docker infra, applies Prisma migrations, starts backend + frontend with `run_in_background`, waits for readiness, and reads the boot logs **into context** — so a boot failure surfaces inline and is acted on, not hidden in a `/tmp` file. The `run-test.sh` wrapper does only one thing: `trap`-guaranteed teardown of the app ports when this run exits (even on a crash). Teardown is therefore NOT this command's responsibility — do not kill the servers yourself.
- **Live verification:** once STEP 3.7 reports the app live, UI-observable ACs are verified against the **running app** in a real browser via the **Claude-in-Chrome MCP** (`mcp__Claude_in_Chrome__*`, `localhost:3000`), not by reading task evidence alone. The wrapper launches the gate with `claude --chrome` so the in-process Chrome MCP is wired; a Chrome instance with the Claude extension must be connected (the wrapper reuses whatever browser is paired). When STEP 3.7 could not bring the app up, or no browser/Chrome MCP is available (e.g. a manual run without `--chrome`), the command falls back to evidence-only verification and says so in the report.

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

## STEP 3.7 — Boot the App (agent-owned lifecycle)

This command boots the whole stack itself so the boot logs land in this context.
The `run-test.sh` wrapper guarantees teardown on exit — you only bring it **up**.
Set a working flag `APP_LIVE = 0`; flip it to `1` only when readiness passes.

Paths: `BE_DIR = ai-platform/`, `FE_DIR = ai-platform-fe/`.
Log files (so the runs survive across tool calls): `BE_LOG = /tmp/teamlead-test-be-<epic>.log`, `FE_LOG = /tmp/teamlead-test-fe-<epic>.log`.

1. **Infra.** If `docker` is available, run (foreground): `cd ai-platform && docker compose up -d`. A failure here is a **WARN, not fatal** — infra may already be running; note it and continue.

2. **Migrations (BE epics only).** If any task file in the epic has `^repo:[[:space:]]*be` (Grep), apply committed migrations before boot:
   `cd ai-platform && npx --no-install prisma migrate deploy && npx --no-install prisma generate`.
   Use **`migrate deploy` only** — never `migrate dev` (it can DROP the raw trgm/hnsw hybrid-search indexes). On failure, WARN (the backend may boot against a stale schema) and continue.

3. **Free stale ports** from any previous run so boot does not `EADDRINUSE`:
   `for p in 4000 4001 4002 3000 3001 3002 3003; do lsof -ti tcp:$p | xargs -r kill -9; done` (ignore errors).

4. **Boot backend** in the background (`run_in_background: true`): `cd ai-platform && npm start > /tmp/teamlead-test-be-<epic>.log 2>&1`. Gateway **4000**, ai-service 4001, auth 4002.

5. **Boot frontend** in the background (`run_in_background: true`): `cd ai-platform-fe && npm start > /tmp/teamlead-test-fe-<epic>.log 2>&1`. Shell **3000**, auth 3001, chat 3002, docs 3003.

6. **Wait for readiness** — ports `4000 3000 3001 3002` must answer. Poll with a bounded Bash loop (≈5 min ceiling), e.g.:
   ```bash
   for port in 4000 3000 3001 3002; do
     tries=0
     until nc -z localhost "$port" 2>/dev/null; do
       tries=$((tries+1)); [ "$tries" -ge 150 ] && { echo "TIMEOUT $port"; break; }
       sleep 2
     done
   done
   ```
   rspack opens the port before the bundle finishes — once the shell answers, `sleep 5` before verifying.

7. **On any port that times out or a boot that looks wrong**, read the tail of the relevant log (`BashOutput` on the background shell, or `tail -n 80` of the log file) **into this context**, summarize the failure, and decide: if the gateway (4000) and shell (3000) are up, set `APP_LIVE = 1` and proceed (note the degraded service in the report); if the core is down, leave `APP_LIVE = 0` and the gate falls back to evidence-only.

8. When `4000 3000 3001 3002` all answered, set `APP_LIVE = 1`.

Carry `APP_LIVE` forward — STEP 4.5 gates on it. **Do not tear the servers down** at any point; the wrapper's `trap` owns teardown when this run exits.

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

## STEP 4.5 — Live Browser Verification (when the app is up)

STEP 3.7 booted the stack: backend (gateway **4000**, ai-service 4001, auth 4002) and
frontend (shell **3000**, auth 3001, chat 3002, docs 3003).
The shell at **`http://localhost:3000`** is the module-federation host — verify there.

**Gate this step on the `APP_LIVE` flag from STEP 3.7:**
- If `APP_LIVE` is `1`, the app is up — do live verification.
- Otherwise probe once with Bash: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` (or `nc -z localhost 3000`). If it answers, proceed; if not, **skip this step**, mark live verification `SKIPPED (app not running)` and fall back to STEP 4 evidence for every AC.

**Drive the running app via the Claude-in-Chrome MCP** (`mcp__Claude_in_Chrome__*`; the wrapper launches `claude --chrome`, so the in-process Chrome MCP is wired — the app was booted in STEP 3.7, do not boot or tear down servers here):

1. **Attach to a browser.** Call `list_connected_browsers`. If one is returned, `select_browser` with its `deviceId` (prefer `isLocal: true`). If the list is empty, the Chrome MCP isn't usable in this run — mark live verification `SKIPPED (no browser connected)` and fall back to evidence-only. **Do not fail the gate solely because the browser was missing.**
2. **Open a tab.** Call `tabs_context_mcp` with `createIfEmpty: true` to get a `tabId` (or `tabs_create_mcp`). Reuse that `tabId` for every subsequent call.
3. Decide which ACs are **UI-observable** (something a user can see/do in the browser: a page renders, a control appears, a flow completes, an API call succeeds end-to-end). Non-UI ACs (pure backend contracts, migrations, internal types) stay evidence-based from STEP 4.
4. For each UI-observable AC, exercise it against `http://localhost:3000`:
   - Navigate: `navigate` with the `tabId` and the route the AC concerns (e.g. `http://localhost:3000/chat`).
   - Inspect: `get_page_text` (article/text content) and `read_page` (`filter: "interactive"` for controls) to assert presence/content; `find` (natural-language) to locate a specific element and get its `ref`.
   - Interact: `computer` (`left_click` with a `ref` from `find`, `type`, `scroll`, etc.) and `form_input` to drive flows (send a chat message, submit a form). Confirm the end-to-end result with `read_network_requests` (the API call to gateway:4000 returned 2xx) where the AC implies a round-trip.
   - Check runtime breakage: `read_console_messages` with `onlyErrors: true` and a `pattern` — console errors on a screen an AC depends on count as evidence **against** that AC.
5. **Save screenshot evidence** for each UI-observable AC: `computer` with `action: "screenshot"`, `save_to_disk: true`, the `tabId`. The result returns a saved path — copy/move it into `<dir>/.test-evidence/AC-NN.jpg` with Bash (create the dir first) and reference that path in the report.
6. Record per-AC live result: `LIVE PASS`, `LIVE FAIL`, or `N/A (not UI-observable)`.

**Committed E2E suites (regression evidence).** Each task ships its own E2E test (FE: Playwright `e2e/*.spec.ts`; BE: supertest `*.e2e-spec.ts`). With the app live, run them as deterministic regression evidence alongside the exploratory Claude-in-Chrome checks: `cd ai-platform-fe && npm run test:e2e` and `cd ai-platform && npx nx run-many --target=e2e` (ignore the BE suite if no `e2e` target exists yet). A committed-suite failure is evidence **against** the AC it covers, same weight as a `LIVE FAIL`. Record the run summary in the report's Live verification line.

The `run-test.sh` wrapper tears the servers down (port-freeing `trap`) after this command exits — no server or browser teardown needed here.

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
Live verification: ON (Claude-in-Chrome MCP @ localhost:3000) | SKIPPED (app not running) | SKIPPED (no browser connected)

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
