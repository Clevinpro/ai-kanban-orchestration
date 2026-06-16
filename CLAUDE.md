# AI Agent Dev Workflow

Multi-agent development automation system. A TeamLead agent reads a SPEC.md, breaks it into task files, and an automated pipeline (Developer → CodeReview → QA → TeamLeadCheck → Done) executes each task.

## Repos

Single repository, three services co-located at workspace root:

- **`ai-platform/`** — backend services (api-gateway, auth-service, ai-service)
  - Agent context: `ai-platform/CLAUDE.md`
  - Conventions skill: `ai-platform/.claude/skills/be-conventions/SKILL.md`

- **`ai-platform-fe/`** — frontend apps (shell, auth, chat, docs MFEs)
  - Agent context: `ai-platform-fe/CLAUDE.md`
  - Conventions skill: `ai-platform-fe/.claude/skills/fe-conventions/SKILL.md`

- **`kanban-server/`** — standalone Express + SSE dev-tool server for the Kanban UI
  - Plain CommonJS Node.js, no Nx, no TypeScript
  - Lives outside the Nx workspace at the repo root

## Task Files

- Task files live at `.planning/work/<epic-name>/TASK-XXX.md`
- Task ID format: `TASK-001` (three-digit zero-padded)
- The `epic` field in frontmatter must match the parent directory name
- **Investigation epics** use a single `.planning/work/<epic-name>/RESEARCH.md` (`id: RESEARCH`, `repo: inv`) instead of TASK files — see **Investigation Epics** below.

## Agent Workflow Entry Points

- `/team-lead:plan <SPEC.md>` — Break a spec into TASK-XXX.md files for human review
- `/team-lead:execute <TASK-ID>` — Run the full automated pipeline for one task
- `/team-lead:test <epic-name>` — Epic-level acceptance gate: runs after all tasks are `done`, verifies every SPEC.md acceptance criterion holistically, writes `TEST-REPORT.md`
  - **Verdict gating:** `IN-PROGRESS` (kanban launch marker) and `PASS` block re-launch; `FAIL` allows re-run. After `PASS`, re-run requires deleting `TEST-REPORT.md`.
  - **Re-run after FAIL:** verifies only previously failed ACs; passed rows carry over as `PASS (carried)`. Previous report preserved as `TEST-REPORT.prev.md` by the kanban server.
  - **On FAIL:** creates fix tasks from open ACs — one per repo (`be` and `fe` separately, never combined), next free `TASK-NNN` numbers — and immediately launches the first via the kanban server.
- `/team-lead:research "<topic>"` — Lightweight architecture/refactor **investigation** (token-frugal alternative to `/deep-research`). Creates a `RESEARCH.md` epic instead of TASK files; see **Investigation Epics** below.

## Investigation Epics (`/team-lead:research`)

- Artifact: a new epic directory with a single **`RESEARCH.md`** (the SPEC/TASK analog for investigations). Every stage and every agent's feedback block is appended to it as the research proceeds.
- Agents (the only ones — no fan-out): **`research-investigator`** — central node, read-only code analysis, the **sole web-search point**, synthesis; plus read-only **`be-developer`/`fe-developer`** in RESEARCH MODE (no code changes, no web search) when a repo is genuinely involved. Each agent runs in its **own terminal tab** (`kanban-server/open-research-tab.sh` → `run-research.sh`), Claude or Cursor.
- Kanban: one card, **`repo: inv`**; starts **In Progress**, reaches **Done** the same way TeamLead Check → Done does (investigator self-approves; the command flips the card). **`team-lead:test` is skipped** for `inv` cards — the `task-state-guard` hook gives them a lean `readyForDevelop → inProgress → done` lifecycle.

## Task Ordering

Tasks run **sequentially within an epic**: a task can only transition `readyForDevelop → inProgress` once the previous task (next-lower `TASK-NNN` in the same epic directory) is `done`. Enforced by the `task-state-guard.js` PreToolUse hook.

## Routing Rules

- **Before editing `ai-platform/` code:** load `ai-platform/CLAUDE.md` first
- **Before editing `ai-platform-fe/` code:** load `ai-platform-fe/CLAUDE.md` first
- **Before editing `kanban-server/` code:** treat as standalone Node.js service — no Nx, no shared deps with the other two
- **Never edit across multiple services in a single task** — tasks are `repo: be`, `repo: fe`, or `repo: kanban`, never combined
- **Each task executes in a fresh context window** — do not assume state from previous tasks

## Commit Hooks

Root-level Husky pre-commit runs scoped lint + tests per service based on staged file paths:

- Staged files under `ai-platform/` → `nx affected -t lint test` inside `ai-platform/`
- Staged files under `ai-platform-fe/` → `nx affected -t lint test` inside `ai-platform-fe/`
- Staged files under `kanban-server/` → `npm run lint && npm test` inside `kanban-server/`
