# Phase 2: TeamLead Skills - Research

**Researched:** 2026-05-23
**Domain:** Claude Code slash commands (skills), hook lifecycle (Stop hook), Node.js hook scripting, markdown task file orchestration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**SPEC.md Format & Location**
- D-01: SPEC.md is user-supplied. Usage: `/team-lead:plan path/to/SPEC.md`. No convention-enforced location.
- D-02: Required sections with free-form content: `## Goal`, `## User Stories / Requirements`, `## Acceptance Criteria`, `## Technical Design`. Content is free-form prose.
- D-03: Template generation via `--new`. Running `/team-lead:plan --new <epic-name>` writes a starter SPEC.md with all four section headers.
- D-04: Epic directory inferred from `## Goal` (or filename slug fallback). Tasks land in `.planning/work/<slug>/`.

**Plan Review Output & Timing**
- D-05: Preview-first, confirm-to-write. Prints review table, asks "Write these tasks? [y/N]" before writing any TASK-XX.md.
- D-06: Markdown table format: `| ID | Title | Complexity | Repo | Epic |`.
- D-07: Flat ordered list — no wave grouping in Phase 2.

**Execute Pipeline Control Flow**
- D-08: Full orchestration logic with stubbed agent calls. Stage gates and status transitions all present; agent invocations log `[Stage stub — Phase 3 plugs in real agent]`.
- D-09: On any failure, pipeline pauses for user. Prompt: "Stage failed: [reason]. Retry / Skip / Abort?". No automatic retry in Phase 2.
- D-10: Stage-by-stage progress trail: `[Developer] Done ✓`, `[CodeReview] APPROVED ✓`, etc.

**Stop Hook Guard**
- D-11: Automated test script (`test-stop-guard.sh`) sets `CLAUDE_STOP_HOOK_ACTIVE=1`, invokes the hook with a mock stop payload, and asserts exit 0.

### Claude's Discretion
- Stop hook architecture: shared `stop-guard.js` at `.claude/hooks/stop-guard.js` registered in `.claude/settings.json` as a `Stop` hook. Reads `stop_hook_active` from JSON stdin — if true, exits 0 immediately. Execute orchestrator sets `CLAUDE_STOP_HOOK_ACTIVE=1` env var before any sub-agent stub. Follows the existing Node.js hook pattern.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TL-01 | `/team-lead:plan` skill reads SPEC.md + `.planning/codebase/`, generates TASK-XX.md files with complexity scoring, outputs list for human review before any execution | Slash command markdown files in `.claude/commands/` work as `/name` commands. `$ARGUMENTS` substitution passes the SPEC.md path. The command file body is the full instruction set for Claude to follow. |
| TL-02 | `/team-lead:execute TASK-ID` skill runs full automated pipeline per task: Developer → CodeReview → QA → TeamLeadCheck → Done | Same slash command mechanism; `Agent` tool listed in `allowed-tools` for Phase 4 real agents; Phase 2 uses stub log output. `$ARGUMENTS` passes TASK-ID. |
| TL-03 | SPEC.md format defined — single file per epic containing product requirements and technical design | Free-form markdown with four required section headers. Validated by the plan command before task generation. |
| TL-04 | TeamLead assigns complexity score 1-10 per generated task, surfaces it in the plan review output | Complexity is a YAML frontmatter field (1-10 integer). The plan command includes it in the `| ID | Title | Complexity | Repo | Epic |` review table. |
| PIPE-04 | Stop hook guard — every Stop hook checks `stop_hook_active` and exits immediately | `stop_hook_active` is a boolean field in the Stop hook JSON stdin payload. Check it first; exit 0 immediately when true. Registered in `.claude/settings.json` `hooks.Stop` array. |
| PIPE-05 | Status transition guard — PostToolUse hook on `.planning/work/*.md` validates only allowed transitions proceed | Already fully implemented as `task-state-guard.js` (PreToolUse hook). REQUIREMENTS.md says PostToolUse but the implementation uses PreToolUse (decision 01-01); ROADMAP SC-2 corrected to PreToolUse. No new work needed for PIPE-05 beyond confirming it is already complete. |
</phase_requirements>

---

## Summary

Phase 2 delivers two slash commands and a Stop hook guard. The implementation surface is entirely in Claude Code's own configuration layer — markdown command files, a Node.js hook script, and entries in `.claude/settings.json`. No new build tools, no npm packages, no framework integration.

