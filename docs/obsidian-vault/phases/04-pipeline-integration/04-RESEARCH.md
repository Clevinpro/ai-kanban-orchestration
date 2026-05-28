# Phase 4: Pipeline Integration - Research

**Researched:** 2026-05-25
**Domain:** Claude Code Agent orchestration, markdown-based pipeline control flow, PreToolUse hook extension
**Confidence:** HIGH

---

## Summary

Phase 4 wires the six already-built sub-agent definitions (Phase 3) into the execute.md orchestrator (Phase 2) to produce a real, runnable end-to-end pipeline. The work is primarily a rewrite of `.claude/commands/team-lead/execute.md` plus a targeted extension of `.claude/hooks/task-state-guard.js`. No new libraries or external dependencies are required — this phase is pure orchestration logic inside Claude Code markdown command files and a Node.js hook.

The critical insight is that this phase has two independent sub-problems: (1) replacing stub log lines with real Agent tool invocations and managing the receipt parsing loop in execute.md, and (2) teaching task-state-guard.js to allow rejection-reversal status transitions (inReview → inProgress, forTeamLeadCheck → inProgress) only when the correct annotation block is present in the task file body. Both are well-bounded, fully specified in the CONTEXT.md decisions, and have clear integration points in the existing code.

The MVP scope is the thinnest slice that proves the pipeline runs end-to-end: one task, one clean run, one rejection loop cycle, one TLC rejection cycle. Parallel task execution and per-agent memory are explicitly v2 concerns out of scope.

**Primary recommendation:** Implement in two waves. Wave 1 extends task-state-guard.js (the hook that blocks everything else if wrong) and writes the happy-path orchestrator. Wave 2 adds the rejection loops and TLC gate. This ordering ensures that the status guard never blocks forward progress during implementation.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Rejection Loop Control (PIPE-02)**
- D-01: Auto-loop on QA failure — no pause between cycles. Pipeline re-invokes Developer automatically after each QA FAIL receipt. Loop only pauses when: (a) QA loop cap hit, or (b) Developer returns an error receipt.
- D-02: QA loop cap = 3 cycles. After the 3rd QA FAIL, pipeline pauses with Retry/Skip/Abort gate. Retry = 4th auto-loop, Skip = continue to TeamLeadCheck without QA pass, Abort = stop and leave task at current status.
- D-03: Rejection loop is full re-review each cycle: Developer → CodeReview → QA. Not a shortcut. Consistent with quality expectation — CodeReview runs on every Developer output.

**Status Regression Strategy**
- D-04: QA failure reverses task status: `inReview → inProgress`. Requires new reverse transition in `task-state-guard.js`.
- D-05: TLC rejection reverses task status: `forTeamLeadCheck → inProgress`. Same reverse transition pattern as QA rejection.
- D-06: Reverse transitions are rejection-only gated — `task-state-guard.js` allows `inReview → inProgress` only when the task file body contains a `## QA Results` block with `Status: FAIL`. Allows `forTeamLeadCheck → inProgress` only when task body contains `## TeamLead Check` block with `Status: REJECTED`. Prevents accidental manual regression.

**TeamLeadCheck Rejection Scope (PIPE-03)**
- D-07: TLC rejection triggers a full pipeline restart: Developer → CodeReview → QA → TeamLeadCheck. Not a shortcut.
- D-08: TLC cap = 2 rejections (separate from QA cap = 3). After 2nd TLC REJECTED receipt, pipeline pauses with Retry/Skip/Abort gate.
- D-09: At TLC cap: same Retry/Skip/Abort gate (consistent with QA cap behavior).

**Agent Invocation Context (PIPE-01)**
- D-10: Orchestrator passes task file path plus pipeline stage context to each spawned agent: current cycle number and previous stage receipts.
- D-11: Orchestrator runs `git diff --stat HEAD~1..HEAD` after Developer stage completes. Passes the resulting file list as part of the code-reviewer prompt. Full unified diff NOT passed.

### Claude's Discretion

