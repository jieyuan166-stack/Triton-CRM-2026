#!/bin/sh
# Pull a reviewed CRM source revision from GitHub directly on the NAS.
set -eu

PROJECT_DIR="${TRITON_CRM_DIR:-/volume1/docker/triton-crm}"
REPOSITORY="${TRITON_GITHUB_REPOSITORY:-jieyuan166-stack/Triton-CRM-2026}"
REF="${1:-main}"
WORK_DIR="$PROJECT_DIR/.github-sync"

case "$REPOSITORY" in
  *"/"*) ;;
  *) echo "TRITON_GITHUB_REPOSITORY must be owner/repository." >&2; exit 2 ;;
esac
case "$REF" in
  *[!A-Za-z0-9._/-]*|*".."*|"" ) echo "Invalid GitHub ref." >&2; exit 2 ;;
esac

mkdir -p "$WORK_DIR"
stage="$(mktemp -d "$WORK_DIR/source.XXXXXX")"
cleanup() { rm -rf "$stage"; }
trap cleanup EXIT INT TERM

archive="$stage/source.tar.gz"
curl -fsSL --retry 3 --connect-timeout 15 \
  "https://github.com/$REPOSITORY/archive/refs/heads/$REF.tar.gz" -o "$archive"
tar -xzf "$archive" -C "$stage"
source_dir="$(find "$stage" -mindepth 1 -maxdepth 1 -type d -name '*-*' | head -n 1)"

[ -n "$source_dir" ] && [ -f "$source_dir/package.json" ] && [ -f "$source_dir/docker/docker-compose.yml" ] || {
  echo "Downloaded GitHub source is not a valid Triton CRM release." >&2
  exit 1
}

# Runtime data and secrets remain on the NAS. The source tree itself mirrors
# GitHub, so removed source files do not linger between deployments.
rsync -a --delete \
  --exclude='.env.production' \
  --exclude='cloudflared/***' \
  --exclude='backup-secrets/***' \
  --exclude='backups/***' \
  --exclude='uploads/***' \
  --exclude='disaster-recovery/***' \
  --exclude='.github-sync/***' \
  --exclude='.next/***' \
  --exclude='node_modules/***' \
  --exclude='*.log' \
  "$source_dir/" "$PROJECT_DIR/"

exec "$PROJECT_DIR/scripts/deploy-safe.sh"
