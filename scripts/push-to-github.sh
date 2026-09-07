#!/bin/sh
# Use the NAS-owned source sync service, independent of Personal Folder.
set -eu
SYNC=/volume1/docker/triton-crm-source-sync/sync.sh
if [ ! -r "$SYNC" ]; then
  echo 'NAS source sync service is not installed; see docs/NAS_SOURCE_BACKUP.md' >&2
  exit 1
fi
exec sh "$SYNC" crm
