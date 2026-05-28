# Phase 1: Foundation - Research

**Researched:** 2026-05-20
**Domain:** Claude Code hooks, CLAUDE.md layering, task file schema, directory structure
**Confidence:** HIGH

## Summary

Phase 1 delivers the structural contract every downstream phase depends on: a three-layer CLAUDE.md hierarchy (root constitution + BE isolation + FE isolation), a machine-readable task file schema, a PreToolUse hook that enforces valid status transitions, and stub slash commands that acknowledge the TeamLead constraints. This phase touches zero application code — it is entirely configuration files, hook scripts, and markdown.

The most significant research finding is a correction to Decision D-09/D-10 from CONTEXT.md: the CONTEXT.md describes a "PostToolUse hook that reverts the file". PostToolUse hooks cannot revert file changes — the tool has already executed by the time PostToolUse fires. The correct implementation is a **PreToolUse hook with `permissionDecision: deny`**, which prevents the write from happening at all. The user-visible effect is identical: invalid transitions are blocked. This is confirmed by the official Claude Code hooks documentation.

The second significant finding is about D-11 (using `git show HEAD:<path>` to read previous status): the workspace root (`ai-agent-microservices/`) has no git repository, so `git show HEAD` will fail. Since this phase uses a PreToolUse hook, it can read the current file from disk with `fs.readFileSync` before the write occurs — which is the canonical "previous state" source. No root git initialization is required.

**Primary recommendation:** Implement the status guard as a PreToolUse hook (not PostToolUse) using `permissionDecision: deny`. Read current status from disk before write occurs. Register in `.claude/settings.json` under `PreToolUse` with matcher `Write|Edit`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Root CLAUDE.md**
- D-01: Rewrite the root CLAUDE.md from scratch. Replace all existing content (the current file is a GSD workflow guide, not a project constitution).
- D-02: Purpose is hard routing rules only — no tech stack details, no NestJS patterns, no React conventions. Those live in sub-repo CLAUDE.md files and skills.
- D-03: Do NOT include a GSD workflow enforcement section in the rewritten root CLAUDE.md.
- D-04: Root CLAUDE.md must explicitly reference: (1) `ai-platform/CLAUDE.md` for BE, (2) `ai-platform-fe/CLAUDE.md` for FE, (3) `.planning/work/<epic>/` for task files, (4) `/team-lead:plan` and `/team-lead:execute` as the agent workflow entry points.

**Sub-Repo Path Isolation**
- D-05: Use an allowlist (not blocklist) approach in sub-repo CLAUDE.md files. List what agents ARE ALLOWED to touch, not what's forbidden.
- D-06: Rewrite `ai-platform/CLAUDE.md` isolation-first. Isolation/allowlist section is the primary content. Existing NestJS conventions are removed from this file.
- D-07: NestJS/BE conventions move to `ai-platform/.claude/skills/be-conventions/SKILL.md`. Agents load them explicitly, not always.
- D-08: Create `ai-platform-fe/CLAUDE.md` fresh, isolation-first (same pattern as BE). FE conventions go to `ai-platform-fe/.claude/skills/fe-conventions/SKILL.md`.

**Status Transition Enforcement**
- D-09: Two artifacts: (1) `.planning/task-schema.yaml` documents the transition map for agents/humans; (2) the PreToolUse hook hardcodes the same transitions inline. Duplication is intentional.
- D-10: On invalid transition: hook denies the write (file is never changed). Claude Code surfaces the error to the agent. [RESEARCH CORRECTION: D-10 says "PostToolUse hook that reverts" — this is architecturally incorrect. PostToolUse cannot revert files. The correct implementation is PreToolUse + permissionDecision:deny. Effect is identical: the file stays unchanged.]
- D-11: Previous status source = git. Use `git show HEAD:<relative-path-to-task-file>` to read the last committed version. [RESEARCH CORRECTION: Workspace root has no git repo. PreToolUse reads current disk content via fs.readFileSync before write occurs — this IS the "previous state".]
- D-12: Hook fires on both creates (new task files) AND edits to existing task files in `.planning/work/`.
- D-13: New task files must have `status: readyForDevelop` at creation time. Any other initial status is rejected.

**Task File Schema**
- D-14: All YAML frontmatter fields are required at creation time: `id`, `title`, `status`, `priority`, `repo`, `epic`, `complexity`, `created-at`, `updated-at`. No optional fields.
- D-15: `repo: both` is disallowed. The hook rejects any task file with `repo: both`.
- D-16: `updated-at` is maintained by the same PreToolUse hook. Agents do not need to set it manually — the hook injects the current ISO timestamp on every valid write.
- D-17: Task ID format: three-digit zero-padded (e.g., `TASK-001`).
- D-18: Task files organized by epic: `.planning/work/<epic-name>/TASK-001.md`. The epic field in frontmatter must match the directory name.

