#!/usr/bin/env bash
# test-stop-guard.sh — Forced-exit test for stop-guard.js. Asserts stop-guard.js exits 0 when stop_hook_active is true.
# Run: bash scripts/test-stop-guard.sh

set -e

HOOK="$(dirname "$0")/../.claude/hooks/stop-guard.js"
NODE="/Users/tarasbannyi/.nvm/versions/node/v22.18.0/bin/node"

# Test 1: stop_hook_active = true → must exit 0 (allow stop, break loop)
PAYLOAD='{"session_id":"test","hook_event_name":"Stop","stop_hook_active":true,"cwd":".","transcript_path":"/tmp/test.jsonl"}'
echo "$PAYLOAD" | "$NODE" "$HOOK"
echo "PASS: stop_hook_active=true exits 0"

# Test 2: stop_hook_active = false → must exit 0 (allow stop normally)
PAYLOAD='{"session_id":"test","hook_event_name":"Stop","stop_hook_active":false,"cwd":".","transcript_path":"/tmp/test.jsonl"}'
echo "$PAYLOAD" | "$NODE" "$HOOK"
echo "PASS: stop_hook_active=false exits 0"

echo "All tests passed."
