#!/bin/sh
# Perform a full restore in a disposable Docker volume. Production is never touched.
set -eu

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck disable=SC1091
. "$PROJECT_DIR/scripts/disaster-recovery-common.sh"

target="${1:-latest}"
ensure_dr_directories
load_control_secret
load_backup_secrets

if [ "$target" = latest ]; then
  archive="$(find "$DR_BACKUPS_DIR" -maxdepth 1 -type f -name 'triton-crm-backup-*.tar.gz.age' -print | sort | tail -n 1 || true)"
  [ -n "$archive" ] || { echo "No local encrypted backup available for the isolation test." >&2; exit 1; }
elif [ -f "$target" ]; then
  archive="$target"
else
  archive="$DR_BACKUPS_DIR/$target"
fi
require_file "$archive"
"$PROJECT_DIR/verify-crm-backup.sh" "$archive" --quiet

test_id="$(date +%Y%m%d%H%M%S)-$$"
test_root="$DR_ROOT/test-runs/$test_id"
test_volume="triton-restore-test-data-$test_id"
test_project="triton-restore-test-$test_id"
test_port="${RESTORE_TEST_PORT:-3002}"
stage="$DR_STAGING_DIR/restore-test-$test_id"
mkdir -p "$test_root/uploads" "$stage"
cleanup() {
  rm -rf "$stage"
}
trap cleanup EXIT INT TERM

cp "$archive" "$stage/$(basename "$archive")"
age_decrypt "$stage/$(basename "$archive")" "$stage/payload.tar.gz"
tar -C "$stage" -xzf "$stage/payload.tar.gz"
python3 "$PROJECT_DIR/scripts/verify_crm_backup.py" "$stage/manifest.json" "$stage/data/triton.db" "$stage/uploads" > "$test_root/preflight-report.json"

docker volume create "$test_volume" >/dev/null
docker run --rm -v "$test_volume:/data" -v "$stage:/restore:ro" alpine:3.20 sh -c 'cp /restore/data/triton.db /data/triton.db && chown 1001:1001 /data/triton.db && chmod 660 /data/triton.db'
cp -a "$stage/uploads/." "$test_root/uploads/" 2>/dev/null || true

test_password="$(openssl rand -hex 18)"
RESTORE_TEST_DATA_VOLUME="$test_volume" RESTORE_TEST_UPLOADS_DIR="$test_root/uploads" RESTORE_TEST_PORT="$test_port" RESTORE_TEST_PUBLIC_URL="http://127.0.0.1:$test_port" RESTORE_TEST_PASSWORD="$test_password" \
  docker compose -p "$test_project" -f "$PROJECT_DIR/docker/docker-compose.restore-test.yml" --env-file "$PROJECT_DIR/.env.production" up -d --build

attempt=0
while [ "$attempt" -lt 30 ]; do
  if curl -fsS "http://127.0.0.1:$test_port/api/ready" >/dev/null 2>&1; then break; fi
  attempt=$((attempt + 1))
  sleep 4
done
curl -fsS "http://127.0.0.1:$test_port/api/ready" >/dev/null || { echo "Isolated CRM did not become ready." >&2; exit 1; }

# Change one user only inside the disposable volume, so a real browser/session
# flow can prove the restored application can authenticate and fetch CRM data.
RESTORE_TEST_PASSWORD="$test_password" docker compose -p "$test_project" -f "$PROJECT_DIR/docker/docker-compose.restore-test.yml" exec -T triton-crm-restore-test node - <<'NODE'
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
(async () => {
  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("Restored database has no users");
  await db.user.update({ where: { id: user.id }, data: { email: "restore-test@example.invalid", passwordHash: await bcrypt.hash(process.env.RESTORE_TEST_PASSWORD, 12) } });
  await db.$disconnect();
})().catch(async (error) => { console.error(error); await db.$disconnect(); process.exit(1); });
NODE

cookie="$test_root/session.cookie"
csrf="$(curl -fsS -c "$cookie" "http://127.0.0.1:$test_port/api/auth/csrf" | python3 -c 'import json,sys; print(json.load(sys.stdin)["csrfToken"])')"
curl -fsS -b "$cookie" -c "$cookie" -X POST "http://127.0.0.1:$test_port/api/auth/callback/credentials" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$csrf" --data-urlencode 'email=restore-test@example.invalid' --data-urlencode "password=$test_password" \
  --data-urlencode "callbackUrl=http://127.0.0.1:$test_port/dashboard" >/dev/null
curl -fsS -b "$cookie" "http://127.0.0.1:$test_port/clients" >/dev/null
curl -fsS -b "$cookie" "http://127.0.0.1:$test_port/api/data" | python3 -c 'import json,sys; assert json.load(sys.stdin).get("ok") is True'
search_term="$(docker compose -p "$test_project" -f "$PROJECT_DIR/docker/docker-compose.restore-test.yml" exec -T triton-crm-restore-test sh -lc "sqlite3 /app/prisma/data/triton.db \"SELECT lower(substr(firstName, 1, 1)) FROM Client WHERE trim(firstName) <> '' LIMIT 1;\"" | tr -d '\r\n')"
[ -n "$search_term" ] || { echo "Restored database contains no searchable client records." >&2; exit 1; }
curl -fsS -b "$cookie" "http://127.0.0.1:$test_port/api/clients?search=$search_term" | python3 -c 'import json,sys; assert json.load(sys.stdin).get("total", 0) > 0'

volume_path="$(docker volume inspect "$test_volume" --format '{{.Mountpoint}}')"
python3 "$PROJECT_DIR/scripts/verify_crm_backup.py" "$stage/manifest.json" "$volume_path/triton.db" "$test_root/uploads" > "$test_root/restore-test-report.json"

docker compose -p "$test_project" -f "$PROJECT_DIR/docker/docker-compose.restore-test.yml" down -v
docker volume rm "$test_volume" >/dev/null 2>&1 || true
echo "Isolated restore test passed. PII-free report: $test_root/restore-test-report.json"
