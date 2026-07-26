#!/usr/bin/env bash
# Stops the detached dev server started by start.sh.
#
#   npm run stop
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 1
echo "[liqops] Dev server stopped. Start it again with: npm run dev"
