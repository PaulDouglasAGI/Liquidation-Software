#!/usr/bin/env bash
# Runs each time you connect to the Codespace. Starts the dev server and does
# not return until it is actually answering — or prints why it failed.
#
# The server runs DETACHED on purpose. A long-lived foreground process under
# postAttachCommand is fragile: if it dies, the terminal is gone with it and
# the only symptom is a 502 on the forwarded port. Detached + logged means the
# server outlives this script and the failure is always readable.
set -e

cd "$(dirname "$0")/.."
source .devcontainer/lib.sh

PORT=3000
LOG=/tmp/liqops-dev.log

# Without this the server boots but every page 500s with
# "Environment variable not found: DATABASE_URL".
load_env

# Already up (a reconnect, or the user started it by hand)? Leave it alone —
# a second server would just fail to bind and muddy the logs.
if server_responding "$PORT"; then
  ok "Dev server already running on port $PORT."
  exit 0
fi

# Listening but unhealthy: a stale server from before the config was fixed.
# Replace it rather than reporting success on a broken process.
if port_listening "$PORT"; then
  warn "Something is on port $PORT but returning errors — restarting it."
  pkill -f "next dev" 2>/dev/null || true
  pkill -f "next-server" 2>/dev/null || true
  sleep 2
fi

# Blocks until setup.sh is done, released before the server starts.
hold_lock

if ! deps_ok; then
  warn "Dependencies are missing or incomplete — installing before starting."
  install_deps
  npx prisma generate >/dev/null 2>&1 || true
fi

bash .devcontainer/wait-for-db.sh || warn "Database not reachable — the app will error until it is."

# Migrations only need applying when they have actually changed. Running
# `prisma migrate deploy` on every attach costs several seconds and prints
# noise for a no-op; a fingerprint of the migrations folder skips it.
MIG_STAMP=".devcontainer/.migrations-applied"
MIG_NOW=$(find prisma/migrations -name migration.sql -type f 2>/dev/null | sort | xargs cksum 2>/dev/null | cksum)
if [ ! -f "$MIG_STAMP" ] || [ "$(cat "$MIG_STAMP" 2>/dev/null)" != "$MIG_NOW" ]; then
  say "Applying database migrations…"
  if npx prisma migrate deploy >/dev/null 2>&1; then
    printf '%s' "$MIG_NOW" > "$MIG_STAMP"
  else
    warn "Migrations did not apply — run: npx prisma migrate deploy"
  fi
fi

release_lock

say "Starting the dev server…"
: > "$LOG"
# setsid detaches from this script's process group, so the server survives
# whatever the attach task does when it finishes.
# Under a supervisor, so a clean kill (which has happened twice when the VS
# Code attach task went away) self-heals instead of leaving a 502 behind.
setsid nohup bash .devcontainer/supervise.sh "$PORT" "$LOG" >>"$LOG" 2>&1 < /dev/null &
SERVER_PID=$!
disown 2>/dev/null || true

# Turbopack compiles the first route on demand, so allow real time.
for _ in $(seq 1 90); do
  if server_responding "$PORT"; then
    echo
    ok "Liquidation Ops is running."
    ok "Open the PORTS tab and click the globe on port $PORT (use a real"
    ok "browser tab, not the preview pane — sign-in needs a first-party cookie)."
    ok "Logs: tail -f $LOG    Stop: npm run stop"
    exit 0
  fi
  # If the process is gone, stop waiting and show what happened.
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo
    warn "The dev server exited on startup. Last output:"
    echo "----------------------------------------------------------------"
    tail -n 40 "$LOG"
    echo "----------------------------------------------------------------"
    warn "Try:  npm run repair   then   npm run dev"
    exit 1
  fi
  sleep 1
done

warn "The dev server did not answer within 90s. Last output:"
echo "----------------------------------------------------------------"
tail -n 40 "$LOG"
echo "----------------------------------------------------------------"
warn "Run 'npm run doctor' for a full diagnosis."
exit 1