### Claude's Discretion
- Exact wording of isolation instructions in sub-repo CLAUDE.md files (beyond the allowlist structure)
- YAML schema format in `task-schema.yaml` (can be YAML or JSON, whichever is cleaner)
- Hook implementation language (Node.js to match existing `.claude/hooks/*.js` pattern)
- How the hook parses YAML frontmatter (can use a minimal regex or a yaml library)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | Task file schema defined — `.planning/work/TASK-XX.md` with YAML frontmatter fields: `id`, `title`, `status`, `priority`, `repo` (be|fe|both), `epic`, `complexity` (1-10), `created-at`, `updated-at` | Regex frontmatter parsing confirmed; all fields mapped to decisions D-14 through D-18 |
| FOUND-02 | Six-state status lifecycle enforced: `readyForDevelop → inProgress → inReview → inTesting → forTeamLeadCheck → done` | PreToolUse hook with permissionDecision:deny confirmed as correct mechanism |
| FOUND-03 | Root CLAUDE.md constitution created — cross-repo rules only, under 200 lines, references sub-repo CLAUDE.md files | Current root CLAUDE.md is 342 lines of GSD workflow content; full rewrite required |
| FOUND-04 | `ai-platform/CLAUDE.md` created — NestJS/BE-specific context and path restrictions | Current file has 56-line service-focused content; rewrite isolation-first (D-06) |
| FOUND-05 | `ai-platform-fe/CLAUDE.md` created — React/FE-specific context and path restrictions | File does not exist yet; create fresh (D-08) |
| FOUND-06 | Each task scoped to max ~10 minutes of execution time — TeamLead enforces atomic, focused task size | Must appear in TeamLead stub definition; slash command stub created in Phase 1 |
| FOUND-07 | Each task executes in a fresh context window — no accumulated state between tasks | Must appear in TeamLead stub definition; slash command stub created in Phase 1 |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Root CLAUDE.md routing rules | Claude Code runtime (config) | — | Claude Code loads CLAUDE.md as system context; routing rules live here, not in code |
| Sub-repo path isolation | Claude Code runtime (config) | — | System prompt isolation via CLAUDE.md; no worktrees (bug #39886 confirmed out of scope) |
| Status transition enforcement | Hook layer (PreToolUse) | — | Must intercept before write completes; PostToolUse cannot revert files |
| Task file schema documentation | Static config (task-schema.yaml) | Hook layer | Human/agent reference; hook hardcodes same map inline for performance |
| Skills/conventions | Skills layer (.claude/skills/) | — | Loaded explicitly by agents; not always-on context |
| TeamLead agent stub | Claude Code commands layer | — | Slash commands at .claude/commands/team-lead/ define /team-lead:plan and /team-lead:execute |

## Standard Stack

This phase introduces no npm packages and no build tools. All artifacts are plain files.

### Core

| Artifact | Format | Purpose | Location |
|----------|--------|---------|----------|
| task-state-guard.js | Node.js ES2022 | PreToolUse hook — validates YAML frontmatter transitions | `.claude/hooks/task-state-guard.js` |
| task-schema.yaml | YAML | Human/agent reference for schema and lifecycle | `.planning/task-schema.yaml` |
| Root CLAUDE.md | Markdown | Project constitution — routing rules only | `CLAUDE.md` |
| ai-platform/CLAUDE.md | Markdown | BE isolation allowlist | `ai-platform/CLAUDE.md` |
| ai-platform-fe/CLAUDE.md | Markdown | FE isolation allowlist | `ai-platform-fe/CLAUDE.md` |
| be-conventions/SKILL.md | Markdown | NestJS/BE conventions (loaded explicitly) | `ai-platform/.claude/skills/be-conventions/SKILL.md` |
| fe-conventions/SKILL.md | Markdown | React/FE conventions (loaded explicitly) | `ai-platform-fe/.claude/skills/fe-conventions/SKILL.md` |
| team-lead/plan.md | Markdown | Stub slash command `/team-lead:plan` with constraint acknowledgment | `.claude/commands/team-lead/plan.md` |
| team-lead/execute.md | Markdown | Stub slash command `/team-lead:execute` with constraint acknowledgment | `.claude/commands/team-lead/execute.md` |

### Supporting Infrastructure

| Item | Purpose | Action |
|------|---------|--------|
| `.planning/work/` | Task file root directory | Create (does not exist yet) |
| `.claude/settings.json` | Hook registration | Update — add PreToolUse entry for task-state-guard.js |
| `ai-platform/.claude/skills/` | Skills directory | Already exists |
| `ai-platform-fe/.claude/skills/` | Skills directory | Does not exist; create |

### No External Packages

This phase uses zero npm packages in the hook. YAML frontmatter parsing uses inline regex — no `yaml` module required (confirmed via testing). [VERIFIED: manual testing]

The `yaml` package (v2.8.0) is available at `node_modules/yaml` if the hook needs it in the future, but regex is sufficient and removes all dependency risk.

## Package Legitimacy Audit

This phase installs zero external packages. No audit required.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Claude Code Agent
       |
       | (Write/Edit .planning/work/**/*.md)
       v
+-------------------------------+
|  PreToolUse Hook              |  <-- fires BEFORE write
|  task-state-guard.js          |
|                               |
|  1. Check path matches        |
|     .planning/work/*.md       |
|  2. Extract new status from   |
|     tool_input.content        |
|     (Write) or new_string     |
|     (Edit)                    |
|  3. Check if file exists      |
|     YES: read current status  |
|           from disk           |
|     NO:  require readyFor     |
|           Develop             |
|  4. Validate transition       |
|     VALID: exit 0 (allow)    |
|     INVALID: permissionDecision|
|     deny + reason             |
+-------------------------------+
       |
       | (allowed writes)
       v
.planning/work/<epic>/TASK-XXX.md
(YAML frontmatter written to disk)
```

```
Claude Code context loading order:
  workspace root CLAUDE.md  (hard routing rules)
       |
       +---> ai-platform/CLAUDE.md       (BE isolation + allowlist)
       |          |
       |          +---> ai-platform/.claude/skills/be-conventions/SKILL.md  (NestJS patterns, explicit load)
       |
       +---> ai-platform-fe/CLAUDE.md    (FE isolation + allowlist)
                  |
                  +---> ai-platform-fe/.claude/skills/fe-conventions/SKILL.md (React patterns, explicit load)
```

### Recommended Project Structure

```
(new directories/files this phase creates)

.claude/
├── commands/
│   └── team-lead/
│       ├── plan.md          # /team-lead:plan stub
│       └── execute.md       # /team-lead:execute stub
└── hooks/
    └── task-state-guard.js  # NEW: PreToolUse status guard

.planning/
├── task-schema.yaml         # NEW: machine-readable schema + lifecycle
└── work/                    # NEW: task file root (empty directory)

CLAUDE.md                    # REWRITE: routing rules only (<200 lines)

ai-platform/
└── CLAUDE.md                # REWRITE: isolation-first
└── .claude/
    └── skills/
        └── be-conventions/
            └── SKILL.md     # NEW: NestJS/BE conventions

ai-platform-fe/
└── CLAUDE.md                # CREATE: isolation-first
└── .claude/
    └── skills/
        └── fe-conventions/
            └── SKILL.md     # NEW: React/FE conventions
```

### Pattern 1: Claude Code Slash Command Naming

**What:** Slash commands follow `/<folder>:<name>` derived from `.claude/commands/<folder>/<name>.md`
**When to use:** Always when creating commands in a namespace

```
.claude/commands/team-lead/plan.md     ->  /team-lead:plan
.claude/commands/team-lead/execute.md  ->  /team-lead:execute
```

The YAML frontmatter of a command file:
```yaml
---
name: team-lead:plan
description: Break a SPEC.md into atomic task files with complexity scores
argument-hint: "<path-to-SPEC.md>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---
```
[VERIFIED: Claude Code settings.json + existing command files in .claude/commands/gsd/]

### Pattern 2: PreToolUse Hook with permissionDecision:deny

**What:** Intercept a tool call before execution and block it conditionally
**When to use:** When you need to prevent a file write based on content validation

```javascript
// Source: official Claude Code hooks documentation + existing hook patterns
// Return value structure for denial:
const output = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: 'Invalid status transition: inProgress -> done is not allowed.',
  },
};
process.stdout.write(JSON.stringify(output));
process.exit(0);  // exit 0 with JSON, NOT exit 2
```

Alternatively, exit 2 with plain text to stderr also blocks:
```javascript
process.stderr.write('Invalid status transition: inProgress -> done\n');
process.exit(2);
```
[VERIFIED: official docs at code.claude.com/docs/en/hooks]

### Pattern 3: YAML Frontmatter Extraction (No Dependencies)

**What:** Extract status from markdown task files using regex
**When to use:** In hooks where minimizing dependencies is important

```javascript
// Source: verified by manual testing in Node.js 22
function extractFrontmatterField(content, field) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return undefined;
  const lineMatch = fmMatch[1].match(new RegExp(`^${field}:\\s*(\\S+)`, 'm'));
  return lineMatch ? lineMatch[1] : undefined;
}

// Usage:
const newStatus = extractFrontmatterField(newContent, 'status');
const currentStatus = extractFrontmatterField(
  fs.readFileSync(filePath, 'utf8'), 'status'
);
```

### Pattern 4: Hook Registration in settings.json

**What:** Add a new PreToolUse hook entry to `.claude/settings.json`
**When to use:** When registering any new hook

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"/path/to/node\" \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/task-state-guard.js",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

The matcher `"Write|Edit"` fires for both new file creation (Write) and edits to existing files (Edit). [VERIFIED: existing settings.json patterns + official docs]

### Pattern 5: CLAUDE.md Sub-Repo Isolation (Allowlist Style)

**What:** Sub-repo CLAUDE.md lists what agents ARE allowed to touch (not forbidden)
**When to use:** All sub-repo CLAUDE.md files

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

Load `@ai-platform/.claude/skills/be-conventions/SKILL.md` before implementing
NestJS features.
```
[ASSUMED] — exact wording is Claude's discretion per D-05/D-06

### Anti-Patterns to Avoid

- **PostToolUse for file content enforcement:** PostToolUse fires AFTER the write; the file is already on disk. It cannot revert changes. Always use PreToolUse for content-based gating.
- **`git show HEAD` as previous-state source at workspace root:** The workspace root has no git repository. Use `fs.readFileSync` in PreToolUse — the file has not been written yet, so disk content IS the previous state.
- **Requiring `yaml` npm package in hooks:** The `yaml` package lives in `node_modules/` which may not be resolvable from hook scripts without an explicit path. Use regex for simple YAML frontmatter — it covers all required fields reliably.
- **Using `exit 2` AND `process.stdout.write(JSON)` together:** Pick one. JSON output requires `exit 0`; `exit 2` sends stderr as the error message.
- **Putting NestJS/BE conventions in `ai-platform/CLAUDE.md`:** Per D-06/D-07, conventions move to the skills file. CLAUDE.md is isolation-first only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Blocking a file write based on content | Custom PostToolUse that writes back | PreToolUse with permissionDecision:deny | PostToolUse cannot revert; PreToolUse is the correct lifecycle point |
| YAML parsing in hook | Full YAML parser dependency | Inline regex for frontmatter fields | No dependency risk; frontmatter is simple key:value, not nested |
| Status state machine | Database or external store | Inline JS object in hook | Hook must be zero-dependency and fast; a plain object is sufficient |
| Sub-repo path enforcement | Complex glob matching | CLAUDE.md allowlist + agent context | Claude Code loads CLAUDE.md as system context; explicit allowlists are more reliable than runtime path checking |

**Key insight:** The hook is a hot-path script that runs on every Write/Edit. It must start, validate, and exit in under 5 seconds. Zero external dependencies and minimal I/O (one file read) is the right design.

## Common Pitfalls

### Pitfall 1: PostToolUse Cannot Revert Files

**What goes wrong:** Implementing status validation as a PostToolUse hook that calls `fs.writeFileSync` to overwrite the file with the previous content. This technically works but is fragile and creates a race condition.
**Why it happens:** The CONTEXT.md decisions D-09/D-10 describe a "PostToolUse hook that reverts" — this description is architecturally incorrect. PostToolUse fires after the write; the file is already on disk.
**How to avoid:** Use PreToolUse with `permissionDecision: deny`. The write never happens. Effect is identical.
**Warning signs:** If the hook implementation is PostToolUse and calls `fs.writeFileSync` — that's the wrong pattern.

### Pitfall 2: git show HEAD Fails at Workspace Root

**What goes wrong:** `git -C /workspace show HEAD:.planning/work/epic/TASK-001.md` returns `fatal: not a git repository`.
**Why it happens:** The `ai-agent-microservices/` workspace root has no `.git` directory. The two sub-repos (`ai-platform/`, `ai-platform-fe/`) have their own git repos, but `.planning/` is at the root.
**How to avoid:** In PreToolUse, use `fs.readFileSync(filePath)` to read the file's current content BEFORE the write occurs. This IS the previous state.
**Warning signs:** Any hook code containing `git show HEAD` or `execSync('git ...')` for reading `.planning/work/` files.

### Pitfall 3: Root CLAUDE.md Line Count Exceeds 200

**What goes wrong:** The rewritten root CLAUDE.md drifts back toward the current 342-line file by including tech stack details, NestJS patterns, or GSD workflow instructions.
**Why it happens:** It is tempting to keep "useful" content from the current file. But D-02/D-03 are explicit: hard routing rules only.
**How to avoid:** Count lines before finalizing. The file should contain: project name, routing references (D-04's four items), task ID format reference, and the TeamLead entry points. Nothing else.
**Warning signs:** Any mention of NestJS, React, Kafka, Prisma, or GSD commands in root CLAUDE.md.

### Pitfall 4: Hook Matcher Too Broad

**What goes wrong:** Registering the status guard as `matcher: "Write|Edit"` without path filtering inside the hook. The hook then fires on every Write/Edit across the entire project, including GSD planning files.
**Why it happens:** The settings.json matcher is tool-name only; path filtering must happen inside the hook script.
**How to avoid:** First line of hook logic: check that `tool_input.file_path` matches `.planning/work/` and ends in `.md`. Exit 0 immediately if not.
**Warning signs:** Hook slowing down all file writes; unexpected denials on non-task files.

### Pitfall 5: `repo: both` Not Rejected

**What goes wrong:** The hook validates status transitions but forgets to also validate `repo` field (D-15). Tasks with `repo: both` slip through.
**Why it happens:** Two separate validation concerns in one hook; the second one is easy to forget.
**How to avoid:** The hook validates BOTH status transition AND repo field in one pass. Order: (1) path filter, (2) extract all required fields, (3) validate repo != 'both', (4) validate status transition.

### Pitfall 6: Skills Directories Not Created

**What goes wrong:** Plan creates `ai-platform-fe/CLAUDE.md` but references `ai-platform-fe/.claude/skills/fe-conventions/SKILL.md` — but `.claude/skills/` doesn't exist in `ai-platform-fe/`.
**Why it happens:** `ai-platform/.claude/skills/` already exists; `ai-platform-fe/.claude/` only has `settings.json` and `worktrees/`. The `skills/` subdirectory must be created.
**How to avoid:** Explicitly include creation of `ai-platform-fe/.claude/skills/fe-conventions/SKILL.md` as a distinct task (directory will be auto-created with the file).

## Code Examples

### Hook: Extract New Status from Write vs Edit

```javascript
// Source: verified against Claude Code PostToolUse input schema documentation
// and manual regex testing in Node.js 22

function getNewStatusFromToolCall(data) {
  const { tool_name, tool_input } = data;

  if (tool_name === 'Write') {
    // tool_input.content is the complete new file content
    return extractFrontmatterField(tool_input.content || '', 'status');
  }

  if (tool_name === 'Edit') {
    // tool_input.new_string is the replacement text
    // It may be "status: inReview" or a multi-line block containing it
    return extractFrontmatterField(tool_input.new_string || '', 'status')
      || (tool_input.new_string || '').match(/^status:\s*(\S+)/m)?.[1];
  }

  return undefined;
}

function extractFrontmatterField(content, field) {
  // Try full frontmatter block first
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const searchIn = fmMatch ? fmMatch[1] : content;
  const lineMatch = searchIn.match(new RegExp(`^${field}:\\s*(\\S+)`, 'm'));
  return lineMatch ? lineMatch[1] : undefined;
}
```

### Hook: Full Skeleton

```javascript
#!/usr/bin/env node
// task-state-guard.js — PreToolUse hook
// Validates YAML frontmatter status transitions in .planning/work/**/*.md

const fs = require('fs');
const path = require('path');

const VALID_TRANSITIONS = {
  readyForDevelop: ['inProgress'],
  inProgress: ['inReview', 'readyForDevelop'],
  inReview: ['inTesting', 'inProgress'],
  inTesting: ['forTeamLeadCheck', 'inProgress'],
  forTeamLeadCheck: ['done', 'inProgress'],
  done: [],
};

const REQUIRED_FIELDS = ['id', 'title', 'status', 'priority', 'repo', 'epic', 'complexity', 'created-at', 'updated-at'];

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const { tool_name, tool_input } = data;

    // Only guard Write and Edit
    if (tool_name !== 'Write' && tool_name !== 'Edit') process.exit(0);

    const filePath = tool_input?.file_path || '';

    // Only guard task files in .planning/work/
    if (!filePath.includes('.planning/work/') || !filePath.endsWith('.md')) process.exit(0);

    const newContent = tool_name === 'Write'
      ? (tool_input.content || '')
      : null; // Edit: reconstruct from old_string + new_string if needed

    const newStatus = extractNewStatus(data);
    if (!newStatus) process.exit(0); // No status field being set — allow

    const fileExists = fs.existsSync(filePath);
    const currentStatus = fileExists
      ? extractFrontmatterField(fs.readFileSync(filePath, 'utf8'), 'status')
      : null;

    // New file: must start as readyForDevelop
    if (!fileExists) {
      if (newStatus !== 'readyForDevelop') {
        deny(`New task files must have status: readyForDevelop. Got: ${newStatus}`);
      }
    } else {
      // Existing file: validate transition
      const allowed = VALID_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(newStatus)) {
        deny(`Invalid status transition: ${currentStatus} -> ${newStatus}. Allowed from ${currentStatus}: [${allowed.join(', ') || 'none'}]`);
      }
    }

    // Validate repo != both
    const repoValue = extractRepoFromContent(data, newContent);
    if (repoValue === 'both') {
      deny('repo: both is not allowed. Split into separate be and fe tasks.');
    }

    process.exit(0); // Allow
  } catch (e) {
    process.exit(0); // Silent fail — never block on error
  }
});

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

