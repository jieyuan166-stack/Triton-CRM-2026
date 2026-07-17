#!/bin/sh
# Shared helpers for NAS-only disaster recovery scripts. This file contains no
# credentials; those live in backup-secrets/backup.env on the NAS.

set -eu

PROJECT_DIR="${PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
COMPOSE_DIR="$PROJECT_DIR/docker"
SECRETS_FILE="${BACKUP_SECRETS_FILE:-$PROJECT_DIR/backup-secrets/backup.env}"
DR_ROOT="${DISASTER_RECOVERY_ROOT:-$PROJECT_DIR/disaster-recovery}"
DR_BACKUPS_DIR="$DR_ROOT/backups"
DR_STATUS_DIR="$DR_ROOT/status"
DR_REQUESTS_DIR="$DR_ROOT/requests"
DR_STAGING_DIR="$DR_ROOT/staging"
CRM_UPLOADS_DIR="${CRM_UPLOADS_DIR:-$PROJECT_DIR/uploads}"
CRM_CONTAINER="${CRM_CONTAINER:-triton-crm}"
CRM_URL="${CRM_URL:-http://127.0.0.1:3001}"

require_file() {
  [ -f "$1" ] || { echo "Required file is missing: $1" >&2; exit 1; }
}

load_backup_secrets() {
  require_file "$SECRETS_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$SECRETS_FILE"
  set +a
  : "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required in backup.env}"
  : "${BACKUP_AGE_IDENTITY_FILE:?BACKUP_AGE_IDENTITY_FILE is required in backup.env}"
  : "${CRON_SECRET:?CRON_SECRET is required in .env.production}"
  require_file "$BACKUP_AGE_IDENTITY_FILE"
}

load_control_secret() {
  require_file "$PROJECT_DIR/.env.production"
  set -a
  # shellcheck disable=SC1090
  . "$PROJECT_DIR/.env.production"
  set +a
  : "${BACKUP_CONTROL_SECRET:?BACKUP_CONTROL_SECRET is required in .env.production}"
  : "${CRON_SECRET:?CRON_SECRET is required in .env.production}"
}

ensure_dr_directories() {
  mkdir -p "$DR_BACKUPS_DIR" "$DR_STATUS_DIR" "$DR_REQUESTS_DIR" "$DR_STAGING_DIR" "$CRM_UPLOADS_DIR"
  chmod 700 "$DR_ROOT" "$DR_BACKUPS_DIR" "$DR_STATUS_DIR" "$DR_REQUESTS_DIR" "$DR_STAGING_DIR" "$CRM_UPLOADS_DIR" 2>/dev/null || true
}

safe_backup_name() {
  case "$1" in
    triton-crm-backup-*.tar.gz.age) return 0 ;;
    *) echo "Invalid disaster recovery backup filename" >&2; return 1 ;;
  esac
}

age_encrypt() {
  input="$1"
  output="$2"
  docker run --rm \
    -v "$(dirname "$input"):/work" \
    "${BACKUP_AGE_IMAGE:-alpine:3.20}" \
    sh -ec 'command -v age >/dev/null 2>&1 || apk add --no-cache age >/dev/null; exec age "$@"' -- \
    -r "$BACKUP_AGE_RECIPIENT" \
    -o "/work/$(basename "$output")" \
    "/work/$(basename "$input")"
}

age_decrypt() {
  input="$1"
  output="$2"
  docker run --rm \
    -v "$(dirname "$input"):/work" \
    -v "$BACKUP_AGE_IDENTITY_FILE:/secrets/age-identity.txt:ro" \
    "${BACKUP_AGE_IMAGE:-alpine:3.20}" \
    sh -ec 'command -v age >/dev/null 2>&1 || apk add --no-cache age >/dev/null; exec age "$@"' -- \
    -d -i /secrets/age-identity.txt \
    -o "/work/$(basename "$output")" \
    "/work/$(basename "$input")"
}

b2_required() {
  : "${B2_S3_ENDPOINT:?B2_S3_ENDPOINT is required for offsite backup}"
  : "${B2_BUCKET:?B2_BUCKET is required for offsite backup}"
  : "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is required for offsite backup}"
  : "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is required for offsite backup}"
}

backup_email_delivery_is_configured() {
  [ -n "${BACKUP_EMAIL_TO:-}" ] || return 1
  [ -n "${BACKUP_SMTP_HOST:-}" ] || return 1
  [ -n "${BACKUP_SMTP_USER:-}" ] || return 1
  [ -n "${BACKUP_SMTP_PASSWORD:-}" ] || return 1
  [ -n "${BACKUP_SMTP_FROM_EMAIL:-}" ] || return 1
}

