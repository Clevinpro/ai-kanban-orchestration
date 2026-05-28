---
name: team-lead:execute
description: Run the full automated pipeline (Developer → CodeReview → QA → TeamLeadCheck → Done) for a single task.
argument-hint: "<TASK-ID> [--auto-next]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
---

## Constraints

- Each stage writes **ONE status transition at a time** using the Edit tool. Never write two status values in a single Edit call. Advance ONE STAGE AT A TIME — wait for each Edit to complete before proceeding to the next stage.
- The PreToolUse hook (`task-state-guard.js`) validates every transition automatically. If a transition is invalid, the hook denies the write and returns the reason. Do not attempt to bypass or work around the hook.
- Never retry automatically — always pause for user input on failure.

**PIPE-05 note:** Status transition validation is enforced automatically by `.claude/hooks/task-state-guard.js` (PreToolUse hook, installed in Phase 1). No additional hook is needed for PIPE-05.

---

## STEP 1 — Normalize Task ID

Take `$ARGUMENTS`. Check for the `--auto-next` flag:

- If `$ARGUMENTS` contains `--auto-next`: `SET auto_next = true`, strip `--auto-next` from the string before extracting the task ID.
- Otherwise: `SET auto_next = false`.

Normalize the remaining input to three-digit zero-padded format:

- If the input is `1`, `01`, or `TASK-1`, normalize to `TASK-001`.
- If the input is `TASK-001` (already normalized), use as-is.
- General rule: extract the numeric portion, zero-pad to three digits, prefix with `TASK-`.

Use Glob on `.planning/work/**/<normalized-id>.md` to find the task file.

If no file is found, output an error message showing the normalized ID that was searched and stop:
```
Error: Task file not found for <normalized-id>. Searched: .planning/work/**/<normalized-id>.md
```

---

## STEP 2 — Read Task File

Read the task file located by Glob. Extract from the frontmatter:
- `title`
- `epic`
- `repo`
- `status`
- `complexity`

**Status check:** Confirm the current status is `readyForDevelop` before proceeding.

- If status is `readyForDevelop`: proceed to STEP 3.
- If status is anything else: print a warning showing the current status:
  ```
  Warning: Task <id> has status: <current-status> (expected: readyForDevelop).
  Continue from the current stage? [y/N]
  ```
  - If the user replies `y` or `Y`: proceed to the stage that corresponds to the current status using the mapping below.
  - Otherwise: stop.

  **Status → Resume at stage:**

  | Current status | Resume at stage |
  |---------------|----------------|
  | `inProgress` | Developer |
  | `inReview` | CodeReview |
  | `inTesting` | QA |
  | `forTeamLeadCheck` | TeamLeadCheck |
  | `done` | (already complete — print "Task already complete" and stop) |
  | `stopped` | (requires manual status reset — print "Task <id> is stopped. Reset to readyForDevelop or inProgress manually, then re-run." and stop) |

---

## STEP 3 — Execute Pipeline

**INITIALIZATION**

At the top of this step, declare three in-context loop counters:

```
SET qa_cycle = 0        (cap: 3)
SET tlc_cycle = 0       (cap: 2)
SET cr_cycle = 0        (cap: 2)
```

Determine agent names from the `repo` field in the task frontmatter:

- If `repo: be`: `developer_agent = "be-developer"`, `qa_agent = "qa-be"`
- If `repo: fe`: `developer_agent = "fe-developer"`, `qa_agent = "qa-fe"`

Maintain a running `prior_receipts` list (starts empty). Append each agent receipt to this list after each agent call.

Set `task_path` = the file path found in STEP 1.

---

