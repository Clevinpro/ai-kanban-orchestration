#!/bin/bash
# Launch a single task pipeline (team-lead execute) in this terminal tab.
# Spawned by kanban-server when a task is dragged to (or auto-run into) inProgress.
#
# Usage: run-task.sh <AGENT> <epic/TASK-NNN> [FLAGS...]
#   AGENT = claude | cursor  (which CLI drives the pipeline; defaults to claude)
AGENT=${1:-claude}
TASK_ARG=$2
TASK_ID=$(basename "$TASK_ARG")
TASK_EPIC=$(dirname "$TASK_ARG")
FLAGS=${@:3}
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="$WORK_DIR/kanban-server/.task-runs"
# Sidecar key: '/' -> '__' (two underscores) to match index.js taskRunFile()
# (epic + '__' + taskId). NOTE: `tr '/' '__'` is WRONG here — tr maps char→char,
# so it emits a SINGLE underscore and the server never finds the sidecar
# (reconcile silently skips the task). Bash substitution gives the real '__'.
RUN_KEY=${TASK_ARG//\//__}
RUN_FILE="$RUN_DIR/$RUN_KEY.json"

CLAUDE_BIN="${CLAUDE_BIN:-/Users/tarasbannyi/.local/bin/claude}"
CURSOR_BIN="${CURSOR_BIN:-$HOME/.local/bin/cursor-agent}"

reverted=0
MAIN_PID=$$
# The launching shell (the iTerm tab's interactive shell). When the tab closes it
# receives SIGHUP and exits — the most reliable close signal, independent of
# whether the agent grabbed the foreground process group or how signals propagate.
PARENT_PID=$PPID
# Process-group id of this runner — used to SIGKILL the whole job (agent + this
# shell + watchdog) on terminal close. Falls back to the pid when pgid lookup fails.
MAIN_PGID=$(ps -o pgid= -p $$ 2>/dev/null | tr -d '[:space:]')
[ -z "$MAIN_PGID" ] && MAIN_PGID=$$

# Persist the runner PID so the server can detect stale inProgress tasks when a
# terminal tab is closed abruptly and shell traps are skipped.
mkdir -p "$RUN_DIR"
cat > "$RUN_FILE" <<EOF
{"pid":$$,"task":"$TASK_ARG","agent":"$AGENT","startedAt":"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"}
EOF

# Rewrite the task back to the start (readyForDevelop). Used when the terminal
# is closed / the run is killed — applies to BOTH agents. A task that already
# finished (done) or was explicitly stopped is left untouched. Even when the
# file still reads readyForDevelop (the agent hadn't flipped it yet), we rewrite
# it so chokidar emits an SSE and the board clears its optimistic inProgress card.
revert_to_ready() {
  TASK_FILE=$(find "$WORK_DIR/.planning/work" -name "$TASK_ID.md" 2>/dev/null | head -1)
  [ -z "$TASK_FILE" ] && return
  CURRENT=$(grep "^status:" "$TASK_FILE" | sed 's/status: //' | tr -d '[:space:]')
  case "$CURRENT" in
    done|stopped)
      ;; # finished or explicitly stopped — keep as is
    *)
      NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
      sed -i '' "s/^status: .*/status: readyForDevelop/" "$TASK_FILE"
      sed -i '' "s/^updated-at: .*/updated-at: $NOW/" "$TASK_FILE"
      echo "[$(date '+%H:%M:%S')] status -> readyForDevelop"
      ;;
  esac
  reverted=1
}

# ---------------------------------------------------------------------------
# Terminal-close watchdog
#
# The agent (claude TUI, or the cursor-agent TUI) runs in the FOREGROUND so it
# owns the controlling terminal — backgrounding an interactive TUI freezes it on
# SIGTTIN/SIGTTOU. But while a foreground external command runs, bash DEFERS the
# main shell's signal traps until that command returns, and real agents
# (claude, cursor-agent) catch SIGHUP and keep working when the tab is closed —
# so neither the shell trap nor the server's pid-liveness reconcile ever fires,
# and the task stays stuck inProgress.
#
# This background watchdog is never blocked in a foreground command, so it acts
# the instant the tab closes. It detects the close three ways (whichever trips
# first):
#   1. the launching shell (PARENT_PID) dies — the reliable one: closing the tab
#      always kills that shell, regardless of signal routing or which process
#      owns the foreground process group;
#   2. it receives SIGHUP/SIGTERM/SIGINT directly;
#   3. the controlling terminal disappears (opening /dev/tty starts failing),
#      latched so a launch that never had a tty can't false-fire.
# It then SIGKILLs the whole process group — agent included (SIGKILL is
# uncatchable, so a signal-trapping agent can't keep running orphaned and
# re-flip the status) — and reverts the task as a fast path. It deliberately
# does NOT remove the run sidecar: if this revert is ever missed, the server's
# reconcile loop still sees inProgress + a dead runner pid + the sidecar and
# heals it. Deleting the sidecar here would blind that backstop.
# ---------------------------------------------------------------------------
watchdog_teardown() {
  revert_to_ready
  kill -KILL -"$MAIN_PGID" 2>/dev/null
  exit 0
}

