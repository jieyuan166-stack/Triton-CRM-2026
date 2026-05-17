# Triton CRM NAS Deployment Runbook

## 1. Prepare Cloudflare

1. Cloudflare Zero Trust -> Networks -> Tunnels -> Create tunnel.
2. Name: `triton-crm-nas`.
3. Copy the tunnel token into `.env.production` as `CLOUDFLARED_TOKEN`.
4. Public hostname:
   - Subdomain: `crm`
   - Domain: `tritonwealth.ca`
   - Service: `http://triton-crm:3000`
5. Access -> Applications -> Self-hosted:
   - Domain: `crm.tritonwealth.ca`
   - Policy: Allow listed advisor/admin emails only.
   - Session duration: 24 hours.

## 2. First NAS install

```bash
cd /opt
git clone <your-private-repo-url> triton-crm
cd triton-crm
cp .env.example .env.production
nano .env.production
```

Required production values:

```env
DATABASE_URL="file:/app/prisma/data/triton.db"
NEXTAUTH_URL="https://crm.tritonwealth.ca"
NEXTAUTH_SECRET="<openssl rand -base64 32>"
AUTH_URL="https://crm.tritonwealth.ca"
AUTH_SECRET="<same-value-as-NEXTAUTH_SECRET>"
SEED_ADMIN_EMAIL="jieyuan165@gmail.com"
SEED_ADMIN_PASSWORD="<strong-password-12-plus-chars>"
SMTP_PASSWORD="<gmail-app-password>"
SMTP_USER="jieyuan165@gmail.com"
SMTP_FROM_NAME="Jeffrey Yuan"
SMTP_FROM_EMAIL="jieyuan165@gmail.com"
CLOUDFLARED_TOKEN="<cloudflare-tunnel-token>"
NEXT_PUBLIC_GOOGLE_MAPS_KEY="<restricted-browser-key>"
```

Build and start:

```bash
docker compose -f docker/docker-compose.yml --env-file .env.production up -d --build
docker exec triton-crm npx prisma migrate deploy
docker exec triton-crm npx tsx prisma/seed.ts
docker logs -f triton-crm
docker logs -f triton-tunnel
```

If Prisma's schema engine fails on the NAS during the first SQLite migration, use the checked-in SQL migration directly, then seed:

```bash
docker exec triton-crm npx prisma db execute \
  --file prisma/migrations/20260509223000_init/migration.sql \
  --schema prisma/schema.prisma
docker exec triton-crm npx tsx prisma/seed.ts
```

## 3. Update deployment

```bash
cd /opt/triton-crm
git pull
docker compose -f docker/docker-compose.yml --env-file .env.production up -d --build
docker exec triton-crm npx prisma migrate deploy
docker logs -f triton-crm
```

## 4. SQLite backup

Install the weekly backup job in the NAS user crontab:

```bash
CRON_TZ=America/Vancouver
0 2 * * 0 /bin/sh /volume1/docker/triton-crm/scripts/backup-sqlite.sh >> /volume1/docker/triton-crm/backup.log 2>&1
```

The script keeps only the latest 10 `.db.gz` backups.

## 5. Restore drill

```bash
docker compose -f docker/docker-compose.yml --env-file .env.production down
docker volume ls | grep triton
# Copy restored db into the mounted volume path or restore through a temporary container.
docker compose -f docker/docker-compose.yml --env-file .env.production up -d
```
