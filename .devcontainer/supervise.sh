#!/usr/bin/env bash
# Keeps the dev server alive.
#
# Not a nicety: the server has twice been killed cleanly mid-session (healthy
# one minute, "no next dev process running" the next, with no error in the
# log) when the VS Code attach task that spawned it went away. A supervisor
# means a transient kill self-heals instead of leaving a 502 for the next
# person who opens the tab.
#
# Runs detached via setsid from start.sh; never invoke it directly in a
# terminal you care about, it does not return.
cd "$(dirname "$0")/.."
source .devcontainer/lib.sh

PORT="${1:-3000}"
LOG="${2:-/tmp/liqops-dev.log}"
BIN=node_modules/.bin/next

# Give up after this many restarts in a short window — if the server dies
# instantly every time, looping forever just buries the real error in the log.
MAX_RAPID=5
rapid=0

load_env

while true; do
  started=$(date +%s)
  "$BIN" dev -H 0.0.0.0 -p "$PORT" >>"$LOG" 2>&1
  code=$?
  ran=$(( $(date +%s) - started ))

  if [ "$ran" -lt 10 ]; then
    rapid=$(( rapid + 1 ))
  else
    rapid=0 # it stayed up a while, so this was a one-off
  fi

  if [ "$rapid" -ge "$MAX_RAPID" ]; then
    {
      echo ""
      echo "[liqops] dev server exited $MAX_RAPID times in under 10s each (last code $code)."
      echo "[liqops] Not restarting again — the error above is the real one."
      echo "[liqops] Try: npm run repair && npm run dev"
    } >>"$LOG"
    exit 1
  fi

  echo "[liqops] dev server exited (code $code) after ${ran}s — restarting…" >>"$LOG"
  sleep 2
done
