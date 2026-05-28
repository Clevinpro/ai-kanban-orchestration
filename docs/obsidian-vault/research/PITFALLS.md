# Pitfalls Research: AI Agent Dev Workflow

**Confidence:** HIGH — verified against confirmed GitHub issues and official Claude Code docs (May 2026)

## 10 Critical Pitfalls

### 1. Orchestrator Context Explosion
- **What:** Sub-agents return full output → orchestrator hits 200K context limit → "Prompt is too long" loop, unrecoverable session
- **Prevention:** Every agent returns only a structured one-line receipt (`STATUS: inReview | TASK: TASK-01 | NOTE: implemented`). Agents write artifacts to task file, not to orchestrator.
- **Phase:** Phase 1 — mandate before writing any agent prompts

### 2. `tools:` Array Silently Drops First/Last Positions
- **What:** Agent declaring `tools: [Read, Write, Bash]` gets only `[Write]` at runtime — confirmed active bug #60237
- **Prevention:** Pad every tools array with `Glob` at position 1 and `Grep` at the last position. Real tools occupy middle positions.
- **Phase:** Phase 1 — apply to every `.claude/agents/*.md`

### 3. Agent Isolation Is Instruction-Only, Not Filesystem-Enforced
- **What:** No `cwd` or `additionalDirectories` per sub-agent. BE Developer can write to `ai-platform-fe/` if it hallucinates a path.
- **Prevention:** (1) System prompt states boundary as rule #1. (2) PreToolUse hook validates all Write/Edit/Bash paths. (3) Per-repo CLAUDE.md provides in-context reminder.
- **Phase:** Phase 1

### 4. Hardcoded Dispatch Instructions Override Agent Prompt
- **What:** Claude Code appends "share relevant file names and code snippets" to every sub-agent launch — contradicts the receipt contract (GitHub #30730)
- **Prevention:** Counter explicitly in agent system prompt: "Respond with ONLY this format: STATUS: ... Do not include file contents."
- **Phase:** Phase 1 — test with real pipeline run during development

### 5. Stop Hook Infinite Loop
- **What:** Stop hook fires on every agent completion including the one the hook just triggered → infinite spawn chain
- **Prevention:** Every Stop hook must check `stop_hook_active` field first and `exit 0` immediately when true
- **Phase:** Phase 2 — first thing before wiring any pipeline transitions

### 6. Concurrent Task File Write (Two Agents, One File)
- **What:** Two agents writing same `.planning/work/TASK-XX.md` — last write wins, YAML frontmatter corrupt
- **Prevention:** Pipeline strictly sequential; each agent owns its status transitions; orchestrator verifies precondition status before spawning next agent; atomic writes (`temp file + fs.rename()`) in Kanban server
- **Phase:** Phase 2 — design status ownership model first

### 7. CLAUDE.md Context Contamination Across Repos
- **What:** Root CLAUDE.md with FE + BE content loads for all agents. BE agent carries React conventions; FE agent carries NestJS migrations. 20%+ context inflation.
- **Prevention:** Layered CLAUDE.md — root under 200 lines (cross-repo rules only); `ai-platform/CLAUDE.md` for BE; `ai-platform-fe/CLAUDE.md` for FE
- **Phase:** Phase 1

### 8. No Invalid Transition Guard on Task Status
- **What:** Agent writes `done` to task that never passed QA. No schema enforcement — frontmatter is a dumb string store.
- **Prevention:** Define full transition graph in CLAUDE.md and each agent prompt. PostToolUse hook scoped to `.planning/work/*.md` validates transitions.
- **Phase:** Phase 1 (define graph) + Phase 2 (hook validation)

### 9. Kanban SSE Connection Lost — Stale Board State
- **What:** Express server restart drops SSE connection. Browser reconnects but misses events during outage. Board shows stale statuses.
- **Prevention:** On every `EventSource.onopen`, fetch full state from `GET /api/tasks`. Server sends full snapshot as first SSE event on every new connection.
- **Phase:** Phase 5 (Kanban Server) — implement from start

### 10. chokidar ENOENT Causes Task Card Flash/Disappear
- **What:** Agent atomic file writes trigger `unlink` + `add` sequence instead of `change`. Board sends `task_deleted` → card disappears → `add` arrives → reappears.
- **Prevention:** `awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }` in chokidar config. 200ms debounce before SSE broadcast. UI waits 500ms before removing "deleted" card.
- **Phase:** Phase 5

## Confirmed Active Bugs (Claude Code, May 2026)

| Issue | Status | Workaround |
|-------|--------|-----------|
| #60237 — `tools:` drops first/last position | Open | Pad with Glob/Grep |
| #30730 — dispatch injects hardcoded instructions | Open | Counter-instruction in system prompt |
| #31940 — no per-subagent cwd/additionalDirectories | Open feature request | PreToolUse hook path validation |
| #23463 — context overflow kills session | Closed, not planned | Receipt-only contract |
| #25000 — sub-agents bypass deny rules | Open | Never use `bypassPermissions` on orchestrator |

## Never-Acceptable Shortcuts

| Shortcut | Why |
|----------|-----|
| No `maxTurns` on sub-agents | Confused agent loops indefinitely, burns token budget |
| `bypassPermissions` on orchestrator | All sub-agents inherit full filesystem access |
| Full agent output to orchestrator | Kills session on multi-stage pipeline |
| Single root CLAUDE.md for FE + BE | 20%+ context inflation, wrong-repo conventions |
| `tools:` array without Glob/Grep padding | Critical tools silently missing until #60237 fixed |

## Roadmap Phase Impact

- **Phase 1** most pitfall-dense: tools padding, receipt contract, layered CLAUDE.md, isolation enforcement, status transition graph, counter-instruction patterns
- **Phase 2** must add: Stop hook guard, status ownership model, sequential spawn validation, PostToolUse status hook
- **Phase 5** must add: reconnect-with-snapshot, chokidar debounce + awaitWriteFinish
- Do NOT use `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` — additional bugs #30703, #29441 make it unreliable
