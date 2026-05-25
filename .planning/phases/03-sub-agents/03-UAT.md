---
status: complete
phase: 03-sub-agents
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md]
started: 2026-05-25T11:00:00Z
updated: 2026-05-25T11:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. All 6 agent files exist
expected: .claude/agents/ contains be-developer.md, fe-developer.md, code-reviewer.md, qa-be.md, qa-fe.md, team-lead-check.md
result: pass

### 2. Developer agents have symmetric repo isolation
expected: be-developer.md names ai-platform-fe/ as the forbidden cross-repo target in a hard STOP clause. fe-developer.md names ai-platform/ as the forbidden target. Each agent only allows its own sub-repo.
result: pass

### 3. Developer receipt protocol
expected: be-developer.md returns `[be-developer] DONE` on success. fe-developer.md returns `[fe-developer] DONE` on success. Both have error receipts too.
result: pass

### 4. code-reviewer is read-only
expected: code-reviewer.md has disallowedTools: Write, Edit, Bash (denylist, not allowlist). Has REVIEW-BLOCK-START / REVIEW-BLOCK-END delimiters. Returns `[code-reviewer] APPROVED` or `[code-reviewer] CHANGES_REQUESTED: see ## Code Review`.
result: pass

### 5. QA agents run scoped nx tests
expected: qa-be.md instructs cd into ai-platform/ before running nx. Passes --base=HEAD~1 --head=HEAD. Returns `[qa-be] PASS` or `[qa-be] FAIL: N tests failed`. qa-fe.md mirrors this for ai-platform-fe/.
result: pass

### 6. All agents have Glob first, Grep last (bug #60237)
expected: Every agent with a tools: field has Glob as first tool and Grep as last tool (no space before Grep). code-reviewer is exempt (uses disallowedTools). team-lead-check has no Bash (per D-10 decision).
result: pass

### 7. team-lead-check finds SPEC.md two ways
expected: team-lead-check.md reads spec: field from task frontmatter first. If absent, falls back to Glob `.planning/work/<epic>/SPEC.md` using epic: field. Returns `[team-lead-check] APPROVED` or `[team-lead-check] REJECTED: <reason>`. No Bash tool.
result: pass

### 8. spec: field wired into schema and plan.md
expected: .planning/task-schema.yaml has a `spec:` field (optional string, after updated-at). .claude/commands/team-lead/plan.md generates `spec: <path-to-SPEC.md>` in the task frontmatter block.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
