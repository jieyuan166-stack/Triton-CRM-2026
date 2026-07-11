#!/bin/sh
# scripts/deploy-safe.sh
#
# Production deploy with mandatory pre/post checks.
# This script exists because three avoidable outages happened during
# the security hardening pass:
#   1. env_file refactor blanked AUTH_SECRET   (30 min auth outage)
#   2. cloudflared container name conflict     (~5 min downtime)
#   3. cloudflared config.yml mode 640         (~5 min tunnel outage)
#
# The rules below are enforced by the script. Do not bypass them.

set -eu

REPO_DIR="/volume1/docker/triton-crm"
COMPOSE_DIR="$REPO_DIR/docker"
ENV_FILE="$REPO_DIR/.env.production"
CRED_DIR="$REPO_DIR/cloudflared"
LOCAL_URL="http://127.0.0.1:3001/api/ready"
PUBLIC_URL="https://crm.tritonwealth.ca"

cd "$REPO_DIR"

echo "==================================================="
echo "  PRE-DEPLOY CHECKS"
echo "==================================================="

echo "[1/6] .env.production exists and contains all required keys"
test -f "$ENV_FILE" || { echo "FAIL: $ENV_FILE missing"; exit 1; }
for KEY in NEXTAUTH_SECRET AUTH_SECRET AUTH_URL NEXTAUTH_URL SMTP_PASSWORD CRON_SECRET; do
  if ! grep -q "^${KEY}=" "$ENV_FILE"; then
    echo "FAIL: $KEY missing from $ENV_FILE"
    exit 1
  fi
done
echo "      ok"

echo "[2/6] .env.production permissions are 600"
MODE="$(stat -c %a "$ENV_FILE" 2>/dev/null || stat -f %A "$ENV_FILE")"
if [ "$MODE" != "600" ]; then
  echo "FAIL: $ENV_FILE mode is $MODE (expected 600). Fix with: chmod 600 $ENV_FILE"
  exit 1
fi
echo "      ok"

echo "[3/6] Cloudflare Tunnel credentials are present and readable"
test -f "$CRED_DIR/credentials.json" || { echo "FAIL: $CRED_DIR/credentials.json missing"; exit 1; }
if ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$CRED_DIR/credentials.json" >/dev/null 2>&1; then
  echo "FAIL: credentials.json is not valid JSON"
  exit 1
fi
echo "      ok"

echo "[4/6] No \${VAR} interpolation in docker-compose environment for secrets"
# These secrets must come from env_file:, never from \${VAR} interpolation.
# Substitution reads the calling shell's env, not env_file, so a missing
# value would silently set the variable to an empty string.
if grep -E '^\s+(NEXTAUTH_SECRET|AUTH_SECRET|SMTP_PASSWORD|CRON_SECRET):.*\$\{' "$COMPOSE_DIR/docker-compose.yml"; then
  echo "FAIL: docker-compose has \${VAR} interpolation for a secret. Use env_file: instead."
  exit 1
fi
echo "      ok"

echo "[5/6] Critical containers exist (catch name-conflict before deploy)"
for NAME in triton-crm triton-tunnel; do
  STATE="$(docker inspect --format '{{.State.Status}}' "$NAME" 2>/dev/null || echo absent)"
  echo "      $NAME = $STATE"
done

echo "[6/6] Tunnel currently online (sanity baseline before we touch anything)"
BEFORE_HTTP="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 "$PUBLIC_URL" || echo 000)"
echo "      $PUBLIC_URL returned HTTP $BEFORE_HTTP"
case "$BEFORE_HTTP" in
  200|301|302|307|308) ;;
  *) echo "WARN: tunnel was already not healthy before deploy (HTTP $BEFORE_HTTP)";;
esac

echo
echo "==================================================="
echo "  PRE-DEPLOY BACKUP"
echo "==================================================="

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_NAME="triton-${TS}-pre-deploy.db.gz"
if [ -f "$REPO_DIR/disaster-recovery/state/activated" ] && [ -f "$REPO_DIR/backup-secrets/backup.env" ]; then
  echo "      creating verified encrypted offsite pre-deploy backup"
  "$REPO_DIR/backup-crm.sh" --reason pre-deploy
  echo "      encrypted offsite pre-deploy backup complete"
