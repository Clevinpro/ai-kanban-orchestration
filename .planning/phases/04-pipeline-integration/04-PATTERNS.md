# Phase 4: Pipeline Integration - Pattern Map

**Mapped:** 2026-05-25
**Files analyzed:** 3 (2 modified, 1 new)
**Analogs found:** 3 / 3

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.claude/commands/team-lead/execute.md` | orchestrator command | event-driven (sequential pipeline) | `.claude/commands/team-lead/execute.md` itself (current stub) | self — extend existing skeleton |
| `.claude/hooks/task-state-guard.js` | middleware / PreToolUse hook | request-response (validate-or-deny) | `.claude/hooks/task-state-guard.js` itself (current) + `scripts/test-stop-guard.sh` test pattern | self — extend existing hook |
| `.planning/task-schema.yaml` | config / documentation | n/a (static reference) | `.planning/task-schema.yaml` itself (current lifecycle section) | self — documentation update only |

---

## Pattern Assignments

### `.claude/commands/team-lead/execute.md` (orchestrator command, sequential pipeline)

**Analog:** The current file at `.claude/commands/team-lead/execute.md` (lines 1-126). Phase 4 replaces stub lines with real Agent tool calls and wraps STEP 3 in rejection loop logic.

---

**Frontmatter / constraint block pattern** (lines 1-23 of current execute.md):

```markdown
---
name: team-lead:execute
description: Run the full automated pipeline (Developer → CodeReview → QA → TeamLeadCheck → Done) for a single task.
argument-hint: "<TASK-ID>"
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
```

Preserve this block verbatim. Remove the Phase 2 stub-only constraint line (`Sub-agent calls in Phase 2 are stubs...`).

---

**STEP 1 + STEP 2 pattern** (lines 26-71 of current execute.md):

These steps are preserved unchanged. STEP 2's status-resume table is authoritative and must be kept.

---

**Stub receipt pattern to REPLACE** (line 82 of current execute.md):

```markdown
[<Stage>] stub — Phase 3 plugs in real agent
```

This stub line inside STEP 3 is what each Agent tool call replaces. The real replacement structure follows the Agent invocation pattern below.

---

**Stage context block format for all Agent invocations** (from 04-CONTEXT.md D-10, D-11):

```markdown
Task: .planning/work/<epic>/TASK-001.md
Stage context: QA re-run cycle 2 of 3
Prior receipts: [be-developer] DONE, [code-reviewer] APPROVED, [qa-be] FAIL: 2 tests failed
```

Pass this as the `prompt:` preamble to each Agent call, before the main agent instruction. The cycle number and prior receipts must be included.

---

**git diff stat invocation pattern** (from 04-CONTEXT.md D-11 + RESEARCH.md Pitfall 5):

```markdown
Use Bash to run:
  git diff --stat HEAD~1..HEAD

If the command fails (non-zero exit, e.g. first commit in repo):
  pass "Changed files: (unavailable)" to code-reviewer instead of aborting pipeline.

Pass the stat output as a "Changed files:" section at the top of the code-reviewer prompt.
```

---

**REVIEW-BLOCK extraction and append pattern** (from `.claude/agents/code-reviewer.md` lines 14-36):

```markdown
After code-reviewer Agent returns:
1. Extract the text between the delimiter lines:
     ---REVIEW-BLOCK-START---
     [content]
     ---REVIEW-BLOCK-END---
2. Use Edit tool (NOT Write) to append the extracted block to the task file body,
   targeting the last line of the file as old_string anchor.
3. Parse the receipt line for signal: look for "APPROVED" or "CHANGES_REQUESTED"
   using plain string indexOf — no regex needed.
```

CRITICAL: Use Edit (not Write) for all task file body appends. The hook denies `Write` calls that include an unchanged `status:` value (same-to-same not in VALID_TRANSITIONS).

---

**Receipt signal extraction pattern** (from 04-CONTEXT.md code_context):

```markdown
receipt = "[code-reviewer] APPROVED"
  → signal = "APPROVED"   (indexOf("APPROVED") >= 0)

receipt = "[qa-be] FAIL: 3 tests failed"
  → signal = "FAIL"       (indexOf("FAIL") >= 0, checked before "PASS")

