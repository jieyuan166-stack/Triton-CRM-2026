#!/bin/sh
set -eu

APP_URL="${APP_URL:-http://127.0.0.1:3001}"

if [ -z "${CRON_SECRET:-}" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S %Z') CRON_SECRET is required" >&2
  exit 1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S %Z') email reminders run started"
curl -fsS \
  -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$APP_URL/api/automation/email-reminders/run"
echo
echo "$(date '+%Y-%m-%d %H:%M:%S %Z') email reminders run finished"
