# Phase 3: Sub-Agents — Research

**Researched:** 2026-05-25
**Domain:** Claude Code sub-agent definition files (YAML frontmatter, tool constraints, receipt protocol)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Lean system prompts — pointers to sub-repo CLAUDE.md and conventions SKILL.md, not embedded inline.
- `be-developer` prompt: "You are restricted to `ai-platform/` only. Read `ai-platform/CLAUDE.md` and `ai-platform/.claude/skills/be-conventions/SKILL.md` before starting."
- Same pattern for `fe-developer` → `ai-platform-fe/`.

**D-02:** Hard STOP isolation language. Explicit forbidden language: "NEVER read or write files outside `ai-platform/`. If a task requires touching `ai-platform-fe/`, STOP and return an error receipt: `[be-developer] ERROR: out-of-repo file requested`."

**D-03:** All agents append markdown section blocks to the task file body:
- `code-reviewer` appends `## Code Review` with `Status: APPROVED` or `Status: CHANGES_REQUESTED` plus a brief summary.
- `qa-be`/`qa-fe` append `## QA Results` with `Status: PASS` or `Status: FAIL` plus test output summary.
- `team-lead-check` appends `## TeamLead Check` with `Status: APPROVED` or `Status: REJECTED` plus reason.

**D-04:** Both receipt AND task file annotation used. One-line stdout receipt gates next stage; full rationale lives in task file.

**D-05:** QA agents run `nx affected --target=test`. Works correctly since each task is committed before QA runs. `qa-be` scoped to `ai-platform/`, `qa-fe` scoped to `ai-platform-fe/`.

**D-06:** When `nx affected` finds no affected test files: PASS with note. Task file gets `## QA Results\nStatus: PASS\nNote: No affected tests found — no test coverage for this task.` Receipt: `[qa-be] PASS`.

