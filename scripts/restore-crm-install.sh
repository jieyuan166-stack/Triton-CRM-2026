#!/bin/sh
# Install only a pre-verified archive. Retain original files until startup succeeds.
set -eu
stage="$1"; db_dir="$2"; uploads="$3"; container="$4"; compose="$5"; url="$6"; project="$7"
rollback_db="$db_dir/.restore-original-$$"
rollback_uploads="${uploads}.restore-original-$$"
incoming_uploads="${uploads}.restore-incoming-$$"
stopped=false
db_moved=false
uploads_moved=false
installed=false
success=false

service() { (cd "$compose" && docker compose --env-file "$project/.env.production" "$@" "$container"); }
ready() {
  i=0
  while [ "$i" -lt "${RESTORE_READY_ATTEMPTS:-24}" ]; do
    if curl --max-time 5 -fsS "$url/api/ready" >/dev/null 2>&1; then return 0; fi
    i=$((i + 1)); sleep "${RESTORE_READY_INTERVAL:-5}"
  done
  return 1
}
cleanup() {
  result=$?
  trap - EXIT INT TERM
  if [ "$success" = false ] && [ "$stopped" = true ]; then
    echo "Restore failed. Rolling back to the original CRM files." >&2
    # Never replace files while the failed application might still be writing.
    if service stop; then
      if [ "$installed" = true ]; then
        rm -f "$db_dir/triton.db" "$db_dir/triton.db-wal" "$db_dir/triton.db-shm"
      fi
      if [ "$db_moved" = true ]; then
        for file in triton.db triton.db-wal triton.db-shm; do
          if [ -f "$rollback_db/$file" ]; then mv "$rollback_db/$file" "$db_dir/$file" || result=1; fi
        done
      fi
      if [ "$uploads_moved" = true ]; then
        rm -rf "$uploads"
        mv "$rollback_uploads" "$uploads" || result=1
      fi
      if service up -d && ready; then
        echo "Original CRM restored and ready. The requested restore did not complete." >&2
      else
        echo "Rollback requires attention. Original files are retained in the restore-original directories." >&2
      fi
    else
      echo "Could not stop CRM; original files retained. Manual recovery required." >&2
    fi
    result=1
  fi
  rm -rf "$incoming_uploads"
  rm -f "$db_dir/.triton.db.incoming-$$"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

mkdir -p "$incoming_uploads" "$rollback_db"
python3 "$project/scripts/crm_uploads.py" "$stage/uploads" "$incoming_uploads"
cp "$stage/data/triton.db" "$db_dir/.triton.db.incoming-$$"
python3 "$project/scripts/verify_crm_backup.py" "$stage/manifest.json" "$db_dir/.triton.db.incoming-$$" "$incoming_uploads" >/dev/null

service stop
stopped=true
db_moved=true
for file in triton.db triton.db-wal triton.db-shm; do
  if [ -f "$db_dir/$file" ]; then mv "$db_dir/$file" "$rollback_db/$file"; fi
done
installed=true
mv "$db_dir/.triton.db.incoming-$$" "$db_dir/triton.db"
if [ -d "$uploads" ]; then
  mv "$uploads" "$rollback_uploads"
  uploads_moved=true
fi
mv "$incoming_uploads" "$uploads"
# The NAS runtime identity owns the configured mounts; do not grant world access.
owner="$(stat -c '%u:%g' "$db_dir" 2>/dev/null || stat -f '%u:%g' "$db_dir")"
chown -R "$owner" "$uploads" "$db_dir/triton.db"
chmod 660 "$db_dir/triton.db"
find "$uploads" -type d -exec chmod 750 {} \;
find "$uploads" -type f -exec chmod 640 {} \;
service up -d
ready || { echo "CRM failed readiness after restore." >&2; exit 1; }
python3 "$project/scripts/verify_crm_backup.py" "$stage/manifest.json" "$db_dir/triton.db" "$uploads" --live
success=true
rm -rf "$rollback_db" "$rollback_uploads"
echo "CRM restore completed successfully."