- Exact wording of the Retry/Skip/Abort prompt text at loop cap
- Whether to print a "Rejection loop cycle N of 3" banner at the start of each loop
- Exact format of stage context block passed in agent prompts (as long as it includes cycle number and prior receipts)
- Which git diff stat command variant to use (HEAD~1..HEAD vs commit hash)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-01 | Sequential orchestration — TeamLead spawns sub-agents one at a time via Agent tool; each stage gates the next based on receipt status | execute.md already has the STEP 3 pipeline loop skeleton; replace stub log lines with Agent tool invocations; receipt signal extraction documented in CONTEXT.md code_context |
| PIPE-02 | Rejection loop — QA failure sends task back to Developer with failure evidence appended to task file body; loop repeats until pass or manual intervention | task-state-guard.js needs `inReview → inProgress` reverse transition with annotation check; execute.md loop counter logic with cap-at-3 behavior |
| PIPE-03 | TeamLeadCheck gate — final verification against SPEC.md before done; can reject back to developer | task-state-guard.js needs `forTeamLeadCheck → inProgress` reverse transition with annotation check; TLC cap-at-2 with same Retry/Skip/Abort pattern |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pipeline orchestration flow | execute.md (orchestrator command) | — | The command IS the orchestrator — it holds all loop logic, status transitions, receipt dispatch |
| Status transition enforcement | task-state-guard.js (PreToolUse hook) | execute.md (initiates the Edit calls) | Hook validates every transition atomically before disk write; orchestrator does not re-validate |
| Code review result extraction | execute.md | code-reviewer agent | code-reviewer cannot write files (disallowedTools); orchestrator must parse REVIEW-BLOCK delimiters from agent return value and append to task file |
| QA test execution | qa-be / qa-fe agents | — | Agents handle nx invocation, result interpretation, and task file annotation directly |
| Spec alignment verification | team-lead-check agent | — | Agent reads SPEC.md and task history; orchestrator only reads the receipt and drives the Done transition |
| Rejection loop counter state | execute.md in-context variables | — | No persistent state store; loop counts live in the orchestrator's running context for one pipeline run |
| Stage context injection | execute.md (builds prompt preamble) | — | D-10 requires orchestrator to prepend cycle number and prior receipts to each agent invocation |
| git diff stat for code review | execute.md (runs Bash) | code-reviewer agent (reads files listed) | Orchestrator runs `git diff --stat HEAD~1..HEAD`, prepends output to code-reviewer prompt; agent then reads each changed file |

---

## Standard Stack

### Core (no new packages — this phase is pure orchestration)

| Component | Type | Purpose | Why Standard |
|-----------|------|---------|--------------|
| `.claude/commands/team-lead/execute.md` | Markdown command | Pipeline orchestrator | Already exists with 4-step skeleton; Phase 4 replaces stub lines with real Agent calls |
| `.claude/hooks/task-state-guard.js` | Node.js PreToolUse hook | Status transition enforcement with rejection gating | Already enforces forward transitions; requires two new reverse-transition entries |
| Agent tool (built-in Claude Code) | Claude Code runtime primitive | Spawning sub-agents synchronously | Phase 3 agents are named exactly for `subagent_type` matching |
| Bash tool (built-in Claude Code) | Claude Code runtime primitive | Running `git diff --stat` for code-reviewer context | Already in execute.md's allowed-tools list |

### No New Dependencies

This phase installs zero npm packages. All building blocks already exist:
- Six agent definition files: confirmed present in `.claude/agents/` (be-developer.md, fe-developer.md, code-reviewer.md, qa-be.md, qa-fe.md, team-lead-check.md) [VERIFIED: direct file inspection]
- task-state-guard.js: confirmed at `.claude/hooks/task-state-guard.js` [VERIFIED: direct file inspection]
- execute.md: confirmed at `.claude/commands/team-lead/execute.md` [VERIFIED: direct file inspection]

---

## Package Legitimacy Audit

> No external packages are installed in this phase. Section not applicable.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
/team-lead:execute TASK-ID
          │
          ▼
  ┌─────────────────────┐
  │  STEP 1: Normalize  │
  │  TASK-ID + Glob     │
  └──────────┬──────────┘
             │
  ┌──────────▼──────────┐
  │  STEP 2: Read task  │
  │  file; check status │
  └──────────┬──────────┘
             │ status: readyForDevelop
  ┌──────────▼──────────────────────────────────────────┐
  │  STEP 3: Pipeline loop  (TLC rejection counter ≤ 2) │
  │                                                      │
  │  ┌─────────────────────────────────────────────┐    │
  │  │  QA rejection loop  (qa_cycle counter ≤ 3)  │    │
  │  │                                             │    │
  │  │  Edit status: readyForDevelop → inProgress  │    │
  │  │  Agent(be-developer or fe-developer)         │    │
  │  │       receipt: [be-developer] DONE           │    │
  │  │  Bash: git diff --stat HEAD~1..HEAD          │    │
  │  │  Agent(code-reviewer) + diff stat preamble   │    │
  │  │       parses REVIEW-BLOCK; Edit appends it   │    │
  │  │       receipt: [code-reviewer] APPROVED      │    │
  │  │              or CHANGES_REQUESTED            │    │
  │  │  ┌──────────────────────────────────────┐   │    │
  │  │  │  CHANGES_REQUESTED path:             │   │    │
  │  │  │  no status change; loop back to       │   │    │
  │  │  │  Developer in same QA cycle           │   │    │
  │  │  └──────────────────────────────────────┘   │    │
  │  │  Edit status: inProgress → inReview          │    │
  │  │  Agent(qa-be or qa-fe)                       │    │
  │  │       receipt: [qa-be] PASS or FAIL          │    │
  │  │       ┌─────────────────────────────────┐   │    │
  │  │       │  FAIL path:                     │   │    │
  │  │       │  Edit inReview → inProgress     │   │    │
  │  │       │  (hook checks ## QA Results     │   │    │
  │  │       │   Status: FAIL annotation)       │   │    │
  │  │       │  qa_cycle++; loop if ≤ 3         │   │    │
  │  │       │  else: Retry/Skip/Abort gate     │   │    │
  │  │       └─────────────────────────────────┘   │    │
  │  │  Edit status: inReview → inTesting           │    │
  │  │  Edit status: inTesting → forTeamLeadCheck   │    │
  │  └─────────────────────────────────────────────┘    │
  │                                                      │
  │  Agent(team-lead-check)                              │
  │       receipt: [team-lead-check] APPROVED            │
  │              or REJECTED: <reason>                   │
  │       ┌───────────────────────────────────────┐     │
  │       │  REJECTED path:                       │     │
  │       │  Edit forTeamLeadCheck → inProgress   │     │
  │       │  (hook checks ## TeamLead Check        │     │
  │       │   Status: REJECTED annotation)         │     │
  │       │  tlc_cycle++; loop if ≤ 2              │     │
  │       │  else: Retry/Skip/Abort gate           │     │
  │       └───────────────────────────────────────┘     │
  │                                                      │
  │  Edit status: forTeamLeadCheck → done                │
  └──────────────────────────────────────────────────────┘
             │
  ┌──────────▼──────────┐
  │  Pipeline complete  │
  │  Task <id> is done  │
  └─────────────────────┘