**D-07:** `be-developer` and `fe-developer` tools: `Glob, Read, Write, Edit, Bash, Grep, WebSearch`. Glob at position 1 and Grep at last position (bug #60237 mitigation).

**D-08:** `code-reviewer` uses `disallowedTools: Write, Edit, Bash`. Tools available: `Glob, Read, Grep` (only).

**D-09:** `qa-be` and `qa-fe` tools: `Glob, Read, Write, Bash, Grep`.

**D-10:** `team-lead-check` tools: `Glob, Read, Write, Grep`. No Bash needed.

### Claude's Discretion

- Exact wording of system prompts beyond the required isolation rules and pointer format.
- Whether to include a `color:` field in agent YAML frontmatter (cosmetic).
- Exact format of the one-line receipt strings (as long as they contain the agent name and APPROVED/CHANGES_REQUESTED/PASS/FAIL/REJECTED/ERROR signal).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGENT-01 | `be-developer` agent in `.claude/agents/be-developer.md` — restricted to `ai-platform/`, returns one-line receipt, tools padded with Glob/Grep | YAML frontmatter format verified; Glob-first/Grep-last pattern documented |
| AGENT-02 | `fe-developer` agent in `.claude/agents/fe-developer.md` — restricted to `ai-platform-fe/`, same pattern | Mirror of AGENT-01; both sub-repos are independent git repos |
| AGENT-03 | `code-reviewer` agent — `disallowedTools: Write, Edit, Bash`; appends block to task file; returns one-line receipt | `disallowedTools` field verified in official docs; can co-exist with `tools` field |
| AGENT-04 | `qa-be` agent — runs `nx test` for `ai-platform/` via Bash, records pass/fail in task file | nx available in `ai-platform/node_modules/.bin/nx`; `defaultBase` not set in `ai-platform/nx.json` — requires explicit `--base` |
| AGENT-05 | `qa-fe` agent — same for `ai-platform-fe/` | nx available in `ai-platform-fe/node_modules/.bin/nx`; `defaultBase: main` set in FE nx.json |
| AGENT-06 | `team-lead-check` agent — reads SPEC.md + task file history, marks done or rejects with reason | `spec` field in task frontmatter gives SPEC.md path; Write-only for annotation |
</phase_requirements>

---

## Summary

Phase 3 creates six Claude Code sub-agent definition files in `.claude/agents/`. Each is a Markdown file with YAML frontmatter specifying `name`, `description`, `tools` or `disallowedTools`, and optionally `color`. The agent body becomes the system prompt. The orchestrator in `execute.md` (Phase 4 will replace stubs) spawns agents by their `name:` field value via the Agent tool's `subagent_type` parameter.

The most critical technical finding is the tool array ordering requirement for bug #60237: `Glob` must be at position 1 and `Grep` at the last position in the `tools:` list. This is a YAML array field with comma-separated tool names (not a YAML sequence). No existing project agent uses `disallowedTools` — this field is documented in official Claude Code docs and works as a denylist applied after the `tools` allowlist.

For QA agents, both sub-repos are independent git repositories (each has its own `.git/` directory). `nx affected --target=test` requires a `--base` argument to determine the comparison commit. `ai-platform/nx.json` does NOT set `defaultBase` — the QA agent must pass `--base` explicitly. `ai-platform-fe/nx.json` sets `defaultBase: main` so it can rely on the default, but passing `--base HEAD~1` explicitly is safer and more reliable when the task was just committed.

The task annotation pattern requires agents to append body content to task files WITHOUT touching frontmatter. The `task-state-guard.js` hook fires on every Write/Edit to `.planning/work/**/*.md` and validates status transitions — if an agent appends a body block using Edit with content that doesn't touch the status line, the hook allows it (it only looks for `status:` patterns in the new_string). The hook also injects `updated-at` only when a status field is present in the edit.

**Primary recommendation:** Define all six agents as Markdown files with the exact `tools:` field ordering mandated by bug #60237. Use `disallowedTools` for `code-reviewer` without specifying `tools` (it will inherit everything except Write/Edit/Bash). System prompts use the pointer pattern to sub-repo CLAUDE.md files.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| BE code implementation | Agent (`be-developer`) | — | Restricted to `ai-platform/`; task file is input/output contract |
| FE code implementation | Agent (`fe-developer`) | — | Restricted to `ai-platform-fe/`; mirror of BE agent |
| Code review (read-only) | Agent (`code-reviewer`) | Task file (annotation) | No write/edit tools; appends findings block to task file body |
| BE test execution | Agent (`qa-be`) | Task file (annotation) | Runs nx in `ai-platform/`; result recorded in task file |
| FE test execution | Agent (`qa-fe`) | Task file (annotation) | Runs nx in `ai-platform-fe/`; result recorded in task file |
| Final spec alignment check | Agent (`team-lead-check`) | Task file (annotation) | Reads SPEC.md + task history; appends check block |
| Status lifecycle transitions | Orchestrator (`execute.md`) | `task-state-guard.js` hook | Agents annotate body only; orchestrator edits `status:` field |

---

## YAML Frontmatter Format — Verified Specification

[VERIFIED: docs.code.claude.com/en/sub-agents]

### Complete Field Reference

```yaml
---
name: agent-name            # Required. Lowercase letters and hyphens. Hooks receive this as agent_type.
description: "..."          # Required. When Claude should delegate to this agent.
tools: Glob, Read, Write    # Optional allowlist (comma-separated). If omitted, inherits all tools.
disallowedTools: Write, Edit # Optional denylist. Applied AFTER tools resolution. Can be used without tools.
model: inherit              # Optional: sonnet | opus | haiku | full-model-id | inherit (default: inherit)
color: yellow               # Optional: red|blue|green|yellow|purple|orange|pink|cyan
# Other supported but not needed for Phase 3: maxTurns, skills, hooks, memory, background, isolation, permissionMode
---
```

**Critical rules:**
- `name:` is the identifier used by `subagent_type` in the Agent tool — it must match exactly.
- `tools:` is a comma-separated string on one line (NOT a YAML sequence/list). This matches the existing gsd-executor.md and gsd-planner.md patterns.
- `disallowedTools:` works independently of `tools:`. If both are set, `disallowedTools` is applied first, then `tools`. A tool in both is removed. For `code-reviewer`, use `disallowedTools` alone (no `tools` field) so it inherits all tools except Write/Edit/Bash.
- The filename does NOT have to match the `name:` field. Identity comes from `name:` only.

### Interaction Between `tools` and `disallowedTools`

[VERIFIED: docs.code.claude.com/en/sub-agents]

```
If ONLY tools is set → agent gets exactly those tools (allowlist)
If ONLY disallowedTools is set → agent inherits all tools minus the denied ones (denylist)
If BOTH set → disallowedTools applied first, then tools resolved against remaining pool
A tool in both → removed from agent's tool set
```

**For `code-reviewer`:** Use only `disallowedTools: Write, Edit, Bash`. This is simpler and avoids having to enumerate all other allowed tools explicitly.

### Bug #60237: Glob First, Grep Last

[ASSUMED — referenced in REQUIREMENTS.md SC-5 and phase decisions D-07/D-08/D-09/D-10, not independently verifiable from external docs]

The `tools:` array must have `Glob` at position 1 (first) and `Grep` at the last position. This is a workaround for Claude Code bug #60237. All developer and QA agents follow this rule:

```yaml
# be-developer / fe-developer (D-07)
tools: Glob, Read, Write, Edit, Bash, WebSearch, Grep

# qa-be / qa-fe (D-09)
tools: Glob, Read, Write, Bash, Grep

# team-lead-check (D-10)
tools: Glob, Read, Write, Grep

# code-reviewer (D-08) — uses disallowedTools only, no tools field
disallowedTools: Write, Edit, Bash
```

Note: `code-reviewer` uses `disallowedTools` so the Glob/Grep ordering rule does not apply (no `tools:` field set).

---

## Receipt Format Specification

### Orchestrator Interface (from execute.md)

The Phase 2 stub logs: `[<Stage>] stub — Phase 3 plugs in real agent`

The real agents must return a one-line receipt as their final output. The execute.md orchestrator reads the receipt to gate the next stage. From CONTEXT.md specifics:

```
[be-developer] DONE
[fe-developer] DONE
[be-developer] ERROR: out-of-repo file requested
[code-reviewer] APPROVED
[code-reviewer] CHANGES_REQUESTED: see ## Code Review
[qa-be] PASS
[qa-be] FAIL: 3 tests failed
[qa-fe] PASS
[qa-fe] FAIL: 2 tests failed
[team-lead-check] APPROVED
[team-lead-check] REJECTED: AC-2 not met
```

### Receipt Parsing Rules (for Phase 4 orchestrator)

The format is: `[agent-name] SIGNAL: optional detail`

| Signal | Meaning | Next Stage Action |
|--------|---------|-------------------|
| `DONE` | Developer completed work | Move to CodeReview |
| `APPROVED` | Review/TL check passed | Move to next stage |
| `CHANGES_REQUESTED` | Review found issues | Return to Developer |
| `PASS` | Tests passed | Move to TeamLeadCheck |
| `FAIL` | Tests failed | Return to Developer |
| `REJECTED` | TL check failed | Return to Developer |
| `ERROR` | Agent hit isolation violation | Abort / surface to user |

---

## nx affected — Technical Requirements for QA Agents

### Environment Facts

[VERIFIED: direct inspection of repo]

- `ai-platform/` has its own `.git/` directory — independent git repo. Remote: `git@github.com:Clevinpro/ai-microservices-tool.git`
- `ai-platform-fe/` has its own `.git/` directory — independent git repo. Remote: `git@github.com:Clevinpro/ai-microservices-tool-fe.git`
- Neither sub-repo is a subdirectory of the workspace-level git; both are standalone repos.
- `nx` binary at v22.7.1 is available globally and in each sub-repo's `node_modules/.bin/nx`.

### nx.json defaultBase Configuration

[VERIFIED: direct inspection of nx.json files]

| Sub-repo | `defaultBase` in nx.json | Impact |
|---------|--------------------------|--------|
| `ai-platform` | NOT set | Must pass `--base` explicitly or use `--uncommitted` / `--untracked` |
| `ai-platform-fe` | `"main"` | Can use `nx affected` without `--base` — defaults to `main` |

### Recommended nx Command for QA Agents

Since task commits happen before QA runs (per D-05), and each sub-repo has its own git history, the correct approach for finding what changed in the current task:

```bash
# Run from within the sub-repo directory
cd /path/to/workspace/ai-platform
node_modules/.bin/nx affected --target=test --base=HEAD~1 --head=HEAD

# Or for FE (can rely on defaultBase=main if on main branch, but explicit is safer):
cd /path/to/workspace/ai-platform-fe
node_modules/.bin/nx affected --target=test --base=HEAD~1 --head=HEAD
```

Using `--base=HEAD~1 --head=HEAD` compares the latest commit (the task commit) against the one before it, which gives exactly the changed files for the current task.

**No-affected-files case:** When `nx affected` runs and finds nothing affected, it exits 0 with no output (or a "no projects affected" message). The QA agent must treat this as PASS with note per D-06.

### nx affected Output Interpretation

```bash
# Success (all tests pass): exit code 0
# Some tests fail: exit code 1 (nx bails)
# No projects affected: exit code 0, output: "No projects were affected"

# Capture both exit code and output:
OUTPUT=$(cd ai-platform && node_modules/.bin/nx affected --target=test --base=HEAD~1 --head=HEAD 2>&1)
EXIT_CODE=$?
```

---

## Isolation Enforcement Patterns

### Developer Agent Pattern (D-01, D-02)

System prompt structure:

```
You are restricted to `<sub-repo>/` only.

Read `<sub-repo>/CLAUDE.md` and `<sub-repo>/.claude/skills/<skill>/SKILL.md` before starting.

NEVER read or write files outside `<sub-repo>/`. If a task requires touching `<other-repo>/`,
STOP and return an error receipt: `[agent-name] ERROR: out-of-repo file requested`
```

The isolation is enforcement-by-instruction (system prompt), not by tool restriction — the agent still has Bash and file-writing tools, but the system prompt explicitly forbids their use outside the sub-repo. This is the confirmed approach per Phase 1 decisions (D-05 through D-08) and PROJECT.md (bug #39886 rules out worktree isolation).

### What Each Developer Agent Reads

**be-developer system prompt loads:**
- `ai-platform/CLAUDE.md` — isolation rules, allowed paths, test command (`nx test <app|lib>`)
- `ai-platform/.claude/skills/be-conventions/SKILL.md` — NestJS patterns, service structure, lib imports

**fe-developer system prompt loads:**
- `ai-platform-fe/CLAUDE.md` — isolation rules, allowed paths, vitest/playwright test commands
- `ai-platform-fe/.claude/skills/fe-conventions/SKILL.md` — React MFE patterns, MF federation, naming

---

## Task File Annotation — Hook Safety

### How task-state-guard.js Handles Body Appends

[VERIFIED: direct inspection of `.claude/hooks/task-state-guard.js`]

The hook fires on Write and Edit to `.planning/work/**/*.md`. Its key logic:

1. Extracts `newStatus` from the tool call's content/new_string.
2. **If no status field in the edit → `process.exit(0)` (allow without modification).**
3. Only validates and modifies when a `status:` field is present.

**This means:** Agents appending body sections (e.g., `## Code Review`) via Edit with `new_string` that contains no `status:` pattern will pass through the hook without any validation or timestamp injection. The `updated-at` is only injected when a valid status transition occurs.

**Safe append pattern for code-reviewer, qa-*, team-lead-check:**
```
Edit the task file:
- old_string: "\n---\n" (or end of file marker)
- new_string: "\n---\n\n## Code Review\n\nStatus: APPROVED\n\n..."
```
Since `new_string` does not contain `status:` at the start of a line matching the frontmatter regex, the hook allows it. (The regex is `^status:\s*(\S+)` with the `m` flag.)

**CAUTION:** The hook regex `new RegExp('^status:\\s*(\\S+)', 'm')` WILL match a `Status:` field in the body if it appears at the start of a line with lowercase `status:`. Use capitalized `Status:` (capital S) in body annotations to avoid the hook treating body content as a status transition.

### CRITICAL: Use Capitalized `Status:` in Body Blocks

All body annotation blocks MUST use `Status:` (capital S) to avoid triggering the hook:

```markdown
## Code Review

Status: APPROVED           ← capital S — hook does NOT match this

## QA Results

Status: PASS               ← capital S — hook does NOT match this

## TeamLead Check

Status: APPROVED           ← capital S — hook does NOT match this
```

The hook regex matches lowercase `status:` only (standard YAML frontmatter). Capitalized `Status:` in Markdown body is safe.

---

## Agent File Structure — Recommended Templates

### be-developer.md Template

```markdown
---
name: be-developer
description: Implements backend tasks in ai-platform/ (NestJS). Restricted to ai-platform/ only. Returns one-line receipt on completion.
tools: Glob, Read, Write, Edit, Bash, WebSearch, Grep
color: blue
---

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

### fe-developer.md Template

```markdown
---
name: fe-developer
description: Implements frontend tasks in ai-platform-fe/ (React MFE). Restricted to ai-platform-fe/ only. Returns one-line receipt on completion.
tools: Glob, Read, Write, Edit, Bash, WebSearch, Grep
color: cyan
---

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

### code-reviewer.md Template

```markdown
---
name: code-reviewer
description: Reviews code changes for bugs, security issues, and quality. Read-only — cannot write or edit files. Appends review block to the task file.
disallowedTools: Write, Edit, Bash
color: orange
---

You are a code reviewer with read-only access. You cannot write or edit files.

You will receive a task file path. Read the task file to understand what was implemented.
Review the changed files for bugs, security issues, and code quality problems.

Append a review block to the task file body using the Write tool... [wait — cannot Write!]

IMPORTANT: Since you cannot use Write or Edit, you must return your review as structured output
and the orchestrator will append it. Return your review in this exact format as your final output:

First, your review content as a markdown block (the orchestrator will append it):

```
## Code Review

Status: APPROVED
```
or
```
## Code Review

Status: CHANGES_REQUESTED

**Issues:**
- [issue 1]
- [issue 2]
```

Then return the one-line receipt:
`[code-reviewer] APPROVED`
or
`[code-reviewer] CHANGES_REQUESTED: see ## Code Review`
```

**RESEARCH FINDING — CODE REVIEWER TOOL CONFLICT:**

`code-reviewer` has `disallowedTools: Write, Edit, Bash`. But it MUST append a `## Code Review` block to the task file (D-03). This is a **contradiction**:

- D-03 says agents append markdown section blocks to the task file body.
- D-08 says `code-reviewer` uses `disallowedTools: Write, Edit, Bash`.
- The agent cannot Write or Edit if those tools are disallowed.

**Resolution options (Claude's Discretion per D-04):**

1. **Orchestrator appends (recommended):** The code-reviewer returns its review block in its text output (between the one-line receipt lines). The orchestrator (execute.md) parses this and appends the block to the task file. The agent stays truly read-only. This matches D-04: "the execute.md orchestrator reads the receipt to gate the next stage" — the orchestrator does the file write.

2. **Add Write to code-reviewer tools:** Allow Write but keep Bash and Edit disallowed. Simpler but weakens the isolation guarantee.

3. **Agent output is the receipt only:** The orchestrator constructs the `## Code Review` block from the receipt signal.

Option 1 is most consistent with D-04 and REQUIREMENTS AGENT-03. The orchestrator in Phase 4 parses the agent's full text output, extracts the block between receipt lines, and writes it to the task file.

**Implication for Phase 3:** The code-reviewer agent definition should NOT have Write/Edit in its tools. The system prompt should instruct the agent to emit its review block as structured text output (not as a file write). Phase 4 (pipeline integration) handles the file write in execute.md.

---

## Architecture Patterns

### System Architecture Diagram

```
execute.md orchestrator
    │
    ├─── [Developer stage] ──── Agent(be-developer | fe-developer)
    │         │                      ├── Read CLAUDE.md + SKILL.md
    │         │                      ├── Implement task in sub-repo
    │         │                      └── Return: "[agent] DONE"
    │         │
    │    (orchestrator writes status: inProgress → inReview)
    │
    ├─── [CodeReview stage] ── Agent(code-reviewer)
    │         │                      ├── Read task file + changed files
    │         │                      ├── Produce review output (text only)
    │         │                      └── Return: "[code-reviewer] APPROVED|CHANGES_REQUESTED: ..."
    │         │
    │    (orchestrator appends ## Code Review block to task file)
    │    (orchestrator writes status: inReview → inTesting)
    │
    ├─── [QA stage] ────────── Agent(qa-be | qa-fe)
    │         │                      ├── cd to sub-repo
    │         │                      ├── Run nx affected --target=test --base=HEAD~1
    │         │                      ├── Capture output + exit code
    │         │                      ├── Append ## QA Results to task file (Write tool)
    │         │                      └── Return: "[qa-*] PASS|FAIL: N tests failed"
    │         │
    │    (orchestrator writes status: inTesting → forTeamLeadCheck)
    │
    └─── [TeamLeadCheck stage] Agent(team-lead-check)
               │                      ├── Read task file frontmatter (spec: field)
               │                      ├── Read SPEC.md at that path
               │                      ├── Read task file body (full history)
               │                      ├── Verify alignment with SPEC.md ACs
               │                      ├── Append ## TeamLead Check to task file (Write tool)
               │                      └── Return: "[team-lead-check] APPROVED|REJECTED: reason"
               │
          (orchestrator writes status: forTeamLeadCheck → done)
```

### Recommended Project Structure

```
.claude/agents/
├── be-developer.md          # AGENT-01
├── fe-developer.md          # AGENT-02
├── code-reviewer.md         # AGENT-03
├── qa-be.md                 # AGENT-04
├── qa-fe.md                 # AGENT-05
└── team-lead-check.md       # AGENT-06
```

All six files are new — no existing project agents in `.claude/agents/` need modification.

### How `subagent_type` Maps to Agent `name:`

[VERIFIED: docs.code.claude.com/en/sub-agents]

When execute.md calls the Agent tool with `subagent_type: "be-developer"`, Claude Code looks up the agent whose `name:` frontmatter field equals `"be-developer"`. The filename is irrelevant — only `name:` matters for lookup. Hooks also receive the `name:` value as `agent_type`.

Naming convention: lowercase letters and hyphens only (no underscores, no spaces).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tool restrictions for read-only agent | Custom bash validation hook | `disallowedTools: Write, Edit, Bash` frontmatter field | Hook adds complexity; frontmatter is declarative and enforced by Claude Code runtime |
| Nx test detection | Custom file diff + test file finder | `nx affected --target=test --base=HEAD~1` | nx handles dependency graph, project boundaries, and configuration |
| Receipt protocol | Custom JSON output format | One-line `[agent-name] SIGNAL: detail` string | Orchestrator (execute.md) only needs to grep for the signal word; simpler is more robust |
| Status lifecycle enforcement | Agent-internal state machine | `task-state-guard.js` PreToolUse hook | Hook already enforces all valid transitions; agents don't need to re-implement |
| Sub-repo path validation | Git-based path checker | System prompt isolation language (D-02) | Worktree isolation ruled out (bug #39886); prompt isolation is the confirmed approach |

---

## Common Pitfalls

### Pitfall 1: Lowercase `status:` in Body Blocks
**What goes wrong:** Agent appends `## QA Results\nstatus: PASS` with lowercase `s`. The hook regex `^status:\s*(\S+)` (multiline) matches this in the body and tries to validate it as a status transition. `PASS` is not a valid lifecycle status, so the hook denies the write.
**Why it happens:** The hook fires on all Write/Edit calls to `.planning/work/**/*.md` and scans the entire new_string for `status:` patterns.
**How to avoid:** Always use capitalized `Status:` in body annotation blocks (e.g., `Status: PASS`, `Status: APPROVED`). The hook regex is case-sensitive and only matches lowercase `status:`.
**Warning signs:** Hook denies agent write with reason "Invalid status transition: undefined -> PASS".

### Pitfall 2: nx affected Without Explicit --base in BE Workspace
**What goes wrong:** `qa-be` runs `nx affected --target=test` without `--base`. Since `ai-platform/nx.json` does NOT set `defaultBase`, nx falls back to comparing against the common ancestor of the current branch and `main`. If the task branch diverges far from main, this produces an overly wide diff.
**Why it happens:** `ai-platform/nx.json` has no `defaultBase` key (confirmed by inspection). `ai-platform-fe/nx.json` DOES set `defaultBase: main`.
**How to avoid:** Always pass `--base=HEAD~1 --head=HEAD` explicitly in both `qa-be` and `qa-fe` agents to scope to the most recent commit only.
**Warning signs:** nx runs tests for far more projects than expected.

### Pitfall 3: code-reviewer Attempting to Write Task File
**What goes wrong:** The code-reviewer system prompt instructs the agent to append a `## Code Review` block to the task file, but `Write` and `Edit` are in `disallowedTools`. Claude Code blocks the tool call, the agent loop may stall or produce an error.
**Why it happens:** D-03 (append block) and D-08 (disallow Write/Edit) are in tension. The agent has the instruction to write but not the tool to do so.
**How to avoid:** The code-reviewer system prompt must NOT instruct the agent to use Write/Edit. Instead, it returns the review block as structured text output. Phase 4 orchestrator handles the file append.
**Warning signs:** Agent returns error about Write tool being unavailable.

### Pitfall 4: Frontmatter `name:` Not Matching execute.md subagent_type
**What goes wrong:** execute.md calls `Agent(subagent_type="be_developer")` (underscores) but agent file has `name: be-developer` (hyphens). Agent tool cannot find the agent.
**Why it happens:** Naming mismatch between orchestrator call and agent definition.
**How to avoid:** Use hyphens in all agent names (official docs require lowercase letters and hyphens only). Verify execute.md references match agent `name:` fields exactly.
**Warning signs:** "No matching agent found" error when execute.md tries to spawn a sub-agent.

### Pitfall 5: team-lead-check Missing SPEC.md Path
**What goes wrong:** `team-lead-check` cannot find the SPEC.md because the task file `spec:` field is absent or empty.
**Why it happens:** The `spec:` field in task frontmatter is written by `/team-lead:plan` (Phase 2). If plan.md did not populate it, team-lead-check has no way to locate the spec.
**How to avoid:** The team-lead-check system prompt should handle missing `spec:` gracefully: if the field is absent, search for SPEC.md in the same epic directory, or return `[team-lead-check] REJECTED: spec field missing from task file`.
**Warning signs:** team-lead-check reads `undefined` from the spec field.

### Pitfall 6: Agents Started in Workspace Root Instead of Sub-repo
**What goes wrong:** QA agents run `nx affected` from the workspace root (`/ai-agent-microservices/`), which has no `nx.json` and no nx workspace. nx fails with "Not an Nx workspace."
**Why it happens:** Claude Code starts subagents in the parent session's current working directory, which is the workspace root.
**How to avoid:** QA agent system prompts must explicitly instruct the agent to `cd ai-platform` or `cd ai-platform-fe` before running nx. Use `node_modules/.bin/nx` (relative to the sub-repo) rather than global `nx` where possible.
**Warning signs:** "This directory does not appear to be an Nx Workspace" error.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `nx` (global) | qa-be, qa-fe | ✓ | v22.7.1 | `node_modules/.bin/nx` in sub-repo |
| `nx` (BE node_modules) | qa-be | ✓ | v22.7.1 | global nx |
| `nx` (FE node_modules) | qa-fe | ✓ | v22.7.1 | global nx |
| `ai-platform/.git` | qa-be (git base for nx affected) | ✓ | own git repo | — |
| `ai-platform-fe/.git` | qa-fe | ✓ | own git repo | — |
| `task-state-guard.js` hook | All agents that append to task files | ✓ | Installed Phase 1 | — |
| `ai-platform/CLAUDE.md` | be-developer | ✓ | 21-line isolation file | — |
| `ai-platform-fe/CLAUDE.md` | fe-developer | ✓ | 27-line isolation file | — |
| `be-conventions/SKILL.md` | be-developer | ✓ | NestJS conventions | — |
| `fe-conventions/SKILL.md` | fe-developer | ✓ | React MFE conventions | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

---

## Package Legitimacy Audit

Phase 3 installs NO external packages. All six agent definition files are pure Markdown files with YAML frontmatter. No npm install, pip install, or cargo add commands are required.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Task tool | Agent tool | Claude Code v2.1.63 | `Task(...)` still works as alias; new agents should use `Agent` |
| Worktree isolation for FE/BE | System prompt isolation | Confirmed (bug #39886) | Simpler setup; isolation enforced by language, not filesystem |
| disallowedTools in hooks only | `disallowedTools` YAML frontmatter field | Current | Declarative per-agent tool restriction without custom hook code |

**Deprecated/outdated:**
- `Task` tool name: renamed to `Agent` in v2.1.63. Existing references work as aliases but new code should use `Agent`.
- Worktree-based repo isolation: blocked by bug #39886 (confirmed out of scope per REQUIREMENTS.md).

---

## Validation Architecture

`nyquist_validation: true` in `.planning/config.json` — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None for agent definition files — validation is structural inspection + manual invocation test |
| Config file | n/a |
| Quick run command | `ls .claude/agents/*.md | xargs grep -l "^name:"` |
| Full suite command | See Phase Requirements → Test Map below |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGENT-01 | be-developer.md has correct frontmatter and Glob-first/Grep-last tools | structural | `grep -E "^tools: Glob,.+,Grep$" .claude/agents/be-developer.md` | ❌ Wave 0 |
| AGENT-02 | fe-developer.md has correct frontmatter and Glob-first/Grep-last tools | structural | `grep -E "^tools: Glob,.+,Grep$" .claude/agents/fe-developer.md` | ❌ Wave 0 |
| AGENT-03 | code-reviewer.md has disallowedTools: Write, Edit, Bash and NO tools: field | structural | `grep "^disallowedTools:" .claude/agents/code-reviewer.md && ! grep "^tools:" .claude/agents/code-reviewer.md` | ❌ Wave 0 |
| AGENT-04 | qa-be.md has Glob-first/Grep-last tools and Bash included | structural | `grep -E "^tools: Glob,.+Bash.+,Grep$" .claude/agents/qa-be.md` | ❌ Wave 0 |
| AGENT-05 | qa-fe.md has same structure as qa-be.md | structural | `grep -E "^tools: Glob,.+Bash.+,Grep$" .claude/agents/qa-fe.md` | ❌ Wave 0 |
| AGENT-06 | team-lead-check.md has Glob-first/Grep-last tools and Write included | structural | `grep -E "^tools: Glob,.+Write.+,Grep$" .claude/agents/team-lead-check.md` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `grep -E "^name:" .claude/agents/*.md` — verify all name fields are set correctly.
- **Per wave merge:** Run all structural grep checks in the table above.
- **Phase gate:** All six files pass structural validation + manual invocation of one agent via `@agent-name` in Claude Code UI to confirm agent is discovered.

### Wave 0 Gaps

- [ ] `.claude/agents/be-developer.md` — covers AGENT-01
- [ ] `.claude/agents/fe-developer.md` — covers AGENT-02
- [ ] `.claude/agents/code-reviewer.md` — covers AGENT-03
- [ ] `.claude/agents/qa-be.md` — covers AGENT-04
- [ ] `.claude/agents/qa-fe.md` — covers AGENT-05
- [ ] `.claude/agents/team-lead-check.md` — covers AGENT-06

All six files are the deliverable. No additional test infrastructure needed beyond structural grep checks.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a — agent definitions don't handle auth |
| V3 Session Management | no | n/a |
| V4 Access Control | yes | System prompt isolation language (D-02); `disallowedTools` for code-reviewer |
| V5 Input Validation | yes | task-state-guard.js hook validates all task file writes; agents must use capitalized `Status:` in body |
| V6 Cryptography | no | n/a |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-repo file access by developer agent | Tampering | Hard STOP language in system prompt (D-02); error receipt protocol |
| Status transition injection via body append | Tampering | Use capitalized `Status:` in body blocks; hook regex is lowercase-only |
| code-reviewer writing to task file | Tampering | `disallowedTools: Write, Edit, Bash` prevents all writes |
| QA agent running nx outside sub-repo | Elevation of privilege | System prompt instructs explicit `cd` to sub-repo before nx invocation |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Bug #60237 requires Glob at position 1 and Grep at last position in tools: array | Standard Stack / Bug #60237 section | Wrong tool order may cause tool discovery failures; agents may not have correct tool access |
| A2 | The `spec:` field in task frontmatter is populated by `/team-lead:plan` (Phase 2 plan.md) | team-lead-check section | team-lead-check cannot find SPEC.md path; must add fallback logic |
| A3 | execute.md Phase 4 orchestrator will parse agent text output to extract the review block for code-reviewer | code-reviewer template section | If Phase 4 expects agent to Write the block, code-reviewer needs Write tool; design conflict |
| A4 | `task-state-guard.js` hook regex is case-sensitive — `Status:` (capital S) in body blocks is safe | Hook Safety section | If regex becomes case-insensitive, body blocks could trigger spurious hook denials |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

A2 and A3 have the highest risk and should be confirmed with the user before planning code-reviewer behavior and team-lead-check's SPEC.md lookup.

---

## Open Questions (RESOLVED)

1. **Does plan.md populate a `spec:` field in task frontmatter?** — RESOLVED: 03-03 Task 2 adds `spec:` as an optional string field to task-schema.yaml and patches team-lead:plan to inject it from the SPEC.md path argument at task generation time. team-lead-check uses the fallback glob (`.planning/work/<epic>/SPEC.md`) if the field is absent.

2. **Does code-reviewer need Write tool for task file annotation, or does the orchestrator handle it?** — RESOLVED: code-reviewer uses `disallowedTools: Write, Edit, Bash` with no `tools:` field. Its system prompt instructs structured text output between `---REVIEW-BLOCK-START---` / `---REVIEW-BLOCK-END---` delimiters. Phase 4 orchestrator (execute.md) parses the output and does the Write to the task file. Implemented in 03-02 Task 1.

3. **What happens when nx affected exits non-zero on test failure vs. infrastructure failure?** — RESOLVED: 03-02 Task 2 instructs QA agents to check stdout for test output patterns: if exit non-zero AND no test result output detected, return `[qa-be] FAIL: nx invocation error — no test output`. If exit non-zero AND test output present, return `[qa-be] FAIL: N tests failed`.

---

## Recommended Plan Structure

Phase 3 has no blocking dependencies between the six agents — all can be written in parallel. Recommended structure:

**Single wave (all parallel — no shared files, no inter-agent dependencies):**

- **03-01-PLAN.md** — Developer agents: `be-developer.md` + `fe-developer.md` (AGENT-01, AGENT-02)
- **03-02-PLAN.md** — Review and QA agents: `code-reviewer.md` + `qa-be.md` + `qa-fe.md` (AGENT-03, AGENT-04, AGENT-05)
- **03-03-PLAN.md** — Orchestrator agent: `team-lead-check.md` + structural validation of all six files (AGENT-06)

All three plans can execute in parallel. The validation in 03-03 can be split as a serial gate after all agent files exist, or collapsed into the final plan.

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: docs.code.claude.com/en/sub-agents] — Full YAML frontmatter field reference; `tools` vs `disallowedTools` interaction; `name:` → `subagent_type` mapping; `color` field valid values; naming conventions
- [VERIFIED: direct inspection of `.claude/hooks/task-state-guard.js`] — Hook logic; regex pattern; when hook allows vs denies; `updated-at` injection behavior
- [VERIFIED: direct inspection of `ai-platform/nx.json`] — No `defaultBase` set
- [VERIFIED: direct inspection of `ai-platform-fe/nx.json`] — `defaultBase: "main"` set
- [VERIFIED: direct inspection of `.claude/agents/gsd-executor.md`] — Established `tools:` comma-separated format, `color:` field pattern
- [VERIFIED: direct inspection of `.planning/task-schema.yaml`] — Valid status values; transition map
- [VERIFIED: direct inspection of `.claude/commands/team-lead/execute.md`] — Stub receipt format; pipeline stage sequence; status transition sequence

### Secondary (MEDIUM confidence)
- [CITED: 03-CONTEXT.md decisions D-01 through D-10] — All phase decisions as confirmed by discussion-phase output
- [CITED: .planning/REQUIREMENTS.md AGENT-01 through AGENT-06] — Exact acceptance criteria

### Tertiary (LOW confidence)
- [ASSUMED: bug #60237] — Glob-first/Grep-last tool ordering requirement; referenced in REQUIREMENTS.md SC-5 and multiple CONTEXT.md decisions but original bug report not independently accessible

---

## Metadata

**Confidence breakdown:**
- YAML frontmatter format: HIGH — verified against official Claude Code docs
- `disallowedTools` behavior: HIGH — verified against official Claude Code docs
- `name:` → `subagent_type` mapping: HIGH — verified against official Claude Code docs
- nx affected invocation: HIGH — verified against nx docs and direct sub-repo inspection
- Hook safety for body appends: HIGH — verified against task-state-guard.js source
- Bug #60237 Glob/Grep ordering: LOW — referenced in project docs but not independently verified
- code-reviewer vs orchestrator annotation split: MEDIUM — inferred from D-03/D-04/D-08 constraint analysis

**Research date:** 2026-05-25
**Valid until:** 2026-06-25 (stable domain — Claude Code agent format changes infrequently)