b2_offsite_is_configured() {
  [ -n "${B2_S3_ENDPOINT:-}" ] || return 1
  [ -n "${B2_BUCKET:-}" ] || return 1
  [ -n "${AWS_ACCESS_KEY_ID:-}" ] || return 1
  [ -n "${AWS_SECRET_ACCESS_KEY:-}" ] || return 1
}

github_release_offsite_is_configured() {
  [ -n "${GITHUB_BACKUP_REPOSITORY:-}" ] || return 1
  [ -n "${GITHUB_BACKUP_TOKEN:-}" ] || return 1
}

github_git_offsite_is_configured() {
  [ -n "${GITHUB_BACKUP_GIT_REMOTE:-}" ] || return 1
  [ -n "${GITHUB_BACKUP_DEPLOY_KEY:-}" ] || return 1
  [ -n "${GITHUB_BACKUP_KNOWN_HOSTS:-}" ] || return 1
  [ -r "$GITHUB_BACKUP_DEPLOY_KEY" ] || return 1
  [ -r "$GITHUB_BACKUP_KNOWN_HOSTS" ] || return 1
}

offsite_delivery_provider() {
  if github_release_offsite_is_configured; then
    printf '%s\n' github-release
  elif github_git_offsite_is_configured; then
    printf '%s\n' github-git
  elif b2_offsite_is_configured; then
    printf '%s\n' b2
  else
    printf '%s\n' none
  fi
}

offsite_delivery_is_configured() {
  [ "$(offsite_delivery_provider)" != "none" ]
}

b2_run() {
  docker run --rm --env-file "$SECRETS_FILE" -e AWS_EC2_METADATA_DISABLED=true \
    "${B2_AWS_CLI_IMAGE:-amazon/aws-cli:2.17.44}" \
    --endpoint-url "$B2_S3_ENDPOINT" "$@"
}

b2_copy_from_local() {
  local_file="$1"
  remote_key="$2"
  docker run --rm --env-file "$SECRETS_FILE" -e AWS_EC2_METADATA_DISABLED=true \
    -v "$(dirname "$local_file"):/backups:ro" \
    "${B2_AWS_CLI_IMAGE:-amazon/aws-cli:2.17.44}" \
    --endpoint-url "$B2_S3_ENDPOINT" \
    s3 cp "/backups/$(basename "$local_file")" "s3://$B2_BUCKET/$remote_key"
}

b2_copy_to_local() {
  remote_key="$1"
  local_file="$2"
  mkdir -p "$(dirname "$local_file")"
  docker run --rm --env-file "$SECRETS_FILE" -e AWS_EC2_METADATA_DISABLED=true \
    -v "$(dirname "$local_file"):/backups" \
    "${B2_AWS_CLI_IMAGE:-amazon/aws-cli:2.17.44}" \
    --endpoint-url "$B2_S3_ENDPOINT" \
    s3 cp "s3://$B2_BUCKET/$remote_key" "/backups/$(basename "$local_file")"
}

b2_presign() {
  remote_key="$1"
  b2_run s3 presign "s3://$B2_BUCKET/$remote_key" --expires-in 604800
}

b2_remove() {
  remote_key="$1"
  b2_run s3 rm "s3://$B2_BUCKET/$remote_key"
}

github_api() {
  endpoint="$1"
  shift
  curl --fail --silent --show-error \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer $GITHUB_BACKUP_TOKEN" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$@" "https://api.github.com/repos/$GITHUB_BACKUP_REPOSITORY$endpoint"
}

github_create_release() {
  tag="$1"
  name="$2"
  reason="$3"
  payload="$(python3 - "$tag" "$name" "$reason" <<'PY'
import json
import sys

tag, name, reason = sys.argv[1:]
print(json.dumps({
    "tag_name": tag,
    "name": name,
    "body": "Encrypted Triton CRM disaster-recovery archive. Reason: " + reason + ".",
    "draft": False,
    "prerelease": False,
}))
PY
)"
  printf '%s' "$payload" | github_api "/releases" -X POST \
    -H "Content-Type: application/json" --data-binary @-
}

github_release_values() {
  python3 -c '
import json, sys
release = json.load(sys.stdin)
upload_url = release["upload_url"].split("{")[0]
print("|".join([str(release["id"]), upload_url, release["html_url"]]))
'
}

