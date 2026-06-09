#!/usr/bin/env bash
# Smoke-boot every microservice in a repo before the TeamLead acceptance check.
#
# Usage: smoke-boot.sh be|fe
#
# Gate policy (decided per workflow):
#   - BUILD must pass        -> build failure exits 1 (TeamLead REJECTS)
#   - BOOT is best-effort    -> a service that builds but fails to listen on its
#                              port is reported DOWN/CRASHED as a WARN, exit 0
#                              (infra like DB/Redis may simply not be running)
#
# Scope: task's repo only (CLAUDE.md repo isolation) — `be` boots the 3 Nest
# services, `fe` boots the 4 Vite MFEs.
set -uo pipefail

REPO="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

case "$REPO" in
  be)
    WS="$ROOT/ai-platform"
    APPS=(api-gateway auth-service ai-service)
    PORTS=(4000 4002 4001)
    ;;
  fe)
    WS="$ROOT/ai-platform-fe"
    APPS=(shell auth chat docs)
    PORTS=(3000 3001 3002 3003)
    ;;
  *)
    echo "SMOKE: usage: smoke-boot.sh be|fe" >&2
    echo "SMOKE_RESULT: BAD_ARGS"
    exit 2
    ;;
esac

cd "$WS" || { echo "SMOKE: workspace $WS missing" >&2; echo "SMOKE_RESULT: NO_WORKSPACE"; exit 2; }

BUILD_LIST="$(IFS=,; echo "${APPS[*]}")"
echo "=== SMOKE BUILD ($REPO): ${APPS[*]} ==="
if ! npx nx run-many -t build -p "$BUILD_LIST"; then
  echo "SMOKE: BUILD FAILED for $REPO — gating TeamLead check"
  echo "SMOKE_RESULT: BUILD_FAIL repo=$REPO"
  exit 1
fi
echo "SMOKE: build OK for $REPO"

LOGDIR="$(mktemp -d)"
WAIT_SECS=30
declare -a STATUS

for i in "${!APPS[@]}"; do
  app="${APPS[$i]}"; port="${PORTS[$i]}"
  log="$LOGDIR/$app.log"
  echo "=== SMOKE BOOT: $app (port $port) ==="
  npx nx serve "$app" >"$log" 2>&1 &
  pid=$!

  up="DOWN"
  for _ in $(seq 1 "$WAIT_SECS"); do
    if lsof -ti tcp:"$port" -sTCP:LISTEN >/dev/null 2>&1; then up="UP"; break; fi
    if ! kill -0 "$pid" 2>/dev/null; then up="CRASHED"; break; fi
    sleep 1
  done

  STATUS[$i]="$app:$port=$up"
  echo "SMOKE: $app -> $up"

  # teardown — kill the nx process and anything still holding the port
  kill "$pid" 2>/dev/null
  lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null | xargs -r kill 2>/dev/null

  if [ "$up" != "UP" ]; then
    echo "--- $app boot log (tail 20) ---"
    tail -n 20 "$log" 2>/dev/null
    echo "--- end $app log ---"
  fi
done

echo "SMOKE_RESULT: BUILD_OK repo=$REPO BOOT=[${STATUS[*]}]"
exit 0
