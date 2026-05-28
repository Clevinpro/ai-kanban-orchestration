# Phase 1: Foundation - Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 9 new/modified files + 1 modified config
**Analogs found:** 8 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.claude/hooks/task-state-guard.js` | middleware (PreToolUse hook) | request-response | `.claude/hooks/gsd-workflow-guard.js` | exact |
| `.claude/settings.json` | config | — | `.claude/settings.json` (current) | exact (modify) |
| `.planning/task-schema.yaml` | config/schema | — | `.planning/config.json` | partial (same dir, YAML vs JSON) |
| `CLAUDE.md` (rewrite) | config/documentation | — | `ai-platform/CLAUDE.md` | role-match (lean, bullet-point CLAUDE.md) |
| `ai-platform/CLAUDE.md` (rewrite) | config/documentation | — | `ai-platform/CLAUDE.md` (current) | exact (modify) |
| `ai-platform-fe/CLAUDE.md` (create) | config/documentation | — | `ai-platform/CLAUDE.md` | role-match (same pattern, new repo) |
| `ai-platform/.claude/skills/be-conventions/SKILL.md` | config/documentation | — | `ai-platform/.claude/skills/app-structure.md` | exact (same skill layer, same repo) |
| `ai-platform-fe/.claude/skills/fe-conventions/SKILL.md` | config/documentation | — | `ai-platform/.claude/skills/app-structure.md` | role-match (same skill layer, different repo) |
| `.claude/commands/team-lead/plan.md` | config (slash command) | — | `.claude/commands/gsd/plan-phase.md` | role-match (same command pattern) |
| `.claude/commands/team-lead/execute.md` | config (slash command) | — | `.claude/commands/gsd/execute-phase.md` | role-match (same command pattern) |

---

## Pattern Assignments

### `.claude/hooks/task-state-guard.js` (PreToolUse hook, request-response)

**Analog:** `.claude/hooks/gsd-workflow-guard.js`

**Shebang + stdin boilerplate** (lines 1–21 of analog):
```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name;

    // Only guard Write and Edit tool calls
    if (toolName !== 'Write' && toolName !== 'Edit') {
      process.exit(0);
    }
    // ...
  } catch (e) {
    // Silent fail — never block tool execution
    process.exit(0);
  }
});
```

**Path filter pattern** (lines 40–45 of `gsd-workflow-guard.js`):
```javascript
const filePath = data.tool_input?.file_path || data.tool_input?.path || '';

