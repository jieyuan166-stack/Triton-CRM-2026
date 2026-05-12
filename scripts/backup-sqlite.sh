#!/bin/sh
set -eu

CONTAINER_NAME="${CONTAINER_NAME:-triton-crm}"
BACKUP_DIR="${BACKUP_DIR:-/volume1/docker/.docker-triton-backups}"
DB_PATH="${DB_PATH:-/app/prisma/data/triton.db}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

DATE="$(date +%Y%m%d)"
TIME="$(date +%H%M%S)"
HASH_FILE="$BACKUP_DIR/.last-db.sha256"
TODAY_GLOB="$BACKUP_DIR/triton-$DATE-"'*.db.gz'
TARGET="$BACKUP_DIR/triton-$DATE-$TIME.db.gz"

mkdir -p "$BACKUP_DIR"

CURRENT_HASH="$(docker exec "$CONTAINER_NAME" sh -lc "sha256sum '$DB_PATH' | cut -d ' ' -f 1")"
LAST_HASH=""
if [ -f "$HASH_FILE" ]; then
  LAST_HASH="$(cat "$HASH_FILE" || true)"
fi

# If the database content is unchanged and today's automatic backup already
# exists, skip the backup. Manual backups from Settings are unaffected.
if [ "$CURRENT_HASH" = "$LAST_HASH" ] && ls $TODAY_GLOB >/dev/null 2>&1; then
  echo "No database changes since last backup; skipping."
  exit 0
fi

docker exec "$CONTAINER_NAME" sh -lc "sqlite3 '$DB_PATH' '.backup /tmp/triton-backup.db' && gzip -c /tmp/triton-backup.db" > "$TARGET"
chmod 600 "$TARGET"
printf '%s' "$CURRENT_HASH" > "$HASH_FILE"

find "$BACKUP_DIR" -name "triton-*.db.gz" -mtime +"$RETENTION_DAYS" -delete

echo "Created $TARGET"