The plan command (`/team-lead:plan`) is a markdown instruction file that directs Claude to: validate SPEC.md section headers, read codebase context from `.planning/codebase/`, generate TASK-XX.md content with YAML frontmatter, display a review table, wait for confirmation, then write files. The execute command (`/team-lead:execute`) is a markdown instruction file that directs Claude to: read a TASK-XX.md file, advance its status through the six-state lifecycle by updating frontmatter (the existing `task-state-guard.js` hook enforces validity automatically), log stubbed agent receipts at each stage, and prompt the user on failure.

The Stop hook (`stop-guard.js`) is a 25-line Node.js script following the exact pattern of `task-state-guard.js`. It reads JSON from stdin, checks `stop_hook_active`, exits 0 immediately when true (preventing infinite loops), otherwise exits 0 to allow stopping. It is registered in `.claude/settings.json` under `hooks.Stop` using the same nested-array pattern already used for `SessionStart` hooks. A bash test script (`test-stop-guard.sh`) drives the forced-exit verification required by ROADMAP SC-5 / D-11.

**Primary recommendation:** Implement plan.md and execute.md as pure markdown instruction files with `$ARGUMENTS` substitution. Implement stop-guard.js following task-state-guard.js's stdin-read-JSON-parse-exit pattern. Register in settings.json. Write test-stop-guard.sh that pipes a mock payload with `"stop_hook_active": true` and asserts exit 0.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Plan command — SPEC.md validation, task generation, review table | Claude Code skill layer | File system (.planning/work/) | Slash command body is the orchestration instruction; Claude performs the reasoning |
| Plan command — human review gate | Claude Code skill layer | Terminal I/O | "Write these tasks? [y/N]" prompt is Claude asking the user, not a subprocess |
| Execute command — pipeline orchestration | Claude Code skill layer | Task file frontmatter | Claude reads TASK-XX.md, advances status by writing frontmatter; hook enforces validity |
| Execute command — stage progress trail | Claude Code skill layer | stdout | Claude prints `[Stage] Done ✓` as text output, no subprocess needed |
| Execute command — failure prompt | Claude Code skill layer | Terminal I/O | Claude presents "Retry / Skip / Abort?" as a conversational prompt |
| Stop hook — infinite loop guard | Hook layer (.claude/hooks/) | settings.json registration | Reads `stop_hook_active` from stdin JSON; exits 0 immediately when true |
| Stop hook test | Shell script layer | Node.js stdin pipe | test-stop-guard.sh mocks payload, pipes to hook, asserts exit code |
| Status transition enforcement | Hook layer (PreToolUse) | — | Already complete: task-state-guard.js. No new work for PIPE-05. |
| Complexity scoring | Claude Code skill layer | YAML frontmatter | Claude reasons about task scope and writes an integer 1-10 into the frontmatter |

---

## Standard Stack

### Core (No new packages required)

| Asset | Version | Purpose | Why Standard |
|-------|---------|---------|--------------|
| Node.js | v22.18.0 (already installed) | Stop hook runtime | All existing hooks use Node.js; consistent with task-state-guard.js |
| Bash | 3.2 (already installed) | Test script | Simplest option for a one-shot CLI test |
| Markdown (.md) | — | Slash command files | Claude Code's native command/skill format |
| YAML frontmatter | — | Task file schema | Already established in Phase 1; task-schema.yaml is the source of truth |

**No npm packages are needed.** The plan and execute commands are markdown files. The stop-guard.js hook uses only Node.js built-ins (`fs`, `process.stdin`), identical to task-state-guard.js.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node.js for stop-guard.js | Bash script | Bash is available (gsd-validate-commit.sh shows the pattern) but JSON parsing in bash requires jq or node anyway; consistent Node.js is cleaner |
| Markdown command files | Agent .md files with `context: fork` | Forked context loses conversation history and makes the review-gate interactive prompt harder; inline commands are the right choice for orchestration flows that need user back-and-forth |

**Installation:** None required. All tools are already available on this machine.

---

## Package Legitimacy Audit

Not applicable. Phase 2 installs no external packages. All implementation uses Node.js built-ins and existing project infrastructure.

---

## Architecture Patterns

### System Architecture Diagram