```

### Recommended Project Structure

No structural changes to directories. All changes are modifications to two existing files:

```
.claude/
├── commands/team-lead/
│   └── execute.md          # REWRITE: replace stubs with real Agent invocations + rejection loops
└── hooks/
    └── task-state-guard.js # EXTEND: add 2 new reverse-transition entries with annotation checks
.planning/
└── task-schema.yaml        # EXTEND: add inReview → inProgress and forTeamLeadCheck → inProgress
                            #         to lifecycle section (documentation only, hook is authoritative)
```

### Pattern 1: Agent Tool Invocation with Stage Context Preamble

**What:** Each sub-agent call prepends a stage context block to the task path argument, passing cycle number and prior receipts.
**When to use:** All six Agent tool calls in execute.md.

```markdown
<!-- Source: 04-CONTEXT.md D-10, D-11 (ASSUMED — no official Claude Code docs on Agent tool prompt format) -->
Agent tool call structure:
  subagent_type: "be-developer"
  description: "Implement task TASK-001 (QA re-run cycle 2 of 3)"
  prompt: |
    Task: .planning/work/<epic>/TASK-001.md
    Stage context: QA re-run cycle 2 of 3
    Prior receipts: [be-developer] DONE, [code-reviewer] APPROVED, [qa-be] FAIL: 2 tests failed
    
    <main agent instruction as specified in agent's own system prompt>
```

### Pattern 2: REVIEW-BLOCK Extraction and Append

**What:** code-reviewer cannot write files (disallowedTools: Write, Edit, Bash). It returns structured text between delimiters. The orchestrator must extract and append it.
**When to use:** After every code-reviewer Agent call returns.

```markdown
<!-- Source: .claude/agents/code-reviewer.md (VERIFIED: direct file inspection) -->
Orchestrator steps after code-reviewer returns:
1. Extract text between "---REVIEW-BLOCK-START---" and "---REVIEW-BLOCK-END---" from agent return value
2. Use Edit tool to append extracted block to task file body (after last line)
3. Parse receipt line "[code-reviewer] APPROVED" or "[code-reviewer] CHANGES_REQUESTED: ..."
```

### Pattern 3: Rejection-Only Reverse Transition in task-state-guard.js

**What:** `inReview → inProgress` is allowed only when `## QA Results\n\nStatus: FAIL` block exists in the task file. `forTeamLeadCheck → inProgress` is allowed only when `## TeamLead Check\n\nStatus: REJECTED` block exists.
**When to use:** The hook validates this automatically before the Edit reaches disk.

```javascript
// Source: 04-CONTEXT.md D-04, D-05, D-06 + existing task-state-guard.js pattern (ASSUMED implementation)
// Addition to VALID_TRANSITIONS map:
// These entries already exist per current hook code:
//   inReview: ['inTesting', 'inProgress'],       // inProgress already present
//   forTeamLeadCheck: ['done', 'inProgress'],     // inProgress already present

// CRITICAL DISCOVERY: The current task-state-guard.js ALREADY has these transitions:
//   inReview: ['inProgress'] is allowed
//   forTeamLeadCheck: ['inProgress'] is allowed
// 
// D-06 requires ANNOTATION-GATED enforcement. The hook must be extended to:
// - Allow inReview → inProgress ONLY when task body contains /## QA Results[\s\S]*?Status: FAIL/
// - Allow forTeamLeadCheck → inProgress ONLY when task body contains /## TeamLead Check[\s\S]*?Status: REJECTED/
// Without this extension, any agent or human could manually regress status without evidence.
```

### Anti-Patterns to Avoid

