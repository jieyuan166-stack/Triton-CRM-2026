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
# The staging directory remains NAS-worker-only. UGREEN NAS ACLs can mask group
# mode changes made by the NAS login user, so mounted subdirectory permissions
# are set from a short-lived Docker-root helper below.
chmod 700 "$PROJECT_DIR/disaster-recovery"
chmod 700 "$PROJECT_DIR/disaster-recovery/staging"
chmod 600 "$SECRETS_FILE" "$ENV_FILE"

# UGREEN NAS ACLs can mask shared group modes for this project. The CRM and the NAS
# worker therefore use the same restricted NAS service identity (1000:10) for
# the explicitly mounted recovery directories. The CRM still runs non-root and
# has no Docker socket or access to backup secrets.
docker run --rm \
  -v "$PROJECT_DIR/disaster-recovery/backups:/backups" \
  -v "$PROJECT_DIR/disaster-recovery/status:/status" \
  -v "$PROJECT_DIR/disaster-recovery/requests:/requests" \
  -v "$PROJECT_DIR/uploads:/uploads" \
  alpine:3.20 sh -c '
    chown -R 1000:10 /backups /status /requests /uploads &&
    find /backups /status -type d -exec chmod 2750 {} \; &&
    find /backups /status -type f -exec chmod 640 {} \; &&
    find /requests -type d -exec chmod 2770 {} \; &&
    find /requests -type f -exec chmod 660 {} \; &&
    chmod -R u=rwX,g=rX,o= /uploads
  '

chmod 700 "$PROJECT_DIR/backup-crm.sh" "$PROJECT_DIR/restore-crm.sh" "$PROJECT_DIR/verify-crm-backup.sh" "$PROJECT_DIR/restore-test-crm.sh" "$PROJECT_DIR/scripts/disaster-recovery-worker.sh"

cron_lines='20 2 * * 0 /bin/sh /volume1/docker/triton-crm/backup-crm.sh --scheduled >> /volume1/docker/triton-crm/disaster-recovery/backup.log 2>&1 # triton-full-disaster-backup
* * * * * /bin/sh /volume1/docker/triton-crm/scripts/disaster-recovery-worker.sh >> /volume1/docker/triton-crm/disaster-recovery/worker.log 2>&1 # triton-disaster-recovery-worker'

(crontab -l 2>/dev/null || true) | grep -v 'triton-full-disaster-backup\|triton-disaster-recovery-worker' > "$PROJECT_DIR/disaster-recovery/crontab.next"
printf '%s\n' "$cron_lines" >> "$PROJECT_DIR/disaster-recovery/crontab.next"
crontab "$PROJECT_DIR/disaster-recovery/crontab.next"
rm -f "$PROJECT_DIR/disaster-recovery/crontab.next"

echo "Disaster recovery installed. Existing weekly customer snapshot cron entries were preserved."
