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
WORK_DIR="$(cd "$DIR/.." && pwd)"

if [ -z "$EPIC" ]; then
  echo "Usage: open-research-tab.sh <claude|cursor> <epic> <inv|be|fe>" >&2
  exit 2
fi

INNER="bash '$SCRIPT' $AGENT $EPIC $ROLE"

# Terminal selection mirrors kanban-server index.js: KANBAN_TERMINAL=warp|iterm
# (default warp). Warp has no `write text` API and its launch-config exec is
# broken (Warp#9007), so the only auto-run path is System Events UI scripting,
# which needs macOS Accessibility permission for the process running osascript.
# Set KANBAN_TERMINAL=iterm for the reliable iTerm path.
TERMINAL="${KANBAN_TERMINAL:-warp}"

if [ "$TERMINAL" = "iterm" ]; then
  osascript \
    -e 'tell application "iTerm"' \
    -e '  tell current window' \
    -e '    create tab with default profile' \
    -e '    tell current session' \
    -e "      write text \"$INNER\"" \
    -e '    end tell' \
    -e '  end tell' \
    -e 'end tell'
else
  # Create the tab DETERMINISTICALLY via Warp's URI scheme (new_tab?path=) —
  # OS-level, no flaky Cmd+T, and it pins cwd to the repo root so the agent CLI
  # loads project context. System Events then TYPES the command + Return (Cmd+V
  # paste no-ops if the new tab hasn't grabbed focus; typing catches it). The
  # 2.0s pre-delay lets the URI tab become the focused input first.
  FULL="cd '$WORK_DIR' && $INNER"
  open "warp://action/new_tab?path=$WORK_DIR"
  osascript \
    -e 'delay 2.0' \
    -e 'tell application "Warp" to activate' \
    -e 'delay 0.5' \
    -e 'tell application "System Events"' \
    -e "  keystroke \"$FULL\"" \
    -e '  delay 0.8' \
    -e '  key code 36' \
    -e 'end tell'
fi
