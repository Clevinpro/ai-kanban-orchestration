# Phase 3: Sub-Agents - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 3-Sub-Agents
**Areas discussed:** Agent system prompt scope, Task file annotation format, QA test invocation, Developer agent tool list

---

## Agent System Prompt Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Lean — pointer only | System prompt points to CLAUDE.md + conventions SKILL.md. Keeps agent definitions small; context loaded on demand. | ✓ |
| Rich — embed inline | Embed full rules from CLAUDE.md and conventions directly in agent system prompt. Self-contained but larger. | |
| Hybrid — embed isolation, pointer for conventions | Embed allowlist inline, pointer for coding conventions. | |

**User's choice:** Lean — pointer only

| Option | Description | Selected |
|--------|-------------|----------|
| Hard STOP — explicit forbidden language | System prompt includes explicit NEVER + error receipt for out-of-repo requests. | ✓ |
| Soft — allowlist only | State what agent IS allowed to touch; no forbidden language. | |

**User's choice:** Hard STOP — explicit forbidden language

---

## Task File Annotation Format

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown section | Append `## Code Review` section with Status line. Human-readable, greppable. | ✓ |
| YAML frontmatter field | Add `review_status:` to frontmatter. Machine-parseable but requires hook awareness. | |
| HTML comment block | `<!-- REVIEW: APPROVED -->`. Invisible in rendered markdown. | |

**User's choice:** Markdown section

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — consistent pattern across all agents | QA and TeamLeadCheck use same section-header pattern. | ✓ |
| No — each agent uses its own format | More flexible, but execute.md needs different parsing per agent. | |

**User's choice:** Yes — consistent pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Both — receipt signals pass/fail, task file has full detail | One-line receipt for orchestrator gating; full rationale in task file body. | ✓ |
| Task file only — orchestrator re-reads file after agent returns | Extra Read call per stage. | |
| Receipt only — orchestrator trusts agent stdout | Detail not preserved in file. | |

**User's choice:** Both

---

## QA Test Invocation

| Option | Description | Selected |
|--------|-------------|----------|
| nx affected --target=test | Only affected projects. Fast, focused. Works since task is committed before QA. | ✓ |
| nx run-many --all --target=test | Full suite. Slow, catches regressions. | |
| nx test \<specific-project\> | Fastest but requires agent to identify modified project. | |

**User's choice:** nx affected --target=test

| Option | Description | Selected |
|--------|-------------|----------|
| PASS with a note | No affected tests = PASS with note in task file. Pipeline continues. | ✓ |
| FAIL and reject back to developer | Treat missing tests as failure. Enforces coverage but blocks config-only tasks. | |
| Skip QA stage entirely | Orchestrator-side detection required. | |

**User's choice:** PASS with a note

---

## Developer Agent Tool List

| Option | Description | Selected |
|--------|-------------|----------|
| Read, Write, Edit, Bash, Glob, Grep | Standard developer set. No web search. | |
| Read, Write, Edit, Glob, Grep only — no Bash | Safer, but blocks nx build, npm install. | |
| Read, Write, Edit, Bash, Glob, Grep, WebSearch | Adds WebSearch for docs/API lookup. | ✓ |

**User's choice:** Read, Write, Edit, Bash, Glob, Grep, WebSearch

| Option | Description | Selected |
|--------|-------------|----------|
| Orchestrator handles `done` transition | team-lead-check is read-only for status; execute.md transitions via Edit. | ✓ |
| team-lead-check writes `done` directly | Agent needs Write/Edit. More autonomous. | |

**User's choice:** Orchestrator handles `done` transition

---

## Claude's Discretion

- Exact wording of system prompt text beyond isolation rules and CLAUDE.md pointer
- Whether to include `color:` field in agent YAML frontmatter
- Exact receipt string format (within the `[agent-name] SIGNAL: detail` pattern)

## Deferred Ideas

None — discussion stayed within phase scope.