```
User invokes /team-lead:plan path/to/SPEC.md
         |
         v
  plan.md (slash command body)
         |
  [1] Read SPEC.md → validate 4 section headers present
         |
  [2] Read .planning/codebase/ → understand codebase context
         |
  [3] Reason about tasks → assign complexity 1-10, repo be/fe, epic slug
         |
  [4] Print review table  →  | ID | Title | Complexity | Repo | Epic |
         |
  [5] Ask "Write these tasks? [y/N]"
         |         |
        YES        NO → stop
         |
  [6] Write TASK-XXX.md files to .planning/work/<epic>/
         |
  task-state-guard.js (PreToolUse) validates readyForDevelop on write
         |
         v
       Done

─────────────────────────────────────────────────────────────

User invokes /team-lead:execute TASK-001
         |
         v
  execute.md (slash command body)
         |
  [1] Read .planning/work/<epic>/TASK-001.md
         |
  [2] Transition status: readyForDevelop → inProgress
         |    (task-state-guard.js auto-injects updated-at)
         |
  [3] Log: "[Developer] stub — Phase 3 plugs in real agent"
         |
  [4] Transition: inProgress → inReview
         |
  [5] Log: "[CodeReview] APPROVED ✓" (stub)
         |
  [6] Transition: inReview → inTesting
         |
  [7] Log: "[QA] PASSED ✓" (stub)
         |
  [8] Transition: inTesting → forTeamLeadCheck
         |
  [9] Log: "[TeamLeadCheck] APPROVED ✓" (stub)
         |
 [10] Transition: forTeamLeadCheck → done
         |
         v
       Done

─────────────────────────────────────────────────────────────

Claude stops responding (any session)
         |
         v
  stop-guard.js (Stop hook)
         |
  Read stdin JSON
         |
  stop_hook_active == true?
    YES → exit 0 (allow stop, break infinite loop)
    NO  → exit 0 (allow stop, nothing to guard)
```

### Recommended Project Structure

Files created or modified in this phase:

```
.claude/
├── commands/team-lead/
│   ├── plan.md              # REPLACE stub with full implementation
│   └── execute.md           # REPLACE stub with full implementation
├── hooks/
│   └── stop-guard.js        # NEW: Stop hook infinite-loop guard
└── settings.json            # ADD: hooks.Stop entry

scripts/                     # (create if not exists)
└── test-stop-guard.sh       # NEW: forced-exit test (PIPE-04 / D-11 / ROADMAP SC-5)
```

### Pattern 1: Slash Command as Orchestration Instruction

**What:** A `.claude/commands/<name>.md` file provides the full instruction body that Claude follows when `/name` is invoked. The file frontmatter declares `allowed-tools` and `argument-hint`.

**When to use:** Any multi-step workflow that Claude orchestrates — reading files, making decisions, writing output, asking the user for confirmation.

**Key facts (VERIFIED via official docs: code.claude.com/docs/en/skills):**
- `$ARGUMENTS` substitution: everything typed after the command name is available as `$ARGUMENTS` in the body. `/team-lead:plan path/to/SPEC.md` → `$ARGUMENTS` = `path/to/SPEC.md`.
- `allowed-tools` in frontmatter: space-separated list of tool names. Does NOT restrict — it pre-approves those tools without per-use prompts. Every tool remains callable.
- `argument-hint` in frontmatter: hint shown in autocomplete, e.g., `"<path-to-SPEC.md>"`.
- `disable-model-invocation: true` prevents Claude from auto-invoking the command. NOT needed for team-lead commands (user always invokes explicitly).
- Command files in `.claude/commands/` and skill files in `.claude/skills/<name>/SKILL.md` are equivalent; the existing commands/ location continues to work.

