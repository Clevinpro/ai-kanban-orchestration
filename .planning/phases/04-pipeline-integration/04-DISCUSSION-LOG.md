# Phase 4: Pipeline Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 4-pipeline-integration
**Areas discussed:** Rejection loop control, Status regression strategy, TeamLeadCheck rejection scope, Agent invocation context

---

## Rejection Loop Control

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-loop (no pause per cycle) | Developer re-invoked automatically after each QA FAIL; loop only pauses at cap or on error | ✓ |
| Pause each cycle | Pipeline pauses after every QA failure for Retry/Skip/Abort | |

**User's choice:** Auto-loop

---

| Option | Description | Selected |
|--------|-------------|----------|
| 3 cycles | Developer → CodeReview → QA repeated up to 3 times before pausing | ✓ |
| 2 cycles | Faster escalation — one auto-retry then pause | |
| Unlimited | Loop until pass or Ctrl+C | |

**User's choice:** 3 cycles

---

| Option | Description | Selected |
|--------|-------------|----------|
| Retry / Skip / Abort | Standard 3-option gate at cap; Retry = 4th loop, Skip = advance, Abort = stop | ✓ |
| Abort only | Hard stop at cap — force investigation | |

**User's choice:** Retry/Skip/Abort gate

---

| Option | Description | Selected |
|--------|-------------|----------|
| Skip CodeReview on re-runs | Rejection loop = Developer → QA only | |
| Full re-review each cycle | Developer → CodeReview → QA on every loop | ✓ |

**User's choice:** Full re-review each cycle
**Notes:** Consistent with quality standard — CodeReview runs on every Developer output regardless of loop cycle.

---

## Status Regression Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Revert to inProgress | inReview → inProgress on QA failure; add reverse transition to guard | ✓ |
| Keep at inReview | Status unchanged during rejection loop | |
| New inRejection status | New 7th status between inReview and inProgress | |

**User's choice:** Revert to inProgress (QA failure path)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Revert to inProgress | forTeamLeadCheck → inProgress on TLC rejection | ✓ |
| Revert to readyForDevelop | Full status reset | |

**User's choice:** Revert to inProgress (TLC rejection path)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Rejection-only gate | Guard allows reverse only when rejection annotation present in task body | ✓ |
| Unrestricted reverse | Guard allows inReview → inProgress and forTeamLeadCheck → inProgress unconditionally | |

**User's choice:** Rejection-only gate
**Notes:** Prevents accidental manual regression. Guard checks for `Status: FAIL` (QA) or `Status: REJECTED` (TLC) annotations in task body before allowing reverse transition.

---

## TeamLeadCheck Rejection Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full pipeline restart | Developer → CodeReview → QA → TeamLeadCheck | ✓ |
| Developer → TeamLeadCheck only | Skip CodeReview/QA on TLC rejection | |

**User's choice:** Full pipeline restart
**Notes:** Consistent with QA rejection behavior (full re-review each cycle).

---

| Option | Description | Selected |
|--------|-------------|----------|
| Separate cap (TLC=2, QA=3) | Each rejection type has its own counter | ✓ |
| Shared cap (combined=3) | All rejections count toward single cap | |
| No cap on TLC | TLC loops until APPROVED or manual abort | |

**User's choice:** Separate caps — TLC cap = 2, QA cap = 3

---

| Option | Description | Selected |
|--------|-------------|----------|
| Retry / Skip / Abort gate | Same 3-option gate at TLC cap as QA cap | ✓ |
| Abort only | Hard stop at TLC cap | |

**User's choice:** Retry/Skip/Abort gate (consistent with QA cap behavior)

---

## Agent Invocation Context

| Option | Description | Selected |
|--------|-------------|----------|
| Task file path only | Orchestrator passes path; agent reads file autonomously | |
| Task path + extracted frontmatter | Orchestrator also passes title, repo, epic inline | |
| Task path + pipeline stage context | Path + cycle number + prior receipts | ✓ |

**User's choice:** Task path + current pipeline stage context (cycle number, previous stage receipts)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Developer appends ## Implementation section | Developer adds changed files list to task body | |
| Orchestrator passes git diff summary | Orchestrator runs git diff --stat, passes file list to code-reviewer | ✓ |
| Code-reviewer runs git diff itself | Add Bash to code-reviewer (violates AGENT-03 requirement) | |

**User's choice:** Orchestrator runs `git diff --stat HEAD~1..HEAD` and passes file list to code-reviewer

---

| Option | Description | Selected |
|--------|-------------|----------|
| Stat only (files + lines changed) | Compact file list; code-reviewer reads files with Read tool | ✓ |
| Full unified diff | Complete diff content inline in agent prompt | |

**User's choice:** Stat only format

---

## Claude's Discretion

- Exact wording of Retry/Skip/Abort prompt text at loop cap
- Whether to print a rejection loop cycle banner (`[Rejection loop cycle N of 3 — QA FAIL]`)
- Exact format of stage context block in agent prompts
- Which git diff stat variant to use (HEAD~1..HEAD vs commit hash)

## Deferred Ideas

None — discussion stayed within phase scope.
