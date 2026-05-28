---
phase: 03-sub-agents
plan: "03"
subsystem: sub-agents
tags: [agent-definition, team-lead-check, task-schema, spec-field]
dependency_graph:
  requires: [03-01, 03-02]
  provides: [team-lead-check agent, spec: field in task schema and plan.md]
  affects: [.claude/agents/team-lead-check.md, .planning/task-schema.yaml, .claude/commands/team-lead/plan.md]
tech_stack:
  added: []
  patterns: [agent-def-yaml-frontmatter, hook-safe-body-annotation, two-step-spec-lookup, glob-first-grep-last]
key_files:
  created:
    - .claude/agents/team-lead-check.md
  modified:
    - .planning/task-schema.yaml
    - .claude/commands/team-lead/plan.md
decisions:
  - "03-03: team-lead-check uses tools Glob, Read, Write, Grep (no Bash per D-10; Glob first, Grep last per bug #60237)"
  - "03-03: Two-step SPEC.md lookup — spec: field primary, epic: glob fallback, rejection receipt if both absent"
  - "03-03: spec: field added to task-schema.yaml as optional string; plan.md generates spec: <path> in task frontmatter"
metrics:
  duration: "56 min"
  completed: "2026-05-25T10:51:07Z"
  tasks_completed: 2
  files_changed: 3
---

# Phase 03 Plan 03: TeamLead Check Agent + spec: Field Summary

**One-liner:** team-lead-check agent with two-step SPEC.md lookup (spec:/epic: fallback), hook-safe Status: annotations, APPROVED/REJECTED receipts, and spec: field wired into task-schema.yaml and plan.md frontmatter generation.

## What Was Built

### Task 1: team-lead-check agent definition (`13852a9`)

Created `.claude/agents/team-lead-check.md` — the final pipeline stage sub-agent. Key characteristics:

- **YAML frontmatter:** `name: team-lead-check`, `tools: Glob, Read, Write,Grep` (Glob first, Grep last, no Bash per D-10), `color: yellow`
- **Two-step SPEC.md lookup:**
  1. Extract `spec:` field from task frontmatter — read SPEC.md at that path if present
  2. If `spec:` absent/empty, use `epic:` field to Glob `.planning/work/<epic>/SPEC.md`
  3. If neither works: return `[team-lead-check] REJECTED: spec field missing from task file`
- **Full task history read:** reads `## Code Review` and `## QA Results` sections from task body to understand what was implemented and verified
- **AC verification:** checks every acceptance criterion from SPEC.md `## Acceptance Criteria` section
- **Hook-safe annotation:** appends `## TeamLead Check` block using capitalized `Status:` (capital S) to avoid triggering `task-state-guard.js` hook regex `^status:\s*(\S+)` (lowercase-only)
- **Receipt protocol:** `[team-lead-check] APPROVED` or `[team-lead-check] REJECTED: <reason>` as final output line

### Task 2: spec: field in task-schema.yaml and plan.md (`fe00ff4`)

**task-schema.yaml edit:** Added `spec:` field after `updated-at:`, before `lifecycle:` section:
```yaml
  spec:
    type: string
    required: false
    note: "Path to the SPEC.md file for this task's epic. Populated by /team-lead:plan. Used by team-lead-check agent to locate acceptance criteria."
```

**plan.md edit:** Added `spec: <path-to-SPEC.md>` to the STEP 5 frontmatter generation block. The value is the SPEC.md path passed as `$ARGUMENTS` to `/team-lead:plan`. Narrow Edit targeting the frontmatter template block only — command frontmatter (name:, description:, allowed-tools:) and lifecycle: section both preserved unchanged.

## Verification Results

All acceptance criteria passed:

```
grep -E "^tools: Glob,.+,Grep$" .claude/agents/team-lead-check.md     ✓
grep "^tools:" | grep -v "Bash"                                         ✓  (Bash absent)
grep "^name: team-lead-check$"                                          ✓
grep "^color: yellow$"                                                  ✓
grep "spec:" and grep "epic:"                                           ✓  (both present)
grep "Status: APPROVED" and grep "Status: REJECTED"                     ✓  (hook-safe)
grep "[team-lead-check] APPROVED" and "[team-lead-check] REJECTED"      ✓
grep "spec field missing"                                               ✓  (graceful rejection)
head -1 returns "---"                                                   ✓
grep "^  spec:" .planning/task-schema.yaml                              ✓
grep "required: false" after spec: block                                ✓
grep "spec:" .claude/commands/team-lead/plan.md                         ✓
lifecycle: section intact                                               ✓
plan.md command frontmatter intact                                      ✓
All 6 agent files exist                                                 ✓
All 6 have name: fields                                                 ✓
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tools line spaces — regex mismatch with acceptance criterion**
- **Found during:** Task 1 verification
- **Issue:** Initial tools line written as `tools: Glob, Read, Write, Grep` (space before Grep). Acceptance criterion regex `^tools: Glob,.+,Grep$` requires no space before Grep. Existing agents (be-developer.md, qa-be.md) use `WebSearch,Grep` and `Write,Grep` (no space) confirming the expected format.
- **Fix:** Changed to `tools: Glob, Read, Write,Grep` (no space before Grep) matching the established pattern.
- **Files modified:** `.claude/agents/team-lead-check.md`
- **Commit:** `13852a9`

## Known Stubs

None — all three files deliver complete, wired functionality. The `spec: <path-to-SPEC.md>` in plan.md is a template placeholder in documentation of the pattern (not a data stub), matching the same style as other frontmatter field examples in that file.

## Threat Flags

No new security-relevant surface introduced. Threat mitigations T-03-03-01 through T-03-03-05 from the plan's threat model are all addressed:

| ID | Mitigation | Status |
|----|-----------|--------|
| T-03-03-01 | Capitalized `Status:` in TeamLead Check block (hook evasion prevention) | Implemented — verified by grep |
| T-03-03-02 | spec: path read from frontmatter written by plan.md, no shell expansion | Implemented — Read-only Glob lookup |
| T-03-03-03 | Rejection receipt when SPEC.md not found | Implemented — `[team-lead-check] REJECTED: spec field missing from task file` |
| T-03-03-04 | epic: fallback glob for legacy tasks without spec: field | Implemented |
| T-03-03-05 | Narrow Edit (old_string) for both schema and plan.md edits | Implemented — lifecycle: and command frontmatter preserved |

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `.claude/agents/team-lead-check.md` exists | FOUND |
| `.planning/task-schema.yaml` exists | FOUND |
| `.claude/commands/team-lead/plan.md` exists | FOUND |
| `03-03-SUMMARY.md` exists | FOUND |
| commit `13852a9` exists | FOUND |
| commit `fe00ff4` exists | FOUND |