**Example — plan.md frontmatter:**
```yaml
# Source: code.claude.com/docs/en/skills (frontmatter reference table)
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

### Pattern 2: Node.js Hook — stdin Read, JSON Parse, Exit

**What:** Every hook is a Node.js script that reads JSON from stdin, parses it, performs a check, and communicates via exit code and stdout JSON.

**When to use:** Any Claude Code lifecycle hook (PreToolUse, PostToolUse, Stop, SessionStart). All existing hooks in this project follow this pattern.

**Key facts (VERIFIED: code.claude.com/docs/en/hooks + task-state-guard.js source):**

Stop hook stdin JSON payload:
```json
{
  "session_id": "...",
  "transcript_path": "...",
  "cwd": "...",
  "hook_event_name": "Stop",
  "stop_hook_active": true,
  "permission_mode": "default"
}
```

`stop_hook_active` (boolean) is in the JSON stdin payload. It is `true` when a previous Stop hook already forced Claude to continue. [VERIFIED: code.claude.com/docs/en/hooks + multiple cross-references including claudefa.st/blog/tools/hooks/stop-hook-task-enforcement]

**Canonical stop-guard.js pattern (following task-state-guard.js structure):**
```javascript
// Source: task-state-guard.js existing pattern + stop_hook_active from official docs
#!/usr/bin/env node
// stop-guard.js — Stop hook
// Prevents infinite loops: exits 0 immediately if stop_hook_active is true.

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    // CRITICAL: if already in forced-continuation state, let Claude stop.
    if (data.stop_hook_active === true) {
      process.exit(0);
    }
    // Default: allow stopping.
    process.exit(0);
  } catch (e) {
    // Silent fail — never block the session.
    process.exit(0);
  }
});
```

**Exit codes for Stop hook:**
- Exit 0: allow Claude to stop (normal behavior)
- Exit 2: block Claude from stopping, force continuation (use VERY carefully — requires `stop_hook_active` check)

This hook always exits 0. Phase 2 does not need to block stopping — it only needs to guard against infinite loops IF a future version of the hook were to exit 2.

### Pattern 3: Stop Hook Registration in settings.json

**What:** Stop hooks are registered in the `hooks.Stop` array in `.claude/settings.json`. Stop does not support matchers and fires on every session stop.

**Observed existing format (SessionStart in this project's settings.json):**
```json
"SessionStart": [
  {
    "hooks": [
      { "type": "command", "command": "..." }
    ]
  }
]
```

**Stop hook format follows the same array-of-groups pattern (no matcher field needed):**
```json
"Stop": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "\"/path/to/node\" \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/stop-guard.js",
        "timeout": 5
      }
    ]
  }
]
```

**IMPORTANT:** Use the absolute Node.js path (matching the existing hooks in this project) — not just `node`. This avoids PATH issues in hook execution context.

### Pattern 4: SPEC.md Section Validation

**What:** Before generating tasks, the plan command must validate that all four required section headers exist in the SPEC.md.

**When to use:** Called at the start of the plan command body, before any task generation.

**Validation approach (in the plan command instruction body):**
The plan command body instructs Claude to use the Grep tool to verify each header is present:
```
Required headers to verify (using Grep):
- ## Goal
- ## User Stories / Requirements
- ## Acceptance Criteria
- ## Technical Design

If any header is missing, output a clear error listing missing headers and stop.
```

**Template SPEC.md (for `--new` flag):**
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

### Pattern 5: Epic Slug Derivation

**What:** The plan command derives the epic directory slug from SPEC.md without requiring a `--epic` flag (D-04).

**Algorithm (instruction to Claude in plan.md body):**
1. Read the text under `## Goal` section
2. Take the first sentence (or first 5-8 words)
3. Convert to lowercase kebab-case (remove punctuation, replace spaces with hyphens)
4. If `## Goal` section is empty or absent, fall back to: take the SPEC.md filename (without path or `.md`), convert to kebab-case
5. Use the derived slug as the directory name under `.planning/work/<slug>/`

**Example:** `## Goal: Build a user authentication system` → `user-authentication-system`

### Pattern 6: Status Transition in Execute Command

**What:** The execute command advances the task's status through all six stages by writing updated frontmatter. The existing `task-state-guard.js` hook validates every transition automatically.

**Status sequence the execute command drives:**
```
readyForDevelop → inProgress → inReview → inTesting → forTeamLeadCheck → done
```

**Task file write pattern (in execute command body):**
- Claude reads the current TASK-XXX.md
- Uses the Edit tool to update only the `status:` line in the frontmatter
- `task-state-guard.js` intercepts the Edit call, validates the transition, injects `updated-at`
- If transition is invalid, the hook denies the write — Claude sees the denial reason

### Anti-Patterns to Avoid

