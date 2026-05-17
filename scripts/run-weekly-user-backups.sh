#!/bin/sh
set -eu

APP_URL="${APP_URL:-http://127.0.0.1:3001}"

if [ -z "${CRON_SECRET:-}" ]; then
  echo "CRON_SECRET is required" >&2
  exit 1
fi

curl -fsS \
  -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$APP_URL/api/automation/user-backups/run"
echo
