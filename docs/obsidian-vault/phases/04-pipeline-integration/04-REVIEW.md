---
phase: 04-pipeline-integration
reviewed: 2026-05-26T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - .claude/hooks/task-state-guard.js
  - scripts/test-pipeline-guard.sh
  - .claude/commands/team-lead/execute.md
findings:
  critical: 2
  warning: 8
  info: 3
  total: 13
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-05-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three files were reviewed: the `task-state-guard.js` PreToolUse hook (Node.js), the shell test harness for that hook, and the `team-lead:execute` command definition (Markdown).

The hook contains one correctness bug that silently drops the `updated-at` timestamp injection in the most common use case (Edit tool targeting only the `status:` line), and a structural issue with the Edit-path content reconstruction that uses a non-global `String.replace`. The execute command has a loop-counter/cap-message mismatch and a re-entry ambiguity when a QA FAIL cycle restarts the Developer Stage. The shell test suite shadows the system `TMPDIR` variable and is missing coverage for several transition classes.

---

## Critical Issues

### CR-01: `updated-at` timestamp never injected when Edit targets only `status:` line

**File:** `.claude/hooks/task-state-guard.js:109`

**Issue:** The ALLOW path injects the current ISO timestamp by running `.replace(/(updated-at:\s*)([^\n]+)/, ...)` on `tool_input.new_string`. In the dominant agent usage pattern — an Edit that replaces `"status: inProgress"` with `"status: inReview"` — the `new_string` is a single-line status value and contains no `updated-at` field. The replacement silently no-ops, and the on-disk `updated-at` field is never updated. The injection only works when an agent happens to include the `updated-at` line in its `new_string`, which the pipeline never does. This means every status transition via Edit leaves a stale `updated-at` timestamp in the task file.

**Fix:** For the Edit tool path, reconstruct the full file content (as is already done for `finalContent` on line 91), apply the `updated-at` replacement to that full content, and return the patched full content as a Write — or change the modifiedInput to patch the `updated-at` field in a separate downstream operation. The minimal targeted fix is to change the `modifiedInput` for the Edit path so that it injects the timestamp into the already-computed `finalContent` and switches the response to use `Write`-style output, or (simpler) to apply the replacement on `finalContent` rather than `new_string`:

```js
// Replace lines 108-110:
const updatedFinalContent = finalContent.replace(/(updated-at:\s*)([^\n]+)/, `$1${now}`);
// Return as a Write-style modifiedInput so the full corrected content is written:
modifiedInput = { content: updatedFinalContent };
// NOTE: This changes the Edit to a Write; alternatively, keep Edit and inject
// only if new_string happens to contain updated-at, with a fallback Edit
// appended for the updated-at line separately.
```

---

### CR-02: Edit-path content reconstruction uses first-occurrence-only `String.replace`

**File:** `.claude/hooks/task-state-guard.js:91`

**Issue:** `finalContent = (diskContent || '').replace(tool_input.old_string || '', tool_input.new_string || '')` uses JavaScript's `String.prototype.replace` with a string pattern, which replaces **only the first occurrence** of `old_string`. If `old_string` appears more than once in the file (e.g., the string `"status: inProgress"` appears in both the YAML front-matter and a description comment), the reconstructed `finalContent` will be wrong. The `repo: both` check on line 94–96 and any future checks that operate on `finalContent` will be operating on a potentially incorrect document. The same first-match ambiguity exists in the real Edit tool, but `finalContent` is used internally for validation, not just display, so a mismatch creates a gap between what the hook validates and what actually gets written to disk.

**Fix:** Use `replaceAll` or a global regex to match the Edit tool's actual replacement semantics, OR document explicitly that this reconstruction is a best-effort heuristic and scope its use accordingly:

```js
// Line 91 — replace first occurrence to match Edit tool behavior explicitly:
// If the Edit tool replaces the first occurrence only, this is correct as-is.
// If the Edit tool replaces all occurrences, use:
finalContent = (diskContent || '').split(tool_input.old_string || '').join(tool_input.new_string || '');
// Either way, add a comment documenting the assumption:
// NOTE: Edit tool replaces first occurrence only — reconstructed finalContent matches that behavior.
```

---

## Warnings

### WR-01: `extractFrontmatterField` builds a regex from an unsanitized `field` argument

**File:** `.claude/hooks/task-state-guard.js:143`

**Issue:** `new RegExp('^${field}:\\s*(\\S+)', 'm')` interpolates the `field` parameter directly into a regex. If a field name ever contains regex metacharacters (e.g., a hypothetical field `updated.at`), the compiled regex will be incorrect. While current callers use only `'status'` and `'repo'` (safe), this is a latent correctness defect.

