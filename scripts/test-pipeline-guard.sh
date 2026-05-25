#!/usr/bin/env bash
# test-pipeline-guard.sh — Four-case unit test for annotation-gated reverse transitions
# Tests task-state-guard.js inReview→inProgress and forTeamLeadCheck→inProgress gates.
# Run: bash scripts/test-pipeline-guard.sh

set -e

HOOK="$(dirname "$0")/../.claude/hooks/task-state-guard.js"
NODE="$(command -v node)"
if [ -z "$NODE" ]; then
  echo "ERROR: node not found in PATH" >&2
  exit 1
fi

# Create temporary directory for fixture files inside .planning/work/ path so
# the hook's path filter (.planning/work/ check) passes. Clean up on exit.
TMPDIR="$(mktemp -d)"
FIXTURE_DIR="$TMPDIR/.planning/work/test-pipeline"
mkdir -p "$FIXTURE_DIR"
trap 'rm -rf "$TMPDIR"' EXIT

NOW="2026-05-25T12:00:00.000Z"

# ─── Fixture 1: status: inReview, NO annotation body ───────────────────────
FIXTURE_INREVIEW_BARE="$FIXTURE_DIR/task-inreview-bare.md"
cat > "$FIXTURE_INREVIEW_BARE" <<'YAML'
---
id: TASK-001
title: Test task bare inReview
status: inReview
priority: medium
repo: be
epic: test-pipeline
complexity: 1
created-at: 2026-05-25T12:00:00.000Z
updated-at: 2026-05-25T12:00:00.000Z
---

## Description

No QA Results annotation here.
YAML

# ─── Fixture 2: status: inReview, WITH ## QA Results Status: FAIL ──────────
FIXTURE_INREVIEW_WITH_QA="$FIXTURE_DIR/task-inreview-with-qa.md"
cat > "$FIXTURE_INREVIEW_WITH_QA" <<'YAML'
---
id: TASK-001
title: Test task annotated inReview
status: inReview
priority: medium
repo: be
epic: test-pipeline
complexity: 1
created-at: 2026-05-25T12:00:00.000Z
updated-at: 2026-05-25T12:00:00.000Z
---

## Description

Has QA annotation below.

## QA Results

Status: FAIL

3 tests failed in auth-service.
YAML

# ─── Fixture 3: status: forTeamLeadCheck, NO annotation body ───────────────
FIXTURE_TLC_BARE="$FIXTURE_DIR/task-tlc-bare.md"
cat > "$FIXTURE_TLC_BARE" <<'YAML'
---
id: TASK-001
title: Test task bare forTeamLeadCheck
status: forTeamLeadCheck
priority: medium
repo: be
epic: test-pipeline
complexity: 1
created-at: 2026-05-25T12:00:00.000Z
updated-at: 2026-05-25T12:00:00.000Z
---

## Description

No TeamLead Check annotation here.
YAML

# ─── Fixture 4: status: forTeamLeadCheck, WITH ## TeamLead Check Status: REJECTED
FIXTURE_TLC_WITH_REJECTED="$FIXTURE_DIR/task-tlc-with-rejected.md"
cat > "$FIXTURE_TLC_WITH_REJECTED" <<'YAML'
---
id: TASK-001
title: Test task annotated forTeamLeadCheck
status: forTeamLeadCheck
priority: medium
repo: be
epic: test-pipeline
complexity: 1
created-at: 2026-05-25T12:00:00.000Z
updated-at: 2026-05-25T12:00:00.000Z
---

## Description

Has TeamLead Check annotation below.

## TeamLead Check

Status: REJECTED

Implementation does not meet acceptance criteria.
YAML

# ─── Helper: run hook and capture output ────────────────────────────────────
run_hook() {
  local FILE_PATH="$1"
  local NEW_STATUS="$2"
  local OLD_STATUS="$3"
  local PAYLOAD
  PAYLOAD=$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s","old_string":"status: %s","new_string":"status: %s"}}' \
    "$FILE_PATH" "$OLD_STATUS" "$NEW_STATUS")
  echo "$PAYLOAD" | "$NODE" "$HOOK"
}

# ─── Test Case A: inReview → inProgress without annotation → expect deny ────
OUTPUT_A=$(run_hook "$FIXTURE_INREVIEW_BARE" "inProgress" "inReview")
if echo "$OUTPUT_A" | grep -q '"permissionDecision":"deny"'; then
  echo "PASS: Case A — bare inReview → inProgress correctly denied"
else
  echo "FAIL: Case A — expected deny, got: $OUTPUT_A"
  exit 1
fi

# ─── Test Case B: inReview → inProgress WITH QA Results block → expect allow ──
OUTPUT_B=$(run_hook "$FIXTURE_INREVIEW_WITH_QA" "inProgress" "inReview")
if echo "$OUTPUT_B" | grep -q '"permissionDecision":"allow"'; then
  echo "PASS: Case B — annotated inReview → inProgress correctly allowed"
else
  echo "FAIL: Case B — expected allow, got: $OUTPUT_B"
  exit 1
fi

# ─── Test Case C: forTeamLeadCheck → inProgress without annotation → expect deny ─
OUTPUT_C=$(run_hook "$FIXTURE_TLC_BARE" "inProgress" "forTeamLeadCheck")
if echo "$OUTPUT_C" | grep -q '"permissionDecision":"deny"'; then
  echo "PASS: Case C — bare forTeamLeadCheck → inProgress correctly denied"
else
  echo "FAIL: Case C — expected deny, got: $OUTPUT_C"
  exit 1
fi

# ─── Test Case D: forTeamLeadCheck → inProgress WITH TeamLead Check block → expect allow ─
OUTPUT_D=$(run_hook "$FIXTURE_TLC_WITH_REJECTED" "inProgress" "forTeamLeadCheck")
if echo "$OUTPUT_D" | grep -q '"permissionDecision":"allow"'; then
  echo "PASS: Case D — annotated forTeamLeadCheck → inProgress correctly allowed"
else
  echo "FAIL: Case D — expected allow, got: $OUTPUT_D"
  exit 1
fi

echo "All tests passed."
