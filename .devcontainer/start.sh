#!/usr/bin/env bash
# Runs each time you connect to the Codespace. Starts the dev server in a
# terminal you can see — Ctrl+C stops it, `npm run dev` starts it again.
set -e

cd "$(dirname "$0")/.."
source .devcontainer/lib.sh

# Blocks until setup.sh is done. Released before the server starts, so a later
# setup run isn't stuck behind a server that never exits.
hold_lock

# A half-finished or interrupted install leaves node_modules present but
# unusable; starting the server on it produces a 502 with no useful error.
if ! deps_ok; then
  warn "Dependencies are missing or incomplete — installing before starting."
  install_deps
  npx prisma generate >/dev/null 2>&1 || true
fi

# A rebuilt/resumed Codespace can attach before Postgres finishes booting.
bash .devcontainer/wait-for-db.sh || true

# Migrations may be newer than the volume if you pulled while stopped.
npx prisma migrate deploy >/dev/null 2>&1 || true

release_lock

echo ""
echo "  Liquidation Ops — starting the dev server"
echo "  When it says Ready, open the PORTS tab and click the globe on port 3000."
echo "  (First visit walks you through creating your account.)"
echo ""

# -H 0.0.0.0 so the forwarder can reach it from outside the container.
exec npx next dev -H 0.0.0.0 -p 3000
