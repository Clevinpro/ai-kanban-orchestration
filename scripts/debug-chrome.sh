#!/bin/bash
# Launch Chrome with remote debugging on :9222 so the chrome-devtools MCP can
# attach to THIS browser (see your actual tab, console, network, logged-in state).
#
# Workflow:
#   1. run this script   -> opens a dedicated debugging Chrome
#   2. npm start in ai-platform/ and ai-platform-fe/  (your normal dev servers)
#   3. browse the app in THIS Chrome, hit a bug
#   4. tell Claude "there's an error on /chat" — it reads this tab via the MCP
#
# Uses a persistent, dedicated profile (logins/state survive restarts) kept
# separate from your main Chrome so remote-debugging isn't exposed on it.

PORT="${1:-9222}"
PROFILE="$HOME/.cache/chrome-debug-profile"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -x "$CHROME" ]; then
  echo "Chrome not found at: $CHROME" >&2
  exit 1
fi

# Already listening? Reuse it.
if nc -z localhost "$PORT" 2>/dev/null; then
  echo "Chrome debugging already up on :$PORT — reusing it."
  echo "Endpoint: http://127.0.0.1:$PORT  (open http://localhost:3000 in that window)"
  exit 0
fi

mkdir -p "$PROFILE"
echo "Launching debugging Chrome on :$PORT (profile: $PROFILE)"
"$CHROME" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  "http://localhost:3000" \
  >/dev/null 2>&1 &

echo "Endpoint: http://127.0.0.1:$PORT"
echo "Use THIS Chrome window for dev so Claude can see your tab."
