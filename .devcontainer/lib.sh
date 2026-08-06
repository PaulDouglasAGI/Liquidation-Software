#!/usr/bin/env bash
# Shared helpers for the dev container scripts. Sourced, not executed.

AMBER='\033[33m'; GREEN='\033[32m'; RED='\033[31m'; NC='\033[0m'
say()  { printf "${AMBER}[liqops]${NC} %s\n" "$1"; }
ok()   { printf "${GREEN}[liqops]${NC} %s\n" "$1"; }
warn() { printf "${RED}[liqops]${NC} %s\n" "$1"; }

LOCK_FILE="/tmp/liqops-devcontainer.lock"

# Serialises setup and startup. npm rewriting node_modules while the dev
# server reads it is what produces "ENOTEMPTY ... rmdir @swc/helpers/_" and a
# half-installed tree, so the two must never overlap.
#
# Usage: hold_lock; <work>; release_lock
hold_lock() {
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    say "Waiting for the other setup step to finish…"
    flock 9
  fi
}
release_lock() { exec 9>&- 2>/dev/null || true; }

# Is the app actually SERVING on this port? Node rather than curl, because curl
# is not guaranteed in every base image.
#
# A 5xx counts as NOT healthy on purpose. A server that boots but 500s on every
# request (bad DATABASE_URL, unapplied migrations) would otherwise be reported
# as "running" while the app is unusable.
server_responding() {
  local port="${1:-3000}"
  node -e '
    const http = require("http");
    const req = http.get({ host: "127.0.0.1", port: process.argv[1], path: "/login", timeout: 15000 },
      res => { res.resume(); process.exit(res.statusCode && res.statusCode < 500 ? 0 : 1); });
    req.on("error", () => process.exit(1));
    req.on("timeout", () => { req.destroy(); process.exit(1); });
  ' "$port" 2>/dev/null
}

# Anything listening at all, healthy or not — distinguishes "no process" from
# "process up but erroring", which need different advice.
port_listening() {
  local port="${1:-3000}"
  node -e '
    const net = require("net");
    const s = net.createConnection({ host: "127.0.0.1", port: Number(process.argv[1]) });
    s.setTimeout(2000);
    s.on("connect", () => { s.end(); process.exit(0); });
    s.on("timeout", () => { s.destroy(); process.exit(1); });
    s.on("error", () => process.exit(1));
  ' "$port" 2>/dev/null
}

# Guarantees DATABASE_URL is in the environment. Next loads .env itself, but
# being explicit means the server can never boot without it — which surfaces
# as "Environment variable not found: DATABASE_URL" and a 500 on every page.
load_env() {
  if [ -z "$DATABASE_URL" ] && [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  fi
  export DATABASE_URL
}

# Is node_modules actually usable? A partial install leaves the directory
# present but the binaries missing, which is why a failed install shows up
# later as a mysterious 502 rather than an obvious error.
deps_ok() {
  [ -x node_modules/.bin/next ] \
    && [ -d node_modules/@prisma/client ] \
    && [ -d node_modules/react ]
}

# Installs dependencies, repairing a corrupted tree rather than failing on it.
install_deps() {
  if deps_ok; then
    say "Dependencies present — refreshing…"
    if npm install --no-fund --no-audit; then return 0; fi
    warn "npm install failed — rebuilding node_modules from scratch"
  fi

  # Anything holding files open will make the removal fail again.
  pkill -f "next dev" 2>/dev/null || true
  pkill -f "next-server" 2>/dev/null || true
  rm -rf node_modules

  # npm ci is the deterministic path and matches package-lock.json exactly.
  if ! npm ci --no-fund --no-audit; then
    warn "npm ci failed — falling back to npm install"
    npm install --no-fund --no-audit
  fi

  if ! deps_ok; then
    warn "node_modules is still incomplete after reinstalling."
    warn "Try:  rm -rf node_modules && npm ci"
    return 1
  fi
}
