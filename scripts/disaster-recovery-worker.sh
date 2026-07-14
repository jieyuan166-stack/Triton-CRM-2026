#!/bin/sh
# NAS-side worker. The CRM web container can enqueue signed requests but never
# receives Docker socket access or permission to replace the live database.
set -eu

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
# shellcheck disable=SC1091
. "$PROJECT_DIR/scripts/disaster-recovery-common.sh"

ensure_dr_directories
load_control_secret
mkdir -p "$DR_REQUESTS_DIR/processing" "$DR_REQUESTS_DIR/processed" "$DR_REQUESTS_DIR/failed"

delete_backup() {
  backup_name="$1"
  safe_backup_name "$backup_name"
  archive="$DR_BACKUPS_DIR/$backup_name"
  metadata="$archive.meta.json"
  checksum="$archive.sha256"
  [ -f "$archive" ] || { echo "Backup file was not found." >&2; return 1; }

  remote_uploaded=false
  remote_key=""
  if [ -f "$metadata" ]; then
    remote_uploaded="$(python3 - "$metadata" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding='utf-8'))
print('true' if data.get('remote', {}).get('uploaded') else 'false')
PY
)"
    remote_key="$(python3 - "$metadata" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding='utf-8'))
print(data.get('remote', {}).get('key', ''))
PY
)"
  fi

  if [ "$remote_uploaded" = true ]; then
    [ -n "$remote_key" ] || { echo "Backup metadata is missing its B2 object key." >&2; return 1; }
    load_backup_secrets
    b2_required
    b2_remove "$remote_key"
    b2_remove "$remote_key.sha256" || true
  fi

  rm -f "$archive" "$checksum" "$metadata"
}

for request_file in "$DR_REQUESTS_DIR"/*.json; do
  [ -f "$request_file" ] || continue
  request_id="$(basename "$request_file" .json)"
  processing="$DR_REQUESTS_DIR/processing/$request_id.json"
  mv "$request_file" "$processing"

  valid="$(python3 - "$processing" <<'PY'
import hashlib, hmac, json, os, sys
request = json.load(open(sys.argv[1], encoding='utf-8'))
filenames = request.get("filenames")
target = "\n".join(sorted(set(filenames))) if isinstance(filenames, list) and filenames else request.get("filename", "") or ""
payload = "|".join([
    request.get("id", ""), request.get("action", ""), target,
    request.get("requestedAt", ""), request.get("requestedBy", {}).get("id", ""), request.get("confirmation", "") or "",
])
expected = hmac.new(os.environ["BACKUP_CONTROL_SECRET"].encode(), payload.encode(), hashlib.sha256).hexdigest()
print("yes" if hmac.compare_digest(expected, request.get("signature", "")) else "no")
PY
)"
  if [ "$valid" != yes ]; then
    write_status "$request_id" failed "Request signature validation failed"
    mv "$processing" "$DR_REQUESTS_DIR/failed/$request_id.json"
    continue
  fi

  action="$(python3 - "$processing" <<'PY'
import json, sys
print(json.load(open(sys.argv[1], encoding='utf-8')).get('action', ''))
PY
)"
filename="$(python3 - "$processing" <<'PY'
import json, sys
print(json.load(open(sys.argv[1], encoding='utf-8')).get('filename') or '')
PY
)"
filenames="$(python3 - "$processing" <<'PY'
import json, sys
request = json.load(open(sys.argv[1], encoding='utf-8'))
for filename in request.get('filenames') or []:
    print(filename)
PY
)"
  write_status "$request_id" running "NAS worker is processing the request" "$filename"

  set +e
  completion_message="Request completed successfully"
  case "$action" in
    backup)
      load_backup_secrets
      if offsite_delivery_is_configured; then
        "$PROJECT_DIR/backup-crm.sh" --reason manual
      else
        "$PROJECT_DIR/backup-crm.sh" --reason manual --local-only
        completion_message="Verified encrypted local backup completed. B2 upload and email are pending configuration."
      fi
      result=$?
      ;;
    test-email)
      "$PROJECT_DIR/backup-crm.sh" --test-email
      result=$?
      ;;
    restore)
      "$PROJECT_DIR/restore-crm.sh" "$filename" --confirmed
      result=$?
      ;;
    delete)
      result=0
      deleted_count=0
      while IFS= read -r backup_name; do
        [ -n "$backup_name" ] || continue
        delete_backup "$backup_name" || { result=1; break; }
        deleted_count=$((deleted_count + 1))
      done <<EOF
$filenames
EOF
      completion_message="$deleted_count encrypted backup(s) deleted"
      ;;
    *)
      result=1
      ;;
  esac
  set -e

  if [ "$result" -eq 0 ]; then
    write_status "$request_id" completed "$completion_message" "$filename"
    mv "$processing" "$DR_REQUESTS_DIR/processed/$request_id.json"
  else
    write_status "$request_id" failed "Request failed. Check /volume1/docker/triton-crm/disaster-recovery/worker.log" "$filename"
    mv "$processing" "$DR_REQUESTS_DIR/failed/$request_id.json"
  fi
done
