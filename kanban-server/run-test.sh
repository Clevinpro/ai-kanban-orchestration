#!/bin/bash
# Thin teardown guard for the epic-level acceptance gate (/team-lead:test).
# Spawned by kanban-server when the last task of an epic is dragged to done.
#
# The AGENT now owns the app lifecycle: the gate command boots docker infra,
# applies Prisma migrations, starts backend + frontend (run_in_background), waits
# for readiness, and reads the boot logs INTO ITS OWN CONTEXT — so boot failures
# surface inline and the agent can react, instead of a blind /tmp log path.
#
# This wrapper exists for the ONE thing the agent cannot do for itself:
# GUARANTEE app teardown even if the agent crashes (OOM, context overflow, hang).
# `trap cleanup EXIT INT TERM` frees the app ports no matter how claude exits, so
# a dead run never leaves BE/FE holding ports → EADDRINUSE on the next launch.
#
# A manual `claude "/team-lead:test <epic>"` (not via this wrapper) loses only the
# teardown guarantee; the gate still boots the app + verifies (it owns boot now).

# Usage: run-test.sh <AGENT> <epic>
#   AGENT = claude | cursor  (which CLI drives the gate; defaults to claude)
AGENT=${1:-claude}
EPIC=$2
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"

CLAUDE_BIN="${CLAUDE_BIN:-/Users/tarasbannyi/.local/bin/claude}"
CURSOR_BIN="${CURSOR_BIN:-$HOME/.local/bin/cursor-agent}"

# Ports the gate's app occupies for the duration of the run — freed on exit.
BE_PORTS=(4000 4001 4002)
FE_PORTS=(3000 3001 3002 3003)

log() { echo "[$(date '+%H:%M:%S')] [epic-test:$EPIC] $*"; }

free_ports() {
  for p in "$@"; do
    lsof -ti "tcp:$p" 2>/dev/null | xargs -r kill -9 2>/dev/null
  done
}

cleanup() {
  log "teardown — freeing app ports (BE ${BE_PORTS[*]} / FE ${FE_PORTS[*]})"
  # Nx serve spawns children that outlive any npm parent — kill by port, not PID.
  free_ports "${BE_PORTS[@]}" "${FE_PORTS[@]}"

  # Cancel an unfinished gate: if the tab was closed (SIGHUP) or aborted before
  # /team-lead:test wrote a PASS/FAIL verdict, the TEST-REPORT.md is still the
  # IN-PROGRESS launch marker — delete it so the epic can be re-tested instead of
  # being blocked. A finished gate already overwrote it with PASS/FAIL (leave it).
  # Removing the file fires the kanban chokidar unlink handler, which clears the
  # board badge, drops the .test-started sidecar, and unblocks the run button.
  REPORT="$WORK_DIR/.planning/work/$EPIC/TEST-REPORT.md"
  if [ -f "$REPORT" ] && grep -q '^Verdict: IN-PROGRESS' "$REPORT"; then
    rm -f "$REPORT"
    log "gate aborted before verdict — cleared IN-PROGRESS marker (epic can be re-tested)"
  fi
  log "teardown done."
}
# HUP added so closing the Warp/iTerm tab (SIGHUP to the shell) runs cleanup too.
trap cleanup EXIT INT TERM HUP

# --- run the gate ---------------------------------------------------------
# --chrome wires the in-process Claude-in-Chrome MCP so the gate can drive the
# live app in a real browser. The gate boots the app itself (see test.md boot
# phase); this wrapper only guarantees teardown via the trap above.
cd "$WORK_DIR" || exit 1
if [ "$AGENT" = "cursor" ]; then
  # cursor-agent runs its interactive TUI in the foreground. --force auto-approves
  # tool/shell commands; --workspace pins the workspace + cwd to the repo root.
  log "starting team-lead-test $EPIC (cursor)"
  "$CURSOR_BIN" --force --workspace "$WORK_DIR" --model auto "team-lead-test $EPIC"
else
  log "starting /team-lead:test $EPIC (claude --chrome)"
  "$CLAUDE_BIN" --chrome "/team-lead:test $EPIC"
fi

# --- teardown via trap ----------------------------------------------------