- **Calling `bash` to generate tasks:** The plan command should use Claude's Read/Write tools directly, not shell out to generate YAML. This keeps it within the `allowed-tools` surface.
- **Setting `stop_hook_active` as an env var for the guard check:** The hook reads `stop_hook_active` from JSON stdin, not from an environment variable. The env var `CLAUDE_STOP_HOOK_ACTIVE=1` in D-11 is used ONLY in the test script to simulate the condition — the production hook reads from stdin.
- **Using `decision: "block"` in stop-guard.js:** Phase 2's stop-guard.js should always exit 0. Blocking stop (exit 2) is a future concern; the guard is about preventing infinite loops, not enforcing task completion.
- **Writing `repo: both` in generated task files:** The plan command body must explicitly split full-stack work and never emit `repo: both`. task-state-guard.js will reject it anyway, but the plan command should prevent it proactively.
- **Assuming `allowed-tools` restricts tool access:** It pre-approves without prompting; it does NOT prevent Claude from calling other tools.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Status transition validation | Custom validation in execute.md | task-state-guard.js (already exists) | The PreToolUse hook enforces valid transitions on every Edit/Write to .planning/work/*.md automatically — execute just writes the new status |
| YAML frontmatter parsing in stop-guard.js | yaml library or regex | Read `stop_hook_active` directly from top-level JSON | It's a top-level JSON field in the hook payload, not embedded YAML |
| Auto-numbering TASK IDs | External counter file or DB | Glob `.planning/work/<epic>/TASK-*.md`, find max ID, increment | Simple in-command glob; no state file needed |
| Human review gate | A subprocess or readline | Claude's native conversational prompt | The plan command body instructs Claude to ask the user — this is just Claude talking, no subprocess |

**Key insight:** The slash command body IS the program. Claude reads it and follows the instructions. There is no separate runner, no shell script to parse arguments, and no framework to configure — just markdown that tells Claude what to do.

---

## Common Pitfalls

### Pitfall 1: `stop_hook_active` Field Name Confusion

**What goes wrong:** Confusing the JSON stdin field `stop_hook_active` with the test env var `CLAUDE_STOP_HOOK_ACTIVE`. Writing `process.env.CLAUDE_STOP_HOOK_ACTIVE` in the production hook will never trigger — the env var is only a test harness convenience.

**Why it happens:** D-11 mentions `CLAUDE_STOP_HOOK_ACTIVE=1` in the test script context, which implies it might be the mechanism. The actual guard reads from JSON stdin.

**How to avoid:** In stop-guard.js: `data.stop_hook_active === true` (JSON field). In test-stop-guard.sh: mock the JSON payload with `"stop_hook_active": true` piped to stdin — the env var approach in D-11 is for the test to SET UP the mock payload, not for the hook to CHECK.

**Warning signs:** The test passes but the hook exits 0 unconditionally regardless of the JSON payload.

### Pitfall 2: PIPE-05 is Already Implemented

**What goes wrong:** Treating PIPE-05 ("PostToolUse hook on `.planning/work/*.md` validates only allowed transitions proceed") as new work.

**Why it happens:** REQUIREMENTS.md lists PIPE-05 as pending, but the PreToolUse hook `task-state-guard.js` already enforces all status transitions (implemented in Phase 1, confirmed correct in Phase 1 plan 01-05).

**How to avoid:** PIPE-05 maps to the already-complete `task-state-guard.js`. The Phase 2 plan should verify this is working (not implement it again). The execute command body relies on the hook's automatic enforcement.

**Warning signs:** A plan task that writes a new hook for status transitions — this would conflict with or duplicate task-state-guard.js.

### Pitfall 3: Slash Command Argument Parsing

**What goes wrong:** The plan command needs to handle two cases: `/team-lead:plan path/to/SPEC.md` (normal) and `/team-lead:plan --new <epic-name>` (template generation). Putting this logic in a bash subprocess is more complex and fragile than letting Claude parse `$ARGUMENTS` in the instruction body.

**Why it happens:** Developers reach for shell scripts for argument parsing.

**How to avoid:** The plan command body should instruct Claude: "If `$ARGUMENTS` starts with `--new`, treat the next word as the epic name and write a template SPEC.md. Otherwise, treat `$ARGUMENTS` as a SPEC.md path and proceed with plan generation." Claude handles this reasoning natively.

**Warning signs:** The plan.md body contains `` !`bash` `` blocks or `$ARGUMENTS | parse` logic.

### Pitfall 4: Stop Hook Registered Without Absolute Node Path

**What goes wrong:** Registering the Stop hook as `"command": "node .claude/hooks/stop-guard.js"` may fail if `node` is not in PATH in the hook execution context.

**Why it happens:** Existing SessionStart hooks use absolute paths (e.g., `/Users/tarasbannyi/.nvm/versions/node/v22.18.0/bin/node`).

**How to avoid:** Follow the exact pattern of existing hooks in settings.json — use the absolute NVM node path. Use `which node` to confirm the path matches.

**Warning signs:** Stop hook silently fails; Claude sessions end normally because the timeout causes the hook to produce no output (non-zero exit without stderr → non-blocking error).

### Pitfall 5: TASK-ID Padding in Execute Command

**What goes wrong:** The execute command receives `TASK-1` or `TASK-001` — it must handle both formats or enforce three-digit zero-padding consistently.

**Why it happens:** Users may type shortened IDs.

**How to avoid:** The execute command body instructs Claude: "Normalize the task ID to three-digit format (TASK-001). Search for the task file using Glob on `.planning/work/**/<normalized-id>.md`."

**Warning signs:** Execute command fails with "file not found" on valid TASK IDs.

### Pitfall 6: execute.md Status Transition Race

**What goes wrong:** The execute command body must write status transitions one at a time and wait for task-state-guard.js validation before advancing to the next stage. If Claude writes two status transitions in sequence too quickly or in one Write call, the hook may see an invalid jump (e.g., `readyForDevelop → inReview`).

**Why it happens:** Optimization instinct — trying to do multiple stages in one write.

**How to avoid:** The execute command body instructs Claude to write ONE status transition at a time, log the stage completion, then proceed to the next stage. Each Edit call to the task file goes through the hook.

---

## Code Examples

### Stop Guard (complete implementation)

```javascript
// Source: task-state-guard.js pattern (existing) + stop_hook_active field (code.claude.com/docs/en/hooks)
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
    // If already in forced-continuation state, let Claude stop immediately.
    // This is the infinite-loop guard: a previous Stop hook already ran
    // and forced continuation; we must not block again.
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

