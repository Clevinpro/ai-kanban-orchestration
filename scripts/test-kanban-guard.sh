#!/usr/bin/env bash
# test-kanban-guard.sh — Six-case unit test for stopped-transition validation
# Tests task-state-guard.js stopped destination: allow from active statuses, deny from terminal.
# Run: bash scripts/test-kanban-guard.sh

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
FIXTURE_DIR="$TMPDIR/.planning/work/test-kanban"
mkdir -p "$FIXTURE_DIR"
trap 'rm -rf "$TMPDIR"' EXIT

NOW="2026-05-26T12:00:00.000Z"

# ─── Fixture A: status: inProgress ──────────────────────────────────────────
FIXTURE_A="$FIXTURE_DIR/task-inprogress.md"
cat > "$FIXTURE_A" <<'YAML'
---
id: TASK-001
title: Test task inProgress
status: inProgress
priority: medium
repo: be
epic: test-kanban
complexity: 1
created-at: 2026-05-26T12:00:00.000Z
updated-at: 2026-05-26T12:00:00.000Z
---

## Description

Task currently in progress.
YAML

# ─── Fixture B: status: inReview ─────────────────────────────────────────────
FIXTURE_B="$FIXTURE_DIR/task-inreview.md"
cat > "$FIXTURE_B" <<'YAML'
---
id: TASK-001
title: Test task inReview
status: inReview
priority: medium
repo: be
epic: test-kanban
complexity: 1
created-at: 2026-05-26T12:00:00.000Z
updated-at: 2026-05-26T12:00:00.000Z
---

## Description

Task currently in review.
YAML

# ─── Fixture C: status: inTesting ────────────────────────────────────────────
FIXTURE_C="$FIXTURE_DIR/task-intesting.md"
cat > "$FIXTURE_C" <<'YAML'
---
id: TASK-001
title: Test task inTesting
status: inTesting
priority: medium
repo: be
epic: test-kanban
complexity: 1
created-at: 2026-05-26T12:00:00.000Z
updated-at: 2026-05-26T12:00:00.000Z
---

## Description

Task currently in testing.
YAML

# ─── Fixture D: status: forTeamLeadCheck ─────────────────────────────────────
FIXTURE_D="$FIXTURE_DIR/task-forteamleadcheck.md"
cat > "$FIXTURE_D" <<'YAML'
---
id: TASK-001
title: Test task forTeamLeadCheck
status: forTeamLeadCheck
priority: medium
repo: be
epic: test-kanban
complexity: 1
created-at: 2026-05-26T12:00:00.000Z
updated-at: 2026-05-26T12:00:00.000Z
---

## Description

Task awaiting team lead check.
YAML

# ─── Fixture E: status: readyForDevelop ──────────────────────────────────────
FIXTURE_E="$FIXTURE_DIR/task-readyfordevelop.md"
cat > "$FIXTURE_E" <<'YAML'
---
id: TASK-001
title: Test task readyForDevelop
status: readyForDevelop
priority: medium
repo: be
epic: test-kanban
complexity: 1
created-at: 2026-05-26T12:00:00.000Z
updated-at: 2026-05-26T12:00:00.000Z
---

## Description

Task ready for development.
YAML

# ─── Fixture F: status: done ─────────────────────────────────────────────────
FIXTURE_F="$FIXTURE_DIR/task-done.md"
cat > "$FIXTURE_F" <<'YAML'
---
id: TASK-001
title: Test task done
status: done
priority: medium
repo: be
epic: test-kanban
complexity: 1
created-at: 2026-05-26T12:00:00.000Z
updated-at: 2026-05-26T12:00:00.000Z
---

## Description

Task completed.
YAML

# ─── Helper: run hook and capture output ────────────────────────────────────
run_hook() {
  local FILE_PATH="$1"
  local OLD_STATUS="$2"
  local PAYLOAD
  PAYLOAD=$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s","old_string":"status: %s","new_string":"status: stopped"}}' \
    "$FILE_PATH" "$OLD_STATUS")
  echo "$PAYLOAD" | "$NODE" "$HOOK"
}

# ─── Test Case A: inProgress → stopped → expect allow ───────────────────────
OUTPUT_A=$(run_hook "$FIXTURE_A" "inProgress")
if echo "$OUTPUT_A" | grep -q '"permissionDecision":"allow"'; then
  echo "PASS: Case A — inProgress → stopped correctly allowed"
else
  echo "FAIL: Case A — expected allow, got: $OUTPUT_A"
  exit 1
fi

# ─── Test Case B: inReview → stopped → expect allow ─────────────────────────
OUTPUT_B=$(run_hook "$FIXTURE_B" "inReview")
if echo "$OUTPUT_B" | grep -q '"permissionDecision":"allow"'; then
  echo "PASS: Case B — inReview → stopped correctly allowed"
else
  echo "FAIL: Case B — expected allow, got: $OUTPUT_B"
  exit 1
fi

# ─── Test Case C: inTesting → stopped → expect allow ────────────────────────
OUTPUT_C=$(run_hook "$FIXTURE_C" "inTesting")
if echo "$OUTPUT_C" | grep -q '"permissionDecision":"allow"'; then
  echo "PASS: Case C — inTesting → stopped correctly allowed"
else
  echo "FAIL: Case C — expected allow, got: $OUTPUT_C"
  exit 1
fi

# ─── Test Case D: forTeamLeadCheck → stopped → expect allow ─────────────────
OUTPUT_D=$(run_hook "$FIXTURE_D" "forTeamLeadCheck")
if echo "$OUTPUT_D" | grep -q '"permissionDecision":"allow"'; then
  echo "PASS: Case D — forTeamLeadCheck → stopped correctly allowed"
else
  echo "FAIL: Case D — expected allow, got: $OUTPUT_D"
  exit 1
fi

# ─── Test Case E: readyForDevelop → stopped → expect deny ───────────────────
OUTPUT_E=$(run_hook "$FIXTURE_E" "readyForDevelop")
if echo "$OUTPUT_E" | grep -q '"permissionDecision":"deny"'; then
  echo "PASS: Case E — readyForDevelop → stopped correctly denied"
else
  echo "FAIL: Case E — expected deny, got: $OUTPUT_E"
  exit 1
fi

# ─── Test Case F: done → stopped → expect deny ──────────────────────────────
OUTPUT_F=$(run_hook "$FIXTURE_F" "done")
if echo "$OUTPUT_F" | grep -q '"permissionDecision":"deny"'; then
  echo "PASS: Case F — done → stopped correctly denied"
else
  echo "FAIL: Case F — expected deny, got: $OUTPUT_F"
  exit 1
fi

echo "All stopped-transition tests passed."