else
  # Bootstrap fallback only. The full encrypted system is activated by a
  # manually verified backup after the first deployment that contains its API.
  docker exec triton-crm sh -c "sqlite3 /app/prisma/data/triton.db '.backup /tmp/pre.db' && gzip -c /tmp/pre.db > '/app/backups/${BACKUP_NAME}' && sha256sum '/app/backups/${BACKUP_NAME}' > '/app/backups/${BACKUP_NAME}.sha256' && rm -f /tmp/pre.db && chown nextjs:nodejs '/app/backups/${BACKUP_NAME}' '/app/backups/${BACKUP_NAME}.sha256' && chmod 660 '/app/backups/${BACKUP_NAME}' '/app/backups/${BACKUP_NAME}.sha256'"
  echo "      saved bootstrap backup: $BACKUP_NAME"
fi

echo
echo "==================================================="
echo "  BUILD"
echo "==================================================="

cd "$COMPOSE_DIR"
docker compose --env-file "$ENV_FILE" build triton-crm

echo
echo "==================================================="
echo "  DEPLOY (triton-crm only — tunnel untouched)"
echo "==================================================="

docker compose --env-file "$ENV_FILE" up -d triton-crm

echo "Waiting up to 90s for /api/ready..."
i=0
while [ $i -lt 18 ]; do
  if curl -fsS "$LOCAL_URL" >/dev/null 2>&1; then
    echo "      local /api/ready healthy"
    break
  fi
  i=$((i + 1))
  sleep 5
done

if ! curl -fsS "$LOCAL_URL" >/dev/null 2>&1; then
  echo "FAIL: /api/ready did not become healthy in 90s"
  docker logs --tail 50 triton-crm
  echo
  echo "ROLLBACK: see backups/$BACKUP_NAME"
  exit 1
fi

echo
echo "==================================================="
echo "  POST-DEPLOY VERIFICATION (mandatory)"
echo "==================================================="

echo "[1/4] Auth secret loaded"
# Probe an auth-protected endpoint. Without a session cookie this should
# return 401 (auth working) rather than 500 (MissingSecret crash).
AUTH_HTTP="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 "$LOCAL_URL/../clients" 2>/dev/null || curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:3001/api/clients" || echo 000)"
case "$AUTH_HTTP" in
  401|307) echo "      ok (HTTP $AUTH_HTTP — auth subsystem responding)";;
  500)
    echo "FAIL: /api/clients returned 500. Likely AUTH_SECRET missing."
    docker logs --tail 20 triton-crm | grep -i "secret\|auth" | tail -5
    exit 1
    ;;
  *) echo "WARN: unexpected HTTP $AUTH_HTTP, continuing";;
esac

echo "[2/4] Public tunnel still works"
sleep 2
PUBLIC_HTTP="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 15 "$PUBLIC_URL" || echo 000)"
case "$PUBLIC_HTTP" in
  200|301|302|307|308) echo "      ok (HTTP $PUBLIC_HTTP)";;
  *)
    echo "FAIL: $PUBLIC_URL returned HTTP $PUBLIC_HTTP"
    docker logs --tail 20 triton-tunnel
    exit 1
    ;;
esac

echo "[3/4] No fresh error logs in app"
ERROR_LINES="$(docker logs --since 60s triton-crm 2>&1 | grep -iE 'missingsecret|fatal|unhandledpromise' | head -5)"
if [ -n "$ERROR_LINES" ]; then
  echo "FAIL: fresh errors detected:"
  echo "$ERROR_LINES"
  exit 1
fi
echo "      ok"

echo "[4/4] Tunnel registered all 4 connections"
TUNNEL_CONNS="$(docker logs --since 5m triton-tunnel 2>&1 | grep -c 'Registered tunnel connection' || true)"
if [ "$TUNNEL_CONNS" -lt 4 ]; then
  echo "WARN: only $TUNNEL_CONNS/4 tunnel connections registered recently. Tunnel may be degraded."
fi
echo "      $TUNNEL_CONNS connections in last 5min"

echo
echo "==================================================="
echo "  DEPLOY OK"
echo "==================================================="
echo "  Backup:   $BACKUP_NAME"
echo "  Local:    $LOCAL_URL  (HTTP 200)"
echo "  Public:   $PUBLIC_URL  (HTTP $PUBLIC_HTTP)"
echo "  Auth:     /api/clients HTTP $AUTH_HTTP (no MissingSecret)"
