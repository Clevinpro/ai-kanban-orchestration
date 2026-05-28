# Phase 2: TeamLead Skills - Pattern Map

**Mapped:** 2026-05-23
**Files analyzed:** 5 new/modified files
**Analogs found:** 5 / 5

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.claude/commands/team-lead/plan.md` | skill/command | request-response (read SPEC → write tasks) | `.claude/commands/team-lead/plan.md` (stub) | role-match (stub to replace) |
| `.claude/commands/team-lead/execute.md` | skill/command | event-driven (pipeline orchestration) | `.claude/commands/team-lead/execute.md` (stub) | role-match (stub to replace) |
| `.claude/hooks/stop-guard.js` | middleware/hook | request-response (stdin JSON → exit code) | `.claude/hooks/task-state-guard.js` | exact |
| `.claude/settings.json` | config | — | `.claude/settings.json` (existing entries) | exact |
| `scripts/test-stop-guard.sh` | utility/test | request-response (pipe payload → assert exit) | `.claude/hooks/gsd-validate-commit.sh` | role-match |

---

## Pattern Assignments

### `.claude/commands/team-lead/plan.md` (skill/command, request-response)

**Analog:** `.claude/commands/team-lead/plan.md` (existing stub) — provides the frontmatter structure to keep; body is replaced.

**Frontmatter pattern** (lines 1-11 of existing stub — KEEP and extend):
```yaml
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
```

**Arguments dispatch pattern** (instruction prose to write in body):
```markdown
## Handling Arguments

Inspect `$ARGUMENTS`:
- If it starts with `--new`, treat the next word as `<epic-name>`. Write a starter
  SPEC.md template to `./<epic-name>/SPEC.md` (or prompt the user for a path if
  unclear). Stop after writing — do not generate tasks.
- Otherwise, treat `$ARGUMENTS` as the path to an existing SPEC.md and proceed
  with plan generation.
```

**SPEC.md validation pattern** (instruction prose referencing Grep tool):
```markdown
## Step 1: Validate SPEC.md

Read the file at `$ARGUMENTS`. Use Grep to verify all four section headers exist:
- `## Goal`
- `## User Stories / Requirements`
- `## Acceptance Criteria`
- `## Technical Design`

If any header is missing, output a clear error listing which headers are absent and stop.
Do not proceed to task generation.
```

**Epic slug derivation pattern** (instruction prose):
```markdown
## Step 2: Derive Epic Slug

Read the text under `## Goal`. Take the first sentence (or first 5-8 words), convert
to lowercase kebab-case (remove punctuation, replace spaces with hyphens).
Fallback: if `## Goal` is empty or absent, use the SPEC.md filename (without path
or `.md` extension), converted to kebab-case.
The derived slug becomes the directory name: `.planning/work/<slug>/`.
```

**Review table + confirmation gate pattern** (instruction prose):
```markdown
## Step 5: Display Review Table

Print the following table for every task you intend to create. Print it BEFORE
writing any files to disk:

| ID | Title | Complexity | Repo | Epic |
|----|-------|------------|------|------|
| TASK-001 | ... | 3 | be | <slug> |

Then ask the user: "Write these tasks? [y/N]"

## Step 6: Write on Confirmation

- If the user replies `y` or `Y`: write each TASK-XXX.md to `.planning/work/<slug>/`.
- If the user declines: stop without writing any files.
```

**TASK file frontmatter to generate** (sourced from `.planning/task-schema.yaml` and `.planning/work/test-epic/TASK-001.md`):
```yaml
---
id: TASK-001
title: <focused action title>
status: readyForDevelop
priority: medium
repo: be          # or fe — never both
epic: <slug>
complexity: 3     # 1-10 integer
created-at: <ISO8601>
updated-at: <ISO8601>
---

## Description

<one-paragraph description of what the developer must do>

## Acceptance Criteria

- [ ] <criterion>

## Technical Notes

<relevant implementation notes>
```

**Auto-numbering guard** (instruction prose in body):
```markdown
Before assigning IDs, Glob `.planning/work/<slug>/TASK-*.md` to find the highest
existing ID number. Start new task IDs one above that maximum (zero-padded to three
digits). If no tasks exist yet, start at TASK-001.
```

---

### `.claude/commands/team-lead/execute.md` (skill/command, event-driven pipeline)

**Analog:** `.claude/commands/team-lead/execute.md` (existing stub) — frontmatter kept; body replaced.

**Frontmatter pattern** (lines 1-13 of existing stub — KEEP as-is):
```yaml
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
```

**Task ID normalization pattern** (instruction prose):
```markdown
## Step 1: Normalize Task ID

