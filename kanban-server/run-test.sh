#!/bin/bash
# Launch the epic-level acceptance gate (/team-lead:test) for a finished epic.
# Spawned by kanban-server when the last task of an epic is dragged to done.
EPIC=$1
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "[$(date '+%H:%M:%S')] epic test start: $EPIC"
cd "$WORK_DIR" && /Users/tarasbannyi/.local/bin/claude "/team-lead:test $EPIC"