watchdog() {
  trap 'watchdog_teardown' SIGHUP SIGTERM SIGINT
  local had_tty=0
  while kill -0 "$MAIN_PID" 2>/dev/null; do
    # Launching shell gone == tab closed (reliable, signal-independent).
    kill -0 "$PARENT_PID" 2>/dev/null || watchdog_teardown
    # `: < /dev/tty` only opens+closes the controlling terminal (no read), so it
    # never triggers SIGTTIN. Open succeeds while the tab is live and fails
    # (ENXIO) once it's gone — but only treat failure as a close after we've
    # actually seen the tty, so a no-tty launch doesn't immediately self-revert.
    if { : < /dev/tty; } 2>/dev/null; then
      had_tty=1
    elif [ "$had_tty" = "1" ]; then
      watchdog_teardown
    fi
    sleep 1
  done
}

# Direct signal to this shell (rare: arrives while not blocked in the agent).
# Leaves the sidecar for the server to clean (chokidar on readyForDevelop, or
# reconcile) so the heal path can never be blinded by an early delete.
on_signal() {
  revert_to_ready
  exit 130
}

# Normal process exit → reap the watchdog (SIGKILL: it traps the gentler signals,
# so anything else would trip its teardown on a clean finish), then recover.
#
# This is the cursor path: cursor-agent (unlike the claude TUI) dies on the tab's
# SIGHUP, so the foreground command returns and this EXIT trap fires before the
# watchdog can act — and we just reaped the watchdog — so on_exit MUST revert any
# stuck in-flight state itself, not just inProgress.
#
# Status handling on exit:
#   inProgress | inReview | inTesting — mid-pipeline stages. A clean finish never
#     rests here (it reaches done, or forTeamLeadCheck). The runner exiting here
#     always means crash / kill / tab close → revert.
#   forTeamLeadCheck — ambiguous: a clean run can legitimately rest here awaiting
#     human review (with a now-dead runner pid). Revert ONLY when the launching
#     shell is gone (the tab was closed); leave it for a normal review pause.
#   done | stopped | readyForDevelop — intentional / already-reset → untouched.
# The sidecar is left for the server to remove — on the resulting status change
# (chokidar) or via reconcile.
on_exit() {
  [ -n "$WATCHDOG_PID" ] && kill -KILL "$WATCHDOG_PID" 2>/dev/null
  [ "$reverted" = "1" ] && return
  TASK_FILE=$(find "$WORK_DIR/.planning/work" -name "$TASK_ID.md" 2>/dev/null | head -1)
  [ -z "$TASK_FILE" ] && return
  CURRENT=$(grep "^status:" "$TASK_FILE" | sed 's/status: //' | tr -d '[:space:]')
  case "$CURRENT" in
    inProgress|inReview|inTesting)
      ;; # mid-pipeline — always stale on exit
    forTeamLeadCheck)
      # Only a closed tab (launching shell gone) reverts this; a live shell means
      # a normal review pause.
      kill -0 "$PARENT_PID" 2>/dev/null && return
      ;;
    *)
      return ;; # done | stopped | readyForDevelop — leave untouched
  esac
  NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
  sed -i '' "s/^status: .*/status: readyForDevelop/" "$TASK_FILE"
  sed -i '' "s/^updated-at: .*/updated-at: $NOW/" "$TASK_FILE"
  echo "[$(date '+%H:%M:%S')] status -> readyForDevelop"
}

trap 'on_signal' SIGHUP SIGTERM SIGINT
trap 'on_exit' EXIT

# Launch the watchdog before the agent. It stays in this shell's process group
# (no `set -m`), so the group SIGKILL above reaches every member.
watchdog &
WATCHDOG_PID=$!

echo "[$(date '+%H:%M:%S')] agent start: [$AGENT] $TASK_ARG $FLAGS"
cd "$WORK_DIR" || exit 1

if [ "$AGENT" = "cursor" ]; then
  # cursor-agent runs its interactive TUI in the FOREGROUND, attached to the
  # terminal — same shape as the claude branch below, so the agent UI renders
  # live (NOT -p/headless, which hides the UI; NOT piped, which breaks the TUI).
  # --force          auto-approves tool/shell commands (no per-command prompts).
  # --workspace      pins the workspace to the repo root, so the one-time
  #                  "Workspace Trust" prompt (and the agent's cwd) is the repo,
  #                  not whatever dir the tab opened in. Trust is persisted by
  #                  cursor after the first [a], so later launches don't re-ask.
  # --model auto     lets Cursor pick the model (avoids fixed-model overload).
  # The .cursor/skills/team-lead-execute skill is invoked by the prompt text.
  # Terminal-close revert is handled by the watchdog above, not this shell's
  # (deferred) trap — cursor-agent, like the claude TUI, survives SIGHUP.
  "$CURSOR_BIN" --force --workspace "$WORK_DIR" --model auto "team-lead-execute $TASK_ARG $FLAGS"
else
  # claude is an interactive TUI — runs in the foreground so it owns the terminal.
  # Terminal-close revert is handled by the watchdog above, not by this shell's
  # (deferred) trap.
  "$CLAUDE_BIN" "/team-lead:execute $TASK_ARG $FLAGS"
fi
