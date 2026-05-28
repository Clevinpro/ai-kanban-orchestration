---
phase: 01-foundation
reviewed: 2026-05-22T10:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - .claude/commands/team-lead/execute.md
  - .claude/commands/team-lead/plan.md
  - .claude/hooks/task-state-guard.js
  - .claude/settings.json
  - ai-platform-fe/.claude/skills/fe-conventions/SKILL.md
  - ai-platform-fe/CLAUDE.md
  - ai-platform/.claude/skills/be-conventions/SKILL.md
  - ai-platform/CLAUDE.md
findings:
  critical: 2
  warning: 4
  info: 2
  total: 8
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-05-22T10:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Eight files were reviewed: two slash-command stubs (`execute.md`, `plan.md`), the core task state-machine hook (`task-state-guard.js`), the hook registry (`settings.json`), two repo-scoped CLAUDE.md context files, and their associated conventions SKILL.md files.

The command stubs and documentation files are structurally consistent with the root CLAUDE.md. The critical defects are concentrated in `task-state-guard.js`: a path-guard bypass via substring matching that treats traversal-crafted paths as task files, and a broken `updated-at` timestamp injection that silently no-ops when the field is absent from a new file. `settings.json` has machine-specific absolute node paths that break portability for all other contributors. The documentation files are internally consistent and well-scoped.

---

## Critical Issues

### CR-01: Path guard bypassable via traversal substring — `.claude/hooks/task-state-guard.js`

**File:** `.claude/hooks/task-state-guard.js:34`

**Issue:** The path filter is `filePath.includes('.planning/work/')` — a substring check. Any path containing `.planning/work/` as a substring satisfies the check regardless of where it actually resolves. An input such as `some/.planning/work/../../other-file.md` passes the guard (the check is true, the file ends with `.md`), so the hook enforces state-machine logic on files outside `.planning/work/`. In the other direction, a normalized path that a caller has run through `path.resolve()` before it reaches this hook may omit the substring and bypass the guard entirely for a legitimate task file.

**Verified:** Running `'.some/.planning/work/../../other-file.md'.includes('.planning/work/')` returns `true` in Node.js.

**Fix:**
```javascript
const WORK_DIR = path.resolve(path.join(__dirname, '../../.planning/work'));
const resolvedPath = path.resolve(filePath);
if (!resolvedPath.startsWith(WORK_DIR + path.sep) || !resolvedPath.endsWith('.md')) {
  process.exit(0);
}
```

---

### CR-02: `updated-at` timestamp injection silently no-ops on new files and corrupts value-embedded occurrences — `.claude/hooks/task-state-guard.js`

**File:** `.claude/hooks/task-state-guard.js:88-96`

**Issue:** Two distinct failure modes in the timestamp injection:

**A) Missing field:** The regex `/(updated-at:\s*)([^\n]+)/` finds zero matches when `updated-at:` is not present in the content. `String.replace()` returns the original string unchanged. The hook still sends `permissionDecision: allow` with `modifiedInput` containing the unmodified content. A new task file created without an `updated-at:` key is written to disk with no timestamp, silently violating the hook's stated contract (line 4: "injects current ISO timestamp into updated-at field via modifiedInput").

**B) First-occurrence greedy match:** The regex is not anchored to line-start. If any field *value* contains the string `updated-at:` (e.g., `title: "last updated-at: old"`), the regex matches there first and replaces the value content, leaving the actual `updated-at:` key stale.

**Verified:** `'---\ntitle: last updated-at: old\nupdated-at: 2026-01-01\n---'.replace(/(updated-at:\s*)([^\n]+)/, '$12026-05-22')` corrupts the title value and leaves the `updated-at` key unchanged.

**Fix:**
```javascript
// Anchor to line start with /m flag to prevent value contamination
let updatedContent = (tool_input.content || '')
  .replace(/^(updated-at:\s*)([^\n]+)/m, `$1${now}`);

// Inject field when absent (new files)
if (!updatedContent.includes('updated-at:')) {
  updatedContent = updatedContent.replace(/^(---\s*\n)([\s\S]*?)(^---)/m,
    `$1$2updated-at: ${now}\n$3`);
}
modifiedInput = { content: updatedContent };

// Same two fixes for the Edit path (line 95):
let updatedNewString = (tool_input.new_string || '')
  .replace(/^(updated-at:\s*)([^\n]+)/m, `$1${now}`);
```

---

## Warnings

### WR-01: Hardcoded absolute developer-machine `node` path in `settings.json` — `.claude/settings.json`

**File:** `.claude/settings.json:7,14,22,33,46,62,67,72,77,97`

**Issue:** Every hook command is hardcoded with `/Users/tarasbannyi/.nvm/versions/node/v22.18.0/bin/node`. This path is specific to one developer's machine and one Node.js version. On any other machine — including all other contributors, CI, and future developer laptops — the node binary will not exist at this path, the hooks will fail to launch, and all guards (state machine, prompt guard, read guard, workflow guard) will silently not execute. The fail-open behavior of hooks means no error is surfaced; enforcement simply stops working.