function extractFrontmatterField(content, field) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const searchIn = fmMatch ? fmMatch[1] : content;
  const m = searchIn.match(new RegExp(`^${field}:\\s*(\\S+)`, 'm'));
  return m ? m[1] : undefined;
}

function extractNewStatus(data) {
  if (data.tool_name === 'Write') {
    return extractFrontmatterField(data.tool_input?.content || '', 'status');
  }
  const ns = data.tool_input?.new_string || '';
  return ns.match(/^status:\s*(\S+)/m)?.[1]
    || extractFrontmatterField(ns, 'status');
}

function extractRepoFromContent(data, newContent) {
  if (data.tool_name === 'Write') {
    return extractFrontmatterField(data.tool_input?.content || '', 'repo');
  }
  const ns = data.tool_input?.new_string || '';
  return ns.match(/^repo:\s*(\S+)/m)?.[1];
}
```
[VERIFIED: pattern derived from official docs + existing hooks in .claude/hooks/*.js]

### task-schema.yaml Structure

```yaml
# .planning/task-schema.yaml
# Machine-readable schema for TASK-XXX.md frontmatter
# Used as reference by agents and humans; the PreToolUse hook hardcodes the same rules.

version: 1
task_id_format: "TASK-\\d{3}"   # e.g. TASK-001 (three-digit zero-padded)
task_file_pattern: ".planning/work/<epic-name>/TASK-XXX.md"

