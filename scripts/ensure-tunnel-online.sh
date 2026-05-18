#!/bin/sh
set -eu

PROJECT_DIR="${PROJECT_DIR:-/volume1/docker/triton-crm}"
COMPOSE_DIR="$PROJECT_DIR/docker"
ENV_FILE="$PROJECT_DIR/.env.production"
LOG_FILE="${LOG_FILE:-$PROJECT_DIR/tunnel-watchdog.log}"
TUNNEL_CONTAINER="${TUNNEL_CONTAINER:-triton-tunnel}"
CHECK_URL="${CHECK_URL:-https://www.tritonwealth.ca/}"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE"
}

restart_tunnel() {
  log "restarting $TUNNEL_CONTAINER"
  cd "$COMPOSE_DIR"
  docker compose --env-file "$ENV_FILE" up -d cloudflared >> "$LOG_FILE" 2>&1
}

if [ ! -f "$ENV_FILE" ]; then
  log "missing env file: $ENV_FILE"
  exit 1
fi

if ! docker inspect "$TUNNEL_CONTAINER" >/dev/null 2>&1; then
  log "$TUNNEL_CONTAINER does not exist"
  restart_tunnel
  exit 0
fi

STATUS="$(docker inspect "$TUNNEL_CONTAINER" --format '{{.State.Status}}' 2>/dev/null || echo missing)"
RESTARTING="$(docker inspect "$TUNNEL_CONTAINER" --format '{{.State.Restarting}}' 2>/dev/null || echo true)"

if [ "$STATUS" != "running" ] || [ "$RESTARTING" = "true" ]; then
  log "$TUNNEL_CONTAINER unhealthy: status=$STATUS restarting=$RESTARTING"
  restart_tunnel
  exit 0
fi

HTTP_CODE="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 20 "$CHECK_URL" 2>/dev/null || echo 000)"
case "$HTTP_CODE" in
  200|301|302|307|308)
    exit 0
    ;;
  *)
    log "$CHECK_URL returned HTTP $HTTP_CODE"
    restart_tunnel
    ;;
esac