Take `$ARGUMENTS`. If it is `TASK-1` or `1` without three-digit padding, normalize
to three digits: `TASK-001`. Search for the task file using:
  Glob `.planning/work/**/<normalized-id>.md`
If no file is found, output an error with the normalized ID and stop.
```

**Pipeline stage loop pattern** (instruction prose — one status write per stage):
```markdown
## Step 2: Execute Pipeline

Read the task file. Then advance through the pipeline ONE STAGE AT A TIME.
For each stage, perform these three actions in order:

1. Write only the `status:` line in the frontmatter to the next status value using
   the Edit tool. (The task-state-guard.js PreToolUse hook validates the transition
   automatically and injects the updated `updated-at` timestamp.)
2. Log a one-line stub receipt:
   `[<Stage>] stub — Phase 3 plugs in real agent`
3. Print the progress trail line:
   `[<Stage>] Done ✓`

Stage sequence and status transitions:
| Stage | Status Before Write | Status After Write |
|-------|--------------------|--------------------|
| Developer | readyForDevelop | inProgress |
| CodeReview | inProgress | inReview |
| QA | inReview | inTesting |
| TeamLeadCheck | inTesting | forTeamLeadCheck |
| Done | forTeamLeadCheck | done |

IMPORTANT: Write ONE status transition at a time. Never write two status values
in a single Edit call. Wait for each write to complete before advancing.
```

**Failure gate pattern** (instruction prose):
```markdown
## On Failure

If any stage produces a failure indication (stub or real), pause immediately.
Prompt the user:
  "Stage failed: [<reason>]. Retry / Skip / Abort?"

- Retry: re-attempt the same stage from the start.
- Skip: mark stage as skipped, continue to the next stage.
- Abort: stop the pipeline. Leave task status at its current value.

Never automatically retry in Phase 2 — always wait for the user's choice.
```

---

### `.claude/hooks/stop-guard.js` (middleware/hook, request-response)

**Analog:** `.claude/hooks/task-state-guard.js` — exact pattern match (Node.js hook: stdin JSON → parse → exit code).

**Full structure pattern** (task-state-guard.js lines 1-6, 19-27, 109-113 — shebang, stdin read, try/catch/exit):
```javascript
#!/usr/bin/env node
// stop-guard.js — Stop hook
// Prevents infinite loop: exits 0 immediately if stop_hook_active is true.
// Registered in .claude/settings.json hooks.Stop array.

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    // Guard: if already in forced-continuation state, let Claude stop.
    if (data.stop_hook_active === true) {
      process.exit(0);
    }
    // Default: allow stopping.
    process.exit(0);
  } catch (e) {
    // Silent fail — never block the session on a parse error.
    process.exit(0);
  }
});
```

**Key difference from task-state-guard.js:** Stop hook never writes to stdout (no `hookSpecificOutput`, no `modifiedInput`). It only exits 0. The `deny()` pattern from task-state-guard.js lines 115-124 is NOT used here.

**stdin timeout pattern** (task-state-guard.js line 20 — copy exactly):
```javascript
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
```

**JSON field to read** (`stop_hook_active` from Stop hook stdin payload — NOT `process.env.CLAUDE_STOP_HOOK_ACTIVE`):
```javascript
// CORRECT — reads from JSON stdin:
if (data.stop_hook_active === true) { process.exit(0); }