// Allow edits to .planning/ files (GSD state management)
if (filePath.includes('.planning/') || filePath.includes('.planning\\')) {
  process.exit(0);
}
```
For the task-state-guard, invert this: pass through immediately if path does NOT include `.planning/work/` or does not end in `.md`.

**Advisory output pattern** (lines 78–90 of `gsd-workflow-guard.js`):
```javascript
const output = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext: `...message...`
  }
};
process.stdout.write(JSON.stringify(output));
```
For task-state-guard, replace `additionalContext` with `permissionDecision: 'deny'` and `permissionDecisionReason: <reason>` (see RESEARCH.md Pattern 2).

**Deny pattern** (from RESEARCH.md Pattern 2 — verified against official docs):
```javascript
function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);  // exit 0 with JSON, NOT exit 2
}
```

**File-existence check pattern** (lines 71–79 of `gsd-read-guard.js`):
```javascript
let fileExists = false;
try {
  fs.accessSync(filePath, fs.constants.F_OK);
  fileExists = true;
} catch {
  // File does not exist
}
```

**YAML frontmatter extraction** (from RESEARCH.md Pattern 3 — manually verified):
```javascript
function extractFrontmatterField(content, field) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const searchIn = fmMatch ? fmMatch[1] : content;
  const m = searchIn.match(new RegExp(`^${field}:\\s*(\\S+)`, 'm'));
  return m ? m[1] : undefined;
}
```

**Config-read with silent fail** (lines 62–74 of `gsd-workflow-guard.js`):
```javascript
const cwd = data.cwd || process.cwd();
const configPath = path.join(cwd, '.planning', 'config.json');
if (fs.existsSync(configPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    // use config...
  } catch (e) {
    process.exit(0);
  }
}
```

---

### `.claude/settings.json` (config, modify existing)

**Analog:** `.claude/settings.json` (current file, lines 61–91)

**Existing PreToolUse block structure to extend** (lines 61–91):
```json
"PreToolUse": [
  {
    "matcher": "Write|Edit",
    "hooks": [
      {
        "type": "command",
        "command": "\"/Users/tarasbannyi/.nvm/versions/node/v22.18.0/bin/node\" \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/gsd-prompt-guard.js",
        "timeout": 5
      }
    ]
  },
  {
    "matcher": "Write|Edit",
    "hooks": [
      {
        "type": "command",
        "command": "\"/Users/tarasbannyi/.nvm/versions/node/v22.18.0/bin/node\" \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/gsd-read-guard.js",
        "timeout": 5
      }
    ]
  }
  // ... add new entry here, same structure
]
```

**New entry to append** (copy exact node path from existing entries):
```json
{
  "matcher": "Write|Edit",
  "hooks": [
    {
      "type": "command",
      "command": "\"/Users/tarasbannyi/.nvm/versions/node/v22.18.0/bin/node\" \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/task-state-guard.js",
      "timeout": 5
    }
  ]
}
```

---

### `.planning/task-schema.yaml` (static schema/config)

**Analog:** `.planning/config.json` — same directory, same purpose (machine-readable project config). No direct YAML analog exists; use the RESEARCH.md code example directly.

**Structure pattern** (from RESEARCH.md, YAML block under "task-schema.yaml Structure"):
```yaml
version: 1
task_id_format: "TASK-\\d{3}"
task_file_pattern: ".planning/work/<epic-name>/TASK-XXX.md"

fields:
  id:
    type: string
    pattern: "TASK-\\d{3}"
    required: true
    example: "TASK-001"
  status:
    type: enum
    values: [readyForDevelop, inProgress, inReview, inTesting, forTeamLeadCheck, done]
    required: true
    initial: readyForDevelop
  # ... all D-14 fields

lifecycle:
  readyForDevelop:
    allowed_next: [inProgress]
  # ... full transition map matching VALID_TRANSITIONS in hook
```

---

### `CLAUDE.md` (rewrite — root constitution)

**Analog:** `ai-platform/CLAUDE.md` (current, lines 1–56)

**Density and format pattern** (lines 1–20 of `ai-platform/CLAUDE.md`):
```markdown
# AI Platform — Backend Monorepo

NestJS microservices monorepo powered by Nx (@nx/nest v22).

## Rules

- All code comments, documentation, and descriptions must be in **English**.

## Project layout

```
├── apps/                       # NestJS microservices
│   ├── api-gateway/
```
```
Pattern to copy: one-line intro, `##` section headers, bullet-point rules, code-fenced tree for structure. No prose paragraphs. No fluff.

**Root CLAUDE.md must include** (per D-01 through D-04):
- Project name header
- `## Repos` section: `ai-platform/` → `ai-platform/CLAUDE.md`, `ai-platform-fe/` → `ai-platform-fe/CLAUDE.md`
- `## Task Files` section: `.planning/work/<epic-name>/TASK-XXX.md`, ID format `TASK-001`
- `## Agent Workflow Entry Points`: `/team-lead:plan` and `/team-lead:execute`
- `## Routing Rules`: load sub-repo CLAUDE.md before editing; no cross-repo edits in one task
- Hard limit: under 200 lines (FOUND-03)
- Must NOT contain: NestJS, React, Kafka, Prisma, or GSD workflow content (D-02, D-03)

---

### `ai-platform/CLAUDE.md` (rewrite — BE isolation-first)

**Analog:** `ai-platform/CLAUDE.md` (current — read before rewriting)

**Format to preserve** (lines 1–56): same `#`, `##` heading density, code-fenced tree blocks, bullet-point conventions. All content in English.

