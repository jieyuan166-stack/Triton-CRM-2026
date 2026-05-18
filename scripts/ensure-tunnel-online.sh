#!/bin/sh
# scripts/ensure-tunnel-online.sh
#
# Watchdog for the cloudflared container. Designed to run every minute
# from the NAS scheduler. Fast-recovers any tunnel outage so the CRM
# stays reachable on https://crm.tritonwealth.ca.
#
# Why we check the CRM first: the marketing site (tritonwealth.ca) and
# the CRM (crm.tritonwealth.ca) share the tunnel. The CRM is what
# advisors rely on for client work; if it goes down, that's the most
# important signal.
set -eu

PROJECT_DIR="${PROJECT_DIR:-/volume1/docker/triton-crm}"
COMPOSE_DIR="$PROJECT_DIR/docker"
LOG_FILE="${LOG_FILE:-$PROJECT_DIR/tunnel-watchdog.log}"
TUNNEL_CONTAINER="${TUNNEL_CONTAINER:-triton-tunnel}"
APP_CONTAINER="${APP_CONTAINER:-triton-crm}"
CRM_URL="${CRM_URL:-https://crm.tritonwealth.ca}"
SITE_URL="${SITE_URL:-https://www.tritonwealth.ca/}"
LOCAL_APP_URL="${LOCAL_APP_URL:-http://127.0.0.1:3001/api/ready}"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE"
}

restart_tunnel() {
  log "restarting $TUNNEL_CONTAINER"
  if docker restart "$TUNNEL_CONTAINER" >> "$LOG_FILE" 2>&1; then
    return 0
  fi
  log "docker restart failed, falling back to compose up"
  cd "$COMPOSE_DIR"
  docker compose up -d cloudflared >> "$LOG_FILE" 2>&1
}

is_running() {
  STATUS="$(docker inspect "$1" --format '{{.State.Status}}' 2>/dev/null || echo missing)"
  RESTARTING="$(docker inspect "$1" --format '{{.State.Restarting}}' 2>/dev/null || echo true)"
  [ "$STATUS" = "running" ] && [ "$RESTARTING" != "true" ]
}

http_ok() {
  CODE="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 20 "$1" 2>/dev/null || echo 000)"
  case "$CODE" in
    200|301|302|307|308) return 0 ;;
    *) echo "$CODE"; return 1 ;;
  esac
}

# Step 1: tunnel container must exist and be running.
if ! docker inspect "$TUNNEL_CONTAINER" >/dev/null 2>&1; then
  log "$TUNNEL_CONTAINER does not exist"
  restart_tunnel
  exit 0
fi

if ! is_running "$TUNNEL_CONTAINER"; then
  log "$TUNNEL_CONTAINER is not running"
  restart_tunnel
  exit 0
fi

# Step 2: app container must be running locally. If the app is dead,
# restarting the tunnel won't help — log and exit.
if ! is_running "$APP_CONTAINER"; then
  log "$APP_CONTAINER is not running; tunnel restart will not help"
  exit 0
fi

# Step 3: app must be reachable on the loopback. If not, the issue is
# the app, not the tunnel.
if ! curl -fsS -o /dev/null --max-time 10 "$LOCAL_APP_URL"; then
  log "local $LOCAL_APP_URL not responding; this is an app problem, not a tunnel problem"
  exit 0
fi

# Step 4: CRM public URL must be reachable. This is the highest-value
# probe — restart the tunnel immediately if it fails.
if CODE=$(http_ok "$CRM_URL"); then
  : # ok
else
  log "$CRM_URL returned HTTP $CODE; restarting tunnel"
  restart_tunnel
  exit 0
fi

# Step 5: marketing site as a secondary signal. Don't restart for this
# alone (the CRM is the priority) but log so we notice if the tunnel
# is degraded for one hostname only.
if CODE=$(http_ok "$SITE_URL"); then
  :
else
  log "$SITE_URL returned HTTP $CODE (CRM is fine, not restarting)"
fi
