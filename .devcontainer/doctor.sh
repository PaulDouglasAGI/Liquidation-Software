#!/usr/bin/env bash
# Prints everything needed to work out why the app is not serving.
#
#   npm run doctor
#
# Never fails — every check reports and moves on, so you always get the
# full picture in one paste.

cd "$(dirname "$0")/.."
source .devcontainer/lib.sh

LOG=/tmp/liqops-dev.log
line() { printf '%s\n' "----------------------------------------------------------------"; }

echo; line; echo " Liquidation Ops — diagnostics"; line

echo "Runtime"
echo "  node        $(node -v 2>/dev/null || echo MISSING)"
echo "  npm         $(npm -v 2>/dev/null || echo MISSING)"
echo "  user        $(whoami)  |  cwd $(pwd)"

echo
echo "Dependencies"
if deps_ok; then
  echo "  node_modules  OK (next, @prisma/client, react present)"
else
  echo "  node_modules  BROKEN or missing  <-- run: npm run repair"
  [ -d node_modules ] || echo "                  (directory does not exist at all)"
  [ -x node_modules/.bin/next ] || echo "                  next binary missing"
  [ -d node_modules/@prisma/client ] || echo "                  @prisma/client missing"
fi

echo
echo "Environment"
if [ -f .env ]; then
  echo "  .env          present"
else
  echo "  .env          missing (falls back to the container's DATABASE_URL)"
fi
# Mask the password before printing.
EFF_URL="${DATABASE_URL:-$(grep -s '^DATABASE_URL=' .env | cut -d= -f2-)}"
echo "  DATABASE_URL  ${EFF_URL:-UNSET}" | sed -E 's|://([^:]+):[^@]*@|://\1:****@|'

echo
echo "Database"
if DATABASE_URL="$EFF_URL" bash .devcontainer/wait-for-db.sh >/dev/null 2>&1; then
  echo "  reachable     yes"
  if DATABASE_URL="$EFF_URL" npx prisma migrate status >/tmp/liqops-migrate.txt 2>&1; then
    echo "  migrations    $(grep -c 'migration' /tmp/liqops-migrate.txt >/dev/null && echo 'up to date' || echo 'see below')"
  else
    echo "  migrations    NOT applied  <-- run: npx prisma migrate deploy"
  fi
  grep -E "following migration|not yet been applied|Database schema is up to date" /tmp/liqops-migrate.txt 2>/dev/null | head -3 | sed 's/^/                /'
else
  echo "  reachable     NO  <-- the 'db' container is not up or DATABASE_URL is wrong"
fi

echo
echo "Web server (port 3000)"
if server_responding 3000; then
  echo "  listening     yes — the app is up; open the PORTS tab globe icon"
else
  echo "  listening     NO  <-- this is what produces a 502 on the forwarded port"
  if pgrep -f "next dev" >/dev/null 2>&1; then
    echo "                a 'next dev' process exists but is not answering yet"
  else
    echo "                no 'next dev' process running"
  fi
fi

echo
echo "Last dev-server output ($LOG)"
if [ -f "$LOG" ]; then
  line; tail -n 30 "$LOG"; line
else
  echo "  no log yet — the server has not been started by start.sh"
fi

echo
echo "Next steps"
if ! deps_ok; then
  echo "  npm run repair      # rebuild dependencies, keeps your data"
elif ! server_responding 3000; then
  echo "  npm run dev         # start the server and watch for errors"
else
  echo "  Everything looks healthy."
fi
echo