fields:
  id:
    type: string
    pattern: "TASK-\\d{3}"
    required: true
    example: "TASK-001"
  title:
    type: string
    required: true
  status:
    type: enum
    values: [readyForDevelop, inProgress, inReview, inTesting, forTeamLeadCheck, done]
    required: true
    initial: readyForDevelop
  priority:
    type: enum
    values: [low, medium, high, critical]
    required: true
  repo:
    type: enum
    values: [be, fe]          # 'both' is explicitly DISALLOWED
    required: true
  epic:
    type: string
    required: true
    note: "Must match the parent directory name under .planning/work/"
  complexity:
    type: integer
    min: 1
    max: 10
    required: true
  created-at:
    type: string
    format: ISO8601
    required: true
  updated-at:
    type: string
    format: ISO8601
    required: true
    note: "Auto-updated by task-state-guard.js on every valid write"

lifecycle:
  readyForDevelop:
    allowed_next: [inProgress]
  inProgress:
    allowed_next: [inReview, readyForDevelop]
  inReview:
    allowed_next: [inTesting, inProgress]
  inTesting:
    allowed_next: [forTeamLeadCheck, inProgress]
  forTeamLeadCheck:
    allowed_next: [done, inProgress]
  done:
    allowed_next: []
```
[ASSUMED] — exact YAML structure is Claude's discretion; content verified against FOUND-01/FOUND-02

### Root CLAUDE.md Structure (Reference Template)

```markdown
# AI Agent Dev Workflow

