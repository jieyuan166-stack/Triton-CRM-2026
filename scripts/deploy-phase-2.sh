#!/bin/sh
# scripts/deploy-phase-2.sh
#
# Deploys the bulk-write replaceAll changes (item 13) and the env_file
# cleanup, WITHOUT touching cloudflared. The Cloudflare Tunnel migration
# is item 15 and must be run separately via
# scripts/migrate-cloudflared-to-credentials.sh after generating the
# credentials JSON on a desktop with browser access.
#
# Run on the NAS:
#   cd /volume1/docker/triton-crm
#   bash scripts/deploy-phase-2.sh

set -eu

REPO_DIR="/volume1/docker/triton-crm"
COMPOSE_FILE="$REPO_DIR/docker/docker-compose.yml"
HEALTHCHECK_URL="http://127.0.0.1:3001/api/ready"

cd "$REPO_DIR"

echo "==> [1/4] Pre-deploy SQLite backup"
TS="$(date +%Y%m%d-%H%M%S)"
docker exec triton-crm sh -c "sqlite3 /app/prisma/data/triton.db '.backup /tmp/pre-phase2.db' && gzip -c /tmp/pre-phase2.db > '/app/backups/triton-${TS}-pre-phase2.db.gz' && sha256sum '/app/backups/triton-${TS}-pre-phase2.db.gz' > '/app/backups/triton-${TS}-pre-phase2.db.gz.sha256' && rm -f /tmp/pre-phase2.db && chown nextjs:nodejs '/app/backups/triton-${TS}-pre-phase2.db.gz' '/app/backups/triton-${TS}-pre-phase2.db.gz.sha256' && chmod 660 '/app/backups/triton-${TS}-pre-phase2.db.gz' '/app/backups/triton-${TS}-pre-phase2.db.gz.sha256'"
echo "    backup: triton-${TS}-pre-phase2.db.gz"

echo "==> [2/4] Rebuilding triton-crm image"
cd "$(dirname "$COMPOSE_FILE")"
docker compose build triton-crm

echo "==> [3/4] Restarting triton-crm only (cloudflared untouched until item 15)"
docker compose up -d triton-crm

echo "    waiting up to 90s for /api/ready..."
i=0
while [ $i -lt 18 ]; do
  if curl -fsS "$HEALTHCHECK_URL" >/dev/null 2>&1; then
    echo "    healthy"
    break
  fi
  i=$((i + 1))
  sleep 5
done

if ! curl -fsS "$HEALTHCHECK_URL" >/dev/null 2>&1; then
  echo "!!! /api/ready did not become healthy. Check logs:"
  echo "    docker compose -f '$COMPOSE_FILE' logs --tail 100 triton-crm"
  exit 1
fi

echo "==> [4/4] Done."
echo "    Public:  https://crm.tritonwealth.ca"
echo "    NAS:     http://192.168.50.158:3001"
echo
echo "    Next: run scripts/migrate-cloudflared-to-credentials.sh after"
echo "    placing /tmp/triton-cred.json from your desktop."
