#!/bin/bash
# Open a new iTerm tab that runs a research worker (run-research.sh).
# Used by /team-lead:research INIT (to launch the investigator) and by the
# research-investigator agent (to launch each read-only be/fe developer) — so every
# agent gets its own terminal tab, mirroring the kanban server's task/test spawns.
#
# Usage: open-research-tab.sh <AGENT> <EPIC> <ROLE>
#   AGENT = claude | cursor
#   EPIC  = epic slug under .planning/work/
#   ROLE  = inv | be | fe
AGENT=${1:-claude}
EPIC=$2
ROLE=${3:-inv}
DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$DIR/run-research.sh"

if [ -z "$EPIC" ]; then
  echo "Usage: open-research-tab.sh <claude|cursor> <epic> <inv|be|fe>" >&2
  exit 2
fi

osascript \
  -e 'tell application "iTerm"' \
  -e '  tell current window' \
  -e '    create tab with default profile' \
  -e '    tell current session' \
  -e "      write text \"bash '$SCRIPT' $AGENT $EPIC $ROLE\"" \
  -e '    end tell' \
  -e '  end tell' \
  -e 'end tell'
