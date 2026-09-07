#!/bin/sh
# docker/entrypoint.sh
# Runs as the `nextjs` user (su-exec switches before invoking this).
# Steps:
#   1. Apply pending Prisma migrations.
#   2. Ensure the SQLite database is in WAL mode for better concurrent
#      reads/writes — important now that the app handles multi-user writes
#      (FollowUp, EmailHistory) plus background automation jobs.
#   3. Hand off to the standalone Next.js server.
set -eu

DB_FILE="${DB_FILE:-/app/prisma/data/triton.db}"

echo "[entrypoint] applying database migrations"
npx prisma migrate deploy

if [ -f "$DB_FILE" ]; then
  CURRENT_MODE="$(sqlite3 "$DB_FILE" 'PRAGMA journal_mode;' || echo unknown)"
  if [ "$CURRENT_MODE" != "wal" ]; then
    echo "[entrypoint] enabling SQLite WAL mode (was: $CURRENT_MODE)"
    sqlite3 "$DB_FILE" 'PRAGMA journal_mode=WAL;' >/dev/null
  else
    echo "[entrypoint] SQLite journal mode already WAL"
  fi
else
  echo "[entrypoint] database file $DB_FILE not found yet; WAL will be set on next start"
fi

echo "[entrypoint] starting Next.js"
exec node server.js
