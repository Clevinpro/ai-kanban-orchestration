# Phase 3: Sub-Agents - Pattern Map

**Mapped:** 2026-05-25
**Files analyzed:** 6 new agent definition files
**Analogs found:** 5 / 6 (one file class — `code-reviewer` — has a partial match with caveat)

---

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `.claude/agents/be-developer.md` | agent-def / developer | request-response (task in → receipt out) | `.claude/agents/gsd-executor.md` | role-match |
| `.claude/agents/fe-developer.md` | agent-def / developer | request-response (task in → receipt out) | `.claude/agents/gsd-executor.md` | role-match |
| `.claude/agents/code-reviewer.md` | agent-def / reviewer, read-only | request-response (files in → review text out) | `.claude/agents/gsd-code-reviewer.md` | exact (frontmatter); partial (system prompt) |
| `.claude/agents/qa-be.md` | agent-def / QA runner | batch (run tests, record result) | `.claude/agents/gsd-verifier.md` | role-match (Bash + Write tool set) |
| `.claude/agents/qa-fe.md` | agent-def / QA runner | batch (run tests, record result) | `.claude/agents/gsd-verifier.md` | role-match |
| `.claude/agents/team-lead-check.md` | agent-def / spec-verifier | request-response (spec + task history in → verdict out) | `.claude/agents/gsd-plan-checker.md` | role-match |

---

## Pattern Assignments

### `.claude/agents/be-developer.md` (agent-def / developer, request-response)

**Analog:** `.claude/agents/gsd-executor.md`

**Frontmatter pattern** (lines 1-5 of gsd-executor.md):
```yaml
---
name: gsd-executor
description: Executes GSD plans with atomic commits, deviation handling, checkpoint protocols, and state management. Spawned by execute-phase orchestrator or execute-plan command.
tools: Read, Write, Edit, Bash, Grep, Glob, mcp__context7__*
color: yellow
---
```

