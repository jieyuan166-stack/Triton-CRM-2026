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

for request_file in "$DR_REQUESTS_DIR"/*.json; do
  [ -f "$request_file" ] || continue
  request_id="$(basename "$request_file" .json)"
  processing="$DR_REQUESTS_DIR/processing/$request_id.json"
  mv "$request_file" "$processing"

  valid="$(python3 - "$processing" <<'PY'
import hashlib, hmac, json, os, sys
request = json.load(open(sys.argv[1], encoding='utf-8'))
payload = "|".join([
    request.get("id", ""), request.get("action", ""), request.get("filename", "") or "",
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
  write_status "$request_id" running "NAS worker is processing the request" "$filename"

  set +e
  case "$action" in
    backup)
      "$PROJECT_DIR/backup-crm.sh" --reason manual
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
    *)
      result=1
      ;;
  esac
  set -e

  if [ "$result" -eq 0 ]; then
    write_status "$request_id" completed "Request completed successfully" "$filename"
    mv "$processing" "$DR_REQUESTS_DIR/processed/$request_id.json"
  else
    write_status "$request_id" failed "Request failed. Check /volume1/docker/triton-crm/disaster-recovery/worker.log" "$filename"
    mv "$processing" "$DR_REQUESTS_DIR/failed/$request_id.json"
  fi
done
