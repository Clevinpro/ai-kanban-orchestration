#!/bin/bash
TASK_ARG=$1
TASK_ID=$(basename "$TASK_ARG")
FLAGS=${@:2}
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"

revert_stopped() {
  TASK_FILE=$(find "$WORK_DIR/.planning/work" -name "$TASK_ID.md" 2>/dev/null | head -1)
  if [ -n "$TASK_FILE" ]; then
    CURRENT=$(grep "^status:" "$TASK_FILE" | sed 's/status: //')
    if [ "$CURRENT" = "inProgress" ]; then
      NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
      sed -i '' "s/^status: .*/status: readyForDevelop/" "$TASK_FILE"
      sed -i '' "s/^updated-at: .*/updated-at: $NOW/" "$TASK_FILE"
      echo "[$(date '+%H:%M:%S')] status -> readyForDevelop"
    fi
  fi
}

trap 'revert_stopped' EXIT SIGHUP SIGTERM SIGINT

echo "[$(date '+%H:%M:%S')] agent start: $TASK_ARG $FLAGS"
cd "$WORK_DIR" && /Users/tarasbannyi/.local/bin/claude "/team-lead:execute $TASK_ARG $FLAGS"
