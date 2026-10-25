#!/bin/sh
# Starts PersonalOS Home: the launcher (127.0.0.1:5171) and the dashboard (http://localhost:5170), then opens the browser.
#   sh start-os.sh          launcher + dashboard
#   sh start-os.sh --all    also starts chart-journal, InteractiveDSA and TaskFlow (skips any whose port is already up)
# Ctrl+C stops what this script started (the launcher also stops the apps it started). Ports are fixed: if one is
# taken, that piece is skipped and reported, never moved. A port counts as taken if 127.0.0.1 OR ::1 answers.
ROOT="$(cd "$(dirname "$0")" && pwd)" || exit 1
DASH="$ROOT/dashboard"
LOGS="$DASH/launcher/logs"
mkdir -p "$LOGS"

# launchd gives a minimal PATH; make sure node/npm are findable (Homebrew on Apple Silicon and Intel, then usual places).
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH
command -v node >/dev/null 2>&1 || { echo "node was not found on PATH." >&2; exit 1; }

START_ALL=""
[ "$1" = "--all" ] && START_ALL="--start-all"

port_up() { node "$DASH/launcher/ports.mjs" "$1"; }

# Each piece runs as the leader of its own process group (set -m), so Ctrl+C can stop the whole group.
set -m
PIDS=""

if port_up 5171; then
  echo "Launcher: port 5171 is already in use, skipping (is it already running?)."
  [ -n "$START_ALL" ] && echo "Launcher: --all ignored because the launcher was not started by this script."
else
  (cd "$DASH" && exec node launcher/server.mjs $START_ALL) &
  PIDS="$PIDS $!"
fi

if port_up 5170; then
  echo "Dashboard: port 5170 is already in use, skipping (is it already running?)."
else
  (cd "$DASH" && exec npm run dev >"$LOGS/dashboard.log" 2>&1) &
  PIDS="$PIDS $!"
fi

cleanup() {
  trap - INT TERM
  for p in $PIDS; do kill -TERM -- "-$p" 2>/dev/null; done   # only the groups started above
  wait
  exit 0
}
trap cleanup INT TERM

# Wait up to 30 s for the dashboard, then open it.
i=0
until port_up 5170; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then echo "Dashboard did not come up on 5170. See $LOGS/dashboard.log" >&2; break; fi
  sleep 0.5
done
if port_up 5170; then
  echo "PersonalOS Home: http://localhost:5170"
  command -v open >/dev/null 2>&1 && open "http://localhost:5170"
fi

if [ -z "$PIDS" ]; then exit 0; fi
echo "Running. Press Ctrl+C to stop."
wait
