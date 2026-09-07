#!/bin/sh
set -u
BASE=/volume1/docker/triton-crm-source-sync
failed=0
for project in crm website kyc proposal; do
  if ! sh "$BASE/sync.sh" "$project"; then
    echo "Source sync failed: $project at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
    failed=1
  fi
done
exit "$failed"