Signal priority check order: APPROVED → CHANGES_REQUESTED → PASS → FAIL → REJECTED → ERROR
Plain string contains() — no regex needed.
```

---

**Loop counter structure pattern** (from 04-RESEARCH.md Architecture + CONTEXT.md D-01 through D-09):

```markdown
SET qa_cycle = 0        (cap: 3 — from D-02)
SET tlc_cycle = 0       (cap: 2 — from D-08)
SET cr_cycle = 0        (cap: 2 — discretion per RESEARCH.md Open Questions)

OUTER LOOP (tlc_cycle < 2):
  INNER LOOP (qa_cycle < 3):
    // Developer stage — repo branch
    IF repo == "be": developer_agent = "be-developer"
    IF repo == "fe": developer_agent = "fe-developer"
    Edit: status → inProgress
    Agent(developer_agent) with stage context
    IF receipt contains "ERROR": pause with Retry/Skip/Abort (not auto-loop)

    // git diff for code-reviewer
    Bash: git diff --stat HEAD~1..HEAD (handle failure gracefully)

    // CodeReview stage — CHANGES_REQUESTED sub-loop
    Agent(code-reviewer) with diff stat context
    Extract REVIEW-BLOCK; Edit append to task file
    IF receipt contains "CHANGES_REQUESTED":
      cr_cycle++
      IF cr_cycle >= 2: pause with Retry/Skip/Abort
      ELSE: loop back to Developer (same qa_cycle, do NOT increment qa_cycle)
    RESET cr_cycle = 0 after APPROVED

    // Status advance to inReview
    Edit: inProgress → inReview

    // QA stage — repo branch
    IF repo == "be": qa_agent = "qa-be"
    IF repo == "fe": qa_agent = "qa-fe"
    Agent(qa_agent) with stage context
    IF receipt contains "PASS": BREAK INNER LOOP
    IF receipt contains "FAIL":
      qa_cycle++
      IF qa_cycle >= 3:
        PAUSE: "QA loop cap reached (3 cycles). Retry / Skip / Abort?"
        IF Retry: CONTINUE INNER LOOP
        IF Skip: BREAK INNER LOOP (proceed to TLC without QA pass)
        IF Abort: STOP pipeline
      Edit: inReview → inProgress  (hook validates ## QA Results Status: FAIL annotation)
      CONTINUE INNER LOOP

  // Advance through inTesting
  Edit: inReview → inTesting
  Edit: inTesting → forTeamLeadCheck

  // TeamLeadCheck stage
  Agent(team-lead-check) with stage context
  IF receipt contains "APPROVED":
    Edit: forTeamLeadCheck → done
    BREAK OUTER LOOP
  IF receipt contains "REJECTED":
    tlc_cycle++
    IF tlc_cycle >= 2:
      PAUSE: "TeamLeadCheck rejection cap reached (2 cycles). Retry / Skip / Abort?"
      IF Retry: CONTINUE OUTER LOOP
      IF Skip: leave at forTeamLeadCheck, print human-review message, STOP
      IF Abort: STOP pipeline
    Edit: forTeamLeadCheck → inProgress  (hook validates ## TeamLead Check Status: REJECTED annotation)
    RESET qa_cycle = 0
    RESET cr_cycle = 0
    CONTINUE OUTER LOOP

Print: "Pipeline complete. Task <id> is now done."
```

---

**Failure gate (STEP 4) pattern** (lines 109-126 of current execute.md — preserve exactly):

```markdown
Stage failed: [<reason>]. Retry / Skip / Abort?
```

- Retry: re-attempt the same stage from the beginning
- Skip: skip current stage, continue to next
- Abort: stop pipeline, leave task at current status, print "Pipeline aborted at [<Stage>]."

---

**Progress trail print pattern** (from 04-CONTEXT.md code_context):

```markdown
[Developer] Done ✓
[CodeReview] Done ✓
[QA] Done ✓
[TeamLeadCheck] Done ✓

// On rejection loop start:
[Rejection loop cycle N of 3 — QA FAIL]

// On TLC rejection loop start:
[TLC rejection cycle N of 2 — REJECTED]
```

---

### `.claude/hooks/task-state-guard.js` (PreToolUse hook, request-response)

**Analog:** The current file at `.claude/hooks/task-state-guard.js` (lines 1-132). Phase 4 adds annotation-gated logic to the existing transition validation path.

---

**Existing validation structure** (lines 60-69 of current hook):

```javascript
// File DOES exist — validate transition
diskContent = fs.readFileSync(filePath, 'utf8');
const currentStatus = extractFrontmatterField(diskContent, 'status');
const allowed = VALID_TRANSITIONS[currentStatus] || [];
if (!allowed.includes(newStatus)) {
  deny(`Invalid status transition: ${currentStatus} -> ${newStatus}. Allowed from ${currentStatus}: [${allowed.join(', ') || 'none'}]`);
}
// PHASE 4 ADDITION: annotation-gated reverse transition check goes here (after line 69)
```

The annotation check must be inserted immediately AFTER the existing `!allowed.includes(newStatus)` check (after line 69), and BEFORE the repo check (line 71). It has access to `diskContent`, `currentStatus`, and `newStatus` — no new variables needed.

---

**Annotation-gated reverse transition pattern** (from 04-CONTEXT.md D-04, D-05, D-06 + RESEARCH.md Pattern 3):

```javascript
// PHASE 4 ADDITION — insert after line 69 (after the allowed-transition check passes):

// Rejection-only gated reverse transitions (D-06)
if (currentStatus === 'inReview' && newStatus === 'inProgress') {
  // Only allow if QA Results block has Status: FAIL
  if (!diskContent.match(/## QA Results[\s\S]*?Status: FAIL/)) {
    deny('Status regression inReview → inProgress requires ## QA Results block with Status: FAIL');
  }
}
if (currentStatus === 'forTeamLeadCheck' && newStatus === 'inProgress') {
  // Only allow if TeamLead Check block has Status: REJECTED
  if (!diskContent.match(/## TeamLead Check[\s\S]*?Status: REJECTED/)) {
    deny('Status regression forTeamLeadCheck → inProgress requires ## TeamLead Check block with Status: REJECTED');
  }
}
// NOTE: Checking for ANY Status: FAIL / Status: REJECTED block (not just the last one) is
// intentional — if evidence exists from any prior cycle the regression is legitimate.
// The guard prevents bare manual regression (where NO block exists at all).
```

---

**VALID_TRANSITIONS map — do NOT modify** (lines 10-17 of current hook):

```javascript
const VALID_TRANSITIONS = {
  readyForDevelop: ['inProgress'],
  inProgress: ['inReview', 'readyForDevelop'],
  inReview: ['inTesting', 'inProgress'],        // inProgress already present — no new entry needed
  inTesting: ['forTeamLeadCheck', 'inProgress'],
  forTeamLeadCheck: ['done', 'inProgress'],     // inProgress already present — no new entry needed
  done: [],
};
```

CRITICAL DISCOVERY (from 04-RESEARCH.md): Both `inReview → inProgress` and `forTeamLeadCheck → inProgress` are already in VALID_TRANSITIONS. Phase 4 does NOT add new entries — it only adds annotation-presence conditions on those existing transitions.

---

**deny() helper pattern** (lines 115-124 of current hook — do NOT change):

```javascript
function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}
```

---

**allow path / modifiedInput pattern** (lines 86-108 of current hook — do NOT change):

```javascript
// Edit tool: modifiedInput.new_string is the replacement snippet (not full file)
const updatedNewString = (tool_input.new_string || '').replace(/(updated-at:\s*)([^\n]+)/, `$1${now}`);
modifiedInput = { new_string: updatedNewString };
```

The timestamp injection on the allow path is unchanged and requires no modification in Phase 4.

---

### `.planning/task-schema.yaml` (config/documentation, n/a)

**Analog:** Current `.planning/task-schema.yaml` (lines 55-67 lifecycle section).

**Current lifecycle section** (lines 54-67):

```yaml
lifecycle:
  readyForDevelop:
    allowed_next: [inProgress]
  inProgress:
    allowed_next: [inReview, readyForDevelop]
  inReview:
    allowed_next: [inTesting, inProgress]
  inTesting:
    allowed_next: [forTeamLeadCheck, inProgress]
  forTeamLeadCheck:
    allowed_next: [done, inProgress]
  done:
    allowed_next: []
```

This already reflects the correct transitions — no structural change. The Phase 4 documentation update adds annotation-gate notes to the two reverse transitions:

```yaml
  inReview:
    allowed_next: [inTesting, inProgress]
    notes:
      inProgress: "Rejection-only — requires ## QA Results block with Status: FAIL in task body (enforced by task-state-guard.js)"
  forTeamLeadCheck:
    allowed_next: [done, inProgress]
    notes:
      inProgress: "Rejection-only — requires ## TeamLead Check block with Status: REJECTED in task body (enforced by task-state-guard.js)"
```

---

## Shared Patterns

### Agent Invocation: Repo Branching
**Source:** `.claude/agents/be-developer.md` (line 3, name field) + `.claude/agents/fe-developer.md` (line 3, name field)
**Apply to:** execute.md — Developer stage and QA stage

```markdown
// Developer agent selection
IF repo == "be": subagent_type = "be-developer"
IF repo == "fe": subagent_type = "fe-developer"

// QA agent selection
IF repo == "be": subagent_type = "qa-be"
IF repo == "fe": subagent_type = "qa-fe"
```

`code-reviewer` and `team-lead-check` are repo-agnostic — they always use the same agent name regardless of `repo:` field.

---

### Status Transition: Edit-Not-Write Rule
**Source:** `.claude/agents/team-lead-check.md` (line 42) + 04-RESEARCH.md Pitfall 3
**Apply to:** execute.md — all task file status writes and body appends

```markdown
ALWAYS use Edit tool for:
  - Status field transitions (old_string: "status: X", new_string: "status: Y")
  - Appending REVIEW-BLOCK to task file body (old_string: last line, new_string: last line + block)
  - Appending any stage annotation block

NEVER use Write for task file updates — it overwrites the full file and the hook
will deny same-status writes (inProgress → inProgress not in VALID_TRANSITIONS).
```

---

### Hook Annotation Format: Capital S Convention
**Source:** `.claude/agents/qa-be.md` (lines 33-35) + `.claude/agents/team-lead-check.md` (lines 44-45)
**Apply to:** task-state-guard.js — annotation detection regexes; execute.md — any orchestrator-written annotations

```markdown
Body annotations use "Status:" (capital S) — NOT "status:" (lowercase).
  QA annotation:  "Status: FAIL"     (capital S)
  TLC annotation: "Status: REJECTED" (capital S)

Hook frontmatter regex uses `^status:\s*(\S+)` with lowercase 's' — case-sensitive.
Capital S in body content is hook-safe and will not trigger frontmatter validation.
```

The annotation regexes in task-state-guard.js must match `Status: FAIL` and `Status: REJECTED` (capital S) to align with what the agents actually write.

---

### Test Script Pattern
**Source:** `scripts/test-stop-guard.sh` (full file)
**Apply to:** `scripts/test-pipeline-guard.sh` (new file per 04-RESEARCH.md Wave 0 Gaps)

```bash
#!/usr/bin/env bash
# test-pipeline-guard.sh — pattern from test-stop-guard.sh

set -e
HOOK="$(dirname "$0")/../.claude/hooks/task-state-guard.js"
NODE="$(command -v node)"

# Test structure:
# 1. Build a JSON payload matching the PreToolUse hook's expected stdin format
# 2. Pipe to node HOOK
# 3. Parse stdout JSON for permissionDecision: "deny" or "allow"
# 4. Assert against expected outcome

# Payload format (from task-state-guard.js lines 26-27):
# { "tool_name": "Edit", "tool_input": { "file_path": "...", "old_string": "...", "new_string": "..." } }

# Test cases needed per RESEARCH.md Wave 0 Gaps:
# (a) inReview→inProgress without ## QA Results annotation → expect deny
# (b) inReview→inProgress WITH Status: FAIL annotation → expect allow
# (c) forTeamLeadCheck→inProgress without ## TeamLead Check annotation → expect deny
# (d) forTeamLeadCheck→inProgress WITH Status: REJECTED annotation → expect allow
```

---

## No Analog Found

No files in this phase lack analogs. All three files to be modified/created are either self-analogous (extend an existing file using its own patterns) or follow the established `test-stop-guard.sh` shell test pattern.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `scripts/test-pipeline-guard.sh` | test | request-response | New file — but `scripts/test-stop-guard.sh` is a near-exact pattern (same structure: bash, node invocation, JSON payload, exit code assertions) |

---

## Metadata

**Analog search scope:** `.claude/commands/team-lead/`, `.claude/hooks/`, `.claude/agents/`, `.planning/`, `scripts/`
**Files read:** execute.md, task-state-guard.js, be-developer.md, fe-developer.md, code-reviewer.md, qa-be.md, qa-fe.md, team-lead-check.md, task-schema.yaml, settings.json, test-stop-guard.sh, REQUIREMENTS.md, CLAUDE.md
**Pattern extraction date:** 2026-05-25
