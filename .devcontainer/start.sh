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

# ── What, if anything, is actually out of date? ──────────────────────────
#
# Both checks compare a fingerprint of a file that IS in git against a stamp
# that is NOT. That asymmetry is the whole point: `git pull` moves the tracked
# file, the stamp stays put, and the mismatch is what says work is needed.
# Everything below is skipped when they match, so a normal reconnect does
# nothing at all.
MIG_STAMP=".devcontainer/.migrations-applied"
MIG_NOW=$(find prisma/migrations -name migration.sql -type f 2>/dev/null | sort | xargs cksum 2>/dev/null | cksum)
SCHEMA_STAMP=".devcontainer/.schema-generated"
SCHEMA_NOW=$(cksum prisma/schema.prisma 2>/dev/null | cksum)

stamp_current() { [ -f "$1" ] && [ "$(cat "$1" 2>/dev/null)" = "$2" ]; }

MIGRATIONS_STALE=0; stamp_current "$MIG_STAMP" "$MIG_NOW" || MIGRATIONS_STALE=1
# The generated Prisma client lives in node_modules, which is not in git. Pull
# a schema change and the OLD client is still there: the code asks for a new
# field and Prisma answers "Unknown argument `pickupDate`". The code is right,
# the client is behind. Nothing regenerates it on its own.
CLIENT_STALE=0;     stamp_current "$SCHEMA_STAMP" "$SCHEMA_NOW" || CLIENT_STALE=1

# Already up, and nothing has moved? Leave it alone — a second server would
# just fail to bind and muddy the logs.
if [ "$CLIENT_STALE" = 0 ] && [ "$MIGRATIONS_STALE" = 0 ] && server_responding "$PORT"; then
  ok "Dev server already running on port $PORT."
  exit 0
fi

# A running server holds the generated client in memory, so a regenerate alone
# would not reach it. Restart is the only way to pick up a schema change.
if port_listening "$PORT"; then
  if [ "$CLIENT_STALE" = 1 ] || [ "$MIGRATIONS_STALE" = 1 ]; then
    say "Schema changed since this server started — restarting it on the new one."
  else
    warn "Something is on port $PORT but returning errors — restarting it."
  fi
  pkill -f "next dev" 2>/dev/null || true
  pkill -f "next-server" 2>/dev/null || true
  sleep 2
fi

# Blocks until setup.sh is done, released before the server starts.
hold_lock

if ! deps_ok; then
  warn "Dependencies are missing or incomplete — installing before starting."
  install_deps
  # A rebuilt node_modules has no generated client at all, whatever the
  # fingerprint said a moment ago.
  CLIENT_STALE=1
fi

if [ "$CLIENT_STALE" = 1 ]; then
  say "Regenerating the Prisma client…"
  if npx prisma generate >/dev/null 2>&1; then
    printf '%s' "$SCHEMA_NOW" > "$SCHEMA_STAMP"
  else
    warn "Could not regenerate the Prisma client — run: npx prisma generate"
  fi
fi

bash .devcontainer/wait-for-db.sh || warn "Database not reachable — the app will error until it is."

if [ "$MIGRATIONS_STALE" = 1 ]; then
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
