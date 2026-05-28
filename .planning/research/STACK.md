# Stack Research

**Domain:** Claude Code multi-agent dev automation system (agent definitions, Kanban UI, task files)
**Researched:** 2026-05-20
**Confidence:** HIGH — all core findings verified against official Claude Code docs (code.claude.com) and Context7

---

## Recommended Stack

### 1. Claude Code Agent Layer

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Claude Code sub-agents | current | TeamLead, Developer, CodeReview, QA agents | Official runtime; subagents run in own context windows with custom system prompts and tool restrictions |
| `.claude/agents/<name>.md` | n/a | Agent definition files (one per role) | Official file location; scanned recursively; project-scoped agents checked into git |
| `.claude/skills/<name>/SKILL.md` | n/a | Slash command definitions (`/team-lead:plan`, `/team-lead:execute`) | Current recommended format; replaces legacy `.claude/commands/`; supports `$ARGUMENTS` substitution, dynamic shell context injection, and `disable-model-invocation` control |
| CLAUDE.md | n/a | Project-level agent constitution | Loaded by every agent in every session; sets coding standards, repo conventions, workspace structure |
| Claude Code hooks | current | Automate task status transitions on file events | `PostToolUse` (Write/Edit) hooks update task status files; `Stop` hooks trigger next pipeline stage |

**Agent file format** (`.claude/agents/developer.md`):
```yaml
---
name: developer
description: Implements tasks from .planning/work/TASK-XX.md in ai-platform/ (BE only). Use when executing a development task.
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
permissionMode: acceptEdits
color: blue
---

You are the Developer agent for the ai-platform NestJS backend.
Work only within the ai-platform/ directory.
Read the task file at .planning/work/$ARGUMENTS and implement it.
When complete, update the task status to `inReview`.
```

**Skill file format** (`.claude/skills/team-lead-execute/SKILL.md`):
```yaml
---
name: team-lead-execute
description: Execute the full automated pipeline for a task
disable-model-invocation: true
argument-hint: "[TASK-ID e.g. TASK-01]"
---

Execute full pipeline for task $ARGUMENTS:
1. Read .planning/work/$ARGUMENTS.md
2. Confirm status is `readyForDevelop`
3. Spawn developer subagent with task ID
4. On completion, spawn code-review subagent
5. On approval, spawn qa subagent
6. On pass, set status to `forTeamLeadCheck`
```

### 2. Task File Format

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Markdown + YAML frontmatter | n/a | Task definition files at `.planning/work/TASK-XX.md` | Human-readable, git-trackable, natively parsed by agents via Read tool; frontmatter carries machine-readable status/metadata |
| YAML frontmatter (status, priority, assigned-to) | n/a | Task lifecycle metadata | Agents can update frontmatter programmatically; Kanban UI reads same files |

**Canonical task file format** (`.planning/work/TASK-01.md`):
```markdown
---
id: TASK-01
title: "Implement JWT refresh endpoint"
status: readyForDevelop
priority: high
created: 2026-05-20
epic: auth-service-v2
repo: be
assigned-to: ""
started-at: ""
completed-at: ""
---

## Context
[Brief context from SPEC.md]

## Requirements
- [ ] ...

## Acceptance Criteria
- [ ] ...

## Technical Notes
[Architecture constraints, relevant files, gotchas]
```

**Status lifecycle values** (agents update `status` field programmatically):
`readyForDevelop` → `inProgress` → `inReview` → `inTesting` → `forTeamLeadCheck` → `done`

### 3. Kanban Web UI

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vite + React | Vite 6.x, React 19.x | Kanban SPA build tooling | Fastest dev startup; minimal config; standalone from the Nx monorepo product apps |
| TypeScript | 5.x | Type safety | Consistent with existing monorepo; catches status enum mismatches at build time |
| Express.js | 4.x | Backend API server: reads `.planning/work/`, serves REST + SSE | Lightweight; no framework overhead; keeps tool separate from NestJS product services |
| gray-matter | 4.0.3 | Parse YAML frontmatter from task `.md` files | Industry standard for markdown frontmatter; used by Gatsby, Vitepress, Astro, Astro; stable at 4.0.3 |
| chokidar | 5.0.0 | File system watcher for `.planning/work/*.md` | Cross-platform, production-grade; powers Vite's own watcher; minimal CPU; event API: `add`, `change`, `unlink` |
| Server-Sent Events (SSE) | native | Push task updates to Kanban UI without polling | No extra lib needed; one-directional push fits this use case perfectly; simpler than WebSocket |
| @hello-pangea/dnd or dnd-kit | latest | Drag-and-drop for status column moves | Both maintained forks of react-beautiful-dnd; dnd-kit preferred for accessibility and flexibility |

**Why standalone Express, not NestJS:**
The Kanban tool is dev tooling — it must not pollute the product codebase (`ai-platform`). A plain Express server in `tools/kanban-server/` with `~100 LOC` is faster to spin up and has zero NestJS module overhead for this read-heavy use case.

**Why SSE over WebSocket:**
Task file updates are unidirectional (server → browser). SSE requires no handshake library, works through proxies, and auto-reconnects natively. WebSocket complexity is not justified.