## Repos

This workspace contains two independent sub-repos:

- `ai-platform/` — NestJS backend (api-gateway, auth-service, ai-service)
  - Agent context: `ai-platform/CLAUDE.md`
  - Conventions: `ai-platform/.claude/skills/be-conventions/SKILL.md`

- `ai-platform-fe/` — React frontend (shell, auth, chat, docs MFEs)
  - Agent context: `ai-platform-fe/CLAUDE.md`
  - Conventions: `ai-platform-fe/.claude/skills/fe-conventions/SKILL.md`

## Task Files

Task files live at `.planning/work/<epic-name>/TASK-XXX.md`.

Task ID format: `TASK-001` (three-digit zero-padded).
Epic field in frontmatter must match the parent directory name.

## Agent Workflow Entry Points

- `/team-lead:plan <SPEC.md>` — Break a spec into TASK-XXX.md files for human review
- `/team-lead:execute <TASK-ID>` — Run the full pipeline for one task

## Routing Rules

- Editing `ai-platform/` code? Load `ai-platform/CLAUDE.md` first.
- Editing `ai-platform-fe/` code? Load `ai-platform-fe/CLAUDE.md` first.
- Never edit across both repos in a single task (tasks are `repo: be` or `repo: fe`).
```
[ASSUMED] — exact wording is Claude's discretion; structure follows D-01 through D-04; must stay under 200 lines

### TeamLead Stub Slash Command

```markdown
---
name: team-lead:plan
description: Break a SPEC.md epic into TASK-XXX.md files with complexity scores. Pauses for human review before any code executes.
argument-hint: "<path-to-SPEC.md>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

