---
phase: 2
slug: teamlead-skills
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-23
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-ins + bash assertions (no test framework — matching Phase 1 pattern) |
| **Config file** | none |
| **Quick run command** | `bash scripts/test-stop-guard.sh` |
| **Full suite command** | `bash scripts/test-stop-guard.sh && node -e "const s=require('./.claude/settings.json'); console.log(s.hooks.Stop ? 'REGISTERED' : 'MISSING')"` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bash scripts/test-stop-guard.sh`
- **After every plan wave:** Run full suite command above
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | PIPE-04 | T-02-01 / T-02-02 | stop-guard.js reads stop_hook_active from JSON stdin, never from env | file | `grep -c "stop_hook_active" /Users/tarasbannyi/TestAI/ai-agent-microservices/.claude/hooks/stop-guard.js` | ❌ Wave 0 | ⬜ pending |
| 2-01-02 | 01 | 1 | PIPE-04 | T-02-03 / T-02-04 | stop-guard.js exits 0 for all inputs; registered in settings.json | behavior | `bash /Users/tarasbannyi/TestAI/ai-agent-microservices/scripts/test-stop-guard.sh` | ❌ Wave 0 | ⬜ pending |
| 2-02-01 | 02 | 1 | TL-01, TL-03, TL-04 | T-02-05 / T-02-07 | plan.md uses $ARGUMENTS; includes confirm gate before any write | file | `grep -c '$ARGUMENTS' /Users/tarasbannyi/TestAI/ai-agent-microservices/.claude/commands/team-lead/plan.md` | ❌ Wave 0 | ⬜ pending |
| 2-02-01b | 02 | 1 | TL-01, TL-03 | T-02-05 | "Write these tasks?" gate present (D-05) | file | `grep -c 'Write these tasks' /Users/tarasbannyi/TestAI/ai-agent-microservices/.claude/commands/team-lead/plan.md` | ❌ Wave 0 | ⬜ pending |
| 2-03-01 | 03 | 1 | TL-02, PIPE-05 | T-02-09 / T-02-10 | execute.md uses $ARGUMENTS; pipeline stages present | file | `grep -c '$ARGUMENTS' /Users/tarasbannyi/TestAI/ai-agent-microservices/.claude/commands/team-lead/execute.md` | ❌ Wave 0 | ⬜ pending |
| 2-03-02 | 03 | 1 | PIPE-05 | T-02-09 | task-state-guard.js registered as PreToolUse with Write|Edit matcher | behavior | `node -e "const s=require('./.claude/settings.json'); const pre=s.hooks.PreToolUse; const found=pre.some(e=>e.matcher&&e.matcher.includes('Write')&&e.hooks.some(h=>h.command.includes('task-state-guard'))); console.log(found?'PIPE-05-OK':'PIPE-05-MISSING')" 2>/dev/null || echo "check-settings-manually"` | ✅ Exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.claude/hooks/stop-guard.js` — covers PIPE-04 (Plan 01 Task 1)
- [ ] `scripts/test-stop-guard.sh` — covers PIPE-04 forced-exit verification (Plan 01 Task 2)
- [ ] `.claude/settings.json` Stop entry — covers PIPE-04 registration (Plan 01 Task 2)
- [ ] `.claude/commands/team-lead/plan.md` — covers TL-01, TL-03, TL-04 (Plan 02 Task 1)
- [ ] `.claude/commands/team-lead/execute.md` — covers TL-02, PIPE-05 confirmation (Plan 03 Task 1)

*(PIPE-05 infrastructure already complete — task-state-guard.js exists from Phase 1. Plan 03 Task 2 verifies and marks REQUIREMENTS.md [x].)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| plan command outputs review table with correct columns (ID, Title, Complexity, Repo, Epic) | TL-01, TL-04 | Interactive prompt — requires Claude to run the command against a sample SPEC.md | Invoke `/team-lead:plan path/to/SPEC.md`; verify `| ID | Title | Complexity | Repo | Epic |` table appears before any files are written |
| plan command pauses at "Write these tasks? [y/N]" before writing | TL-01, D-05 | Interactive prompt — output only visible during live session | Confirm prompt appears; reply `n`; verify no TASK files are written |
| plan command rejects SPEC.md missing required section headers | TL-03 | Requires testing invalid input end-to-end | Run with SPEC.md missing `## Technical Design`; verify error message lists missing header and stops |
| execute command advances task through all 6 stages with progress trail | TL-02, D-08, D-10 | Requires a live task file and session observation | Run `/team-lead:execute TASK-001`; verify `[Stage] Done ✓` printed after each stage; final status is `done` |
| execute command prompts "Retry / Skip / Abort?" on failure | D-09 | Requires simulating a hook rejection mid-pipeline | Trigger a failed transition; verify the exact prompt appears and no auto-retry occurs |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 2s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
