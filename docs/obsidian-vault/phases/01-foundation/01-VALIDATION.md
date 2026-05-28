---
phase: 1
slug: foundation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-20
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js scripts (no test framework — all verifications are file-existence + hook behavior checks) |
| **Config file** | none — hook is a plain Node.js script |
| **Quick run command** | `node .claude/hooks/task-state-guard.js < test/fixtures/valid-transition.json` |
| **Full suite command** | inline verify commands in each plan task (see Per-Task Verification Map) |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-root-claude | 01 | 1 | FOUND-03 | — | Root CLAUDE.md < 200 lines | file | `wc -l CLAUDE.md` | ❌ W0 | ⬜ pending |
| 1-be-claude | 01 | 1 | FOUND-04 | — | ai-platform/CLAUDE.md isolation-first | file | `head -10 ai-platform/CLAUDE.md` | ❌ W0 | ⬜ pending |
| 1-fe-claude | 01 | 1 | FOUND-04 | — | ai-platform-fe/CLAUDE.md isolation-first | file | `head -10 ai-platform-fe/CLAUDE.md` | ❌ W0 | ⬜ pending |
| 1-be-skill | 01 | 1 | FOUND-05 | — | be-conventions/SKILL.md exists | file | `test -f ai-platform/.claude/skills/be-conventions/SKILL.md` | ❌ W0 | ⬜ pending |
| 1-fe-skill | 01 | 1 | FOUND-05 | — | fe-conventions/SKILL.md exists | file | `test -f ai-platform-fe/.claude/skills/fe-conventions/SKILL.md` | ❌ W0 | ⬜ pending |
| 1-task-schema | 01 | 1 | FOUND-01 | — | task-schema.yaml exists with all 9 fields | file | `cat .planning/task-schema.yaml` | ❌ W0 | ⬜ pending |
| 1-hook-valid | 01 | 2 | FOUND-02 | — | Valid transition accepted (hook exits 0) | behavior | `echo '{"tool_name":"Write","tool_input":{"file_path":".planning/work/test/TASK-001.md","content":"---\nstatus: inProgress\n---"}}' \| node .claude/hooks/task-state-guard.js` | ❌ W0 | ⬜ pending |
| 1-hook-invalid | 01 | 2 | FOUND-02 | — | Invalid transition denied (hook exits 0 with JSON deny payload) | behavior | `echo '{"tool_name":"Write","tool_input":{"file_path":".planning/work/test/TASK-001.md","content":"---\nstatus: done\n---"}}' \| node .claude/hooks/task-state-guard.js \| node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.exit(d.hookSpecificOutput?.permissionDecision==='deny'?0:1)"` | ❌ W0 | ⬜ pending |
| 1-work-dir | 01 | 1 | FOUND-01 | — | .planning/work/ directory exists | file | `test -d .planning/work` | ❌ W0 | ⬜ pending |
| 1-teamlead-stub | 01 | 2 | FOUND-06 | — | team-lead slash command files exist | file | `ls .claude/commands/team-lead/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing inline verify commands cover all phase requirements — no Wave 0 artifacts needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Root CLAUDE.md loads without surfacing BE/FE conventions in neutral context | FOUND-03 | Requires opening Claude Code in each repo root | Open Claude Code at repo root, at `ai-platform/`, and at `ai-platform-fe/` — verify only relevant CLAUDE.md sections surface per context |
| TeamLead agent acknowledges max ~10 min / fresh-context constraint when sizing tasks | FOUND-07 | Requires running the agent stub and reading output | Invoke `/team-lead:plan` stub, verify output references timing constraint |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