### Test Script (PIPE-04 / D-11 / ROADMAP SC-5)

```bash
# Source: D-11 (CONTEXT.md) — test-stop-guard.sh
#!/usr/bin/env bash
# test-stop-guard.sh — Forced-exit test for stop-guard.js
# Asserts that stop-guard.js exits 0 when stop_hook_active is true.
# Run: bash scripts/test-stop-guard.sh

set -e

HOOK="$(dirname "$0")/../.claude/hooks/stop-guard.js"
NODE="/Users/tarasbannyi/.nvm/versions/node/v22.18.0/bin/node"

# Test 1: stop_hook_active = true → must exit 0 (allow stop, break loop)
PAYLOAD='{"session_id":"test","hook_event_name":"Stop","stop_hook_active":true,"cwd":".","transcript_path":"/tmp/test.jsonl"}'
echo "$PAYLOAD" | "$NODE" "$HOOK"
echo "PASS: stop_hook_active=true exits 0"

# Test 2: stop_hook_active = false → must exit 0 (allow stop normally)
PAYLOAD='{"session_id":"test","hook_event_name":"Stop","stop_hook_active":false,"cwd":".","transcript_path":"/tmp/test.jsonl"}'
echo "$PAYLOAD" | "$NODE" "$HOOK"
echo "PASS: stop_hook_active=false exits 0"

echo "All tests passed."
```

### settings.json Stop Hook Registration

```json
// Source: existing settings.json SessionStart pattern (this project) + hooks docs
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

### plan.md Instruction Body (key sections)

```markdown
# Source: D-01 through D-07 (CONTEXT.md) + $ARGUMENTS substitution (code.claude.com/docs/en/skills)

## Handling Arguments

- If `$ARGUMENTS` is `--new <epic-name>`: write a SPEC.md template to `<epic-name>/SPEC.md` (or prompt user for path) and stop.
- Otherwise: treat `$ARGUMENTS` as the path to an existing SPEC.md.

## Step 1: Validate SPEC.md

Read the file at `$ARGUMENTS`. Verify all four section headers exist:
- `## Goal`
- `## User Stories / Requirements`
- `## Acceptance Criteria`
- `## Technical Design`

If any header is missing, output the list of missing headers and stop.

## Step 2: Derive Epic Slug

Read the text under `## Goal`. Take the first sentence, convert to lowercase kebab-case.
Example: "Build user authentication" → `user-authentication`.
Fallback: use the SPEC.md filename slug if Goal is empty.

## Step 3: Read Codebase Context

Read `.planning/codebase/STRUCTURE.md` and `.planning/codebase/ARCHITECTURE.md` to understand
where new code would land. This informs task granularity and repo assignment (be vs fe).

## Step 4: Generate Tasks

Create a list of TASK-XXX.md file contents. For each task:
- Assign sequential ID starting from TASK-001 (check existing files in .planning/work/<epic>/ to avoid collisions)
- Write a focused title (one action, ~10 min execution time)
- Assign `repo: be` or `repo: fe` (never `repo: both`)
- Assign `complexity: N` (1=trivial, 10=most complex)
- Set `status: readyForDevelop`, `priority: medium` (adjust as warranted)
- Set `epic: <slug>` matching the directory name
- Set `created-at` and `updated-at` to current ISO8601 timestamp

## Step 5: Display Review Table

Print the review table before writing any files:

| ID | Title | Complexity | Repo | Epic |
|----|-------|------------|------|------|
| TASK-001 | ... | 3 | be | user-auth |

