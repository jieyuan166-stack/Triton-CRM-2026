#!/bin/sh
# One-time NAS installation for full encrypted disaster recovery.
set -eu

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
SECRETS_FILE="$PROJECT_DIR/backup-secrets/backup.env"
ENV_FILE="$PROJECT_DIR/.env.production"

[ -f "$SECRETS_FILE" ] || { echo "Create $SECRETS_FILE from backup-secrets/README.md first." >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 1; }
grep -q '^BACKUP_CONTROL_SECRET=.' "$ENV_FILE" || { echo "BACKUP_CONTROL_SECRET is required in .env.production." >&2; exit 1; }

# A verified local encrypted backup is useful immediately. B2 and notification
# credentials are optional at install time; the worker only enables offsite
# delivery after every required B2 and mail variable is present.

mkdir -p "$PROJECT_DIR/uploads" \
  "$PROJECT_DIR/disaster-recovery/backups" \
  "$PROJECT_DIR/disaster-recovery/status" \
  "$PROJECT_DIR/disaster-recovery/requests" \
  "$PROJECT_DIR/disaster-recovery/staging"
# `uploads` and `requests` are owned by uid 1001 for the CRM process, so
# their mode is set by the Docker-rooted command below. The NAS account owns
# the remaining disaster-recovery directories.
chmod 700 "$PROJECT_DIR/disaster-recovery" "$PROJECT_DIR/disaster-recovery/backups" "$PROJECT_DIR/disaster-recovery/status" "$PROJECT_DIR/disaster-recovery/staging"
chmod 600 "$SECRETS_FILE" "$ENV_FILE"

# The NAS worker owns the signed request queue. The CRM gets the NAS admin
# group as a supplementary Docker group, so it can enqueue requests without
# receiving ownership of the worker's processing directories. Uploads remain
# owned by the CRM process and only readable by the NAS admin group.
docker run --rm \
  -v "$PROJECT_DIR/disaster-recovery/requests:/requests" \
  -v "$PROJECT_DIR/uploads:/uploads" \
  alpine:3.20 sh -c 'chown -R 1000:10 /requests && chmod -R 2770 /requests && chown -R 1001:10 /uploads && chmod -R u=rwX,g=rX,o= /uploads'

chmod 700 "$PROJECT_DIR/backup-crm.sh" "$PROJECT_DIR/restore-crm.sh" "$PROJECT_DIR/verify-crm-backup.sh" "$PROJECT_DIR/restore-test-crm.sh" "$PROJECT_DIR/scripts/disaster-recovery-worker.sh"

cron_lines='20 2 * * 0 /bin/sh /volume1/docker/triton-crm/backup-crm.sh --scheduled >> /volume1/docker/triton-crm/disaster-recovery/backup.log 2>&1 # triton-full-disaster-backup
* * * * * /bin/sh /volume1/docker/triton-crm/scripts/disaster-recovery-worker.sh >> /volume1/docker/triton-crm/disaster-recovery/worker.log 2>&1 # triton-disaster-recovery-worker'

(crontab -l 2>/dev/null || true) | grep -v 'triton-full-disaster-backup\|triton-disaster-recovery-worker' > "$PROJECT_DIR/disaster-recovery/crontab.next"
printf '%s\n' "$cron_lines" >> "$PROJECT_DIR/disaster-recovery/crontab.next"
crontab "$PROJECT_DIR/disaster-recovery/crontab.next"
rm -f "$PROJECT_DIR/disaster-recovery/crontab.next"

echo "Disaster recovery installed. Existing weekly customer snapshot cron entries were preserved."