**OUTER LOOP** — TLC rejection loop. Repeat while `tlc_cycle < 2`:

  **INNER LOOP** — QA rejection loop. Repeat while `qa_cycle < 3`:

  ---

  ### Developer Stage

  Edit the task file: change `status: readyForDevelop` to `status: inProgress`.
  (On re-loop when status is already `inProgress`, this Edit is a no-op — the hook will deny a same-to-same transition; skip the Edit and proceed directly to the Agent call if the task is already `inProgress`.)

  Construct the stage context preamble:
  ```
  Task: <task_path>
  Stage context: Developer cycle <N>
  Prior receipts: <prior_receipts joined by ", " or "(none)" if empty>
  ```

  **Stopped check:** Re-read the task file at `<task_path>`. If frontmatter `status` is `stopped`:
    - Append to task file body: `[pipeline] STOPPED`
    - Print: `Pipeline stopped by user at Developer. Task <id> is on branch task/<id>/stopped.`
    - Stop pipeline (do not advance to the next agent).

  Invoke Agent with `subagent_type = developer_agent`. Include the stage context preamble at the top of the agent prompt, followed by:
  ```
  Read the task file at <task_path> and implement the task according to the Description and Acceptance Criteria.
  ```

  Capture the receipt from the agent return value. Append receipt to `prior_receipts`.

  If receipt contains `"ERROR"`:
  - Print: `Stage failed: Developer returned ERROR — <receipt>. Retry / Skip / Abort?`
  - Wait for user response.
    - **Retry**: re-invoke developer_agent (do NOT re-Edit status). Restart Developer Stage.
    - **Skip**: continue to Git Diff Stage.
    - **Abort**: stop pipeline. Print `Pipeline aborted at Developer.`
  Else: print `[Developer] Done ✓`

  ---

  ### Git Diff Stage

  Run Bash:
  ```bash
  git diff --stat HEAD~1..HEAD
  ```

  If the command exits non-zero or returns empty output, set:
  ```
  diff_stat = "Changed files: (unavailable)"
  ```
  Otherwise set `diff_stat` = the command output.

  ---

  ### CodeReview Stage

  Edit the task file: change `status: inProgress` to `status: inReview`.
  (On re-loop when status is already `inReview`, the hook will deny a same-to-same transition; skip the Edit and proceed directly to the Agent call.)

  Construct the stage context preamble:
  ```
  Task: <task_path>
  Stage context: CodeReview cycle <N>
  Prior receipts: <prior_receipts joined by ", ">
  Changed files:
  <diff_stat>
  ```

  **Stopped check:** Re-read the task file at `<task_path>`. If frontmatter `status` is `stopped`:
    - Append to task file body: `[pipeline] STOPPED`
    - Print: `Pipeline stopped by user at CodeReview. Task <id> is on branch task/<id>/stopped.`
    - Stop pipeline (do not advance to the next agent).

  Invoke Agent with `subagent_type = "code-reviewer"`. Include the stage context preamble at the top of the agent prompt, followed by:
  ```
  Read the task file at <task_path> and review the changed files listed above.
  ```

  Capture the full return value from code-reviewer. Append the receipt line to `prior_receipts`.

  **REVIEW-BLOCK extraction:** In the code-reviewer return value, find the text between the delimiter lines `---REVIEW-BLOCK-START---` and `---REVIEW-BLOCK-END---` (inclusive of the delimiter lines). If both delimiters are present, extract that block. If either delimiter is absent, use this placeholder block instead:
  ```
  ---REVIEW-BLOCK-START---
  Code review output unavailable — manual review required
  ---REVIEW-BLOCK-END---
  ```

  Use Edit to append the extracted REVIEW-BLOCK to the task file body. Target the last line of the current task file content as `old_string`; set `new_string` = that last line + `"\n\n"` + the extracted block.

  **Signal extraction** (check in this priority order: APPROVED → CHANGES_REQUESTED → ERROR):

  - If receipt contains `"APPROVED"`:
    - Reset `cr_cycle = 0`.
    - Print `[CodeReview] Done ✓`
    - Continue to QA Stage.

  - If receipt contains `"CHANGES_REQUESTED"`:
    - Increment `cr_cycle`.
    - If `cr_cycle >= 2`:
      - Print: `CodeReview CHANGES_REQUESTED cap reached (2 cycles). Retry / Skip / Abort?`
      - Wait for user response.
        - **Retry**: reset `cr_cycle = 0`, Edit the task file: change `status: inReview` to `status: inProgress`. Continue INNER LOOP from Developer Stage.
        - **Skip**: treat as APPROVED (clear CHANGES_REQUESTED signal). Reset `cr_cycle = 0`. Continue to QA Stage.
        - **Abort**: stop pipeline. Print `Pipeline aborted at CodeReview.`
    - Else (below cap):
      - Edit the task file: change `status: inReview` to `status: inProgress`. (The hook validates the REVIEW-BLOCK with CHANGES_REQUESTED is present before allowing this transition.)
      - Continue INNER LOOP from Developer Stage. Do NOT increment `qa_cycle`.

  ---

  ### QA Stage

  Edit the task file: change `status: inReview` to `status: inTesting`.
  (On re-loop when status is already `inTesting`, the hook will deny a same-to-same transition; skip the Edit and proceed directly to the Agent call.)

  Construct the stage context preamble:
  ```
  Task: <task_path>
  Stage context: QA run cycle <N> of 3
  Prior receipts: <prior_receipts joined by ", ">
  ```

  **Stopped check:** Re-read the task file at `<task_path>`. If frontmatter `status` is `stopped`:
    - Append to task file body: `[pipeline] STOPPED`
    - Print: `Pipeline stopped by user at QA. Task <id> is on branch task/<id>/stopped.`
    - Stop pipeline (do not advance to the next agent).

  Invoke Agent with `subagent_type = qa_agent`. Include the stage context preamble at the top of the agent prompt, followed by:
  ```
  Read the task file at <task_path> and run the affected tests for this task.
  ```

  Capture the receipt. Append to `prior_receipts`.

  **Signal extraction** (check in this priority order: PASS → FAIL):

  - If receipt contains `"PASS"`:
    - Print `[QA] Done ✓`
    - Break INNER LOOP.

  - If receipt contains `"FAIL"`:
    - Increment `qa_cycle`.
    - If `qa_cycle >= 3`:
      - Print: `QA loop cap reached (3 cycles). Retry / Skip / Abort?`
      - Wait for user response.
        - **Retry**: continue INNER LOOP from Developer Stage (qa_cycle is NOT reset on Retry — it is already at cap; let it increment further on subsequent Retry cycles).
        - **Skip**: break INNER LOOP (proceed to TeamLeadCheck without a QA pass).
        - **Abort**: stop pipeline. Print `Pipeline aborted at QA.`
    - Else (below cap):
      - Print: `[QA] FAIL ✗. Rejection loop cycle <qa_cycle> of 3.`
      - Edit the task file: change `status: inTesting` to `status: inProgress`. (The hook validates the ## QA Results Status: FAIL annotation written by the qa agent is present before allowing this transition.)
      - Continue INNER LOOP from Developer Stage.

  ---

  **END INNER LOOP**

  ---

  ### Status Advance to forTeamLeadCheck

  Edit the task file: change `status: inTesting` to `status: forTeamLeadCheck`.

  ---

  ### TeamLeadCheck Stage

  Construct the stage context preamble:
  ```
  Task: <task_path>
  Stage context: TeamLeadCheck cycle <N> of 2
  Prior receipts: <prior_receipts joined by ", ">
  ```

  **Stopped check:** Re-read the task file at `<task_path>`. If frontmatter `status` is `stopped`:
    - Append to task file body: `[pipeline] STOPPED`
    - Print: `Pipeline stopped by user at TeamLeadCheck. Task <id> is on branch task/<id>/stopped.`
    - Stop pipeline (do not advance to the next agent).

  Invoke Agent with `subagent_type = "team-lead-check"`. Include the stage context preamble at the top of the agent prompt, followed by:
  ```
  Read the task file at <task_path> and verify acceptance criteria against the SPEC.md.
  ```

  Capture the receipt. Append to `prior_receipts`.

  **Signal extraction** (check in this priority order: APPROVED → REJECTED):

  - If receipt contains `"APPROVED"`:
    - Edit the task file: change `status: forTeamLeadCheck` to `status: done`.
    - Print `[TeamLeadCheck] Done ✓`
    - Print `Pipeline complete. Task <id> is now done.`
    - Break OUTER LOOP.
    - Proceed to STEP 4.

  - If receipt contains `"REJECTED"`:
    - Increment `tlc_cycle`.
    - If `tlc_cycle >= 2`:
      - Print: `TeamLeadCheck rejection cap reached (2 cycles). Retry / Skip / Abort?`
      - Wait for user response.
        - **Retry**: continue OUTER LOOP.
        - **Skip**: leave task at forTeamLeadCheck. Print `Task <id> requires manual review — left at forTeamLeadCheck. Human must review and transition manually.` Stop pipeline.
        - **Abort**: stop pipeline. Print `Pipeline aborted at TeamLeadCheck.`
    - Else (below cap):
      - Print: `[TLC rejection cycle <tlc_cycle> of 2 — REJECTED]`
      - Edit the task file: change `status: forTeamLeadCheck` to `status: inProgress`. (The hook validates the ## TeamLead Check Status: REJECTED annotation written by the team-lead-check agent is present before allowing this transition.)
      - Reset `qa_cycle = 0`.
      - Reset `cr_cycle = 0`.
      - Continue OUTER LOOP.

---

**END OUTER LOOP**

---

## STEP 4 — Auto-Next Chain

Skip this step if `auto_next = false`.

Run Bash to find all task files in the same epic directory and identify the next candidate:

```bash
grep -l "^status: readyForDevelop" .planning/work/<epic>/TASK-*.md 2>/dev/null | sort
```

From the output:
- Filter to files whose numeric ID (extracted from filename) is **greater than** the current task's numeric ID.
- Take the first result (lowest ID above current).

If a candidate is found:
- Print `[Auto-next] → <next-id>`
- SET `task_id = <next-id>` (already normalized from filename)
- Restart from **STEP 2** (skip flag parsing — `auto_next` stays `true`, task file already known from the grep path).

If no candidate is found:
- Print `[Auto-next] No more readyForDevelop tasks in epic <epic>. All done.`
- Stop.

---

## STEP 5 — Failure Handling

If at any stage a failure occurs (the hook denied the transition, or the user signals a failure), pause immediately. Print:

```
Stage failed: [<reason>]. Retry / Skip / Abort?
```

User response options:

- **Retry**: re-attempt the same stage status write from the beginning of that stage.
- **Skip**: skip the current stage — do not write its status transition — continue to the next stage.
- **Abort**: stop the pipeline. Leave the task file at its current status. Print:
  ```
  Pipeline aborted at [<Stage>].
  ```

Never automatically retry — always wait for the user's explicit choice.
