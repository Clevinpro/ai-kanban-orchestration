# Phase 4: Pipeline Integration - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the 5-stub pipeline in `.claude/commands/team-lead/execute.md` with real Agent invocations. The orchestrator spawns each sub-agent sequentially, reads receipts to gate the next stage, runs a rejection loop (QA failure → Developer) and a TeamLeadCheck gate (TLC rejection → Developer) with loop caps and Retry/Skip/Abort escalation. `task-state-guard.js` is updated to allow rejection-reversal status transitions (inReview → inProgress, forTeamLeadCheck → inProgress) gated by annotation presence. All 6 agent definition files are already complete (Phase 3). This phase wires them.

</domain>

<decisions>
## Implementation Decisions

### Rejection Loop Control (PIPE-02)

- **D-01:** Auto-loop on QA failure — no pause between cycles. Pipeline re-invokes Developer automatically after each QA FAIL receipt. Loop only pauses when: (a) QA loop cap hit, or (b) Developer returns an error receipt.
- **D-02:** QA loop cap = 3 cycles. After the 3rd QA FAIL, pipeline pauses with Retry/Skip/Abort gate. Retry = 4th auto-loop, Skip = continue to TeamLeadCheck without QA pass, Abort = stop and leave task at current status.
- **D-03:** Rejection loop is full re-review each cycle: Developer → CodeReview → QA. Not a shortcut. Consistent with quality expectation — CodeReview runs on every Developer output.

### Status Regression Strategy

- **D-04:** QA failure reverses task status: `inReview → inProgress`. Requires new reverse transition in `task-state-guard.js`.
- **D-05:** TLC rejection reverses task status: `forTeamLeadCheck → inProgress`. Same reverse transition pattern as QA rejection.
- **D-06:** Reverse transitions are **rejection-only gated** — `task-state-guard.js` allows `inReview → inProgress` only when the task file body contains a `## QA Results` block with `Status: FAIL`. Allows `forTeamLeadCheck → inProgress` only when task body contains `## TeamLead Check` block with `Status: REJECTED`. Prevents accidental manual regression.

### TeamLeadCheck Rejection Scope (PIPE-03)

- **D-07:** TLC rejection triggers a full pipeline restart: Developer → CodeReview → QA → TeamLeadCheck. Not a shortcut. Ensures Developer fix is reviewed and tested before TLC re-evaluates.
- **D-08:** TLC cap = 2 rejections (separate from QA cap = 3). After 2nd TLC REJECTED receipt, pipeline pauses with Retry/Skip/Abort gate (same 3-option pattern as QA cap).
- **D-09:** At TLC cap: same Retry/Skip/Abort gate (consistent with QA cap behavior).

### Agent Invocation Context (PIPE-01)

- **D-10:** Orchestrator passes task file path **plus** pipeline stage context to each spawned agent: current cycle number (e.g., "QA re-run cycle 2 of 3") and previous stage receipts (e.g., "[code-reviewer] APPROVED", "[qa-be] FAIL: 2 tests failed"). Agents get richer context without needing to reconstruct history from the task file body.
- **D-11:** Orchestrator runs `git diff --stat HEAD~1..HEAD` after Developer stage completes. Passes the resulting file list (stat format: names + lines changed) as part of the code-reviewer prompt. Code-reviewer then reads changed files individually with its Read tool. Full unified diff NOT passed — avoids bloating agent context window.

### Claude's Discretion

- Exact wording of the Retry/Skip/Abort prompt text at loop cap
- Whether to print a "Rejection loop cycle N of 3" banner at the start of each loop
- Exact format of stage context block passed in agent prompts (as long as it includes cycle number and prior receipts)
- Which git diff stat command variant to use (HEAD~1..HEAD vs commit hash)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — PIPE-01, PIPE-02, PIPE-03 (exact acceptance criteria for Phase 4); AGENT-03 through AGENT-06 (receipt formats agents return)
- `.planning/ROADMAP.md` — Phase 4 goal and success criteria SC-1 through SC-3
- `.planning/PROJECT.md` — Key decisions: agent isolation model, one-line receipt protocol, stop hook guard

