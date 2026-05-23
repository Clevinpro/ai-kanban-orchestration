#!/usr/bin/env bash
# test-stop-guard.sh — Forced-exit test for stop-guard.js. Asserts stop-guard.js exits 0 with no stdout output.
# Run: bash scripts/test-stop-guard.sh

set -e

HOOK="$(dirname "$0")/../.claude/hooks/stop-guard.js"
NODE="$(command -v node)"
if [ -z "$NODE" ]; then
  echo "ERROR: node not found in PATH" >&2
  exit 1
fi

# Test 1: stop_hook_active = true → must exit 0 with no output
PAYLOAD='{"session_id":"test","hook_event_name":"Stop","stop_hook_active":true,"cwd":".","transcript_path":"/tmp/test.jsonl"}'
OUTPUT=$(echo "$PAYLOAD" | "$NODE" "$HOOK")
EXIT=$?
[ $EXIT -eq 0 ] || { echo "FAIL: expected exit 0, got $EXIT"; exit 1; }
[ -z "$OUTPUT" ] || { echo "FAIL: unexpected output: $OUTPUT"; exit 1; }
echo "PASS: stop_hook_active=true exits 0 with no output"

# Test 2: stop_hook_active = false → must exit 0 with no output
PAYLOAD='{"session_id":"test","hook_event_name":"Stop","stop_hook_active":false,"cwd":".","transcript_path":"/tmp/test.jsonl"}'
OUTPUT=$(echo "$PAYLOAD" | "$NODE" "$HOOK")
EXIT=$?
[ $EXIT -eq 0 ] || { echo "FAIL: expected exit 0, got $EXIT"; exit 1; }
[ -z "$OUTPUT" ] || { echo "FAIL: unexpected output: $OUTPUT"; exit 1; }
echo "PASS: stop_hook_active=false exits 0 with no output"

echo "All tests passed."
