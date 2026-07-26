#!/usr/bin/env bash
# Blocks until the database accepts TCP connections, or gives up after ~30s.
# A plain socket probe: no psql in the node image, and this avoids paying
# Prisma's startup cost on every poll.
set -e
cd "$(dirname "$0")/.."

node -e '
const net = require("net");
const url = new URL(process.env.DATABASE_URL || "postgresql://liqops:liqops@db:5432/liquidation");
const host = url.hostname, port = Number(url.port) || 5432;
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