**Copy this frontmatter structure for be-developer.md.** Key differences:
- `name: be-developer` (hyphenated, matches `subagent_type` called by execute.md)
- `description:` one sentence: capability + constraint + receipt signal
- `tools: Glob, Read, Write, Edit, Bash, WebSearch, Grep` — CRITICAL: Glob must be first, Grep must be last (bug #60237 mitigation, per D-07 and REQUIREMENTS.md SC-5). WebSearch replaces the MCP tools.
- `color: blue` (Claude's discretion)

**Concrete frontmatter to use:**
```yaml
---
name: be-developer
description: Implements backend tasks in ai-platform/ (NestJS). Restricted to ai-platform/ only. Returns one-line receipt on completion.
tools: Glob, Read, Write, Edit, Bash, WebSearch, Grep
color: blue
---
```

**System prompt structure** — pointer pattern (D-01) + hard STOP clause (D-02):
```
You are a backend developer restricted to `ai-platform/` only.

Before starting any task, read:
1. `ai-platform/CLAUDE.md` — isolation rules and allowed paths
2. `ai-platform/.claude/skills/be-conventions/SKILL.md` — NestJS conventions

NEVER read or write files outside `ai-platform/`. If the task requires touching `ai-platform-fe/`
or any path outside `ai-platform/`, STOP immediately and return:
`[be-developer] ERROR: out-of-repo file requested`

On successful completion, return a one-line receipt as your final output:
`[be-developer] DONE`
```

**Receipt protocol** — from 03-RESEARCH.md receipt format specification:
- Success: `[be-developer] DONE`
- Isolation violation: `[be-developer] ERROR: out-of-repo file requested`

---

### `.claude/agents/fe-developer.md` (agent-def / developer, request-response)

**Analog:** `.claude/agents/gsd-executor.md` (same as be-developer — mirror pattern)

**Frontmatter to use** (identical structure, swap sub-repo references):
```yaml
---
name: fe-developer
description: Implements frontend tasks in ai-platform-fe/ (React MFE). Restricted to ai-platform-fe/ only. Returns one-line receipt on completion.
tools: Glob, Read, Write, Edit, Bash, WebSearch, Grep
color: cyan
---
```

**System prompt structure** (swap ai-platform → ai-platform-fe, be-conventions → fe-conventions):
```
You are a frontend developer restricted to `ai-platform-fe/` only.

Before starting any task, read:
1. `ai-platform-fe/CLAUDE.md` — isolation rules and allowed paths
2. `ai-platform-fe/.claude/skills/fe-conventions/SKILL.md` — React MFE conventions

NEVER read or write files outside `ai-platform-fe/`. If the task requires touching `ai-platform/`
or any path outside `ai-platform-fe/`, STOP immediately and return:
`[fe-developer] ERROR: out-of-repo file requested`

On successful completion, return a one-line receipt as your final output:
`[fe-developer] DONE`
```

**Receipt protocol:**
- Success: `[fe-developer] DONE`
- Isolation violation: `[fe-developer] ERROR: out-of-repo file requested`

---

### `.claude/agents/code-reviewer.md` (agent-def / reviewer, read-only, request-response)

**Analog:** `.claude/agents/gsd-code-reviewer.md`

**Frontmatter pattern** (lines 1-8 of gsd-code-reviewer.md):
```yaml
---
name: gsd-code-reviewer
description: Reviews source files for bugs, security issues, and code quality problems. Produces structured REVIEW.md with severity-classified findings. Spawned by /gsd:code-review.
tools: Read, Write, Bash, Grep, Glob
color: "#F59E0B"
---
```

**CRITICAL DIFFERENCE:** The analog uses a `tools:` allowlist. The new `code-reviewer` uses `disallowedTools:` (denylist) with NO `tools:` field — per D-08 and REQUIREMENTS.md AGENT-03. Do NOT copy the `tools:` field from the analog.

**Frontmatter to use:**
```yaml
---
name: code-reviewer
description: Reviews code changes for bugs, security issues, and quality. Read-only — cannot write, edit, or run commands. Returns review as structured text output.
disallowedTools: Write, Edit, Bash
color: orange
---
```

**TOOL CONFLICT RESOLUTION** (from 03-RESEARCH.md, Pitfall 3):
D-03 requires the agent to append a `## Code Review` block to the task file, but D-08 bans Write/Edit. Resolution: the code-reviewer returns its review block as structured text in its output. The Phase 4 orchestrator (execute.md) appends it to the task file. The system prompt must NOT instruct the agent to use Write/Edit.

**System prompt structure:**
```
You are a code reviewer with read-only access. You cannot write or edit files or run commands.

You will receive a task file path. Read the task file to understand what was implemented.
Review the changed files (listed in the task or identified via git diff) for bugs, security
issues, and code quality problems.

Return your review as structured text in this exact format:

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

[Brief summary — what was reviewed, overall quality assessment]
---REVIEW-BLOCK-END---

Or if issues found:

---REVIEW-BLOCK-START---
## Code Review

Status: CHANGES_REQUESTED

**Issues:**
- [issue description, file:line, severity]

[Brief summary]
---REVIEW-BLOCK-END---

Then on the final line of your output, return the one-line receipt:
`[code-reviewer] APPROVED`
or
`[code-reviewer] CHANGES_REQUESTED: see ## Code Review`
```

**Receipt protocol:**
- Approved: `[code-reviewer] APPROVED`
- Issues found: `[code-reviewer] CHANGES_REQUESTED: see ## Code Review`

---

### `.claude/agents/qa-be.md` (agent-def / QA runner, batch)

**Analog:** `.claude/agents/gsd-verifier.md` (shares Bash + Write + Glob + Read + Grep tool set)

**Frontmatter pattern** (lines 1-5 of gsd-verifier.md):
```yaml
---
name: gsd-verifier
description: Verifies phase goal achievement through goal-backward analysis. ...
tools: Read, Write, Bash, Grep, Glob
color: green
---
```

**Frontmatter to use** (Glob-first/Grep-last per D-09 and bug #60237):
```yaml
---
name: qa-be
description: Runs nx affected tests for ai-platform/ (NestJS). Appends QA Results block to the task file. Returns one-line receipt.
tools: Glob, Read, Write, Bash, Grep
color: green
---
```

**System prompt structure** (incorporates nx invocation from 03-RESEARCH.md nx section):
```
You are a QA agent for the ai-platform/ (backend) sub-repo.

You will receive a task file path. Read the task file to understand what was implemented.

Run nx affected tests for the task:

```bash
cd /absolute/path/to/ai-platform
OUTPUT=$(node_modules/.bin/nx affected --target=test --base=HEAD~1 --head=HEAD 2>&1)
EXIT_CODE=$?
```

IMPORTANT: Always cd into ai-platform/ explicitly before running nx — the workspace root
has no nx.json and nx will fail with "Not an Nx workspace."

Always pass --base=HEAD~1 --head=HEAD explicitly — ai-platform/nx.json does NOT set
defaultBase (unlike ai-platform-fe).

Interpret results:
- Exit code 0, output contains test results: PASS
- Exit code 1, output contains test failures: FAIL
- Output contains "No projects were affected" or similar: PASS with note (D-06)
- Exit code non-zero AND no test output: FAIL (nx invocation error)

Append a QA Results block to the task file body using the Edit tool.
Use capitalized `Status:` (not lowercase `status:`) to avoid triggering the task-state-guard hook.

Append format:
```
## QA Results

Status: PASS

[Test output summary or "No affected tests found — no test coverage for this task."]
```
or:
```
## QA Results

Status: FAIL

[Test failure summary, count of failed tests]
```

Then return the one-line receipt as your final output:
`[qa-be] PASS`
or
`[qa-be] FAIL: N tests failed`
or
`[qa-be] FAIL: nx invocation error — no test output`
```

**Receipt protocol:**
- Tests pass: `[qa-be] PASS`
- Tests fail: `[qa-be] FAIL: N tests failed`
- No affected: `[qa-be] PASS` (with "No affected tests" note in task file)
- nx error: `[qa-be] FAIL: nx invocation error — no test output`

**Hook safety note** (from 03-RESEARCH.md Hook Safety section):
The `task-state-guard.js` hook regex `^status:\s*(\S+)` is case-sensitive. Body blocks MUST use capitalized `Status:` (capital S) so the hook does not misinterpret body content as a frontmatter status transition. This applies to the `## QA Results` block and all other body annotations.

---

### `.claude/agents/qa-fe.md` (agent-def / QA runner, batch)

**Analog:** `.claude/agents/gsd-verifier.md` (same as qa-be — mirror pattern)

**Frontmatter to use:**
```yaml
---
name: qa-fe
description: Runs nx affected tests for ai-platform-fe/ (React MFE). Appends QA Results block to the task file. Returns one-line receipt.
tools: Glob, Read, Write, Bash, Grep
color: purple
---
```

**System prompt structure** (mirror of qa-be with these differences):
- `cd` into `ai-platform-fe/` (not `ai-platform/`)
- `ai-platform-fe/nx.json` sets `defaultBase: "main"` — but STILL pass `--base=HEAD~1 --head=HEAD` explicitly for safety per 03-RESEARCH.md (nx section recommends explicit base for both)
- Receipt prefix `[qa-fe]` not `[qa-be]`

**Receipt protocol:**
- Tests pass: `[qa-fe] PASS`
- Tests fail: `[qa-fe] FAIL: N tests failed`
- No affected: `[qa-fe] PASS`
- nx error: `[qa-fe] FAIL: nx invocation error — no test output`

---

### `.claude/agents/team-lead-check.md` (agent-def / spec-verifier, request-response)

**Analog:** `.claude/agents/gsd-plan-checker.md` (read-heavy verifier with no Bash, uses Write for output)

**Frontmatter pattern** (lines 1-6 of gsd-plan-checker.md):
```yaml
---
name: gsd-plan-checker
description: Verifies plans will achieve phase goal before execution. Goal-backward analysis of plan quality. Spawned by /gsd:plan-phase orchestrator.
tools: Read, Bash, Glob, Grep
color: green
---
```

**Frontmatter to use** (no Bash per D-10; Write needed for task annotation; Glob-first/Grep-last per D-10 and bug #60237):
```yaml
---
name: team-lead-check
description: Verifies task implementation aligns with SPEC.md acceptance criteria. Appends TeamLead Check block to the task file. Returns one-line receipt.
tools: Glob, Read, Write, Grep
color: yellow
---
```

**System prompt structure:**
```
You are a team lead performing a final acceptance check before a task is marked done.

You will receive a task file path. Read the task file.

1. Extract the `spec:` field from the task frontmatter to find the SPEC.md path.
   - If `spec:` is absent or empty, search for SPEC.md in `.planning/work/<epic>/SPEC.md`
     using the task's `epic:` field. If still not found, return:
     `[team-lead-check] REJECTED: spec field missing from task file`

2. Read the SPEC.md at the resolved path.

3. Read the full task file body, including all appended sections (## Code Review, ## QA Results).

4. Verify that the implementation described in the task body satisfies every acceptance
   criterion in the SPEC.md `## Acceptance Criteria` section.

5. Append a TeamLead Check block to the task file body using the Edit tool.
   Use capitalized `Status:` (not lowercase `status:`) to avoid triggering the task-state-guard hook.

Append format:
```
## TeamLead Check

Status: APPROVED

[Brief reason — which ACs were verified]
```
or:
```
## TeamLead Check

Status: REJECTED

**Reason:** [Which AC was not met and why]
```

Then return the one-line receipt as your final output:
`[team-lead-check] APPROVED`
or
`[team-lead-check] REJECTED: <AC-N not met>`
```

**Receipt protocol:**
- All ACs met: `[team-lead-check] APPROVED`
- AC not met: `[team-lead-check] REJECTED: AC-2 not met`
- spec field missing: `[team-lead-check] REJECTED: spec field missing from task file`

**spec field note** (from 03-RESEARCH.md Open Questions 1):
The task-schema.yaml does not list `spec:` as a required field — it is populated by `team-lead:plan` (Phase 2 plan.md). The system prompt must include a graceful fallback: if `spec:` is absent, search `.planning/work/<epic>/SPEC.md` using the `epic:` frontmatter value.

---

## Shared Patterns

### YAML Frontmatter Structure
**Source:** All files in `.claude/agents/`
**Apply to:** All six new agent files

```yaml
---
name: <agent-name>        # Lowercase + hyphens only. MUST match subagent_type in execute.md
description: "..."        # One sentence: capability + constraint + output signal
tools: ...                # Comma-separated on ONE LINE (not YAML list). OR use disallowedTools.
color: <color>            # Optional. Valid: red|blue|green|yellow|purple|orange|pink|cyan
---
```

Key rules:
- `tools:` is a comma-separated string on one line — NOT a YAML sequence (`- item`)
- For allowlist agents: `tools: Glob, ..., Grep` with Glob first and Grep last
- For denylist agent (code-reviewer): `disallowedTools: Write, Edit, Bash` with NO `tools:` field
- The file body (after `---`) is the system prompt — no XML tags required, plain Markdown is fine

### Bug #60237 Tool Array Ordering
**Source:** REQUIREMENTS.md SC-5, 03-CONTEXT.md D-07/D-09/D-10
**Apply to:** be-developer, fe-developer, qa-be, qa-fe, team-lead-check (all agents with `tools:` allowlist)

Rule: `Glob` must be at position 1 (first), `Grep` must be at the last position.

| Agent | Correct tools: value |
|-------|---------------------|
| be-developer | `Glob, Read, Write, Edit, Bash, WebSearch, Grep` |
| fe-developer | `Glob, Read, Write, Edit, Bash, WebSearch, Grep` |
| qa-be | `Glob, Read, Write, Bash, Grep` |
| qa-fe | `Glob, Read, Write, Bash, Grep` |
| team-lead-check | `Glob, Read, Write, Grep` |
| code-reviewer | (no tools: field — use disallowedTools only) |

### Task File Body Annotation — Hook-Safe Pattern
**Source:** `.claude/hooks/task-state-guard.js` (verified in 03-RESEARCH.md Hook Safety section)
**Apply to:** qa-be, qa-fe, team-lead-check (all agents that Write to `.planning/work/**/*.md`)

The `task-state-guard.js` PreToolUse hook fires on every Write/Edit to `.planning/work/**/*.md`. It scans the content for the regex `^status:\s*(\S+)` (multiline, case-sensitive lowercase). If found, it validates as a status transition.

Safe annotation: use capitalized `Status:` in body blocks. The hook only matches lowercase `status:` so `Status: PASS` is safe.

```markdown
## QA Results

Status: PASS        ← capital S — hook IGNORES this

## TeamLead Check

Status: APPROVED    ← capital S — hook IGNORES this
```

NEVER write `status: PASS` (lowercase) in body blocks — the hook will attempt to validate `PASS` as a lifecycle status and deny the write.

### Receipt Protocol
**Source:** 03-CONTEXT.md specifics section, 03-RESEARCH.md receipt format specification
**Apply to:** All six agent files

Format: `[agent-name] SIGNAL: optional detail`

All agents must end their output with exactly one receipt line. The execute.md orchestrator greps for the signal word to gate the next pipeline stage.

| Agent | Signal Words |
|-------|-------------|
| be-developer | `DONE`, `ERROR` |
| fe-developer | `DONE`, `ERROR` |
| code-reviewer | `APPROVED`, `CHANGES_REQUESTED` |
| qa-be | `PASS`, `FAIL` |
| qa-fe | `PASS`, `FAIL` |
| team-lead-check | `APPROVED`, `REJECTED` |

### Isolation Language Pattern
**Source:** 03-CONTEXT.md D-01, D-02; 03-RESEARCH.md Isolation Enforcement Patterns
**Apply to:** be-developer, fe-developer

The system prompt must include three elements in this order:
1. Restriction declaration: "You are restricted to `<sub-repo>/` only."
2. Read directive: "Before starting any task, read: 1. `<sub-repo>/CLAUDE.md` 2. `<sub-repo>/.claude/skills/<skill>/SKILL.md`"
3. Hard STOP clause: "NEVER read or write files outside `<sub-repo>/`. If the task requires touching `<other-repo>/`, STOP immediately and return: `[agent-name] ERROR: out-of-repo file requested`"

---

## No Analog Found

All six files have analogs (role-match or exact). No files require falling back to RESEARCH.md patterns exclusively.

| File | Notes |
|------|-------|
| `.claude/agents/be-developer.md` | gsd-executor is the closest role-match; frontmatter structure transfers directly |
| `.claude/agents/fe-developer.md` | Same as be-developer — pure mirror |
| `.claude/agents/code-reviewer.md` | gsd-code-reviewer is exact for frontmatter structure; system prompt is different (text output vs. REVIEW.md file write) |
| `.claude/agents/qa-be.md` | gsd-verifier shares the Bash+Write+Glob+Read+Grep tool set; the nx invocation pattern is from RESEARCH.md |
| `.claude/agents/qa-fe.md` | Same as qa-be — mirror with ai-platform-fe path |
| `.claude/agents/team-lead-check.md` | gsd-plan-checker shares the read-heavy + Write pattern; spec-lookup logic is phase-3-specific |

---

## Metadata

**Analog search scope:** `.claude/agents/` (33 files scanned), `.claude/commands/team-lead/`
**Files scanned:** 6 analog files read in full (gsd-executor.md, gsd-code-reviewer.md, gsd-verifier.md, gsd-plan-checker.md, gsd-planner.md frontmatter), execute.md, plan.md, task-schema.yaml
**Pattern extraction date:** 2026-05-25