github_upload_release_asset() {
  upload_url="$1"
  file="$2"
  content_type="$3"
  name="$(basename "$file")"
  encoded_name="$(python3 - "$name" <<'PY'
from urllib.parse import quote
import sys
print(quote(sys.argv[1], safe=""))
PY
)"
  curl --fail --silent --show-error -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer $GITHUB_BACKUP_TOKEN" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -H "Content-Type: $content_type" \
    --data-binary "@$file" "${upload_url}?name=${encoded_name}" >/dev/null
}

github_verify_release_assets() {
  release_id="$1"
  shift
  github_api "/releases/$release_id/assets?per_page=100" | python3 -c '
import json, sys
expected = set(sys.argv[1:])
actual = {asset["name"] for asset in json.load(sys.stdin)}
missing = sorted(expected - actual)
if missing:
    raise SystemExit("GitHub release is missing assets: " + ", ".join(missing))
' "$@"
}

github_delete_release_by_tag() {
  tag="$1"
  release="$(github_api "/releases/tags/$tag")"
  release_id="$(printf '%s' "$release" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
  github_api "/releases/$release_id" -X DELETE >/dev/null
}

github_git_sync_files() {
  mode="$1"
  shift
  [ "$#" -gt 0 ] || return 0

  work_dir="$DR_STAGING_DIR/github-git-$(date +%s)-$$"
  mkdir -p "$work_dir"
  files=""
  for file in "$@"; do
    files="$files $(basename "$file")"
  done

  key_dir="$(dirname "$GITHUB_BACKUP_DEPLOY_KEY")"
  key_name="$(basename "$GITHUB_BACKUP_DEPLOY_KEY")"
  hosts_name="$(basename "$GITHUB_BACKUP_KNOWN_HOSTS")"
  docker run --rm \
    --env HOME=/root \
    --env "HOST_UID=$(id -u)" \
    --env "HOST_GID=$(id -g)" \
    --env "GITHUB_BACKUP_GIT_REMOTE=$GITHUB_BACKUP_GIT_REMOTE" \
    --env "GITHUB_BACKUP_FILES=$files" \
    --env "GITHUB_BACKUP_MODE=$mode" \
    --env "GIT_SSH_COMMAND=ssh -i /secrets/$key_name -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/secrets/$hosts_name" \
    -v "$DR_BACKUPS_DIR:/backups:ro" \
    -v "$work_dir:/work" \
    -v "$key_dir:/secrets:ro" \
    --workdir /work \
    --entrypoint /bin/sh \
    "${GITHUB_GIT_IMAGE:-alpine/git:2.47.2}" -c '
      set -eu
      trap '\''chown -R "$HOST_UID:$HOST_GID" /work'\'' EXIT
      git clone --depth 1 "$GITHUB_BACKUP_GIT_REMOTE" repo
      cd repo
      git config user.name "Triton CRM NAS Backup"
      git config user.email "nas-backup@tritonwealth.ca"
      case "$GITHUB_BACKUP_MODE" in
        upload)
          mkdir -p archives
          for file in $GITHUB_BACKUP_FILES; do
            cp "/backups/$file" "archives/$file"
          done
          git add archives
          git diff --cached --quiet && exit 0
          git commit -m "Store encrypted CRM backup $(date -u +%Y-%m-%dT%H:%M:%SZ)"
          git push origin HEAD:main
          ;;
        delete)
          for file in $GITHUB_BACKUP_FILES; do
            git rm -f --ignore-unmatch "archives/$file"
          done
          git diff --cached --quiet && exit 0
          git commit -m "Prune expired encrypted CRM backup"
          git push origin HEAD:main
          ;;
        *) exit 2 ;;
      esac
    '
  rm -rf "$work_dir"
}

write_status() {
  request_id="$1"
  state="$2"
  message="$3"
  filename="${4:-}"
  python3 - "$DR_STATUS_DIR/$request_id.json" "$request_id" "$state" "$message" "$filename" <<'PY'
import json, sys
from datetime import datetime, timezone
from pathlib import Path
path, request_id, state, message, filename = sys.argv[1:]
Path(path).write_text(json.dumps({
  "id": request_id,
  "state": state,
  "message": message,
  "filename": filename or None,
  "updatedAt": datetime.now(timezone.utc).isoformat(),
}, indent=2) + "\n", encoding="utf-8")
PY
}
