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
