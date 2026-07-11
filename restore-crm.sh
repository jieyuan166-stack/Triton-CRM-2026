#!/bin/sh
# Restore a complete encrypted Triton CRM disaster-recovery package.
set -eu

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck disable=SC1091
. "$PROJECT_DIR/scripts/disaster-recovery-common.sh"

target="${1:-latest}"
confirmed=false
[ "$#" -gt 0 ] && shift || true
if [ "${1:-}" = "--confirmed" ]; then confirmed=true; fi

ensure_dr_directories
load_control_secret
load_backup_secrets

fetch_latest_from_b2() {
  b2_required
  remote_prefix="${B2_PREFIX:-production}"
  listing="$DR_STAGING_DIR/b2-list-$$.json"
  b2_run s3api list-objects-v2 --bucket "$B2_BUCKET" --prefix "$remote_prefix/" --output json > "$listing"
  remote_key="$(python3 - "$listing" <<'PY'
import json, sys
items = json.load(open(sys.argv[1], encoding='utf-8')).get('Contents', [])
items = [item for item in items if item.get('Key', '').endswith('.tar.gz.age')]
items.sort(key=lambda item: item.get('LastModified', ''), reverse=True)
print(items[0]['Key'] if items else '')
PY
)"
  rm -f "$listing"
  [ -n "$remote_key" ] || { echo "No encrypted backup exists in Backblaze B2." >&2; exit 1; }
  filename="$(basename "$remote_key")"
  b2_copy_to_local "$remote_key" "$DR_BACKUPS_DIR/$filename"
  b2_copy_to_local "$remote_key.sha256" "$DR_BACKUPS_DIR/$filename.sha256"
  printf '%s\n' "$DR_BACKUPS_DIR/$filename"
}

if [ "$target" = "latest" ]; then
  archive="$(find "$DR_BACKUPS_DIR" -maxdepth 1 -type f -name 'triton-crm-backup-*.tar.gz.age' -print | sort | tail -n 1 || true)"
  if [ -z "$archive" ]; then
    archive="$(fetch_latest_from_b2)"
  fi
elif [ -f "$target" ]; then
  archive="$target"
else
  archive="$DR_BACKUPS_DIR/$target"
  if [ ! -f "$archive" ]; then
    safe_backup_name "$(basename "$target")"
    b2_required
    remote_prefix="${B2_PREFIX:-production}"
    b2_copy_to_local "$remote_prefix/$target" "$archive"
    b2_copy_to_local "$remote_prefix/$target.sha256" "$archive.sha256"
  fi
fi

require_file "$archive"
safe_backup_name "$(basename "$archive")"
"$PROJECT_DIR/verify-crm-backup.sh" "$archive" --quiet

if ! docker inspect "$CRM_CONTAINER" >/dev/null 2>&1; then
  echo "CRM container is not present. Creating an empty service before restore."
  (cd "$COMPOSE_DIR" && docker compose --env-file "$PROJECT_DIR/.env.production" up -d "$CRM_CONTAINER")
fi

is_empty=true
if docker inspect --format '{{.State.Running}}' "$CRM_CONTAINER" 2>/dev/null | grep -qx true; then
  current_clients="$(docker exec "$CRM_CONTAINER" sh -lc "sqlite3 /app/prisma/data/triton.db 'SELECT COUNT(*) FROM Client;'" 2>/dev/null || printf 0)"
  current_policies="$(docker exec "$CRM_CONTAINER" sh -lc "sqlite3 /app/prisma/data/triton.db 'SELECT COUNT(*) FROM Policy;'" 2>/dev/null || printf 0)"
  if [ "$current_clients" -gt 0 ] || [ "$current_policies" -gt 0 ]; then is_empty=false; fi
fi

if [ "$is_empty" = false ] && [ "$confirmed" = false ]; then
  printf "This will replace the current CRM database and uploads. Type RESTORE to continue: "
  read answer
  [ "$answer" = "RESTORE" ] || { echo "Restore cancelled."; exit 1; }
fi

# Preserve the current state locally before the destructive operation. A B2
# outage must never prevent an emergency restore from proceeding.
if docker inspect --format '{{.State.Running}}' "$CRM_CONTAINER" | grep -qx true; then
  "$PROJECT_DIR/backup-crm.sh" --reason pre-restore --local-only --no-prune
fi

stage="$DR_STAGING_DIR/restore-$(date +%s)-$$"
mkdir -p "$stage"
cleanup() { rm -rf "$stage"; }
trap cleanup EXIT INT TERM
cp "$archive" "$stage/$(basename "$archive")"
age_decrypt "$stage/$(basename "$archive")" "$stage/payload.tar.gz"
tar -C "$stage" -xzf "$stage/payload.tar.gz"
python3 "$PROJECT_DIR/scripts/verify_crm_backup.py" "$stage/manifest.json" "$stage/data/triton.db" "$stage/uploads" >/dev/null

db_dir="$(docker inspect "$CRM_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/app/prisma/data"}}{{.Source}}{{end}}{{end}}')"
[ -n "$db_dir" ] || { echo "Could not resolve the CRM database volume." >&2; exit 1; }

(cd "$COMPOSE_DIR" && docker compose --env-file "$PROJECT_DIR/.env.production" stop "$CRM_CONTAINER")
timestamp="$(TZ=America/Vancouver date +%Y-%m-%d-%H%M%S)"
if [ -f "$db_dir/triton.db" ]; then
  mv "$db_dir/triton.db" "$db_dir/triton.db.before-restore-$timestamp"
fi
cp "$stage/data/triton.db" "$db_dir/.triton.db.restore"
mv "$db_dir/.triton.db.restore" "$db_dir/triton.db"

uploads_previous="$DR_ROOT/uploads.before-restore-$timestamp"
if [ -d "$CRM_UPLOADS_DIR" ]; then
  mv "$CRM_UPLOADS_DIR" "$uploads_previous"
fi
mkdir -p "$CRM_UPLOADS_DIR"
cp -a "$stage/uploads/." "$CRM_UPLOADS_DIR/" 2>/dev/null || true
chmod 700 "$CRM_UPLOADS_DIR" 2>/dev/null || true

(cd "$COMPOSE_DIR" && docker compose --env-file "$PROJECT_DIR/.env.production" up -d "$CRM_CONTAINER")

attempt=0
while [ "$attempt" -lt 24 ]; do
  if curl -fsS "$CRM_URL/api/ready" >/dev/null 2>&1; then break; fi
  attempt=$((attempt + 1))
  sleep 5
done
curl -fsS "$CRM_URL/api/ready" >/dev/null || { echo "CRM did not become ready after restore." >&2; exit 1; }

python3 "$PROJECT_DIR/scripts/verify_crm_backup.py" "$stage/manifest.json" "$db_dir/triton.db" "$CRM_UPLOADS_DIR"
echo "CRM restore completed successfully."
