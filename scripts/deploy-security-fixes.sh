#!/bin/sh
# scripts/deploy-security-fixes.sh
#
# One-shot deploy script for the security/stability hardening pass.
# Run this on the NAS over SSH:
#
#   ssh wellce101@192.168.50.158
#   cd /volume1/docker/triton-crm
#   bash scripts/deploy-security-fixes.sh
#
# Steps:
#   1. Lock down .env.production permissions.
#   2. Trigger a fresh SQLite database backup before any change.
#   3. Commit local changes and push to origin/main on GitHub.
#   4. Rebuild the Docker image with the new code.
#   5. Restart the stack and wait for the health check.
#   6. Verify /api/ready returns 200.
#
# Anything that fails aborts the script — no half-deploys.

set -eu

REPO_DIR="/volume1/docker/triton-crm"
COMPOSE_FILE="$REPO_DIR/docker/docker-compose.yml"
ENV_FILE="$REPO_DIR/.env.production"
BACKUP_DIR="$REPO_DIR/backups"
HEALTHCHECK_URL="http://127.0.0.1:3001/api/ready"

cd "$REPO_DIR"

echo "==> [1/6] Hardening .env.production permissions"
if [ -f "$ENV_FILE" ]; then
  chmod 600 "$ENV_FILE"
  echo "    chmod 600 applied. Current mode:"
  stat -c "    %a %n" "$ENV_FILE" 2>/dev/null || stat -f "    %A %N" "$ENV_FILE"
else
  echo "    .env.production not found, skipping"
fi

echo "==> [2/6] Pre-deploy SQLite backup"
TS="$(date +%Y%m%d-%H%M%S)"
PRE_DEPLOY_TARGET="$BACKUP_DIR/triton-${TS}-pre-security-fixes.db.gz"
mkdir -p "$BACKUP_DIR"
docker exec triton-crm sh -c "sqlite3 /app/prisma/data/triton.db '.backup /tmp/triton-pre.db' && gzip -c /tmp/triton-pre.db > '/app/backups/triton-${TS}-pre-security-fixes.db.gz' && sha256sum '/app/backups/triton-${TS}-pre-security-fixes.db.gz' > '/app/backups/triton-${TS}-pre-security-fixes.db.gz.sha256' && rm -f /tmp/triton-pre.db && chown nextjs:nodejs '/app/backups/triton-${TS}-pre-security-fixes.db.gz' '/app/backups/triton-${TS}-pre-security-fixes.db.gz.sha256' && chmod 660 '/app/backups/triton-${TS}-pre-security-fixes.db.gz' '/app/backups/triton-${TS}-pre-security-fixes.db.gz.sha256'"
echo "    backup written: $PRE_DEPLOY_TARGET"

echo "==> [3/6] Committing and pushing to origin/main"
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "Security and stability hardening pass

- Lock CSP-adjacent X-Powered-By header off
- Constant-time bearer-token check for /api/automation/* cron routes
- Health check now hits /api/ready so DB outages are detected
- Sanitize signature/template HTML before dangerouslySetInnerHTML
- Document Prisma client global caching (dev only)
- Log rate-limit hits on forgot-password while preserving anti-enumeration
- Validate snapshot schema version with backwards-compatible parser
- Enable SQLite WAL via dedicated entrypoint script (multi-user write safety)
- FollowUp.createdById now ON DELETE CASCADE; admin user delete no longer
  fails when the user has activity history
- Explicit onDelete declarations for EmailHistory.user and AuditLog.user"
  git push origin main
else
  echo "    no local changes; skipping commit/push"
fi

echo "==> [4/6] Rebuilding Docker image"
cd "$(dirname "$COMPOSE_FILE")"
docker compose build triton-crm

echo "==> [5/6] Restarting stack"
docker compose up -d
echo "    waiting up to 90s for health check..."
i=0
while [ $i -lt 18 ]; do
  if curl -fsS "$HEALTHCHECK_URL" >/dev/null 2>&1; then
    echo "    /api/ready is healthy"
    break
  fi
  i=$((i + 1))
  sleep 5
done

if ! curl -fsS "$HEALTHCHECK_URL" >/dev/null 2>&1; then
  echo "!!! /api/ready did not become healthy in 90s. Check logs:"
  echo "    docker compose -f '$COMPOSE_FILE' logs --tail 100 triton-crm"
  exit 1
fi

echo "==> [6/6] Done."
echo "    Public:  https://crm.tritonwealth.ca"
echo "    NAS:     http://192.168.50.158:3001"
echo "    Pre-deploy backup: $PRE_DEPLOY_TARGET"