// WRONG — this is only for the test script, not the production hook:
// if (process.env.CLAUDE_STOP_HOOK_ACTIVE === '1') { ... }
```

---

### `.claude/settings.json` (config — add Stop hook entry)

**Analog:** `.claude/settings.json` existing `SessionStart` and `PreToolUse` entries — copy registration pattern exactly.

**Existing pattern to follow** (settings.json lines 3-9 — SessionStart registration without matcher):
```json
"SessionStart": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "\"/Users/tarasbannyi/.nvm/versions/node/v22.18.0/bin/node\" \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/gsd-check-update.js"
      }
    ]
  }
]
```

**New Stop entry to add** (follows the same array-of-groups shape; no `matcher` field — Stop hooks do not support matchers):
```json
"Stop": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "\"/Users/tarasbannyi/.nvm/versions/node/v22.18.0/bin/node\" \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/stop-guard.js",
        "timeout": 5
      }
    ]
  }
]
```

**Node binary path** (must match existing hooks — absolute NVM path from settings.json lines 8, 36, 46, 68, etc.):
```
/Users/tarasbannyi/.nvm/versions/node/v22.18.0/bin/node
```

**Insertion point:** Add `"Stop": [...]` as a sibling of `"SessionStart"`, `"PostToolUse"`, and `"PreToolUse"` inside the top-level `"hooks"` object (settings.json line 2).

---

### `scripts/test-stop-guard.sh` (utility/test, request-response)

**Analog:** `.claude/hooks/gsd-validate-commit.sh` — bash script pattern (shebang, set -e, pipe payload to node script, assert exit).

**Shebang and safety flags pattern** (gsd-validate-commit.sh lines 1-2):
```bash
#!/usr/bin/env bash
set -e
```

**Script structure pattern** (pipe JSON payload to Node hook, check exit, print result):
```bash
#!/usr/bin/env bash
# test-stop-guard.sh — Forced-exit test for stop-guard.js
# Asserts stop-guard.js exits 0 when stop_hook_active is true.
# Run: bash scripts/test-stop-guard.sh

set -e

HOOK="$(dirname "$0")/../.claude/hooks/stop-guard.js"
NODE="/Users/tarasbannyi/.nvm/versions/node/v22.18.0/bin/node"

# Test 1: stop_hook_active=true → must exit 0
PAYLOAD='{"session_id":"test","hook_event_name":"Stop","stop_hook_active":true,"cwd":".","transcript_path":"/tmp/test.jsonl"}'
echo "$PAYLOAD" | "$NODE" "$HOOK"
echo "PASS: stop_hook_active=true exits 0"

# Test 2: stop_hook_active=false → must exit 0
PAYLOAD='{"session_id":"test","hook_event_name":"Stop","stop_hook_active":false,"cwd":".","transcript_path":"/tmp/test.jsonl"}'
echo "$PAYLOAD" | "$NODE" "$HOOK"
echo "PASS: stop_hook_active=false exits 0"

echo "All tests passed."
```

**`scripts/` directory:** Must be created (does not exist yet). No special structure required — single flat script.

---

## Shared Patterns

### Node.js Hook Boilerplate
**Source:** `.claude/hooks/task-state-guard.js` lines 19-27, 109-113
**Apply to:** `stop-guard.js`
```javascript
let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    // ... hook logic ...
  } catch (e) {
    process.exit(0);  // Silent fail — never block
  }
});
```

### Absolute Node Binary Path
**Source:** `.claude/settings.json` lines 8, 36, 46, 68, 78, 88, 98
**Apply to:** `settings.json` Stop hook entry AND `scripts/test-stop-guard.sh`
```
/Users/tarasbannyi/.nvm/versions/node/v22.18.0/bin/node
```
Used in settings.json as: `"\"/Users/tarasbannyi/.nvm/versions/node/v22.18.0/bin/node\" \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/<script>.js"`

### Slash Command Frontmatter Structure
**Source:** `.claude/commands/team-lead/plan.md` lines 1-11, `.claude/commands/team-lead/execute.md` lines 1-13
**Apply to:** Both plan.md and execute.md (keep existing frontmatter, replace body only)

The frontmatter `name`, `description`, `argument-hint`, and `allowed-tools` fields are already correct in the stubs. The full body below `---` is what gets replaced.

### Task File YAML Frontmatter Schema
**Source:** `.planning/task-schema.yaml` (full file), `.planning/work/test-epic/TASK-001.md` (canonical example)
**Apply to:** plan.md body — the TASK-XXX.md files it generates must conform to this schema exactly.

Required fields in generation order:
```yaml
id: TASK-NNN          # three-digit zero-padded
title: <string>
status: readyForDevelop   # always this on creation
priority: medium          # default; adjust per task
repo: be                  # or fe — never both
epic: <slug>              # must match parent directory name
complexity: N             # integer 1-10
created-at: <ISO8601>
updated-at: <ISO8601>
```

---

## No Analog Found

All files have close analogs in the codebase. No entries.

---

## Metadata

**Analog search scope:** `.claude/commands/`, `.claude/hooks/`, `.claude/settings.json`, `.planning/work/`, `.planning/task-schema.yaml`
**Files scanned:** 10 (task-state-guard.js, gsd-validate-commit.sh, gsd-workflow-guard.js, settings.json, plan.md stub, execute.md stub, gsd-validate-commit.sh, TASK-001.md, task-schema.yaml, CLAUDE.md)
**Pattern extraction date:** 2026-05-23
