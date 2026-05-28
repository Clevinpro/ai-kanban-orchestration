# Feature Research

**Domain:** Local multi-agent AI developer workflow automation
**Researched:** 2026-05-20
**Confidence:** HIGH (Claude Code official docs + multiple verified community sources)

## Feature Landscape

### Table Stakes (Users Expect These)

Features that the system must have or it feels broken/incomplete relative to what the ecosystem already provides.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Agent role definitions as markdown files with YAML frontmatter | Claude Code's native subagent format — every user of Claude Code expects `.claude/agents/*.md` files with `name`, `description`, `tools`, `model` fields | LOW | Official format: YAML frontmatter + system prompt body. Fields: name, description, tools, disallowedTools, model, permissionMode, maxTurns, memory, color |
| Per-repo agent isolation | Monorepo best practice: FE agents in `ai-platform-fe/.claude/agents/`, BE agents in `ai-platform/.claude/agents/`. Root CLAUDE.md loads on every call — context contamination is a documented failure mode | LOW | Scoped AGENTS.md files are the established pattern. Root-level context must be minimal |
| Task files as markdown with YAML frontmatter status field | Ecosystem standard (Compozy, Maestro, Task Magic, taskmd all converge on this). Git-trackable, agent-readable, no DB required | LOW | Status in frontmatter: `status: readyForDevelop`. Body: acceptance criteria, context, dependencies |
| Sequential pipeline execution per task | The core value proposition. Developer → CodeReview → QA → TeamLeadCheck is validated in real multi-agent systems (EPAM guide, Alexey's 5-project test). Sequential prevents self-verification failure | MEDIUM | Each stage produces an artifact (code, review notes, test results) that feeds the next |
| Human review gate before pipeline execution | `/team-lead:plan` then human approval before `/team-lead:execute` is the dominant HITL pattern. Prevents runaway automation on badly-specified tasks | LOW | Plan shows generated tasks; human confirms before any code runs |
| Task status lifecycle with clear state names | Status transitions are how the system communicates pipeline position. Table stakes for any Kanban-adjacent tool | LOW | `readyForDevelop → inProgress → inReview → inTesting → forTeamLeadCheck → Done` |
| SPEC.md ingestion to generate task files | The "spec-to-task" pattern is industry-standard (TaskMaster, Kiro's three-file system, Antigravity all implement this). TeamLead reading a spec and emitting TASK-XX.md files is the entry point users expect | MEDIUM | SPEC.md should contain: objective, acceptance criteria, technical constraints, out-of-scope. TeamLead breaks into atomic tasks with dependencies |
| Codebase context loading for TeamLead | TeamLead must understand existing architecture before planning tasks. The `.planning/codebase/` directory already exists; loading it is mandatory, not optional | LOW | Without this, generated tasks produce hallucinated file paths and wrong module names |
| Kanban board showing task files as cards | Local file-watching Kanban is proven (kanban-md, Beads Web, Backlog.md). Users need visual confirmation of pipeline progress | MEDIUM | Reads `.planning/work/` directory, groups by status field, auto-refreshes |

### Differentiators (Competitive Advantage)

Features that distinguish this system from generic multi-agent frameworks or simple scripts.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Rejection loop back to Developer from QA | Prevents the silent-failure failure mode where QA accepts broken code. Real systems (Alexey's 5-project test) show this is where most quality gains come from: QA can send tasks back to Developer with specific failure evidence | MEDIUM | Task status goes from `inTesting` back to `inProgress` with QA notes appended to the task file. Developer reads the rejection reason before re-implementing |
| TeamLeadCheck as final gate before Done | Prevents QA-passing-but-wrong-direction failures. PM/TechLead final acceptance is the pattern from validated multi-agent architectures. Critical when agents drift from original spec | LOW | TeamLeadCheck agent reads original SPEC.md, task definition, and QA results before marking Done |
| Per-task context isolation (each task is one pipeline run) | Prevents context bleed between tasks. Each `execute TASK-XX` starts fresh. This is harder to achieve with LangGraph/CrewAI where state persists across tasks | LOW | Each `/team-lead:execute TASK-XX` is an isolated Claude Code invocation. No shared state between tasks |
| Separate FE and BE Developer agents with stack-specific prompts | NestJS BE and Next.js/React FE have completely different patterns, conventions, and tools. A single Developer agent produces worse output than two specialized agents with correct context | MEDIUM | FE Developer knows Nx module federation, React patterns, Tailwind. BE Developer knows NestJS modules, guards, interceptors, DTOs |
| Slash command interface (`/team-lead:plan`, `/team-lead:execute`) | Fits naturally into Claude Code's existing UX. Users don't learn a new CLI — they use the interface they already have | LOW | Claude Code slash commands are the expected invocation pattern. More discoverable than a separate CLI tool |
| SPEC.md task complexity scoring and ordering | TaskMaster shows that automated complexity scoring (1-10) helps users prioritize which tasks to break down further before executing. Prevents starting with a high-complexity task that will fail mid-pipeline | MEDIUM | TeamLead scores each task by estimated complexity. User can split high-complexity tasks before approving the plan |
| Kanban as a standalone dev server (not embedded in product) | Keeps tooling separate from product code. Vibe Kanban and similar tools show the value of a dedicated UI. Standalone server at localhost:PORT doesn't pollute the product codebase | MEDIUM | Simple file-watcher + SSE or polling. Stack: plain Node.js server + minimal frontend (avoid React/Vite overhead for a dev tool) |
| Task file format carries full pipeline history | Each TASK-XX.md accumulates notes from each pipeline stage (Developer notes, CodeReview findings, QA results). The file becomes a traceable audit log for the task | LOW | Append sections to task file as pipeline progresses. TeamLead reads full history during TeamLeadCheck |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| External task tracker integration (Linear, Jira) | Users want tasks in their existing tools | Adds API dependencies, auth complexity, sync conflicts, and breaks the local-first model. Network dependency kills offline use | Keep tasks in `.planning/work/*.md`. Git is the source of truth. If sharing is needed later, a read-only export script is sufficient |
| Real-time multi-agent parallelism within a single task | Faster execution sounds better | Tasks have data dependencies within a pipeline. Parallelizing Developer + CodeReview introduces race conditions on the same files. The ecosystem (Agent Teams docs) explicitly calls out that sequential checkpoints are required when work depends on prior results | Sequential pipeline per task is correct. Parallelism across tasks (multiple `/execute` calls simultaneously) is valid but is a v2+ concern |
| Persistent shared memory across tasks via vector DB | Agents "remembering" previous tasks sounds like continuous improvement | Adds infrastructure complexity (embedding model, vector store), non-deterministic behavior, and hard-to-debug context pollution. Claude Code's `memory` frontmatter field is simpler and sufficient for codebase patterns | Use `memory: project` in agent frontmatter for project-scoped persistent memory. Simpler, already supported by Claude Code |
| Auto-commit and auto-PR after every task | Automation sounds like the logical conclusion | Removes the human's ability to review combined changes. Auto-PRs from partially-completed epics create review noise. TeamLeadCheck is a better gate | TeamLeadCheck marks Done; human runs git commands. Keep humans in the commit/PR loop |
| Web-based SPEC editor | A GUI for writing specs seems friendly | The SPEC.md format is plain markdown — any editor works. Building a custom editor is significant scope for zero functional benefit | Document the SPEC.md schema clearly. Use existing markdown editors |
| Agent-to-agent direct messaging (message queue, SQLite) | Frameworks like CrewAI use this pattern | Claude Code subagents communicate through the orchestrator by design. Adding a message queue outside Claude Code's model creates two communication channels to debug. File-based handoff (task files) is simpler and inspectable | Use task files as the communication artifact. Each stage reads what the previous stage wrote. No separate message bus needed |
| Dynamic agent spawning based on task type | Adaptive agents sound powerful | Hard to debug, hard to predict, and not needed when task types are known (FE task → FE Developer, BE task → BE Developer). Explicit routing is deterministic | Tag tasks with `repo: fe|be` in YAML frontmatter. TeamLead routes based on the tag |

## Feature Dependencies

```
SPEC.md Ingestion
    └──requires──> Codebase Context Loading (TeamLead needs to understand what already exists)
                       └──requires──> .planning/codebase/ snapshot (already exists per PROJECT.md)

Task File Generation (TASK-XX.md)
    └──requires──> SPEC.md Ingestion
    └──requires──> Task Schema Definition (what fields every task file must have)

Human Review Gate (/team-lead:plan)
    └──requires──> Task File Generation

Pipeline Execution (/team-lead:execute TASK-XX)
    └──requires──> Human Review Gate (user must have approved the plan first)
    └──requires──> Agent Role Definitions (Developer, CodeReview, QA, TeamLeadCheck must exist)
    └──requires──> Task Status Lifecycle (status transitions drive pipeline flow)

Developer Agent (FE/BE)
    └──requires──> Per-repo Agent Isolation (agents stored in each sub-repo's .claude/agents/)
    └──requires──> Stack-specific CLAUDE.md context in each sub-repo

CodeReview Agent
    └──requires──> Developer Agent output (reviews the code the Developer produced)

QA Agent
    └──requires──> Developer Agent output + CodeReview notes
    └──requires──> Stack-specific test runner knowledge (FE: Playwright/Jest, BE: Jest/Supertest)

Rejection Loop
    └──requires──> QA Agent (only QA can trigger a rejection)
    └──requires──> Task Status Lifecycle (rejection reverts status to readyForDevelop or inProgress)

TeamLeadCheck Agent
    └──requires──> QA Agent completion
    └──requires──> Original SPEC.md access (to verify alignment)

Kanban Board
    └──requires──> Task File Generation (needs .planning/work/*.md files to read)
    └──requires──> Task Status Lifecycle (uses status field to place cards in columns)
    └──enhances──> Pipeline Execution (visual confirmation of progress)

Task Complexity Scoring
    └──enhances──> Task File Generation (adds complexity score to generated tasks)
    └──enhances──> Human Review Gate (users can spot high-complexity tasks before approving)
```

### Dependency Notes

- **SPEC.md Ingestion requires Codebase Context Loading:** Without knowing the existing architecture, TeamLead generates tasks targeting files or patterns that don't exist. The `.planning/codebase/` directory must be loaded before task planning.
- **Pipeline Execution requires all Agent Role Definitions:** If any role definition file is missing, the pipeline halts at that stage. All four roles must exist before the first execute command.
- **Rejection Loop requires Task Status Lifecycle:** The status field is the state machine. Without it, the pipeline has no way to signal a retry.
- **Kanban Board enhances but does not block Pipeline Execution:** The board is observability, not control. Pipeline works without it; users just have less visibility.
- **Task Complexity Scoring enhances Human Review Gate:** Useful but not blocking. The plan command works without scoring; scoring makes the human review faster.

## MVP Definition

### Launch With (v1)

Minimum needed to validate the core concept: one-command automated dev lifecycle with human review gate.

- [ ] Task schema (YAML frontmatter fields: id, title, status, repo, complexity, dependencies) — foundation everything else reads
- [ ] SPEC.md format definition (sections: objective, acceptance criteria, technical constraints, out-of-scope, tasks) — TeamLead ingestion target
- [ ] TeamLead agent with SPEC.md ingestion and TASK-XX.md generation — the entry point
- [ ] `/team-lead:plan` slash command — generates task files, shows them for human review
- [ ] `/team-lead:execute TASK-XX` slash command — triggers full pipeline for one task
- [ ] Developer agent (BE) stored in `ai-platform/.claude/agents/developer.md` — BE implementation
- [ ] Developer agent (FE) stored in `ai-platform-fe/.claude/agents/developer.md` — FE implementation
- [ ] CodeReview agent (root-level, works across both repos) — review stage
- [ ] QA agent (BE) stored in `ai-platform/.claude/agents/qa.md` — BE test execution
- [ ] QA agent (FE) stored in `ai-platform-fe/.claude/agents/qa.md` — FE test execution
- [ ] TeamLeadCheck agent (root-level) — final gate before Done
- [ ] Task status lifecycle with all six states — pipeline state machine
- [ ] Rejection loop (QA → back to Developer with notes appended to task file) — quality gate
- [ ] Kanban web server reading `.planning/work/` files grouped by status — visibility

### Add After Validation (v1.x)

Add once the basic pipeline is proven to work end-to-end on real tasks.

- [ ] Task complexity scoring in TeamLead output — add when human reviewers find it hard to assess plan quality
- [ ] Kanban auto-refresh via file watcher (SSE or polling) — add when manual refresh feels painful
- [ ] SPEC.md template / schema validator — add when malformed SPECs cause TeamLead failures
- [ ] TaskLeadCheck rejection loop (TeamLeadCheck can send back to Developer, not just to QA) — add when TeamLeadCheck catches issues QA missed

### Future Consideration (v2+)

Defer until v1 is validated with real usage.

- [ ] Parallel task execution (run two `/execute` commands simultaneously on different tasks) — defer until single-task pipeline is reliable; adds git conflict risk
- [ ] Per-agent persistent memory (`memory: project` frontmatter) — defer until pattern repetition within a project is observed
- [ ] Kanban drag-and-drop status override (human can move a card to bypass a stage) — defer; could hide pipeline failures that should be fixed, not bypassed
- [ ] SPEC.md auto-generation from a brief description (TeamLead writes the SPEC from a one-liner) — defer; high LLM cost, high hallucination risk without structured input

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Task schema (YAML frontmatter) | HIGH | LOW | P1 |
| SPEC.md format definition | HIGH | LOW | P1 |
| TeamLead agent + `/team-lead:plan` | HIGH | MEDIUM | P1 |
| `/team-lead:execute TASK-XX` pipeline | HIGH | MEDIUM | P1 |
| Developer agents (FE + BE, separate) | HIGH | LOW | P1 |
| CodeReview agent | HIGH | LOW | P1 |
| QA agents (FE + BE, separate) | HIGH | LOW | P1 |
| TeamLeadCheck agent | HIGH | LOW | P1 |
| Task status lifecycle (6 states) | HIGH | LOW | P1 |
| Rejection loop (QA → Developer) | HIGH | LOW | P1 |
| Kanban web server (file-based, local) | MEDIUM | MEDIUM | P1 |
| Task complexity scoring | MEDIUM | LOW | P2 |
| Kanban file-watcher auto-refresh | MEDIUM | LOW | P2 |
| SPEC.md schema validator | MEDIUM | LOW | P2 |
| TeamLeadCheck rejection loop | MEDIUM | LOW | P2 |
| Parallel task execution | LOW | HIGH | P3 |
| Per-agent persistent memory | LOW | LOW | P3 |
| Kanban drag-and-drop override | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch (MVP)
- P2: Should have, add after v1 is validated
- P3: Nice to have, defer to v2+

## Competitor Feature Analysis

| Feature | TaskMaster AI | Vibe Kanban | kanban-md CLI | Our Approach |
|---------|--------------|-------------|---------------|--------------|
| Spec ingestion | PRD → task decomposition via MCP | Manual task creation | Manual task creation | SPEC.md → TASK-XX.md via TeamLead agent |
| Agent roles | Single orchestrator, no role specialization | Delegates to external agents (Claude Code, Copilot) | No agents, pure file tracker | Specialized role agents (TeamLead, Developer, CodeReview, QA, TeamLeadCheck) |
| Pipeline | Linear task queue, no review stages | Agent runs in workspace, human reviews diff | Status column transitions | Automated sequential pipeline with rejection loops |
| Kanban | CLI only, no visual board | Full visual board with Git integration | CLI + TUI | Standalone local web server, file-watcher based |
| Task format | JSON/structured — not markdown-native | GitHub Issues / internal DB | One file per task (markdown) | YAML frontmatter + markdown body, git-trackable |
| Human review gate | Before implementation starts | After agent completes (diff review) | Manual column move | Before pipeline starts (plan) and after QA (TeamLeadCheck) |
| Monorepo support | Single-repo focus | Single-repo workspaces | Single-repo | First-class: FE and BE agents isolated per sub-repo |
| Local-first | Yes (CLI, no cloud) | No (Rust server, PostgreSQL) | Yes (files only) | Yes (no external DB, no cloud) |

## Sources

- Claude Code official subagents documentation: https://code.claude.com/docs/en/sub-agents (HIGH confidence — official docs, verified 2026)
- Claude Code agent teams documentation: https://code.claude.com/docs/en/agent-teams (HIGH confidence — official docs)
- Claude Code best practices: https://code.claude.com/docs/en/best-practices (HIGH confidence — official docs)
- Alexey on Data: "I Built an AI Agent Team for Software Development": https://alexeyondata.substack.com/p/i-built-an-ai-agent-team-for-software (MEDIUM confidence — practitioner, 5 real projects tested)
- Addy Osmani: "How to write a good spec for AI agents": https://addyosmani.com/blog/good-spec/ (MEDIUM confidence — industry practitioner)
- kanban-md file-based kanban for multi-agent workflows: https://github.com/antopolskiy/kanban-md (MEDIUM confidence — community project)
- Vibe Kanban (BloopAI) AI coding agent management: https://github.com/BloopAI/vibe-kanban (MEDIUM confidence — active project)
- TaskMaster AI features: https://www.task-master.dev/ (MEDIUM confidence — product site, verified against community articles)
- Monorepo agent isolation with AGENTS.md: https://dev.to/datadog-frontend-dev/steering-ai-agents-in-monorepos-with-agentsmd-13g0 (MEDIUM confidence — Datadog frontend team)
- Human-in-the-loop approval gate patterns: https://machinelearningmastery.com/building-a-human-in-the-loop-approval-gate-for-autonomous-agents/ (MEDIUM confidence — established ML source)
- CLAUDE.md best practices: https://www.humanlayer.dev/blog/writing-a-good-claude-md (MEDIUM confidence — community best practices)

---
*Feature research for: Local multi-agent AI developer workflow automation*
*Researched: 2026-05-20*
