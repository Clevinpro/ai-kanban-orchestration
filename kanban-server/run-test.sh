#!/bin/bash
# Launch the epic-level acceptance gate (/team-lead:test) for a finished epic.
# Spawned by kanban-server when the last task of an epic is dragged to done.
#
# Lifecycle owned here (NOT inside the claude command):
#   1. ensure docker infra (postgres/kafka) is up
#   2. boot backend  (npm start in ai-platform/      -> gateway 4000, ai 4001, auth 4002)
#   3. boot frontend (npm start in ai-platform-fe/   -> shell 3000, auth 3001, chat 3002, docs 3003)
#   4. wait until the entry ports answer (or time out)
#   5. run /team-lead:test with --chrome (it drives the live app via the Claude-in-Chrome MCP)
#   6. ALWAYS tear the app down on exit (trap), even if claude crashes
#
# A manual `claude "/team-lead:test <epic>"` (not via this wrapper) skips boot;
# the command detects that and falls back to evidence-only verification.

# Usage: run-test.sh <AGENT> <epic>
#   AGENT = claude | cursor  (which CLI drives the gate; defaults to claude)
AGENT=${1:-claude}
EPIC=$2
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BE_DIR="$WORK_DIR/ai-platform"
FE_DIR="$WORK_DIR/ai-platform-fe"

CLAUDE_BIN="${CLAUDE_BIN:-/Users/tarasbannyi/.local/bin/claude}"
CURSOR_BIN="${CURSOR_BIN:-$HOME/.local/bin/cursor-agent}"

# Ports we own for the duration of the gate.
BE_PORTS=(4000 4001 4002)
FE_PORTS=(3000 3001 3002 3003)
# Ports that must answer before we consider the app "ready" enough to verify.
READY_PORTS=(4000 3000 3001 3002)

BE_LOG="/tmp/teamlead-test-be-$EPIC.log"
FE_LOG="/tmp/teamlead-test-fe-$EPIC.log"
BE_PID=""
FE_PID=""

log() { echo "[$(date '+%H:%M:%S')] [epic-test:$EPIC] $*"; }

free_ports() {
  for p in "$@"; do
    lsof -ti "tcp:$p" 2>/dev/null | xargs -r kill -9 2>/dev/null
  done
}

cleanup() {
  log "tearing down app..."
  [ -n "$BE_PID" ] && kill "$BE_PID" 2>/dev/null
  [ -n "$FE_PID" ] && kill "$FE_PID" 2>/dev/null
  # Nx serve spawns child processes that outlive the npm parent — kill by port.
  free_ports "${BE_PORTS[@]}" "${FE_PORTS[@]}"
  log "teardown done. logs: $BE_LOG  $FE_LOG"
}
trap cleanup EXIT INT TERM

wait_port() {
  local port=$1 tries=0 max=150   # 150 * 2s = 5 min ceiling
  until nc -z localhost "$port" 2>/dev/null; do
    tries=$((tries + 1))
    if [ "$tries" -ge "$max" ]; then
      log "TIMEOUT waiting for port $port"
      return 1
    fi
    sleep 2
  done
  log "port $port is up"
}

# --- 1. infra -------------------------------------------------------------
if command -v docker >/dev/null 2>&1; then
  log "ensuring docker infra (postgres/kafka) is up..."
  (cd "$BE_DIR" && docker compose up -d) >>"$BE_LOG" 2>&1 || log "WARN: docker compose up failed — continuing (infra may already be running)"
fi

# --- 1b. apply migrations for BE epics ------------------------------------
# A finished BE epic may have added Prisma migrations; apply them before the
# backend boots so live verification runs against the up-to-date schema.
# `migrate deploy` only (idempotent, applies committed migrations) — never
# `migrate dev`, which can drop the raw trgm/hnsw hybrid-search indexes.
# Skipped for FE-only epics (the grep below finds no `repo: be` tasks).
EPIC_DIR="$WORK_DIR/.planning/work/$EPIC"
if grep -rqE '^repo:[[:space:]]*be[[:space:]]*$' "$EPIC_DIR"/TASK-*.md 2>/dev/null; then
  log "BE epic — applying Prisma migrations (migrate deploy)..."
  if (cd "$BE_DIR" && npx --no-install prisma migrate deploy && npx --no-install prisma generate >/dev/null 2>&1) >>"$BE_LOG" 2>&1; then
    log "migrations applied + client regenerated"
  else
    log "WARN: prisma migrate deploy failed — see $BE_LOG (backend may boot against a stale schema)"
  fi
fi

# Free any stragglers from a previous run so boot doesn't EADDRINUSE.
free_ports "${BE_PORTS[@]}" "${FE_PORTS[@]}"

# --- 2/3. boot be + fe ----------------------------------------------------
log "booting backend  -> $BE_LOG"
(cd "$BE_DIR" && exec npm start) >>"$BE_LOG" 2>&1 &
BE_PID=$!

log "booting frontend -> $FE_LOG"
(cd "$FE_DIR" && exec npm start) >>"$FE_LOG" 2>&1 &
FE_PID=$!

# --- 4. readiness ---------------------------------------------------------
log "waiting for app to come up..."
APP_LIVE=1
for p in "${READY_PORTS[@]}"; do
  wait_port "$p" || APP_LIVE=0
done
# rspack opens the port before the bundle finishes — give the shell a moment.
[ "$APP_LIVE" = "1" ] && sleep 5

if [ "$APP_LIVE" = "1" ]; then
  log "app is live — gateway:4000 shell:3000"
else
  log "WARN: app did not fully come up — gate will fall back to evidence-only"
fi

# --- 5. run the gate ------------------------------------------------------
# --chrome wires the in-process Claude-in-Chrome MCP so the gate can drive the
# live app in a real browser. Requires a Chrome with the Claude extension paired;
# if none is connected the gate degrades to evidence-only (handled in test.md).
cd "$WORK_DIR" || exit 1
if [ "$AGENT" = "cursor" ]; then
  # cursor-agent runs its interactive TUI in the foreground (same shape as the
  # claude branch + run-task.sh). NOT -p/headless (hides the UI), NOT piped
  # (breaks the TUI). --force auto-approves tool/shell commands; --workspace
  # pins the workspace + cwd to the repo root so the one-time "Workspace Trust"
  # prompt targets the repo (already pre-trusted). --model auto lets Cursor pick.
  # The .cursor/skills/team-lead-test skill is invoked by the prompt text.
  log "starting team-lead-test $EPIC (cursor)"
  TEAMLEAD_APP_LIVE="$APP_LIVE" "$CURSOR_BIN" --force --workspace "$WORK_DIR" --model auto "team-lead-test $EPIC"
else
  log "starting /team-lead:test $EPIC (claude --chrome)"
  TEAMLEAD_APP_LIVE="$APP_LIVE" "$CLAUDE_BIN" --chrome "/team-lead:test $EPIC"
fi

# --- 6. teardown via trap -------------------------------------------------