**Fix:**
```js
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const m = searchIn.match(new RegExp(`^${escapeRegex(field)}:\\s*(\\S+)`, 'm'));
```

---

### WR-02: Edit-path status extraction fallback (`extractFrontmatterField`) is dead code

**File:** `.claude/hooks/task-state-guard.js:43`

**Issue:** For the Edit tool, `newStatus` is extracted via:
```js
newStatus = ns.match(/^status:\s*(\S+)/m)?.[1] || extractFrontmatterField(ns, 'status');
```
`extractFrontmatterField` scans for a `---\n...\n---` YAML front-matter block. A `new_string` passed to an Edit call is a partial snippet — it will never contain a full `---` delimited front-matter block. The fallback will always return `undefined`. The `|| extractFrontmatterField(...)` branch is unreachable dead code and creates a false impression that two extraction strategies exist for this path.

**Fix:** Remove the dead fallback:
```js
newStatus = ns.match(/^status:\s*(\S+)/m)?.[1];
```

---

### WR-03: `TMPDIR` variable shadows the system environment variable

**File:** `scripts/test-pipeline-guard.sh:17`

**Issue:** `TMPDIR="$(mktemp -d)"` assigns a new value to `$TMPDIR`, which is a well-known POSIX environment variable that many programs (including `mktemp` itself) use to locate the system temporary directory. Any child process spawned by the script after this line that relies on `$TMPDIR` will use the test fixture directory instead of the system temp directory. If a subsequent call to `mktemp` is ever added to the script, it will attempt to create files inside the fixture directory rather than the real temp directory.

**Fix:** Use a distinct variable name:
```bash
TEST_TMPDIR="$(mktemp -d)"
FIXTURE_DIR="$TEST_TMPDIR/.planning/work/test-pipeline"
mkdir -p "$FIXTURE_DIR"
trap 'rm -rf "$TEST_TMPDIR"' EXIT
```

---

### WR-04: Shell test suite missing `set -o pipefail`

**File:** `scripts/test-pipeline-guard.sh:6`

**Issue:** The script uses `set -e` but not `set -o pipefail`. The test assertions use pipelines: `echo "$OUTPUT_A" | grep -q '"permissionDecision":"deny"'`. If the left side of such a pipeline produces a non-zero exit code (e.g., if `run_hook` itself fails silently), `set -e` will not catch it — only the exit status of the rightmost command in the pipeline (`grep`) determines whether the script exits. A broken hook invocation that produces empty output would cause `grep` to exit 1, which `set -e` would catch, but other failure modes (e.g., node exits with signal) could pass through undetected.

**Fix:**
```bash
set -eo pipefail
```

---

### WR-05: Developer Stage re-entry after QA FAIL: `old_string` mismatch on Edit

**File:** `.claude/commands/team-lead/execute.md:105-106`

**Issue:** At the top of the Developer Stage, the Edit instruction is: change `status: readyForDevelop` to `status: inProgress`. The note on line 106 addresses the CHANGES_REQUESTED re-loop case (where status is already `inProgress`) but not the QA FAIL re-loop case. On a QA FAIL, the pipeline transitions the file back to `inProgress` (line 233), then re-enters the INNER LOOP at the Developer Stage. The `old_string` `"status: readyForDevelop"` will not match the file's current content (`"status: inProgress"`), so the Edit tool will error or silently no-op. The command's parenthetical note only mentions the CHANGES_REQUESTED path.

**Fix:** Extend the parenthetical on line 106 to also cover the QA FAIL re-entry:
```
(On re-loop when status is already `inProgress` — whether from a CHANGES_REQUESTED cycle
or a QA FAIL cycle — skip this Edit and proceed directly to the Agent call.)
```

---

### WR-06: QA FAIL re-entry loop counter `qa_cycle` not reset before status regression

**File:** `.claude/commands/team-lead/execute.md:233`

**Issue:** On a QA FAIL, `qa_cycle` is incremented (line 225) before the loop re-enters. On the Retry path at the QA cap (line 228), the instruction says `qa_cycle is NOT reset on Retry — it is already at cap; let it increment further`. However the QA cap check is `qa_cycle >= 3` (line 225), so after cap is hit and Retry is chosen, `qa_cycle` will be 3 on the next pass, incrementing to 4, 5, etc. The cap check `>= 3` remains true on every subsequent cycle, meaning every subsequent QA FAIL will immediately re-prompt the user. This is probably the intended behavior, but the incrementing counter with no upper bound is misleading — a comment should clarify that the cap becomes a per-FAIL user prompt after the first cap hit, rather than a true N-cycle limit.

