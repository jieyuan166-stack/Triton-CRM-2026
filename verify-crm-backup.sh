#!/bin/sh
# Verify an encrypted disaster-recovery archive without printing CRM PII.
set -eu

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck disable=SC1091
. "$PROJECT_DIR/scripts/disaster-recovery-common.sh"

target="${1:-}"
quiet=false
[ "$#" -gt 0 ] && shift
if [ "${1:-}" = "--quiet" ]; then quiet=true; fi

[ -n "$target" ] || { echo "Usage: ./verify-crm-backup.sh BACKUP_FILE [--quiet]" >&2; exit 2; }
case "$target" in
  /*) archive="$target" ;;
  *) archive="$DR_BACKUPS_DIR/$target" ;;
esac
require_file "$archive"
safe_backup_name "$(basename "$archive")"
load_control_secret
load_backup_secrets

checksum_file="$archive.sha256"
require_file "$checksum_file"
(cd "$(dirname "$archive")" && sha256sum -c "$(basename "$checksum_file")") >/dev/null

stage="$DR_STAGING_DIR/verify-$(date +%s)-$$"
mkdir -p "$stage"
cleanup() { rm -rf "$stage"; }
trap cleanup EXIT INT TERM
cp "$archive" "$stage/$(basename "$archive")"
age_decrypt "$stage/$(basename "$archive")" "$stage/payload.tar.gz"
tar -C "$stage" -xzf "$stage/payload.tar.gz"
[ -f "$stage/manifest.json" ] || { echo "Backup manifest is missing" >&2; exit 1; }
[ -f "$stage/data/triton.db" ] || { echo "Backup database is missing" >&2; exit 1; }

report="$stage/report.json"
python3 "$PROJECT_DIR/scripts/verify_crm_backup.py" "$stage/manifest.json" "$stage/data/triton.db" "$stage/uploads" > "$report"
if [ "$quiet" = false ]; then
  cat "$report"
fi
