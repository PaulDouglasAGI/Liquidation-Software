#!/usr/bin/env bash
# Runs once, when the Codespace / dev container is first created.
# Installs dependencies and gets the database ready. Safe to re-run.
set -e

AMBER='\033[33m'; GREEN='\033[32m'; NC='\033[0m'
say() { printf "${AMBER}[liqops]${NC} %s\n" "$1"; }
ok()  { printf "${GREEN}[liqops]${NC} %s\n" "$1"; }

cd "$(dirname "$0")/.."

# The DB lives in the sibling 'db' container (see docker-compose.yml). The app
# reads .env, so mirror the compose value into it.
DB_URL="${DATABASE_URL:-postgresql://liqops:liqops@db:5432/liquidation}"
if [ ! -f .env ]; then
  cat > .env <<EOF
DATABASE_URL=$DB_URL
LOCAL_UPLOAD_PATH=./uploads
EOF
  ok "Created .env"
else
  say ".env already exists — keeping it"
fi
mkdir -p uploads

say "Installing dependencies…"
npm install --no-fund --no-audit

say "Generating the Prisma client…"
npx prisma generate

# Compose already gates on the healthcheck, but a rebuild can race it.
say "Waiting for PostgreSQL…"
bash .devcontainer/wait-for-db.sh

say "Applying database migrations…"
npx prisma migrate deploy

echo
ok "Ready. The dev server starts automatically — look for the popup, or open"
ok "the PORTS tab and click the globe icon next to port 3000."
ok "Not running? Start it yourself with:  npm run dev"