**New content structure** (per D-05, D-06):
```markdown
# ai-platform — Backend (NestJS)

## Path Isolation

You are operating ONLY within `ai-platform/`. Do not read, write, or reference
files outside this directory.

## Allowed Paths

- `ai-platform/apps/**` — NestJS application source
- `ai-platform/libs/**` — Shared NestJS libraries
- `ai-platform/prisma/**` — Prisma schema and migrations
- `ai-platform/docker-compose.yml` — Local infrastructure
- `ai-platform/nx.json`, `ai-platform/tsconfig.base.json`, `ai-platform/package.json`

## Skills

Load `ai-platform/.claude/skills/be-conventions/SKILL.md` before implementing
NestJS features.
```
The existing NestJS conventions (service pattern, key conventions list) move entirely to `be-conventions/SKILL.md`.

---

### `ai-platform-fe/CLAUDE.md` (create — FE isolation-first)

**Analog:** `ai-platform/CLAUDE.md` (new rewritten version — same isolation-first pattern, D-08)

Mirror the exact structure of the rewritten `ai-platform/CLAUDE.md`, substituting:
- Scope: `ai-platform-fe/` only
- Allowed paths: `ai-platform-fe/apps/**`, `ai-platform-fe/libs/**`, `ai-platform-fe/nx.json`, `ai-platform-fe/package.json`
- Skills reference: `ai-platform-fe/.claude/skills/fe-conventions/SKILL.md`

---

### `ai-platform/.claude/skills/be-conventions/SKILL.md` (new skill file)

**Analog:** `ai-platform/.claude/skills/app-structure.md` (lines 1–end)

**Skill file format** (lines 1–10 of `app-structure.md`):
```markdown
# Skill: App Structure

**Purpose:** scaffold a new NestJS app with valid file structure.

## Rules

- All comments, descriptions, and documentation must be in **English**.

## App template

```
```
Pattern: `# Skill: <Name>`, `**Purpose:**` one-liner, `## Rules` bullets, then content sections with code fences. No prose padding.

**Content to include:** All NestJS conventions currently in `ai-platform/CLAUDE.md` (service pattern, monorepo scope `@ai-platform/*`, build/test/lint/commit commands). This is a direct lift-and-restructure from the current `ai-platform/CLAUDE.md` lines 27–56.

---

### `ai-platform-fe/.claude/skills/fe-conventions/SKILL.md` (new skill file)

**Analog:** `ai-platform/.claude/skills/app-structure.md`

Same skill file format as above (see be-conventions pattern). Content: React/FE conventions from the project's CLAUDE.md technology stack section covering:
- Frontend app structure (`apps/shell`, `apps/auth`, `apps/chat`)
- Module Federation pattern (shell host + remote apps)
- `@libs/api`, `@libs/store`, `@libs/ui` import paths
- Vitest/Playwright test commands
- Rspack build commands
- Component naming (PascalCase), hook naming (`use` prefix), file naming conventions

---

### `.claude/commands/team-lead/plan.md` (new slash command)

**Analog:** `.claude/commands/gsd/plan-phase.md` (lines 1–16)

**YAML frontmatter pattern** (lines 1–16 of `plan-phase.md`):
```markdown
---
name: gsd:plan-phase
description: Create detailed phase plan (PLAN.md) with verification loop
argument-hint: "[phase] [--auto] [--research] ..."
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
  - WebFetch
  - mcp__context7__*
requires: [discuss-phase, phase, review, update]
---
```
Copy the `name`/`description`/`argument-hint`/`allowed-tools` frontmatter pattern exactly. Adapt:
- `name: team-lead:plan`
- `description:` one-liner describing TeamLead plan function
- `argument-hint: "<path-to-SPEC.md>"`
- `allowed-tools:` Read, Write, Bash, Glob, Grep (no Agent/AskUserQuestion needed for stub)
- No `requires:` field needed for stub

**Body structure to follow** (from RESEARCH.md TeamLead Stub pattern):
```markdown
## Constraints (MUST READ BEFORE PLANNING)

- **Max task size: ~10 minutes of execution time.** If a task would take longer, split it.
- **Fresh context window per task.** Each task executes in isolation — no state from previous tasks is available.
- **Repo isolation.** Set `repo: be` or `repo: fe` per task. Never `repo: both`.
- **Status on creation: `readyForDevelop`.** The status guard hook will reject any other initial status.

## Usage

[STUB — full implementation in Phase 2]
```

---

### `.claude/commands/team-lead/execute.md` (new slash command)

**Analog:** `.claude/commands/gsd/plan-phase.md` (same frontmatter pattern)

Mirror `.claude/commands/team-lead/plan.md` structure:
- `name: team-lead:execute`
- `description:` one-liner for execute function
- `argument-hint: "<TASK-ID>"`
- Same constraints block (FOUND-06, FOUND-07 must be visible)
- Body: `[STUB — full implementation in Phase 2]`

---

## Shared Patterns

### Hook stdin/stdout/exit contract
**Source:** `.claude/hooks/gsd-workflow-guard.js` lines 17–21 and 89–94
**Apply to:** `task-state-guard.js`
```javascript
let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    // ... logic
  } catch (e) {
    process.exit(0); // Silent fail — never block tool execution
  }
});
```
Rules:
- Always set a 3-second stdin timeout — avoids hangs if Claude Code doesn't close stdin
- Wrap all logic in try/catch with `process.exit(0)` on error — hooks must never block
- Advisory output: `process.stdout.write(JSON.stringify(output))` then implicit fall-through
- Deny output: same stdout write with `permissionDecision: 'deny'`, then `process.exit(0)`
- Never use `process.exit(2)` with JSON output; use `exit(0)` + JSON or `exit(2)` + stderr plain text

### Path filter pattern (early-exit guard)
**Source:** `.claude/hooks/gsd-prompt-guard.js` lines 50–55
**Apply to:** `task-state-guard.js` (first check after tool-name check)
```javascript
const filePath = data.tool_input?.file_path || '';

// Only scan files going into .planning/ (agent context files)
if (!filePath.includes('.planning/') && !filePath.includes('.planning\\')) {
  process.exit(0);
}
```
Adapt: check `filePath.includes('.planning/work/')` AND `filePath.endsWith('.md')`.

### CLAUDE.md density/format
**Source:** `ai-platform/CLAUDE.md` lines 1–56 (entire file)
**Apply to:** Root `CLAUDE.md` (rewrite), `ai-platform/CLAUDE.md` (rewrite), `ai-platform-fe/CLAUDE.md` (create)

Rules extracted from existing file:
- First heading `#` is project/repo name only — no subtitle
- One-line context sentence after heading (no paragraph)
- All sections use `##` — no `###` in CLAUDE.md files
- Rules stated as bullet points with `**bold**` key term
- Code trees use backtick fences, not indented blocks
- No JSDoc, no prose explanations — terse imperative statements only
- All content in English (enforced by `## Rules` bullet in existing file)

### Skill file format
**Source:** `ai-platform/.claude/skills/app-structure.md` lines 1–10
**Apply to:** `be-conventions/SKILL.md`, `fe-conventions/SKILL.md`
```markdown
# Skill: <Name>

**Purpose:** <one-line description of what loading this skill enables>

## Rules

- All comments, descriptions, and documentation must be in **English**.

## <Content Section>
```
Every skill file starts with `# Skill:`, `**Purpose:**` one-liner, `## Rules` with English rule, then content.

### Slash command YAML frontmatter
**Source:** `.claude/commands/gsd/plan-phase.md` lines 1–16
**Apply to:** `team-lead/plan.md`, `team-lead/execute.md`
```yaml
---
name: <namespace>:<command>      # derived from folder/file path
description: <one-line purpose>
argument-hint: "<args>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---
```
Namespace is the folder name; command is the file name (without `.md`). Both are required.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.planning/work/` (directory) | infrastructure | — | Directory creation, no analog needed — will be an empty directory placeholder |

---

## Metadata

**Analog search scope:** `.claude/hooks/`, `.claude/commands/gsd/`, `ai-platform/CLAUDE.md`, `ai-platform/.claude/skills/`, `.claude/settings.json`
**Files scanned:** 7
**Pattern extraction date:** 2026-05-20