**Fix:** Add a clarifying comment in the Retry section:
```
- **Retry**: continue INNER LOOP from Developer Stage (after the first cap hit, every
  subsequent QA FAIL will also hit the cap and re-prompt — qa_cycle is not bounded above).
```

---

### WR-07: Double status advance after INNER LOOP has no QA-pass guard

**File:** `.claude/commands/team-lead/execute.md:242-247`

**Issue:** After the INNER LOOP exits (either on QA PASS or via the Skip option at the QA cap), the pipeline unconditionally applies two consecutive status advances: `inReview → inTesting` and `inTesting → forTeamLeadCheck`. There is no explicit instruction to verify whether QA actually passed before proceeding. The Skip path at the QA cap (line 229) allows the task to reach TeamLeadCheck without a QA pass, with no warning printed to the user. If a human auditing the task file later sees `forTeamLeadCheck` status they may assume QA passed.

**Fix:** On the QA Skip path, print a clear warning before advancing:
```
- **Skip**: break INNER LOOP (proceed to TeamLeadCheck WITHOUT a QA pass).
  Print: `[QA] WARNING: skipping QA — task will advance to TeamLeadCheck without a passing test run.`
```

---

### WR-08: Loop cap message implies total invocations but counts rejections

**File:** `.claude/commands/team-lead/execute.md:279`

**Issue:** The TLC cap message reads `"TeamLeadCheck rejection cap reached (2 cycles)"`. However, `tlc_cycle` is initialized to 0 and incremented only on REJECTED. With `tlc_cycle >= 2` as the cap check, the cap triggers after 2 rejections, meaning up to 3 total TLC invocations (initial call + 2 rejection loops). The same mismatch applies to QA: `"QA loop cap reached (3 cycles)"` at `qa_cycle >= 3` means 3 FAILs (4 total QA runs). The "(N cycles)" wording is ambiguous and could mislead operators monitoring the pipeline.

**Fix:** Clarify the messages to distinguish rejections from invocations:
```
"TeamLeadCheck rejection cap reached (2 REJECTED responses). Manual intervention required."
"QA loop cap reached (3 FAIL responses). Manual intervention required."
```

---

## Info

### IN-01: `inTesting → inProgress` transition is valid but has no annotation gate

**File:** `.claude/hooks/task-state-guard.js:10-17` and `scripts/test-pipeline-guard.sh` (no test for this)

**Issue:** `VALID_TRANSITIONS` lists `inTesting: ['forTeamLeadCheck', 'inProgress']`, meaning a regression from `inTesting` back to `inProgress` is allowed with no annotation requirement. The two annotation gates (lines 71-82) cover only `inReview → inProgress` and `forTeamLeadCheck → inProgress`. There is no test case for `inTesting → inProgress` in the test suite, and it is unclear whether this omission is intentional (the pipeline never transitions `inTesting → inProgress`) or an oversight.

**Fix:** Either add an annotation gate for `inTesting → inProgress` consistent with the others, or add a comment to the hook explaining why this regression is intentionally ungated:
```js
// NOTE: inTesting → inProgress is intentionally ungated: the pipeline does not
// use this transition; it is only available for manual emergency regressions.
```

---

### IN-02: Test suite has no coverage for invalid transitions or new-file creation

**File:** `scripts/test-pipeline-guard.sh`

**Issue:** The four test cases cover only annotation-gated regression paths. There are no tests for: (a) a completely invalid transition (e.g., `done → inProgress`) being denied, (b) a new file being created with a status other than `readyForDevelop` being denied, (c) a `repo: both` value being denied, or (d) the `updated-at` timestamp injection working correctly. The test suite title ("unit test for annotation-gated reverse transitions") is accurate but the absence of other transition tests leaves most of the hook's logic unexercised.

**Fix:** Add test cases for the above scenarios. At minimum, add one test that verifies an invalid transition is denied and one that verifies the `updated-at` field is updated in the hook output.

---

### IN-03: `execute.md` uses emoji in pipeline output print statements

**File:** `.claude/commands/team-lead/execute.md:128`

**Issue:** The print statements use Unicode checkmarks (e.g., `[Developer] Done ✓`) which may not render correctly in all terminal environments or log aggregators. This is a minor portability consideration.

**Fix:** Replace decorative Unicode characters with plain ASCII if cross-environment compatibility is needed:
```
[Developer] Done (OK)
[QA] Done (OK)
```

---

_Reviewed: 2026-05-26T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
