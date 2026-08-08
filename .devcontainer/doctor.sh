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

echo "Machine"
# Exit code 137 in the restart list below means the kernel killed the server
# (out of memory); 143 means something asked it to stop. That distinction is
# the whole diagnosis, so record what the box actually has.
if command -v free >/dev/null 2>&1; then
  free -m | awk 'NR==2 {printf "  memory      %s MB total, %s MB available\n", $2, $7}'
fi
echo "  cpus        $(nproc 2>/dev/null || echo '?')"
if [ -r /sys/fs/cgroup/memory.max ]; then
  lim=$(cat /sys/fs/cgroup/memory.max)
  if [ "$lim" = "max" ]; then echo "  memory cap  none"; else echo "  memory cap  $((lim/1024/1024)) MB"; fi
fi
echo
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

# The generated client is not in git, so pulling a schema change leaves the old
# one behind. The symptom is a runtime PrismaClientValidationError reading
# "Unknown argument `<newField>`" — which looks like a code bug and is not one.
SCHEMA_NOW=$(cksum prisma/schema.prisma 2>/dev/null | cksum)
if [ "$(cat .devcontainer/.schema-generated 2>/dev/null)" = "$SCHEMA_NOW" ]; then
  echo "  prisma client OK (generated from the current schema)"
else
  echo "  prisma client STALE vs prisma/schema.prisma"
  echo "                  <-- run: npx prisma generate && npm run stop && npm run dev"
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
  echo "  listening     yes — the app is up"
  echo
  echo "  Still getting a 502 on the *.app.github.dev URL? Then the request is"
  echo "  not reaching this server, and the app is not the problem:"
  echo "    1. VS Code -> PORTS tab -> port 3000 -> click the globe icon."
  echo "       Never reuse a saved URL: every Codespace gets a new hostname and"
  echo "       an old one 502s forever."
  echo "    2. Still 502? Right-click port 3000 -> Port Visibility -> Public."
else
  echo "  listening     NO  <-- this is what produces a 502 on the forwarded port"
  if pgrep -f "next dev" >/dev/null 2>&1; then
    echo "                a 'next dev' process exists but is not answering yet"
  else
    echo "                no 'next dev' process running"
  fi
fi

echo
echo "Server restarts (137 = killed for memory, 143 = asked to stop)"
if [ -f "$LOG" ] && grep -q "dev server exited" "$LOG"; then
  grep "dev server exited" "$LOG" | tail -5 | sed 's/^/  /'
else
  echo "  none recorded"
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
  # Checks the data rather than the machine: whether orders, bundles, units
  # and costs still agree with each other.
  echo "  npm run check:data  # confirm the records still agree with each other"
fi
echo
