#!/bin/sh
# Create a full encrypted Triton CRM disaster-recovery package on the NAS.
set -eu

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck disable=SC1091
. "$PROJECT_DIR/scripts/disaster-recovery-common.sh"

reason="manual"
local_only=false
skip_prune=false
test_email=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --reason) reason="$2"; shift 2 ;;
    --scheduled) reason="scheduled"; shift ;;
    --local-only) local_only=true; shift ;;
    --no-prune) skip_prune=true; shift ;;
    --test-email) test_email=true; shift ;;
    *) echo "Usage: ./backup-crm.sh [--reason manual|scheduled|pre-deploy|pre-migration|pre-restore] [--local-only] [--no-prune] [--test-email]" >&2; exit 2 ;;
  esac
done

case "$reason" in
  manual|scheduled|pre-deploy|pre-migration|pre-restore) ;;
  *) echo "Invalid backup reason: $reason" >&2; exit 2 ;;
esac

ensure_dr_directories
load_control_secret
load_backup_secrets

if [ "$test_email" = true ]; then
  curl --fail --silent --show-error \
    -X POST -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
    -d '{"mode":"test"}' "$CRM_URL/api/automation/disaster-backup-notify"
  exit 0
fi

state_dir="$DR_ROOT/state"
mkdir -p "$state_dir"
if [ "$reason" = "scheduled" ] && [ -f "$state_dir/last-biweekly-success.epoch" ]; then
  last="$(cat "$state_dir/last-biweekly-success.epoch" 2>/dev/null || printf 0)"
  now="$(date +%s)"
  if [ "$((now - last))" -lt 1209600 ]; then
    echo "A successful full disaster-recovery backup is less than 14 days old; skipping scheduled run."
    exit 0
  fi
fi

lock="$DR_ROOT/.backup.lock"
if ! mkdir "$lock" 2>/dev/null; then
  echo "Another disaster-recovery backup is already running." >&2
  exit 1
fi

stage="$DR_STAGING_DIR/backup-$(date +%s)-$$"
cleanup() {
  rm -rf "$stage" "$lock"
}
trap cleanup EXIT INT TERM
mkdir -p "$stage/data" "$stage/uploads" "$stage/recovery"

docker inspect "$CRM_CONTAINER" >/dev/null 2>&1 || { echo "CRM container $CRM_CONTAINER is unavailable." >&2; exit 1; }
docker inspect --format '{{.State.Running}}' "$CRM_CONTAINER" | grep -qx true || { echo "CRM container must be running to take an online backup." >&2; exit 1; }

timestamp="$(TZ=America/Vancouver date +%Y-%m-%d-%H%M%S)"
archive_name="triton-crm-backup-$timestamp-$reason.tar.gz.age"
archive_path="$DR_BACKUPS_DIR/$archive_name"
payload_path="$stage/payload.tar.gz"
db_temp="/tmp/triton-dr-$timestamp-$$.db"

docker exec "$CRM_CONTAINER" sh -lc "sqlite3 /app/prisma/data/triton.db '.backup $db_temp' && sqlite3 '$db_temp' 'PRAGMA integrity_check;' | grep -qx ok"
docker cp "$CRM_CONTAINER:$db_temp" "$stage/data/triton.db"
docker exec "$CRM_CONTAINER" rm -f "$db_temp"

if [ -d "$CRM_UPLOADS_DIR" ]; then
  cp -a "$CRM_UPLOADS_DIR/." "$stage/uploads/" 2>/dev/null || true
fi
cp "$PROJECT_DIR/prisma/schema.prisma" "$stage/recovery/schema.prisma"
cp -R "$PROJECT_DIR/prisma/migrations" "$stage/recovery/migrations"
cp "$PROJECT_DIR/docker/docker-compose.yml" "$stage/recovery/docker-compose.yml"
cp "$PROJECT_DIR/docs/DEPLOY.md" "$stage/recovery/DEPLOY.md"

image_id="$(docker inspect --format '{{.Image}}' "$CRM_CONTAINER")"
python3 "$PROJECT_DIR/scripts/build_crm_backup_manifest.py" \
  "$stage/data/triton.db" "$stage/uploads" "$stage/manifest.json" "$reason" "$image_id" "$PROJECT_DIR/prisma/migrations"

tar -C "$stage" -czf "$payload_path" data uploads recovery manifest.json
age_encrypt "$payload_path" "$stage/$archive_name"
mv "$stage/$archive_name" "$archive_path"
sha256sum "$archive_path" > "$archive_path.sha256"

"$PROJECT_DIR/verify-crm-backup.sh" "$archive_path" --quiet
python3 "$PROJECT_DIR/scripts/create_crm_backup_metadata.py" \
  --manifest "$stage/manifest.json" --archive "$archive_path" --output "$archive_path.meta.json" --reason "$reason"

if [ "$local_only" = true ]; then
  echo "Created verified local encrypted backup: $archive_path"
  exit 0
fi

b2_required
remote_prefix="${B2_PREFIX:-production}"
remote_key="$remote_prefix/$archive_name"
b2_copy_from_local "$archive_path" "$remote_key"
b2_copy_from_local "$archive_path.sha256" "$remote_key.sha256"
download_url="$(b2_presign "$remote_key")"
python3 "$PROJECT_DIR/scripts/create_crm_backup_metadata.py" \
  --manifest "$stage/manifest.json" --archive "$archive_path" --output "$archive_path.meta.json" --reason "$reason" \
  --remote-key "$remote_key" --remote-uploaded --download-url "$download_url"

payload_file="$stage/notify.json"
python3 - "$payload_file" "$archive_name" "$download_url" <<'PY'
import json, sys
from pathlib import Path
Path(sys.argv[1]).write_text(json.dumps({"mode": "backup", "filename": sys.argv[2], "downloadUrl": sys.argv[3]}) + "\n")
PY
curl --fail --silent --show-error \
  -X POST -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
  --data-binary "@$payload_file" "$CRM_URL/api/automation/disaster-backup-notify" >/dev/null

python3 "$PROJECT_DIR/scripts/create_crm_backup_metadata.py" \
  --manifest "$stage/manifest.json" --archive "$archive_path" --output "$archive_path.meta.json" --reason "$reason" \
  --remote-key "$remote_key" --remote-uploaded --email-sent --download-url "$download_url"

if [ "$reason" = "scheduled" ]; then
  date +%s > "$state_dir/last-biweekly-success.epoch"
fi
touch "$state_dir/activated"

if [ "$skip_prune" = false ]; then
  python3 "$PROJECT_DIR/scripts/prune_crm_backups.py" "$DR_BACKUPS_DIR" | while IFS= read -r old_name; do
    [ -n "$old_name" ] || continue
    old_meta="$DR_BACKUPS_DIR/$old_name.meta.json"
    old_key="$(python3 - "$old_meta" <<'PY'
import json, sys
print(json.load(open(sys.argv[1], encoding='utf-8')).get('remote', {}).get('key', ''))
PY
)"
    if [ -n "$old_key" ] && b2_remove "$old_key"; then
      b2_remove "$old_key.sha256" || true
      rm -f "$DR_BACKUPS_DIR/$old_name" "$DR_BACKUPS_DIR/$old_name.sha256" "$old_meta"
    fi
  done
fi

echo "Created, verified, encrypted, uploaded, and emailed: $archive_path"