## Constraints (MUST READ BEFORE PLANNING)

- **Max task size: ~10 minutes of execution time.** If a task would take longer, split it.
- **Fresh context window per task.** Each task executes in isolation — no state from previous tasks is available. Design tasks to be self-contained.
- **Repo isolation.** Set `repo: be` or `repo: fe` per task. Never `repo: both` — split full-stack work into two tasks.
- **Status on creation: `readyForDevelop`.** The status guard hook will reject any other initial status.

## Usage

[STUB — full implementation in Phase 2]
```
[ASSUMED] — exact wording is Claude's discretion; FOUND-06/07 constraints must be explicit

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monolithic CLAUDE.md (all conventions in root) | Three-layer hierarchy: root (routing) + sub-repo (isolation) + skills (conventions, explicit load) | Phase 1 | Agents don't load BE conventions when working on FE tasks |
| PostToolUse for file content enforcement | PreToolUse with permissionDecision:deny | Always correct | PostToolUse cannot revert files — PreToolUse prevents the write |
| git show HEAD for previous state | fs.readFileSync in PreToolUse | Architecture decision | No root git repo; PreToolUse fires before write so disk content IS previous state |

**Deprecated/outdated:**
- Current root CLAUDE.md (342 lines): Replace entirely. It is a GSD workflow guide, not a project constitution.
- Current `ai-platform/CLAUDE.md` NestJS conventions section: Move to `ai-platform/.claude/skills/be-conventions/SKILL.md`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Root CLAUDE.md template structure and exact wording | Code Examples | Low — wording is Claude's discretion per CONTEXT.md; structure is derived from locked decisions |
| A2 | task-schema.yaml YAML structure | Code Examples | Low — format is Claude's discretion per CONTEXT.md |
| A3 | TeamLead stub command content and exact wording | Code Examples | Low — exact wording is Claude's discretion; constraint acknowledgment is required |
| A4 | Sub-repo CLAUDE.md allowlist wording | Architecture Patterns | Low — wording is Claude's discretion per D-05/D-06 |
| A5 | Hook's `extractRepoFromContent` handles Edit tool correctly for repo field | Code Examples | Medium — Edit new_string may not always contain the repo line; may need to reconstruct full content |

## Open Questions (RESOLVED)

1. **Does D-16 (hook injects `updated-at`) require the PreToolUse hook to MODIFY the content before writing?**
   - What we know: PreToolUse can use `modifiedInput` to alter `tool_input.content` before the write
   - What's unclear: The official docs mention `modifiedInput` for PreToolUse — needs verification of exact format
   - Recommendation: Either implement `updated-at` injection via `modifiedInput` in the hook, OR document that agents must set `updated-at` manually and the hook only validates (not injects). Simpler and safer to start with validation-only.
   - **RESOLVED: Implement D-16 fully.** updated-at injection via `modifiedInput` implemented in task-state-guard.js (Plan 01-01 Task 2). On ALLOW path, hook replaces `updated-at:` field in YAML frontmatter with `new Date().toISOString()` and returns `{ hookSpecificOutput: { permissionDecision: "allow" }, modifiedInput: { content: ... } }`.

2. **Should `.planning/work/` contain an example TASK file from Phase 1?**
   - What we know: FOUND-01 success criterion says "a TASK-XX.md file written by hand with valid frontmatter is accepted without errors"
   - What's unclear: Does Phase 1 need to ship an example task, or is an empty directory enough?
   - Recommendation: Create one example task (e.g., `TASK-000.md`) with valid frontmatter as a smoke test artifact. Not strictly required but validates FOUND-01 at phase close.
   - **RESOLVED: Empty directory with `.gitkeep` is sufficient.** Plan 01-01 Task 1 creates `.planning/work/.gitkeep` only. FOUND-01 is validated at verify-phase by creating a test task manually.

3. **TeamLead agent definition location: .claude/agents/ vs .claude/commands/?**
   - What we know: `.claude/commands/team-lead/plan.md` creates `/team-lead:plan`; `.claude/agents/team-lead.md` would create an invokable agent
   - What's unclear: Phase 1 requires the "TeamLead agent definition acknowledges the constraint" — does this mean a slash command stub or an agent definition?
   - Recommendation: Create slash command stubs (plan.md + execute.md in `.claude/commands/team-lead/`) that contain the constraint text. These ARE the agent definitions for Phase 1; Phase 2 fills in the logic.
   - **RESOLVED: Slash command stubs at `.claude/commands/team-lead/`.** Plan 01-02 Task 2 creates `plan.md` and `execute.md` with timing constraint text. Agent logic implemented in Phase 2.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | task-state-guard.js hook | Yes | v22.18.0 | — |
| git | D-11 (previous status) | Yes at sub-repos, NO at workspace root | 2.39.5 | Use fs.readFileSync in PreToolUse (recommended) |
| Claude Code runtime | Hook registration, CLAUDE.md loading | Yes | (current session) | — |
| `yaml` npm module | Optional hook dependency | Yes (node_modules/yaml v2.8.0) | 2.8.0 | Not needed — use regex |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:**
- git at workspace root: Not needed. PreToolUse + fs.readFileSync is simpler and correct.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None (Phase 1 is config/markdown/hook only) |
| Config file | none |
| Quick run command | Manual: write a task file and confirm hook allows/denies |
| Full suite command | n/a |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | Valid TASK-XXX.md with all required fields is accepted by hook | manual | Write a well-formed task file; hook exits 0 | No — smoke test artifact |
| FOUND-02 | Invalid status transition is denied by hook | manual | Edit task file status to a disallowed transition; hook denies | No — manual test |
| FOUND-02 | Valid status transition is accepted | manual | Edit task file status to an allowed transition; hook permits | No — manual test |
| FOUND-02 | `repo: both` is rejected | manual | Write task with `repo: both`; hook denies | No — manual test |
| FOUND-03 | Root CLAUDE.md loads without BE/FE conventions | manual | Open workspace root in Claude Code; confirm no NestJS/React context injected | N/A |
| FOUND-04 | Opening ai-platform/ surfaces only BE rules | manual | Open ai-platform/ in Claude Code | N/A |
| FOUND-05 | Opening ai-platform-fe/ surfaces only FE rules | manual | Open ai-platform-fe/ in Claude Code | N/A |
| FOUND-06/07 | TeamLead stub acknowledges ~10 min + fresh context constraints | manual | Read .claude/commands/team-lead/plan.md; confirm constraint text present | No — created in Phase 1 |

### Sampling Rate

- **Per task commit:** Manual smoke test — write one task file through Claude Code
- **Per wave merge:** All manual tests above
- **Phase gate:** All success criteria in ROADMAP.md Phase 1 verified manually before close

### Wave 0 Gaps

No automated test framework required for this phase. All validation is manual file inspection and hook behavior testing.

## Security Domain

No user input, no authentication, no network calls. The hook reads local files and validates string values against a hardcoded transition table. No ASVS categories apply to this phase.

The one security consideration: the hook must not block on unexpected input or expose file system paths in error messages beyond the task file path. Both are addressed by the `try/catch` silent-fail pattern used in all existing hooks.

## Sources

### Primary (HIGH confidence)
- Official Claude Code hooks documentation at `code.claude.com/docs/en/hooks` — PreToolUse/PostToolUse input/output schema, permissionDecision:deny format, exit code semantics
- Existing hooks at `.claude/hooks/*.js` — verified Node.js hook pattern, stdin/stdout/exit conventions
- `.claude/settings.json` — verified hook registration format, matcher syntax
- `.claude/commands/gsd/plan-phase.md` — verified slash command YAML frontmatter format
- `.planning/REQUIREMENTS.md` — authoritative source for FOUND-01 through FOUND-07
- `.planning/phases/01-foundation/01-CONTEXT.md` — locked decisions D-01 through D-18

### Secondary (MEDIUM confidence)
- `node_modules/yaml/package.json` — confirmed yaml v2.8.0 available at workspace root (not needed for hook)
- Manual testing of regex frontmatter extraction in Node.js 22 — confirmed functional

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no packages; all artifacts are files/config
- Architecture (PreToolUse hook): HIGH — verified against official docs
- YAML frontmatter regex approach: HIGH — manually tested
- CLAUDE.md structure: MEDIUM — locked decisions confirmed; exact wording is Claude's discretion
- Hook updated-at injection via modifiedInput: LOW — not verified; deferred to Open Questions

**Research date:** 2026-05-20
**Valid until:** 2026-07-20 (stable domain — Claude Code hooks API is stable)