- **Passing full git diff to code-reviewer:** The unified diff of a large task could be thousands of lines, bloating the agent context window. Use `git diff --stat` (file names + line counts only) and let code-reviewer read changed files individually via its Read tool. [CITED: 04-CONTEXT.md D-11]
- **Shortcutting the rejection loop to skip CodeReview:** D-03 is explicit — every QA FAIL triggers a full Developer → CodeReview → QA re-run. Skipping CodeReview in the loop would violate the quality contract and make PIPE-02 incomplete.
- **Using Write tool to append review block:** team-lead-check.md explicitly notes "do NOT use Write as it overwrites the full file and the hook will deny same-status writes." Use Edit to append. Same rule applies when orchestrator appends the REVIEW-BLOCK. [VERIFIED: direct inspection of team-lead-check.md]
- **Hardcoding developer agent name:** The task has a `repo:` field (be | fe). Orchestrator must branch: `repo: be` → invoke `be-developer`; `repo: fe` → invoke `fe-developer`. Same applies to QA agents (qa-be vs qa-fe).
- **Forgetting the CHANGES_REQUESTED path in CodeReview:** The code-reviewer can return `CHANGES_REQUESTED`. The orchestrator must handle this — either loop Developer again (within the same QA cycle without incrementing the QA counter) or surface Retry/Skip/Abort. The CONTEXT.md does not prescribe a cap on code-review cycles; Claude's discretion applies here.

---

## Critical Discovery: task-state-guard.js Already Allows Reverse Transitions

**This is the most important finding for planning.**

Reading the current `task-state-guard.js` VALID_TRANSITIONS map:

```javascript
const VALID_TRANSITIONS = {
  readyForDevelop: ['inProgress'],
  inProgress: ['inReview', 'readyForDevelop'],
  inReview: ['inTesting', 'inProgress'],        // inProgress ALREADY ALLOWED
  inTesting: ['forTeamLeadCheck', 'inProgress'],
  forTeamLeadCheck: ['done', 'inProgress'],     // inProgress ALREADY ALLOWED
  done: [],
};
```

Both `inReview → inProgress` and `forTeamLeadCheck → inProgress` are **already in the allowed transitions**. [VERIFIED: direct file inspection]

The D-06 decision requires that these transitions be **rejection-only gated** — allowed only when the corresponding annotation block (with Status: FAIL / Status: REJECTED) is present in the task file body.

**What this means for planning:**
- Task-state-guard.js does NOT need new entries added to VALID_TRANSITIONS
- It DOES need annotation-presence logic added to the validation path for those specific reverse transitions
- The annotation check fires on the existing allowed transitions, not on new ones
- This is a smaller change than CONTEXT.md makes it sound — it's a conditional check on existing transitions, not adding new entries

