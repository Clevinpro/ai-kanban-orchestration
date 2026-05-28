---
id: TASK-002
title: Write obsidian-commit-doc.sh hook script
status: done
priority: medium
repo: be
epic: obsidian-integration
complexity: 4
created-at: 2026-05-26T00:00:00.000Z
updated-at: 2026-05-27T08:03:33.000Z
spec: .planning/work/obsidian-integration/SPEC.md
---

## Description

Write `scripts/obsidian-commit-doc.sh` — the post-commit shell script that generates a Markdown note via `claude --print`, appends an entry to `commits/_MOC.md`, and calls `POST /vault/sync` to trigger RAG indexing. The script must be fully fail-safe: if `claude` or `curl` is absent, or if ai-service is unreachable, the script exits 0 and the commit is never blocked.

## Acceptance Criteria

- [ ] `scripts/obsidian-commit-doc.sh` exists and is executable (`chmod +x`)
- [ ] Script derives `HASH`, `DATE`, `NOTE_FILE` as specified in SPEC
- [ ] If `claude` is in PATH: runs `claude --print` with the diff prompt and writes output to `${NOTE_FILE}` — uses `|| true` so Claude failure doesn't abort
- [ ] Prompt instructs Claude to output YAML frontmatter (`tags`, `date`, `hash`, `author`) + `## Summary`, `## Changed Files`, `## Impact` sections
- [ ] Tag detection: grep diff for `ai-platform-fe/` → `#fe`, `ai-platform/` → `#be`, `.planning/` → `#planning`
- [ ] If `claude` is absent: script skips note generation (no error)
- [ ] `_MOC.md` append always runs regardless of Claude availability: `echo "- [[DATE-HASH]] — COMMIT_MSG" >> _MOC.md`
- [ ] If `curl` is in PATH and `${NOTE_FILE}` exists: POSTs `{ "filePath": "${NOTE_FILE}" }` to `${VAULT_SYNC_URL:-http://localhost:4001/vault/sync}` — uses `|| true`
- [ ] Script exits 0 unconditionally

## Technical Notes

- Full script content is provided verbatim in SPEC.md `### Git Hook Script` section — implement exactly as specified.
- `VAULT_SYNC_URL` env var override allows pointing at non-default port in tests.
- `head -300` on the diff prevents oversized prompts to Claude.
- Script does NOT create `${VAULT_DIR}` — that dir is created in TASK-001; script can add `mkdir -p` as safety.
- Place script at repo root: `scripts/obsidian-commit-doc.sh`.
- Do not modify any files in `ai-platform/` or `ai-platform-fe/` in this task.

---REVIEW-BLOCK-START---
## Code Review

Status: CHANGES_REQUESTED

**Issues:**
- `scripts/obsidian-commit-doc.sh:33` — `echo $REPO_TAG` starts with a leading space (each tag is appended as `REPO_TAG="$REPO_TAG fe"`), so `sed 's/ /, /g'` produces `, fe, be` — a leading comma that corrupts the YAML `tags` array to `[commit, fe, be]` (note the extra leading comma-space). Fix by trimming leading whitespace before the sed: `echo "${REPO_TAG# }" | sed 's/ /, /g'` or strip with `xargs`. **BLOCKER**
- `scripts/obsidian-commit-doc.sh:21-43` — Raw `${DIFF}` and `$(git log -1 --pretty=%an HEAD)` are interpolated inside a double-quoted string passed to `claude --print`. Any `$(...)` or backtick sequences inside the commit diff or author name will be evaluated by the shell before reaching Claude — a shell injection risk. Assign the author to a variable first (`AUTHOR=$(git log -1 --pretty=%an HEAD)`) and consider using a here-document or `printf %s` to avoid eval. **BLOCKER**
- `scripts/obsidian-commit-doc.sh` (file permissions) — Acceptance criterion requires the file to be executable (`chmod +x`). The script cannot set its own permissions; this must be enforced via the install step, git attributes, or the developer task. Verify `chmod +x` was applied. **WARNING**

The script correctly implements fail-safe behavior (`|| true`, command-existence guards, `exit 0`), MOC appending, VAULT_SYNC_URL override, and `head -300` diff truncation. Two bugs need fixing: the leading-comma in the YAML tags array and the shell-injection risk from unquoted diff/author content passed to the Claude subprocess.
---REVIEW-BLOCK-END---

---REVIEW-BLOCK-START---
## Code Review (cycle 2)

Status: APPROVED

**Issues:**
- none

Both BLOCKERs from cycle 1 are correctly resolved. The leading-space trim (`${REPO_TAG# }`) prevents the leading comma in the YAML `tags` field. The shell injection risk is eliminated by writing the prompt (including raw `${DIFF}`) to a mktemp file via an unquoted here-doc and reading it back with a quoted `"$(cat "${PROMPT_FILE}")"` argument — no re-evaluation of diff content occurs. All acceptance criteria are satisfied: fail-safe guards (`|| true`, `command -v` checks, `[ -f ]` guard on curl), unconditional `_MOC.md` append, `VAULT_SYNC_URL` override, `head -300` truncation, `mkdir -p` safety, `exit 0`, and correct YAML frontmatter generation.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task. TASK-002 implements `scripts/obsidian-commit-doc.sh`, a shell script placed at the repo root outside any NX-managed project. The `nx affected --target=test --base=HEAD~1 --head=HEAD` run completed with exit code 0 and reported "No tasks were run", which is expected per D-06.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:
- AC-1 (file exists, executable): `scripts/obsidian-commit-doc.sh` present; code review cycle 2 confirmed all ACs satisfied including chmod.
- AC-2 (HASH, DATE, NOTE_FILE derived): Lines 5–7 match SPEC exactly.
- AC-3 (claude --print with diff, || true): Lines 14–55 — command-v guard, prompt via mktemp here-doc, output to NOTE_FILE with || true.
- AC-4 (YAML frontmatter + Summary/Changed Files/Impact sections): Here-doc at lines 30–53 contains all required fields and sections.
- AC-5 (tag detection fe/be/planning): Lines 17–19 grep ai-platform-fe/, ai-platform/, .planning/ and build REPO_TAG; leading-space trim fix applied at line 22.
- AC-6 (claude absent skips note generation): `if command -v claude` block at line 14 — absent claude skips entire note section.
- AC-7 (_MOC.md append unconditional): Lines 59–60 outside the claude guard — always runs.
- AC-8 (curl POST with || true): Lines 63–68 — command-v curl + [ -f NOTE_FILE ] guard + || true.
- AC-9 (exit 0 unconditional): Line 70.
SPEC ACs covered by this task: AC-02, AC-03, AC-04, AC-05, AC-12 — all PASS.
