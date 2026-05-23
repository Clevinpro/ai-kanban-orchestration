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

## Constraints

- Each stage writes **ONE status transition at a time** using the Edit tool. Never write two status values in a single Edit call. Advance ONE STAGE AT A TIME — wait for each Edit to complete before proceeding to the next stage.
- The PreToolUse hook (`task-state-guard.js`) validates every transition automatically. If a transition is invalid, the hook denies the write and returns the reason. Do not attempt to bypass or work around the hook.
- Sub-agent calls in Phase 2 are stubs — log one-line receipts instead of spawning real agents.
- Never retry automatically — always pause for user input on failure.

**PIPE-05 note:** Status transition validation is enforced automatically by `.claude/hooks/task-state-guard.js` (PreToolUse hook, installed in Phase 1). No additional hook is needed for PIPE-05.

---

## STEP 1 — Normalize Task ID

Take `$ARGUMENTS`. Normalize to three-digit zero-padded format:

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
  - If the user replies `y` or `Y`: proceed to the stage that corresponds to the current status.
  - Otherwise: stop.

---

## STEP 3 — Execute Pipeline

Advance through the pipeline ONE STAGE AT A TIME. For each stage, perform these three actions in sequence:

**(a)** Write only the `status:` line in the task file frontmatter to the next status value using the Edit tool. The `task-state-guard.js` PreToolUse hook validates the transition automatically and injects the updated `updated-at` timestamp.

**(b)** Log a one-line stub receipt:
```
[<Stage>] stub — Phase 3 plugs in real agent
```

**(c)** Print the progress trail line:
```
[<Stage>] Done ✓
```

**Stage sequence and status writes (one Edit per stage):**

| Stage | Edit: old status | Edit: new status |
|-------|-----------------|-----------------|
| Developer | `readyForDevelop` | `inProgress` |
| CodeReview | `inProgress` | `inReview` |
| QA | `inReview` | `inTesting` |
| TeamLeadCheck | `inTesting` | `forTeamLeadCheck` |
| Done | `forTeamLeadCheck` | `done` |

After the final Done stage, print:
```
Pipeline complete. Task <id> is now done.
```

---

## STEP 4 — Failure Handling

If at any stage a failure occurs (in Phase 2 this means the hook denied the transition, or the user signals a failure), pause immediately. Print:

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