**Why Vite standalone, not Nx-managed:**
The Kanban UI lives in `tools/kanban-ui/` outside the Nx workspace apps. Adding it to Nx would create coupling to product build targets and Nx version constraints. A standalone `vite.config.ts` with a proxy to `localhost:3001` (Express) is the simplest setup.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| gray-matter | 4.0.3 | Parse frontmatter from task .md files | In Express server when reading task directory |
| chokidar | 5.0.0 | Watch `.planning/work/` for file changes | In Express server; emit SSE events on add/change/unlink |
| js-yaml | 4.x | Stringify YAML frontmatter when agents update task status | When agents need to write updated frontmatter back to task files (used transitively by gray-matter) |
| date-fns | 3.x | Format task timestamps in Kanban UI | Lightweight date formatting without moment.js overhead |
| tailwindcss | 4.x | Kanban UI styling | Zero-config utility CSS; fast for tool UIs where design system doesn't matter |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `concurrently` | Run Vite dev server + Express server in one command | `"dev": "concurrently \"vite\" \"node server.js\""` in `tools/kanban-ui/package.json` |
| `nodemon` | Auto-restart Express server on source changes | Dev-only; not needed in production (tool is dev-only) |

---

## Installation

```bash
# Kanban tool (in tools/kanban-ui/)
npm create vite@latest . -- --template react-ts
npm install gray-matter chokidar express date-fns @hello-pangea/dnd
npm install -D tailwindcss @tailwindcss/vite concurrently nodemon @types/express

# No extra install for Claude Code agent/skill files — they are plain markdown
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `.claude/agents/<name>.md` sub-agents | Agent teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`) | Agent teams if agents need to message each other directly and debate; marked experimental as of May 2026, disabled by default, has known limitations around session resumption |
| `.claude/skills/` | `.claude/commands/` (legacy) | Never for new projects; commands still work but skills are the current standard and add frontmatter control + supporting files |
| Express + SSE | Vite dev server proxy only | If the tool never needs server-side file watching (it does here) |
| Express + SSE | WebSocket (`ws` package) | If bidirectional push were needed (e.g. agents writing back to UI); not needed here |
| chokidar | Node.js `fs.watch` | If targeting Node 22+ only and macOS-only; chokidar normalizes cross-platform quirks and handles atomic writes from editors |
| Standalone Vite app | Nx-managed React app | Only if the Kanban UI needs to share code from the Nx libs (it doesn't; it reads files, not imports) |
| YAML frontmatter in task .md | Pure JSON task files | If tasks are consumed by non-markdown tooling; frontmatter is superior here because agents can read/write tasks with their Read/Write tools without JSON parsing |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`) for the pipeline | Experimental, disabled by default, known limitations in session resumption, one-team-at-a-time limit | Sub-agents via `.claude/agents/` — stable, single-session orchestration model, sufficient for sequential pipeline |
| `.claude/commands/` (legacy) for slash commands | Deprecated path; skills supersede commands in all ways | `.claude/skills/<name>/SKILL.md` |
| Polling the task directory from the Kanban UI | Wastes CPU; causes stale data; poor DX | chokidar on Express + SSE push |
| Storing task state in a database | Violates the local-first, git-trackable constraint from PROJECT.md | YAML frontmatter in `.planning/work/TASK-XX.md` |
| Next.js or Remix for the Kanban UI | Massive overhead for a local-only dev tool that reads files | Plain Vite + React; no SSR needed |
| NestJS for the Kanban server | Product-level overhead (modules, providers, decorators) for a 100-LOC file watcher | Plain Express |
| Electron for the Kanban UI | Adds binary packaging complexity for something that runs `npm run dev` | Vite dev server + Express; stays web-native |

---

## Stack Patterns by Variant

**If the pipeline needs agents to coordinate (debate, share findings):**
- Enable `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` and use agent teams
- BUT: wait for the experimental flag to stabilize before relying on it in production workflows

**If running multiple tasks in parallel (future scope):**
- Spawn multiple Developer sub-agents with `isolation: worktree` to prevent file conflicts
- Each subagent gets its own git worktree; no manual branch management

**If BE and FE tasks are independent within one epic:**
- Spawn BE Developer and FE Developer sub-agents in parallel (Task tool supports up to 10 parallel sub-agents)
- Each agent scoped to its own repo path via CLAUDE.md and agent system prompt

**If task volume grows large:**
- Add an `epic` field to frontmatter; Kanban UI groups by epic with collapsible swimlanes

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| gray-matter@4.0.3 | Node.js 14+ | ESM and CJS; stable — no breaking changes expected |
| chokidar@5.0.0 | Node.js 18+ | v5 is ESM-only; use `import` syntax or `"type": "module"` in package.json |
| React 19.x | Vite 6.x | Official support; use `@vitejs/plugin-react` (Babel) or `@vitejs/plugin-react-swc` |
| tailwindcss@4.x | Vite 6.x | Use `@tailwindcss/vite` plugin; no `tailwind.config.js` needed |

---

## Sources

- [code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents) — Sub-agent frontmatter fields, scope locations, file format (HIGH confidence)
- [code.claude.com/docs/en/slash-commands](https://code.claude.com/docs/en/slash-commands) + skills page — Skills vs commands, SKILL.md frontmatter spec (HIGH confidence)
- [code.claude.com/docs/en/agent-teams](https://code.claude.com/docs/en/agent-teams) — Agent teams architecture, experimental status, limitations (HIGH confidence)
- [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks) — Hook types, lifecycle events, PostToolUse automation (HIGH confidence)
- Context7 `/jonschlinkert/gray-matter` — gray-matter API, current version 4.0.3 (HIGH confidence)
- Context7 `/paulmillr/chokidar` — chokidar API, current version 5.0.0, ESM-only note (HIGH confidence)
- npm registry — Version verification for gray-matter (4.0.3) and chokidar (5.0.0) (HIGH confidence)

---
*Stack research for: Claude Code multi-agent automation system + local Kanban UI*
*Researched: 2026-05-20*
