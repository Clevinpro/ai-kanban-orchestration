# Phase 2: TeamLead Skills - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-22
**Phase:** 2-TeamLead Skills
**Areas discussed:** SPEC.md format & location, Plan review output & timing, Execute pipeline control flow, Stop hook guard design

---

## SPEC.md Format & Location

| Option | Description | Selected |
|--------|-------------|----------|
| User-supplied path | User passes path to plan command. Flexible, no convention enforced. | ✓ |
| Fixed: .planning/epics/<epic>/SPEC.md | Convention-enforced; plan infers path from epic name. | |
| Fixed: .planning/specs/<name>.md | Flat specs directory, simpler nesting. | |

**User's choice:** User-supplied path

---

| Option | Description | Selected |
|--------|-------------|----------|
| Defined template with required sections | Strict sections required; content also structured. | |
| Required sections, free-form content | Headers required; content inside is free-form prose. | ✓ |
| Fully free-form | No required sections. TeamLead infers tasks from anything. | |

**User's choice:** Required sections, free-form content

---

| Option | Description | Selected |
|--------|-------------|----------|
| ## Goal | One-line epic statement. | ✓ |
| ## User Stories / Requirements | User needs that drive task generation. | ✓ |
| ## Acceptance Criteria | Done criteria that drive TeamLeadCheck. | ✓ |
| ## Technical Design | API contracts, DB schema, architecture notes. | ✓ |

**User's choice:** All four sections required

---

| Option | Description | Selected |
|--------|-------------|----------|
| Template file written to disk | `--new` flag creates starter SPEC.md with section headers. | ✓ |
| Format documented in SKILL.md only | No template generation; users write from scratch. | |

**User's choice:** Template file written to disk

---

## Plan Review Output & Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Write first, then show review | Tasks written immediately, then summary printed. | |
| Preview first, confirm to write | Preview table shown; writes only after user confirms [y/N]. | ✓ |

**User's choice:** Preview first, confirm to write

---

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown table | `\| ID \| Title \| Complexity \| Repo \| Epic \|` — scannable. | ✓ |
| Numbered list with details | Prose-friendly but harder to scan. | |
| Grouped by wave | Tasks grouped by execution wave with dependency context. | |

**User's choice:** Markdown table

---

| Option | Description | Selected |
|--------|-------------|----------|
| Flat list only | Tasks in recommended execution order, no wave grouping. | ✓ |
| Wave grouping in review output | Groups shown in output but not written to task frontmatter. | |
| Wave grouping in both output and task files | Adds `wave` field to frontmatter; locks Phase 4 decisions now. | |

**User's choice:** Flat list only

---

| Option | Description | Selected |
|--------|-------------|----------|
| Infer epic from SPEC.md ## Goal or filename | TeamLead reads spec and derives slug. | ✓ |
| User specifies epic via argument | `--epic <slug>` flag required. | |

**User's choice:** Infer epic from SPEC.md

---

## Execute Pipeline Control Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Full orchestration logic, stubbed agent calls | Full flow implemented; agent calls are stubs. Phase 3 plugs in real agents. | ✓ |
| Minimal scaffold only | Just entry point + first status transition. | |
| Full working pipeline with inline logic | Developer/reviewer/QA inline; replaced in Phase 3/4. | |

**User's choice:** Full orchestration logic, stubbed agent calls

---

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-retry to Developer, max 3 loops | Auto-retries; escalates to user after 3 failures. | |
| Always pause for user on failure | Every rejection stops pipeline; user decides retry/skip/abort. | ✓ |
| Single retry, then pause | One auto-retry then pause. | |

**User's choice:** Always pause for user on failure

---

| Option | Description | Selected |
|--------|-------------|----------|
| Stage-by-stage progress trail | Each stage prints on completion: `[Stage] Done ✓`. | ✓ |
| Final status only | Silent during run; prints final result only. | |
| Full verbose log | Every receipt + transition logged. | |

**User's choice:** Stage-by-stage progress trail

---

## Stop Hook Guard Design

| Option | Description | Selected |
|--------|-------------|----------|
| Shared stop-guard.js in settings.json | One file registered as Stop hook; checks `CLAUDE_STOP_HOOK_ACTIVE`. | |
| Inline guard in each pipeline step | Guard embedded per-stage; no shared file. | |
| You decide | Claude picks cleanest implementation. | ✓ |

**User's choice:** Delegated to Claude

---

| Option | Description | Selected |
|--------|-------------|----------|
| Manual test documented in SKILL.md | Human runs procedure once. | |
| Automated test script | Script sets env var, invokes hook, asserts exit 0. | ✓ |
| No explicit test — trust the implementation | Overkill for Phase 2. | |

**User's choice:** Automated test script

---

## Claude's Discretion

- Stop hook architecture: Claude to implement as shared `stop-guard.js` registered in `.claude/settings.json` `Stop` hooks array. Checks `CLAUDE_STOP_HOOK_ACTIVE` env var; exits 0 immediately if set. Execute orchestrator sets this env var before spawning sub-agents. Follows existing Node.js hook pattern.

## Deferred Ideas

None — discussion stayed within phase scope.
