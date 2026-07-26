#!/usr/bin/env bash
# Rebuilds the dev environment from scratch when something is wedged —
# a failed install, a 502 from a dead server, a corrupted build cache.
#
#   npm run repair
#
# Touches nothing in the database, so your pallets and items survive.
set -e

cd "$(dirname "$0")/.."
source .devcontainer/lib.sh

say "Stopping any running dev server…"
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 1

hold_lock

say "Clearing node_modules and the build cache…"
rm -rf node_modules .next

say "Reinstalling dependencies…"
install_deps

say "Generating the Prisma client…"
npx prisma generate

say "Waiting for PostgreSQL…"
bash .devcontainer/wait-for-db.sh || warn "Database unreachable — is the 'db' container running?"

say "Applying database migrations…"
npx prisma migrate deploy || warn "Migrations did not apply — check the database is up."

release_lock

echo
ok "Repaired. Start the app with:  npm run dev"