**Annotation detection regex (from CONTEXT.md specifics):**
- QA rejection: `Status: FAIL` (capital S, space before FAIL) within the `## QA Results` block
- TLC rejection: `Status: REJECTED` for the `## TeamLead Check` block
- The hook already reads `diskContent` from disk on the validation path — the annotation check can be added inline after the allowed-transition check passes

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Status transition validation | Custom validation in execute.md | task-state-guard.js PreToolUse hook | Hook fires automatically on every Write/Edit to .planning/work/*.md; orchestrator never needs to re-validate |
| Agent discovery by name | Manual file lookup | Claude Code Agent tool `subagent_type` matching | Claude Code resolves agent definitions by `name:` field in .claude/agents/*.md automatically |
| Task file timestamp updates | Manual timestamp injection in execute.md | task-state-guard.js allow path | Hook already injects `updated-at` ISO timestamp on every allowed Write/Edit pass |
| Loop state persistence across sessions | External state file | execute.md in-context variables | Each pipeline run is a single session; loop counters live as variables in the orchestrator context |
| Receipt signal parsing | Regex parsing library | Plain string search for uppercase signal words | Receipts are `[agent-name] SIGNAL` format; `APPROVED`, `FAIL`, `PASS`, `REJECTED` appear exactly once per receipt line |

**Key insight:** The hook architecture means the orchestrator is intentionally thin on validation — its job is to drive the pipeline forward, not to re-validate what the hook already guarantees.

---

## Common Pitfalls

### Pitfall 1: CHANGES_REQUESTED Loop Not Capped

**What goes wrong:** CodeReview returns CHANGES_REQUESTED. The orchestrator loops Developer. Developer re-submits. CodeReview requests changes again. This repeats indefinitely with no cap, no Retry/Skip/Abort gate.
**Why it happens:** CONTEXT.md specifies QA loop cap (3) and TLC cap (2) explicitly, but does not specify a cap for CodeReview CHANGES_REQUESTED cycles. It's in Claude's discretion.
**How to avoid:** The planner must define a CodeReview loop cap (suggest 2, consistent with TLC cap) and a Retry/Skip/Abort gate at that cap. Document this as a discretion decision in the plan.
**Warning signs:** execute.md has an unbounded loop around Developer + CodeReview without a counter check.

### Pitfall 2: Hook Annotation Check Reads Stale Disk Content

**What goes wrong:** The orchestrator writes status edit first (e.g., `forTeamLeadCheck → inProgress`). The hook's disk read (`fs.readFileSync`) sees the annotation block from the previous pipeline run, not the current one — but the annotation IS there from a prior REJECTED, so the check passes spuriously.
**Why it happens:** The annotation check looks for the *presence* of `Status: REJECTED` in the body, not for the *most recent* annotation instance.
**How to avoid:** This is actually fine for the use case — if a REJECTED block is present from any prior cycle, the reverse transition is legitimate. The guard prevents MANUAL regression (where no REJECTED block exists at all), not replay of prior cycles. Document this invariant in the hook code comment.
**Warning signs:** Overly strict "only check the last annotation" logic that is more complex than needed.

### Pitfall 3: code-reviewer Write Attempt Blocked by Hook

**What goes wrong:** If execute.md uses Edit to append the REVIEW-BLOCK to the task file while the frontmatter status is already `inProgress`, the hook validates the Edit. If the Edit's `new_string` doesn't contain a `status:` field, the hook exits 0 and allows it (per line 47: "If no status field being set — allow without modification"). This is fine. But if someone passes the full file content via Write (accidentally including the current status), the hook re-validates the same-to-same status transition `inProgress → inProgress` which is NOT in the allowed list — this would be denied.
**Why it happens:** Confusion between appending body content (Edit, targeting last line) vs rewriting full file (Write).
**How to avoid:** Always use Edit tool with `old_string` targeting the last line of the task file body when appending review blocks. Never use Write to append. [VERIFIED: team-lead-check.md documents this exact warning]
**Warning signs:** execute.md using Write to build the full task file content after receiving REVIEW-BLOCK.

### Pitfall 4: Repo Field Determines Agent but Execute.md Has One Code Path

**What goes wrong:** execute.md invokes `be-developer` always, even for `repo: fe` tasks.
**Why it happens:** The STEP 2 extract captures `repo` but the stub pipeline doesn't branch on it.
**How to avoid:** In STEP 3, immediately after reading `repo` from frontmatter, establish two code paths: `repo: be` uses `be-developer` and `qa-be`; `repo: fe` uses `fe-developer` and `qa-fe`.
**Warning signs:** A single hardcoded `subagent_type: "be-developer"` in execute.md with no conditional.

### Pitfall 5: git diff --stat Fails on First Commit in Repo

**What goes wrong:** `git diff --stat HEAD~1..HEAD` fails with "unknown revision" if the task commit is the first commit in the repo (no HEAD~1).
**Why it happens:** The Nx monorepo sub-repos (`ai-platform/`, `ai-platform-fe/`) already have git history, so this is unlikely in practice. But a brand-new test task on a shallow repo could fail.
**How to avoid:** The orchestrator should catch non-zero exit from the git diff command and pass an empty/stub "Changed files: (unavailable)" to code-reviewer rather than aborting the pipeline.
**Warning signs:** Pipeline crashes at CodeReview stage when run on a brand-new git repo.

### Pitfall 6: TLC Receives Multiple ## TeamLead Check Blocks

**What goes wrong:** After a TLC rejection and full pipeline re-run, the task file body accumulates a second `## TeamLead Check` block from the previous run. TLC on the second run reads both blocks — the first `Status: REJECTED` and the second `Status: APPROVED` — and may be confused.
**Why it happens:** Each pipeline run appends new annotation blocks rather than replacing old ones. This is by design for audit trail, but TLC must look at the LAST TeamLead Check block.
**How to avoid:** The team-lead-check agent system prompt (already written) reads "full task file history." It is already expected to handle multiple blocks. The hook annotation check should also target the LAST occurrence of `## TeamLead Check` with `Status: REJECTED` if checking for the most recent rejection. For the D-06 guard, checking for ANY `Status: REJECTED` block is sufficient and simpler.
**Warning signs:** Annotation regex using `^` anchors that only match the first block occurrence.

---

## Code Examples

Verified patterns from existing files:

### Receipt Signal Extraction (from CONTEXT.md code_context)

```markdown
<!-- Source: 04-CONTEXT.md code_context — CITED -->
Orchestrator extracts the signal by looking for APPROVED, CHANGES_REQUESTED, PASS, FAIL, REJECTED
in the receipt string. Plain string contains() check — no regex needed.
Example:
  receipt = "[code-reviewer] APPROVED"
  signal = "APPROVED"   # found by indexOf("APPROVED") >= 0
  
  receipt = "[qa-be] FAIL: 3 tests failed"
  signal = "FAIL"       # found before "APPROVED"/"PASS"/"REJECTED"
```

### Annotation-Gated Reverse Transition (task-state-guard.js extension)

```javascript
// Source: Derived from 04-CONTEXT.md D-06 + existing task-state-guard.js code (ASSUMED implementation pattern)
// Insert after the existing allowed-transition check passes (line 68 in current hook):

// Annotation-gated reverse transition check
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
```

### Stage Context Block Format for Agent Prompts

```markdown
<!-- Source: 04-CONTEXT.md specifics — CITED -->
Task: .planning/work/<epic>/TASK-001.md
Stage context: QA re-run cycle 2 of 3
Prior receipts: [be-developer] DONE, [code-reviewer] APPROVED, [qa-be] FAIL: 2 tests failed
```

### execute.md Loop Structure (pseudocode)

```markdown
<!-- Source: 04-CONTEXT.md decisions D-01, D-02, D-03, D-07, D-08 — CITED -->
SET qa_cycle = 0
SET tlc_cycle = 0

OUTER_LOOP (tlc_cycle < 2):
  INNER_LOOP (qa_cycle < 3):
    // Developer stage
    Edit: readyForDevelop → inProgress  (or stays inProgress on re-loop)
    Agent(developer) with stage context
    Bash: git diff --stat HEAD~1..HEAD
    
    // CodeReview stage
    Agent(code-reviewer) with diff stat context
    Extract REVIEW-BLOCK; Edit append to task file
    IF receipt = CHANGES_REQUESTED:
      // loop Developer without incrementing qa_cycle
      CONTINUE INNER_LOOP
    
    // Status advance
    Edit: inProgress → inReview
    
    // QA stage
    Agent(qa-be or qa-fe) with stage context
    IF receipt = PASS:
      BREAK INNER_LOOP
    ELSE (FAIL):
      qa_cycle++
      IF qa_cycle >= 3:
        PROMPT user: Retry/Skip/Abort
        IF Retry: CONTINUE INNER_LOOP (qa_cycle reset or not — Claude's discretion)
        IF Skip: BREAK INNER_LOOP (proceed to TLC without QA pass)
        IF Abort: STOP pipeline
      Edit: inReview → inProgress  (hook validates annotation)
      CONTINUE INNER_LOOP
  
  // Advance to TLC
  Edit: inReview → inTesting
  Edit: inTesting → forTeamLeadCheck
  Agent(team-lead-check) with stage context
  IF receipt = APPROVED:
    Edit: forTeamLeadCheck → done
    BREAK OUTER_LOOP
  ELSE (REJECTED):
    tlc_cycle++
    IF tlc_cycle >= 2:
      PROMPT user: Retry/Skip/Abort
      IF Retry: CONTINUE OUTER_LOOP
      IF Skip: mark done anyway (Claude's discretion — or surface error)
      IF Abort: STOP pipeline
    Edit: forTeamLeadCheck → inProgress  (hook validates annotation)
    qa_cycle = 0  // reset QA counter for new full loop
    CONTINUE OUTER_LOOP

Print: Pipeline complete. Task <id> is now done.
```

### Current execute.md Stub Line (what gets replaced)

```markdown
<!-- Source: .claude/commands/team-lead/execute.md line 82 — VERIFIED: direct file inspection -->
[<Stage>] stub — Phase 3 plugs in real agent
```

This line becomes a real Agent tool call in Phase 4.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stubbed pipeline (Phase 2) | Real Agent invocations (Phase 4) | This phase | Pipeline actually executes — not just status transitions with log messages |
| Forward-only status transitions | Rejection-gated reverse transitions | This phase | Enables rejection loops without exposing accidental manual status regression |
| Single-pass CodeReview check | Potentially multi-cycle CodeReview within each QA loop | This phase | Quality gate survives iterative developer fixes |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Manual end-to-end pipeline execution (no automated test framework for Claude Code command files) |
| Config file | none — verification by running the command and observing behavior |
| Quick run command | `/team-lead:execute TASK-ID` against a real task file |
| Full suite command | Three runs: (1) clean happy path, (2) forced QA FAIL injection, (3) forced TLC rejection |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-01 | Sequential orchestration — each stage gates the next | smoke | Run `/team-lead:execute <task>` on readyForDevelop task; verify all 5 status transitions fire in order | ❌ requires real task |
| PIPE-02 | QA failure triggers rejection loop; loops ≤ 3 times | manual | Create task with deliberately failing test; verify rejection loop fires and task returns to inProgress with QA Results Status: FAIL annotation; verify loop cap at 3 shows Retry/Skip/Abort | ❌ requires controlled test task |
| PIPE-03 | TLC gate rejects non-spec-aligned task; correctly implemented task marked done | manual | Create task whose implementation does not satisfy a SPEC.md AC; verify TLC rejects; verify forTeamLeadCheck → inProgress transition requires ## TeamLead Check Status: REJECTED block | ❌ requires controlled test task |
| PIPE-05 (existing) | task-state-guard.js annotation check blocks bare reverse transitions | unit | `node .claude/hooks/task-state-guard.js` with crafted stdin payloads: (a) bare inReview→inProgress without annotation — expect deny; (b) inReview→inProgress with Status: FAIL annotation in task body — expect allow | ❌ Wave 0 gap |

### Stage Gate Testable Assertions

Each stage of the pipeline must satisfy these testable conditions:

**Developer Stage Gate:**
- [ ] After Developer Agent returns `[be-developer] DONE` or `[fe-developer] DONE`, task status is `inProgress`
- [ ] If Developer returns `[be-developer] ERROR: out-of-repo file requested`, pipeline pauses with Retry/Skip/Abort (not auto-loops)
- [ ] `git diff --stat HEAD~1..HEAD` output appears in code-reviewer prompt

**CodeReview Stage Gate:**
- [ ] REVIEW-BLOCK text is appended to task file body (visible when reading task file after pipeline run)
- [ ] If receipt is `APPROVED`, pipeline advances status to `inReview`
- [ ] If receipt is `CHANGES_REQUESTED`, pipeline loops Developer without advancing status past `inProgress`

**QA Stage Gate:**
- [ ] `## QA Results` block with `Status: PASS` or `Status: FAIL` is present in task file body
- [ ] If `[qa-be] PASS`: status advances from `inReview` to `inTesting`
- [ ] If `[qa-be] FAIL`: task-state-guard.js allows `inReview → inProgress` transition (annotation present)
- [ ] If QA FAIL on cycle 3: user sees Retry/Skip/Abort prompt (pipeline pauses)
- [ ] Attempting bare `inReview → inProgress` Edit (without QA Results FAIL annotation) is DENIED by hook

**TeamLeadCheck Stage Gate:**
- [ ] `## TeamLead Check` block with `Status: APPROVED` or `Status: REJECTED` is present in task file body
- [ ] If `[team-lead-check] APPROVED`: orchestrator writes `forTeamLeadCheck → done` transition
- [ ] If `[team-lead-check] REJECTED`: task-state-guard.js allows `forTeamLeadCheck → inProgress` transition (annotation present)
- [ ] If TLC REJECTED on cycle 2: user sees Retry/Skip/Abort prompt (pipeline pauses)
- [ ] Attempting bare `forTeamLeadCheck → inProgress` Edit (without TeamLead Check REJECTED annotation) is DENIED by hook
- [ ] Final task status after APPROVED + Done transition is `done`

### Wave 0 Gaps

- [ ] `scripts/test-pipeline-guard.sh` — unit test for annotation-gated reverse transitions in task-state-guard.js: tests (a) bare inReview→inProgress denied, (b) inReview→inProgress with Status: FAIL in body allowed, (c) bare forTeamLeadCheck→inProgress denied, (d) forTeamLeadCheck→inProgress with Status: REJECTED in body allowed
- [ ] `.planning/work/<test-epic>/TASK-TEST.md` — a minimal task file used as a fixture for hook unit tests and happy-path smoke testing

*(Existing test infrastructure: `scripts/test-stop-guard.sh` — established pattern for hook unit testing. Pipeline guard test should follow the same structure.)*

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | task-state-guard.js hook | ✓ | Darwin 25.4.0 (node inferred present from prior phases) | — |
| git | `git diff --stat HEAD~1..HEAD` in execute.md | assumed present | — | Pass "(unavailable)" to code-reviewer |
| nx CLI | qa-be / qa-fe agents | ✓ (present in ai-platform/ and ai-platform-fe/) | per repo | QA agents already handle nx invocation error as FAIL receipt |

**Missing dependencies with no fallback:** none

**Missing dependencies with fallback:**
- git diff stat: if git command fails (new repo, no prior commit), code-reviewer receives "Changed files: unavailable" and proceeds on visible code alone.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes (limited) | task-state-guard.js annotation-gated transitions prevent unauthorized status regression |
| V5 Input Validation | yes | Hook validates status field and repo field on every task file write; annotation regex validates block format |
| V6 Cryptography | no | — |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized status regression (manual inReview→inProgress without QA evidence) | Tampering | Annotation-gated hook check (D-06) |
| Agent prompt injection via task file body | Tampering | Agent isolation via system prompt; task file is markdown, not executed code |
| Loop escape via crafted receipt string | Elevation of privilege | Signal extraction looks for uppercase keywords; crafted receipts with fake signals in unexpected positions would be ignored if the parser uses indexOf-first-match |
| code-reviewer attempting Write/Edit | Elevation of privilege | disallowedTools: Write, Edit, Bash enforced by Claude Code runtime; not bypassed via orchestrator |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Agent tool in execute.md passes a `prompt:` parameter that can include a freeform preamble (stage context block) before the main instruction | Standard Stack, Code Examples | If Agent tool doesn't support custom prompt text, the stage context must be encoded differently — e.g., a separate task file section that agents read |
| A2 | Claude Code resolves agent definitions by matching `subagent_type` field against `name:` field in .claude/agents/*.md | Standard Stack | If name matching works differently, agent invocations would fail silently — high impact |
| A3 | The orchestrator's in-context loop counter variables persist across Agent tool calls within the same command run | Architecture, Code Examples | If context is reset per Agent call, counters would need to be stored in the task file or a separate file |
| A4 | CodeReview CHANGES_REQUESTED loop does not need a separate cap (Claude's discretion per CONTEXT.md) | Common Pitfalls | Without a cap, CHANGES_REQUESTED loop is unbounded — planner should define one |
| A5 | `git diff --stat HEAD~1..HEAD` works in the workspace root (above both sub-repos) when tasks are committed | Code Examples | If the workspace root has no git history, the command fails — mitigation documented in Pitfalls |

---

## Open Questions (RESOLVED)

1. **CodeReview CHANGES_REQUESTED loop cap** — RESOLVED: cr_cycle cap = 2 (separate variable, independent of qa_cycle).
   - What we know: QA cap is 3, TLC cap is 2 (explicit in CONTEXT.md). CHANGES_REQUESTED cap is Claude's discretion.
   - What's unclear: Should CHANGES_REQUESTED cycles count against the QA loop cap, or have their own cap?
   - Recommendation: Treat CHANGES_REQUESTED as a sub-cycle within the same QA cycle count. A CHANGES_REQUESTED forces Developer re-work but does NOT advance to QA, so QA cycle count stays the same. Give CHANGES_REQUESTED its own cap of 2 (separate variable). This prevents both QA-cap and CR-cap exhaustion from being conflated.

2. **execute.md status at start of rejection re-loop** — RESOLVED: STEP 2 is entry-gate only; rejection loop restarts bypass STEP 2 and proceed directly in STEP 3.
   - What we know: After TLC rejection, `forTeamLeadCheck → inProgress` transition fires. QA counter resets. The next Developer invocation sees `status: inProgress`.
   - What's unclear: The STEP 2 "Status check" in execute.md asks for `readyForDevelop` — if status is `inProgress` at loop restart, STEP 2's warning fires.
   - Recommendation: The rejection loop is internal to STEP 3; the STEP 2 status check fires only at initial entry. Loop restarts bypass STEP 2 entirely. The planner should document this in the new execute.md flow.

3. **Skip behavior at Retry/Skip/Abort gate** — RESOLVED: At TLC cap, Skip leaves task at forTeamLeadCheck with a human-review message; does NOT mark done.
   - What we know: Skip at QA cap = "continue to TeamLeadCheck without QA pass." Skip at TLC cap = unclear.
   - What's unclear: At TLC cap, does Skip mean "mark done without TLC approval" or "leave task at forTeamLeadCheck for human resolution"?
   - Recommendation: At TLC cap, Skip should leave the task at `forTeamLeadCheck` and print a message explaining the human must manually review and transition. Marking done without TLC approval contradicts the quality contract.

---

## Sources

### Primary (HIGH confidence)
- `.claude/commands/team-lead/execute.md` — direct inspection of current pipeline stubs, allowed-tools list, 4-step structure
- `.claude/hooks/task-state-guard.js` — direct inspection of VALID_TRANSITIONS map, annotation detection pattern, allow/deny path
- `.planning/phases/04-pipeline-integration/04-CONTEXT.md` — all locked decisions D-01 through D-11
- `.claude/agents/code-reviewer.md` — REVIEW-BLOCK delimiter format, receipt protocol
- `.claude/agents/qa-be.md` — nx invocation pattern, Status: FAIL annotation format, receipt format
- `.claude/agents/qa-fe.md` — same as qa-be with FE paths
- `.claude/agents/team-lead-check.md` — Status: REJECTED annotation format, receipt format, Edit-not-Write warning
- `.claude/agents/be-developer.md` / `fe-developer.md` — receipt formats, isolation constraints
- `.planning/task-schema.yaml` — confirmed status lifecycle, confirmed reverse transitions already present in schema

### Secondary (MEDIUM confidence)
- `.planning/phases/03-sub-agents/03-02-SUMMARY.md` — confirmed disallowedTools pattern for code-reviewer, tools ordering
- `.planning/phases/03-sub-agents/03-03-SUMMARY.md` — confirmed spec: field in task-schema.yaml, two-step SPEC.md lookup
- `.planning/phases/02-teamlead-skills/02-CONTEXT.md` — D-08 through D-10: stage sequence, failure gate pattern, progress trail format established in Phase 2

### Tertiary (LOW confidence / ASSUMED)
- Agent tool prompt format (A1, A2, A3 in Assumptions Log) — derived from training knowledge about Claude Code Agent tool; not verified against official docs in this session

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components directly inspected from filesystem
- Architecture: HIGH — derived directly from CONTEXT.md decisions + existing code inspection
- Pitfalls: MEDIUM — some pitfalls derived from code reasoning; runtime behavior only fully visible in real runs
- Assumptions log items: LOW — Agent tool invocation mechanics not verified against official docs

**Research date:** 2026-05-25
**Valid until:** 2026-06-24 (stable — no external dependencies that change)
