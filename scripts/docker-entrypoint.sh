#!/usr/bin/env bash
# Applies any pending database migrations, then starts the app.
set -e

echo "[liqops] applying database migrations…"
npx prisma migrate deploy

echo "[liqops] starting — open http://localhost:3000 (first visit runs the setup wizard)"
exec npm run start