**Fix:** Replace the absolute path with the portable `node` binary name, relying on PATH resolution:
```json
"command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/task-state-guard.js"
```
Apply this replacement to all nine hook command entries in `settings.json`.

---

### WR-02: `updated-at` injection for Edit tool uses wrong `modifiedInput` key — `.claude/hooks/task-state-guard.js`

**File:** `.claude/hooks/task-state-guard.js:88-96`

**Issue:** The ALLOW path always builds `modifiedInput = { content: updatedContent }`. The `content` key is the Write tool's input field. The Edit tool's writable field is `new_string`, not `content`. As a result, every status transition performed through an Edit call sends back a `modifiedInput` with a key the Edit tool ignores. The timestamp injection is silently discarded for all Edit-based transitions, meaning `updated-at` is never updated when agents use the Edit tool (the typical case for status transitions on existing files).

**Fix:**
```javascript
if (tool_name === 'Write') {
  modifiedInput = { content: updatedContent };
} else {
  // Edit: inject timestamp into new_string, not content
  const updatedNewString = (tool_input.new_string || '')
    .replace(/^(updated-at:\s*)([^\n]+)/m, `$1${now}`);
  modifiedInput = { new_string: updatedNewString };
}
```

---

### WR-03: `execute.md` grants `Agent` tool capability while the command body is an unimplemented stub — `.claude/commands/team-lead/execute.md`

**File:** `.claude/commands/team-lead/execute.md:11,31`

**Issue:** `allowed-tools` includes `Agent`, which grants the capability to spawn sub-agents with arbitrary tool access. The entire implementation body is `[STUB — full implementation in Phase 2]`. Any invocation of `/team-lead:execute` (deliberate or accidental) grants a context that can spawn agents with no behavioral guardrails, no pipeline instructions, and no scoping constraints. The mismatch between a declared capability and an absent implementation creates an unbounded agency risk.

**Fix:** Remove `Agent` from `allowed-tools` until the implementation exists:
```yaml
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  # Agent: added in Phase 2 when pipeline stage implementation is present
```

---

### WR-04: Edit reconstruction `String.replace()` only replaces first occurrence — repo guard and timestamp injection operate on malformed content — `.claude/hooks/task-state-guard.js`

**File:** `.claude/hooks/task-state-guard.js:77`

**Issue:** `finalContent = (diskContent || '').replace(tool_input.old_string || '', tool_input.new_string || '')` uses `String.prototype.replace` with a string argument, which replaces only the first occurrence. If `old_string` appears more than once in the file (e.g., a block of text that is repeated in both frontmatter and body), the reconstructed `finalContent` diverges from what the Edit tool will actually produce. The `repo: both` check (line 80) and `updated-at` injection (line 87-95) then operate on a representation that does not match the final file on disk.

Note: in the common case where `old_string` is unique in the file (as Claude Code requires for Edit), this is harmless. But the hook does not validate uniqueness and silently produces incorrect behavior when it is violated.

**Fix:** Validate that `old_string` occurs exactly once before using the reconstruction, or explicitly slice around the first match:
```javascript
const os = tool_input.old_string || '';
const ns = tool_input.new_string || '';
const idx = (diskContent || '').indexOf(os);
if (idx === -1) {
  // Cannot reconstruct; allow without repo/timestamp check
  process.exit(0);
}
finalContent = diskContent.slice(0, idx) + ns + diskContent.slice(idx + os.length);
```

---

## Info

### IN-01: Fallback `extractFrontmatterField` in Edit status extraction is unreachable dead code — `.claude/hooks/task-state-guard.js`

**File:** `.claude/hooks/task-state-guard.js:43`

**Issue:** The Edit branch extracts `newStatus` as:
```javascript
newStatus = ns.match(/^status:\s*(\S+)/m)?.[1] || extractFrontmatterField(ns, 'status');
```
The `extractFrontmatterField` fallback is never reached in any meaningful case. When `new_string` contains `status: <value>`, the inline `/^status:\s*(\S+)/m` regex matches it. When it does not, `extractFrontmatterField` — which falls back to searching the whole string when no `---` delimiters are present — performs the identical search. The fallback adds no coverage and gives a misleading impression that a distinct code path exists.

**Fix:**
```javascript
newStatus = ns.match(/^status:\s*(\S+)/m)?.[1];
```

---

### IN-02: `be-conventions/SKILL.md` has no environment variable section — `ai-platform/.claude/skills/be-conventions/SKILL.md`

**File:** `ai-platform/.claude/skills/be-conventions/SKILL.md`

**Issue:** `fe-conventions/SKILL.md` documents environment variable naming conventions (`NX_PUBLIC_` prefix, `NX_PUBLIC_API_URL` default). The BE conventions skill has no equivalent section. Backend services have environment dependencies (database URLs, JWT secrets, Kafka broker addresses) but no canonical guidance for agents on naming conventions, required variables per service, or where to find the `.env` template. This asymmetry means BE agents implementing new service features lack the same constraint guardrails that FE agents have.

**Fix:** Add an `## Environment Variables` section to `ai-platform/.claude/skills/be-conventions/SKILL.md` documenting required variables per service, naming conventions, and a reference to `ai-platform/.env*`.

---

_Reviewed: 2026-05-22T10:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
