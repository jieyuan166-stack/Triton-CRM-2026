#!/bin/sh
set -eu

CONTAINER_NAME="${CONTAINER_NAME:-triton-crm}"
BACKUP_DIR="${BACKUP_DIR:-/volume1/docker/triton-crm/backups}"
DB_PATH="${DB_PATH:-/app/prisma/data/triton.db}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
TIME_ZONE="${TIME_ZONE:-America/Vancouver}"

DATE="$(TZ="$TIME_ZONE" date +%Y%m%d)"
TIME="$(TZ="$TIME_ZONE" date +%H%M%S)"
HASH_FILE="$BACKUP_DIR/.last-db.sha256"
HASH_FILE_IN_CONTAINER="/app/backups/.last-db.sha256"
TODAY_GLOB_IN_CONTAINER="/app/backups/triton-$DATE-*.db.gz"
FILENAME="triton-$DATE-$TIME.db.gz"
TARGET_IN_CONTAINER="/app/backups/$FILENAME"

mkdir -p "$BACKUP_DIR"

CURRENT_HASH="$(docker exec "$CONTAINER_NAME" sh -lc "sha256sum '$DB_PATH' | cut -d ' ' -f 1")"
LAST_HASH=""
if docker exec "$CONTAINER_NAME" sh -lc "test -f '$HASH_FILE_IN_CONTAINER'" >/dev/null 2>&1; then
  LAST_HASH="$(docker exec "$CONTAINER_NAME" sh -lc "cat '$HASH_FILE_IN_CONTAINER' || true")"
elif [ -f "$HASH_FILE" ]; then
  LAST_HASH="$(cat "$HASH_FILE" || true)"
fi

# If the database content is unchanged and today's automatic backup already
# exists, skip the backup. Manual backups from Settings are unaffected.
if [ "$CURRENT_HASH" = "$LAST_HASH" ] &&
  docker exec "$CONTAINER_NAME" sh -lc "ls $TODAY_GLOB_IN_CONTAINER >/dev/null 2>&1"; then
  echo "No database changes since last backup; skipping."
  exit 0
fi

docker exec "$CONTAINER_NAME" sh -lc "sqlite3 '$DB_PATH' '.backup /tmp/triton-backup.db' && gzip -c /tmp/triton-backup.db > '$TARGET_IN_CONTAINER' && chmod 660 '$TARGET_IN_CONTAINER'"
docker exec "$CONTAINER_NAME" sh -lc "printf '%s' '$CURRENT_HASH' > '$HASH_FILE_IN_CONTAINER'"

docker exec "$CONTAINER_NAME" sh -lc "cd /app/backups && node - <<'NODE'
const fs = require('fs');
const keep = Number(process.env.KEEP_BACKUPS || '$KEEP_BACKUPS');
let flags = {};
try {
  flags = JSON.parse(fs.readFileSync('.backup-flags.json', 'utf8'));
} catch {}
const files = fs.readdirSync('.')
  .filter((name) => name.endsWith('.db.gz'))
  .map((name) => ({ name, stat: fs.statSync(name) }))
  .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
let keptUnstarred = 0;
for (const file of files) {
  if (flags[file.name]?.important) continue;
  keptUnstarred += 1;
  if (keptUnstarred > keep) {
    fs.unlinkSync(file.name);
  }
}
NODE"

echo "Created $BACKUP_DIR/$FILENAME"