### Existing Infrastructure to Extend
- `.claude/commands/team-lead/execute.md` — Current pipeline (5 stubs to replace with real Agent calls). Read this before writing the new implementation — Stage sequence, status transitions, and failure gate format must be preserved.
- `.claude/hooks/task-state-guard.js` — PreToolUse hook that validates ALL task file writes. Requires two new reverse transitions added: `inReview → inProgress` (rejection-only) and `forTeamLeadCheck → inProgress` (rejection-only). Read its current transition table and annotation-detection logic before extending.
- `.planning/task-schema.yaml` — Status lifecycle definition. Reference for allowed transitions (currently forward-only).
- `.claude/settings.json` — Hook registration; no changes expected unless new hooks are needed.

### Agent Definitions (Phase 3 output — Phase 4 wires these)
- `.claude/agents/be-developer.md` — System prompt, tools, receipt format
- `.claude/agents/fe-developer.md` — System prompt, tools, receipt format
- `.claude/agents/code-reviewer.md` — Read-only; returns delimited block (`---REVIEW-BLOCK-START---` / `---REVIEW-BLOCK-END---`). Orchestrator must extract and append this block to the task file.
- `.claude/agents/qa-be.md` — Runs `nx affected --target=test --base=HEAD~1 --head=HEAD` from `ai-platform/`; appends `## QA Results` block; returns `[qa-be] PASS` or `[qa-be] FAIL: N tests failed`
- `.claude/agents/qa-fe.md` — Same pattern as qa-be for `ai-platform-fe/`
- `.claude/agents/team-lead-check.md` — Reads SPEC.md via `spec:` field (epic: fallback); appends `## TeamLead Check` block; returns `[team-lead-check] APPROVED` or `[team-lead-check] REJECTED: <reason>`

### Phase 2 & 3 Context (prior decisions)
- `.planning/phases/02-teamlead-skills/02-CONTEXT.md` — D-08 through D-10: stage sequence, failure gate pattern, progress trail format
- `.planning/phases/03-sub-agents/03-CONTEXT.md` — D-01 through D-10: agent tool sets, receipt format, QA test invocation, task file annotation format

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.claude/hooks/task-state-guard.js` — Node.js hook: reads stdin JSON payload, checks `tool_name`, `path`, parses YAML frontmatter, validates transitions. Extension pattern: add new reverse-transition entries to the allowed-transitions map with annotation-presence check.
- `.claude/commands/team-lead/execute.md` — Full 4-step orchestration logic already exists (STEP 1: normalize ID, STEP 2: read task, STEP 3: pipeline loop, STEP 4: failure gate). Phase 4 replaces stub log lines with real Agent tool invocations and adds rejection loop around the pipeline loop.

### Established Patterns
- All status transitions written via Edit tool on the frontmatter `status:` line. task-state-guard.js validates automatically — orchestrator does not need to validate manually.
- Stage progress trail format: `[Stage] Done ✓` / `[Stage] FAIL ✗` — preserve this for new real-agent invocations.
- One-line receipts from agents contain agent name + uppercase signal word. Orchestrator extracts the signal by looking for `APPROVED`, `CHANGES_REQUESTED`, `PASS`, `FAIL`, `REJECTED` in the receipt string.

### Integration Points
- `execute.md` STEP 3 stub loop → replace each stub log line with: (1) Agent tool call with task path + stage context, (2) parse receipt, (3) branch on signal (advance/reject/loop).
- `task-state-guard.js` transition table → add `inReview: ['inProgress']` (rejection-only) and `forTeamLeadCheck: ['inProgress']` (rejection-only) entries with annotation-presence condition.
- `git diff --stat HEAD~1..HEAD` output → pass to code-reviewer as "Changed files:" section in agent prompt.

</code_context>

<specifics>
## Specific Ideas

- Code-reviewer output extraction: orchestrator captures the full text between `---REVIEW-BLOCK-START---` and `---REVIEW-BLOCK-END---` from the agent's return value, then appends it to the task file via Edit tool.
- Loop cycle banner suggested: `[Rejection loop cycle N of 3 — QA FAIL]` before re-invoking Developer. Helps human observers track where the pipeline is.
- Stage context block format for agent prompts: include `Task: <path>`, `Stage context: cycle N of <cap>`, `Prior receipts: [receipt1, receipt2]` as a brief preamble before the main instruction.
- `task-state-guard.js` annotation detection: use regex `Status: FAIL` (capital S, space before FAIL) to match qa-be/qa-fe annotation format; `Status: REJECTED` for team-lead-check annotation format. These match the hook-safe annotation conventions from D-03 (Phase 3) which use capitalized `Status:` deliberately to avoid conflicting with the frontmatter `status:` regex.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 4-Pipeline-Integration*
*Context gathered: 2026-05-25*
