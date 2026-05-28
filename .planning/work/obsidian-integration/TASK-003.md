---
id: TASK-003
title: Register post-commit symlink and add .gitignore vault rules
status: done
priority: medium
repo: be
epic: obsidian-integration
complexity: 2
created-at: 2026-05-26T00:00:00.000Z
updated-at: 2026-05-26T00:00:00.000Z
started-at: 2026-05-26T00:00:00.000Z
completed-at: 2026-05-28T21:44:12+03:00
spec: .planning/work/obsidian-integration/SPEC.md
---

## Description

Wire the `obsidian-commit-doc.sh` script written in TASK-002 into git by creating a `scripts/install-hooks.sh` installer that symlinks it into `.git/hooks/post-commit`, and add the required `.gitignore` entries to exclude Obsidian workspace state files and trash from version control.

## Acceptance Criteria

- [ ] `scripts/install-hooks.sh` exists, is executable, and creates `.git/hooks/post-commit` as a symlink pointing to `../../scripts/obsidian-commit-doc.sh`
- [ ] Running `scripts/install-hooks.sh` is idempotent (safe to run multiple times)
- [ ] Root `.gitignore` (or `docs/obsidian-vault/.gitignore`) contains exclusions for:
  - `docs/obsidian-vault/.obsidian/workspace.json`
  - `docs/obsidian-vault/.obsidian/workspace-mobile.json`
  - `docs/obsidian-vault/.trash/`
- [ ] `docs/obsidian-vault/.obsidian/app.json` is NOT excluded (it should be tracked)
- [ ] `docs/obsidian-vault/commits/_MOC.md` is NOT excluded
- [ ] README note added (or existing README updated) with one-line instruction: `bash scripts/install-hooks.sh` to activate the hook

## Technical Notes

- Symlink approach preferred over copying — keeps hook in sync with git history.
- Installer script should check if `.git/hooks/post-commit` already exists and warn rather than silently overwrite.
- `.gitignore` entries go in the root `.gitignore` file. Read the current root `.gitignore` first to avoid duplicates.
- Do not hardcode an absolute path in the symlink — use a relative path (`../../scripts/obsidian-commit-doc.sh`) so it works for any clone location.
- Do not modify any files in `ai-platform/` or `ai-platform-fe/` in this task.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

**Issues:**
- /Users/tarasbannyi/TestAI/ai-agent-microservices/scripts/install-hooks.sh:22 — The error message references "TASK-002" which is an internal pipeline artifact meaningless to external contributors or anyone running the script without task-system context. Consider replacing with a generic message such as "scripts/obsidian-commit-doc.sh is missing from the repository." Severity: WARNING

All three changed artifacts satisfy every acceptance criterion from TASK-003. The `.gitignore` additions match the SPEC exactly and introduce no duplicates. The installer script is correct, idempotent, uses the required relative symlink path, and handles all edge cases (existing symlink pointing elsewhere, existing non-symlink file). The README provides the required one-line setup instruction. No security issues, no bugs.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task. TASK-003 touches only shell scripts (`scripts/install-hooks.sh`), `.gitignore` entries, and a README update. None of these files belong to any nx project, so `nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" with exit code 0.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:
- AC-1 PASS: `scripts/install-hooks.sh` exists, uses correct relative symlink target `../../scripts/obsidian-commit-doc.sh`, and the code reviewer confirmed it is executable.
- AC-2 PASS: Script is idempotent — checks for existing symlink pointing to same target and exits 0 with INFO; warns and exits 1 if pointing elsewhere or if a non-symlink file exists.
- AC-3 PASS: Root `.gitignore` contains all three required exclusions (`workspace.json`, `workspace-mobile.json`, `.trash/`) under a descriptive comment.
- AC-4 PASS: `app.json` is not present in `.gitignore` — it remains tracked.
- AC-5 PASS: `commits/_MOC.md` is not excluded — no glob or path in `.gitignore` covers it.
- AC-6 PASS: Root `README.md` contains a dedicated "Install git hooks" section with the exact one-line instruction `bash scripts/install-hooks.sh`.