Then ask: "Write these tasks? [y/N]"

## Step 6: Write on Confirmation

If the user confirms with y/Y: write each TASK-XXX.md to `.planning/work/<epic>/`.
If the user declines: stop without writing any files.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.claude/commands/<name>.md` as legacy format | Merged with Skills — both work identically | Claude Code 2.x (skills update) | No migration needed; existing `plan.md` and `execute.md` stubs already in the right location |
| Stop hook exit-2 pattern without guard | Stop hook with `stop_hook_active` check required | Documented in Claude Code hooks reference | Must read JSON stdin and check `stop_hook_active` before any blocking logic |

**Deprecated/outdated:**
- Separate "commands" vs "skills" distinction: now merged. `.claude/commands/*.md` still works; no need to migrate to `.claude/skills/*/SKILL.md` format unless you want supporting files.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The test script (D-11) sets `CLAUDE_STOP_HOOK_ACTIVE=1` as a convenience for the test author's mental model, but the actual hook check is `data.stop_hook_active` from JSON stdin | Common Pitfalls / Code Examples | Test script would pass vacuously if hook reads env var and env var is set, masking a broken stdin-parse path |
| A2 | PIPE-05 (status transition guard) is fully satisfied by the existing `task-state-guard.js` — no new PreToolUse hook needed for Phase 2 | Phase Requirements table | If PIPE-05 requires a PostToolUse hook specifically (not PreToolUse), a second hook would need to be written — but SC-2 was already corrected to PreToolUse in 01-05 |
| A3 | The node binary path `/Users/tarasbannyi/.nvm/versions/node/v22.18.0/bin/node` remains stable for the stop-guard.js registration | Code Examples (settings.json) | If node version changes, the absolute path breaks; use `$(which node)` in test script as a cross-check |

---

## Open Questions (RESOLVED)

1. **PIPE-05 scope confirmation** — RESOLVED: PreToolUse hook (task-state-guard.js) fully satisfies PIPE-05; Plan 02-03 Task 2 verifies this and marks REQUIREMENTS.md [x].
   - What we know: REQUIREMENTS.md lists PIPE-05 as pending; Phase 1 implemented `task-state-guard.js` as a PreToolUse hook that fully enforces status transitions.
   - What's unclear: Does PIPE-05 require an ADDITIONAL PostToolUse hook, or does the existing PreToolUse hook satisfy it?
   - Recommendation: The planner should mark PIPE-05 as satisfied by task-state-guard.js (following the precedent of ROADMAP SC-2 correction in 01-05) and include a verification task that confirms the hook blocks invalid transitions. No new hook code needed.

2. **test-stop-guard.sh location** — RESOLVED: scripts/test-stop-guard.sh per Plan 02-01 Task 2.
   - What we know: D-11 calls it "a test script (e.g., `test-stop-guard.sh`)". No directory is specified.
   - What's unclear: Should it live in `scripts/`, `.claude/hooks/tests/`, or the project root?
   - Recommendation: `scripts/test-stop-guard.sh` — consistent with a general `scripts/` directory; keeps hook directory clean; easy to run with `bash scripts/test-stop-guard.sh`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | stop-guard.js hook | Yes | v22.18.0 | — |
| Bash | test-stop-guard.sh | Yes | 3.2.57 | — |
| `.claude/settings.json` | Stop hook registration | Yes (exists, has existing hooks) | — | — |
| `.planning/work/` | Plan command writes task files | Yes (exists, has test-epic/TASK-001.md) | — | — |
| `.planning/codebase/` | Plan command reads codebase context | Yes (STRUCTURE.md, ARCHITECTURE.md, etc.) | — | — |
| `task-state-guard.js` | Execute command relies on it for transition enforcement | Yes (Phase 1 complete) | — | — |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-ins + bash assertions (no test framework — matching Phase 1 pattern) |
| Config file | none |
| Quick run command | `bash scripts/test-stop-guard.sh` |
| Full suite command | `bash scripts/test-stop-guard.sh && node .claude/hooks/stop-guard.js < /dev/null; echo "hook exit: $?"` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TL-01 | plan.md exists and contains `$ARGUMENTS` substitution | file | `grep -l '\$ARGUMENTS' .claude/commands/team-lead/plan.md` | ❌ Wave 0 |
| TL-01 | plan command outputs review table format | manual | Invoke `/team-lead:plan` against a sample SPEC.md, verify table appears | manual |
| TL-01 | plan command pauses before writing files | manual | Observe "Write these tasks? [y/N]" prompt during live test | manual |
| TL-02 | execute.md exists and references all 5 pipeline stages | file | `grep -c 'Developer\|CodeReview\|QA\|TeamLeadCheck\|done' .claude/commands/team-lead/execute.md` | ❌ Wave 0 |
| TL-03 | plan command rejects SPEC.md missing required headers | manual | Run with a SPEC.md missing one header; verify error message | manual |
| TL-04 | Generated tasks include complexity score in review table | manual | Run plan against sample SPEC.md; verify `Complexity` column is populated | manual |
| PIPE-04 | stop-guard.js exits 0 when stop_hook_active=true | behavior | `bash scripts/test-stop-guard.sh` | ❌ Wave 0 |
| PIPE-04 | stop-guard.js registered in settings.json | file | `node -e "const s=require('./.claude/settings.json'); console.log(s.hooks.Stop ? 'OK' : 'MISSING')"` | ❌ Wave 0 |
| PIPE-05 | task-state-guard.js blocks invalid transitions (already complete) | behavior | `echo '{"tool_name":"Write","tool_input":{"file_path":".planning/work/test-epic/TASK-001.md","content":"---\nstatus: done\n---"}}' \| node .claude/hooks/task-state-guard.js \| node -e "process.exit(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).hookSpecificOutput?.permissionDecision==='deny'?0:1)"` | ✅ Exists |

### Sampling Rate

- **Per task commit:** `bash scripts/test-stop-guard.sh`
- **Per wave merge:** Full suite (all file-existence checks + stop guard test)
- **Phase gate:** All automated tests green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `.claude/commands/team-lead/plan.md` — covers TL-01, TL-03, TL-04 (replace stub)
- [ ] `.claude/commands/team-lead/execute.md` — covers TL-02 (replace stub)
- [ ] `.claude/hooks/stop-guard.js` — covers PIPE-04
- [ ] `scripts/test-stop-guard.sh` — covers PIPE-04 forced-exit verification
- [ ] Stop hook entry in `.claude/settings.json` — covers PIPE-04 registration

*(PIPE-05 is already complete — task-state-guard.js exists and enforces all transitions. No Wave 0 gap.)*

---

## Security Domain

This phase operates entirely within the local Claude Code configuration layer. No network calls, no external services, no user data handling. ASVS categories are not applicable.

| ASVS Category | Applies | Rationale |
|---------------|---------|-----------|
| V2 Authentication | No | No auth layer |
| V3 Session Management | No | Claude Code manages sessions |
| V4 Access Control | No | File access governed by Claude Code permissions |
| V5 Input Validation | Partial | SPEC.md section header validation is functional, not security-critical |
| V6 Cryptography | No | No secrets or encrypted data |

**One relevant safety concern (not ASVS):** The stop-guard.js hook must never exit non-zero unexpectedly, as this could block Claude sessions. Wrap all logic in try/catch with `process.exit(0)` in the catch — this is already the pattern in task-state-guard.js.

---

## Sources

### Primary (HIGH confidence)

- [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) — Slash command / skill frontmatter reference table; `$ARGUMENTS` substitution; `allowed-tools` behavior; command file location rules
- [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks) — Stop hook input payload structure; exit codes; `stop_hook_active` field; settings.json registration format
- `.claude/hooks/task-state-guard.js` (codebase) — Node.js hook pattern: stdin timeout, JSON parse, process.exit, PreToolUse output format
- `.claude/settings.json` (codebase) — Exact settings.json hook registration format used by this project (SessionStart pattern without matcher, hooks array with type/command/timeout)

### Secondary (MEDIUM confidence)

- [claudefa.st/blog/tools/hooks/stop-hook-task-enforcement](https://claudefa.st/blog/tools/hooks/stop-hook-task-enforcement) — `stop_hook_active` field confirmed in JSON payload; Node.js read pattern shown
- [github.com/anthropics/claude-code/issues/55754](https://github.com/anthropics/claude-code/issues/55754) — Stop hook infinite loop behavior; confirms `stop_hook_active` as the documented guard mechanism

### Tertiary (LOW confidence)

None. All key claims verified against official docs or codebase source.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all tools already present in project
- Architecture: HIGH — slash command mechanics verified against official docs; hook pattern verified against existing codebase
- Pitfalls: HIGH — `stop_hook_active` field name confirmed from multiple sources including official docs

**Research date:** 2026-05-23
**Valid until:** 2026-08-23 (stable API; Claude Code hook/skill contracts are mature)
