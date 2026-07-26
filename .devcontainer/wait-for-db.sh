#!/usr/bin/env bash
# Blocks until the database accepts TCP connections, or gives up after ~30s.
# A plain socket probe: no psql in the node image, and this avoids paying
# Prisma's startup cost on every poll.
set -e
cd "$(dirname "$0")/.."

# DATABASE_URL normally comes from the container environment, but fall back to
# .env so the probe still targets the right host when run from a plain shell.
if [ -z "$DATABASE_URL" ] && [ -f .env ]; then
  DATABASE_URL="$(grep -s '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"
fi
export DATABASE_URL

node -e '
const net = require("net");
const raw = process.env.DATABASE_URL || "postgresql://liqops:liqops@db:5432/liquidation";
let host = "db", port = 5432;
try {
  const url = new URL(raw);
  // A "?host=/path" query means a Unix socket, which needs no TCP wait.
  const sock = url.searchParams.get("host");
  if (sock && sock.startsWith("/")) process.exit(0);
  host = url.hostname || host;
  port = Number(url.port) || 5432;
} catch { /* keep the defaults */ }

let tries = 0;
(function attempt() {
  const sock = net.createConnection({ host, port });
  sock.setTimeout(1000);
  const retry = () => {
    sock.destroy();
    if (++tries >= 30) {
      console.error(`  database at ${host}:${port} never came up`);
      process.exit(1);
    }
    setTimeout(attempt, 1000);
  };
  sock.on("connect", () => { sock.end(); process.exit(0); });
  sock.on("timeout", retry);
  sock.on("error", retry);
})();
'
