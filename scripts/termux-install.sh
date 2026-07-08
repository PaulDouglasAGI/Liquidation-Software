#!/data/data/com.termux/files/usr/bin/bash
# Liquidation Ops — Android installer (run inside Termux from F-Droid).
#
# One command sets up everything on your phone:
#
#   curl -fsSL https://raw.githubusercontent.com/PaulDouglasAGI/Liquidation-Software/main/scripts/termux-install.sh | bash
#
# (If the repo is private, download this file another way — e.g. copy/paste it
#  into `nano install.sh` — then run `bash install.sh`. It will ask for a
#  GitHub token to clone the code.)
#
# What it does:
#   1. Installs a minimal Ubuntu inside Termux (proot-distro — no root needed)
#   2. Installs Node.js 22 + PostgreSQL inside it
#   3. Clones the app, sets up the database, builds everything
#   4. Creates a `liqops` command — from then on, starting the app is:
#         liqops
#      then open http://localhost:3000 in Chrome and "Add to Home Screen".
set -e

REPO="PaulDouglasAGI/Liquidation-Software"
DISTRO="ubuntu"
APP_DIR="/root/Liquidation-Software"

say() { printf "\033[33m[liqops]\033[0m %s\n" "$1"; }

case "$PREFIX" in
  *com.termux*) ;;
  *) echo "This script must run inside Termux (install it from F-Droid)."; exit 1 ;;
esac

say "Step 1/4 — installing the Linux runtime (proot-distro + Ubuntu)…"
pkg update -y >/dev/null 2>&1 || pkg update -y
pkg install -y proot-distro termux-api >/dev/null 2>&1 || pkg install -y proot-distro
proot-distro list --installed 2>/dev/null | grep -q "$DISTRO" || proot-distro install "$DISTRO"

# GitHub auth (only needed while the repo is private)
GH_TOKEN=""
if [ -t 0 ]; then
  printf "If the GitHub repo is private, paste a GitHub token (Enter to skip): "
  read -r GH_TOKEN
fi
CLONE_URL="https://github.com/$REPO.git"
[ -n "$GH_TOKEN" ] && CLONE_URL="https://$GH_TOKEN@github.com/$REPO.git"

say "Step 2/4 — installing Node.js 22 + PostgreSQL inside Ubuntu (5–10 min)…"
proot-distro login "$DISTRO" -- bash -e -c '
  export DEBIAN_FRONTEND=noninteractive

  # postgresql'"'"'s own postinst tries to auto-create + start the default
  # cluster during "apt-get install", but proot has no real /proc or service
  # manager, so that step silently fails (this is the "pg_lsclusters: not
  # found" error some phones hit). Block the auto-attempt with a policy-rc.d
  # shim and do cluster creation + startup ourselves below, where failures
  # are actually checked instead of swallowed.
  cat > /usr/sbin/policy-rc.d <<"RCD"
#!/bin/sh
exit 101
RCD
  chmod +x /usr/sbin/policy-rc.d

  apt-get update -qq
  apt-get install -y -qq curl git ca-certificates postgresql >/dev/null
  if ! command -v node >/dev/null || [ "$(node -p "process.versions.node.split(\".\")[0]" 2>/dev/null || echo 0)" -lt 18 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
  fi

  PG_VERSION=$(ls /usr/lib/postgresql/ 2>/dev/null | sort -V | tail -1)
  if [ -z "$PG_VERSION" ]; then
    echo "PostgreSQL package files not found after install — something went wrong with apt-get install postgresql" >&2
    exit 1
  fi
  # pg_lsclusters column-aligns with variable whitespace, so match by field
  # (not a literal substring — "$PG_VERSION main" with one space won'"'"'t match
  # the real "16  main" double-space output).
  if ! pg_lsclusters 2>/dev/null | awk -v v="$PG_VERSION" '"'"'NR>1 && $1==v && $2=="main" {f=1} END{exit !f}'"'"'; then
    echo "no PostgreSQL cluster found — creating one ($PG_VERSION main)…"
    pg_createcluster "$PG_VERSION" main
  fi

  service postgresql start
  for i in $(seq 1 20); do
    su postgres -c "pg_isready -q" 2>/dev/null && break
    sleep 1
  done
  su postgres -c "pg_isready -q" || { echo "PostgreSQL did not start after 20s — cannot continue" >&2; exit 1; }

  su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='"'"'liquidation'"'"'\"" 2>/dev/null | grep -q 1 || su postgres -c "createdb liquidation"
  su postgres -c "psql -c \"ALTER USER postgres PASSWORD '"'"'postgres'"'"';\"" >/dev/null
  echo "runtime ready: node $(node -v), postgres up"
'

say "Step 3/4 — downloading and building the app (5–15 min on a phone)…"
proot-distro login "$DISTRO" -- bash -e -c "
  service postgresql start >/dev/null 2>&1 || true
  for i in \$(seq 1 20); do
    su postgres -c 'pg_isready -q' 2>/dev/null && break
    sleep 1
  done
  if [ ! -d $APP_DIR ]; then
    git clone --depth 1 '$CLONE_URL' $APP_DIR
  else
    cd $APP_DIR && git pull --ff-only || true
  fi
  cd $APP_DIR
  bash scripts/setup.sh
"

say "Step 4/4 — creating the 'liqops' launcher command…"
cat > "$PREFIX/bin/liqops" <<LAUNCHER
#!/data/data/com.termux/files/usr/bin/bash
# Starts Liquidation Ops. Ctrl+C stops it.
termux-wake-lock 2>/dev/null || true
echo ""
echo "  Liquidation Ops starting…"
echo "  Open Chrome ->  http://localhost:3000"
echo "  (menu -> 'Add to Home Screen' to install it as an app)"
echo ""
exec proot-distro login $DISTRO -- bash -c 'service postgresql start >/dev/null 2>&1; cd $APP_DIR && npm run start'
LAUNCHER
chmod +x "$PREFIX/bin/liqops"

echo
say "Done! Start the app any time by typing:  liqops"
say "Then open http://localhost:3000 in Chrome — the first visit walks you through creating your account."
