#!/usr/bin/env bash
# Liquidation Ops — one-command setup for a bare-metal Linux/macOS box
# (also used inside the Termux/proot Ubuntu created by termux-install.sh).
#
#   bash scripts/setup.sh            # set up + build
#   bash scripts/setup.sh --start    # set up + build + start the app
#
# Optional env vars:
#   LIQOPS_DB_URL   PostgreSQL connection string (default: local postgres)
set -e

AMBER='\033[33m'; GREEN='\033[32m'; RED='\033[31m'; DIM='\033[2m'; NC='\033[0m'
say()  { printf "${AMBER}[liqops]${NC} %s\n" "$1"; }
ok()   { printf "${GREEN}[liqops]${NC} %s\n" "$1"; }
fail() { printf "${RED}[liqops] %s${NC}\n" "$1"; exit 1; }

cd "$(dirname "$0")/.."

printf "${AMBER}"
cat <<'BANNER'
  _     ___ ___        ___  ____  ____
 | |   |_ _/ _ \  ___ / _ \|  _ \/ ___|
 | |    | | | | ||___| | | | |_) \___ \
 | |___ | | |_| |    | |_| |  __/ ___) |
 |_____|___\__\_\     \___/|_|   |____/
BANNER
printf "${NC}Liquidation Ops setup\n\n"

# --- Node.js ---------------------------------------------------------------
command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install Node 18+ from https://nodejs.org and re-run."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js 18+ required (found $(node -v)). Please upgrade."
ok "Node $(node -v)"

# --- .env ------------------------------------------------------------------
if [ ! -f .env ]; then
  DB_URL="${LIQOPS_DB_URL:-postgresql://postgres:postgres@localhost:5432/liquidation}"
  cat > .env <<EOF
DATABASE_URL=$DB_URL
LOCAL_UPLOAD_PATH=./uploads
EOF
  ok "Created .env (database: ${DB_URL%%\?*})"
else
  say ".env already exists — keeping it"
fi

# --- PostgreSQL (best effort for local installs) ----------------------------
DB_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
if command -v pg_isready >/dev/null 2>&1 && ! pg_isready -q 2>/dev/null; then
  say "PostgreSQL is not responding — trying to start it…"
  (service postgresql start || sudo service postgresql start || pg_ctlcluster 16 main start) >/dev/null 2>&1 || true
fi
# Create the database if we have local psql access and it doesn't exist yet.
DB_NAME=$(printf '%s' "$DB_URL" | sed -E 's|.*/([^/?]+)(\?.*)?$|\1|')
if command -v psql >/dev/null 2>&1; then
  RUN_AS_PG="psql"; command -v sudo >/dev/null 2>&1 && id postgres >/dev/null 2>&1 && RUN_AS_PG="sudo -u postgres psql"
  if ! $RUN_AS_PG -lqt 2>/dev/null | cut -d'|' -f1 | grep -qw "$DB_NAME"; then
    say "Creating database '$DB_NAME'…"
    $RUN_AS_PG -c "CREATE DATABASE $DB_NAME;" >/dev/null 2>&1 || true
    $RUN_AS_PG -c "ALTER USER postgres PASSWORD 'postgres';" >/dev/null 2>&1 || true
  fi
fi

# --- Install, migrate, build -------------------------------------------------
say "Installing dependencies (this can take a few minutes)…"
npm install --no-fund --no-audit

say "Applying database migrations…"
npx prisma migrate deploy || fail "Could not reach the database. Check DATABASE_URL in .env, then re-run this script."

say "Building the app…"
npm run build

echo
ok "Setup complete."
echo    "  Start the app:   npm run start"
echo    "  Then open:       http://localhost:3000"
printf "${DIM}  First visit opens a setup wizard to create your account — no config files needed.${NC}\n"
printf "${DIM}  On a phone: browser menu -> 'Add to Home Screen' installs it like an app.${NC}\n"

if [ "$1" = "--start" ]; then
  echo
  say "Starting…"
  exec npm run start
fi
