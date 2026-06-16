#!/bin/bash
# Run one research worker (team-lead:research --run) in this terminal tab.
# Spawned (via open-research-tab.sh) by /team-lead:research INIT for the
# investigator, and by the research-investigator agent for each repo it consults.
#
# Usage: run-research.sh <AGENT> <EPIC> <ROLE>
#   AGENT = claude | cursor   (which CLI drives the worker; defaults to claude)
#   EPIC  = epic slug under .planning/work/
#   ROLE  = inv | be | fe
#     inv → hosts the research-investigator and owns the RESEARCH.md card status;
#           on tab close / crash it reverts the card to readyForDevelop.
#     be|fe → a read-only developer pass; does NOT own the card, so no revert.
AGENT=${1:-claude}
EPIC=$2
ROLE=${3:-inv}
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESEARCH_FILE="$WORK_DIR/.planning/work/$EPIC/RESEARCH.md"

CLAUDE_BIN="${CLAUDE_BIN:-/Users/tarasbannyi/.local/bin/claude}"
CURSOR_BIN="${CURSOR_BIN:-$HOME/.local/bin/cursor-agent}"

reverted=0
MAIN_PID=$$
PARENT_PID=$PPID
MAIN_PGID=$(ps -o pgid= -p $$ 2>/dev/null | tr -d '[:space:]')
[ -z "$MAIN_PGID" ] && MAIN_PGID=$$

# Revert the investigation card back to readyForDevelop. Only the inv worker owns
# the card; a finished (done) or explicitly stopped card is left untouched.
revert_to_ready() {
  [ "$ROLE" != "inv" ] && return
  [ -f "$RESEARCH_FILE" ] || return
  CURRENT=$(grep "^status:" "$RESEARCH_FILE" | sed 's/status: //' | tr -d '[:space:]')
  case "$CURRENT" in
    done|stopped)
      ;; # finished or explicitly stopped — keep as is
    *)
      NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
      sed -i '' "s/^status: .*/status: readyForDevelop/" "$RESEARCH_FILE"
      sed -i '' "s/^updated-at: .*/updated-at: $NOW/" "$RESEARCH_FILE"
      echo "[$(date '+%H:%M:%S')] research card -> readyForDevelop"
      ;;
  esac
  reverted=1
}

# Terminal-close watchdog — same shape as run-task.sh: a foreground TUI defers the
# shell's traps, and real agents survive SIGHUP, so this background watcher is what
# actually fires the instant the tab closes. (No-op revert for be/fe roles.)
watchdog_teardown() {
  revert_to_ready
  kill -KILL -"$MAIN_PGID" 2>/dev/null
  exit 0
}

watchdog() {
  trap 'watchdog_teardown' SIGHUP SIGTERM SIGINT
  local had_tty=0
  while kill -0 "$MAIN_PID" 2>/dev/null; do
    kill -0 "$PARENT_PID" 2>/dev/null || watchdog_teardown
    if { : < /dev/tty; } 2>/dev/null; then
      had_tty=1
    elif [ "$had_tty" = "1" ]; then
      watchdog_teardown
    fi
    sleep 1
  done
}

on_signal() {
  revert_to_ready
  exit 130
}

# Clean exit: reap the watchdog, then for the inv worker revert any card still
# stuck mid-flight (a clean investigation ends at done; anything else = crash/close).
on_exit() {
  [ -n "$WATCHDOG_PID" ] && kill -KILL "$WATCHDOG_PID" 2>/dev/null
  [ "$reverted" = "1" ] && return
  [ "$ROLE" != "inv" ] && return
  [ -f "$RESEARCH_FILE" ] || return
  CURRENT=$(grep "^status:" "$RESEARCH_FILE" | sed 's/status: //' | tr -d '[:space:]')
  case "$CURRENT" in
    inProgress|forTeamLeadCheck)
      NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
      sed -i '' "s/^status: .*/status: readyForDevelop/" "$RESEARCH_FILE"
      sed -i '' "s/^updated-at: .*/updated-at: $NOW/" "$RESEARCH_FILE"
      echo "[$(date '+%H:%M:%S')] research card -> readyForDevelop"
      ;;
    *)
      return ;; # done | stopped | readyForDevelop — leave untouched
  esac
}

trap 'on_signal' SIGHUP SIGTERM SIGINT
trap 'on_exit' EXIT

watchdog &
WATCHDOG_PID=$!

echo "[$(date '+%H:%M:%S')] research start: [$AGENT] $EPIC role=$ROLE"
cd "$WORK_DIR" || exit 1

if [ "$AGENT" = "cursor" ]; then
  "$CURSOR_BIN" --force --workspace "$WORK_DIR" --model auto "team-lead-research --run $EPIC $ROLE --agent cursor"
else
  "$CLAUDE_BIN" "/team-lead:research --run $EPIC $ROLE --agent claude"
fi
