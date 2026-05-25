# Deployment Discipline

This document exists because three avoidable outages happened during the
2026-05-17 security hardening pass. The rules below MUST be followed for
every production deploy.

## Why the CRM going down is unacceptable

`https://crm.tritonwealth.ca` is the single point of access for advisors.
Every minute of downtime blocks real client work. Advisors don't see
"the deploy script", they see a broken site. Treat every change like
it can take the whole thing down — because as we have seen, it can.

## The Three Outages and What Caused Them

### Outage 1: 30-minute auth failure
**What happened:** After a docker-compose refactor, `AUTH_SECRET`
silently became an empty string. Every page returned HTTP 500 with
`[auth][error] MissingSecret`. The container reported healthy because
`/api/ready` only checks the database, not the auth subsystem.

**Why it slipped through:** The deploy script confirmed `/api/ready`
was 200 and called the deploy successful. Nobody hit a real auth
endpoint to check.

**Root cause:** `${VAR}` interpolation in `docker-compose.yml`
`environment:` section reads from the calling shell's environment, NOT
from `env_file:`. When the calling shell didn't have NEXTAUTH_SECRET
exported (which is the normal state on the NAS), the interpolation
produced an empty string that *overrode* what env_file injected.

### Outage 2: cloudflared name conflict (~5 min)
**What happened:** `docker compose up -d cloudflared` failed with
"container name in use" because the old token-mode container's compose
project metadata didn't match the new file.

**Root cause:** Switching tunnel modes is a major config change.
docker-compose's "is this the same container" check uses labels that
include the project name + service name + config hash. Edge cases exist.

### Outage 3: cloudflared config.yml unreadable (~5 min)
**What happened:** Tunnel started but immediately printed
"open /etc/cloudflared/config.yml: permission denied" forever. Public
URL returned HTTP 530 because no connection registered.

**Root cause:** I set the file mode to 640. cloudflared's container
runs as a non-root user (uid 65532) and is not in the file's owning
group, so it could not read the file.

## The Rules

1. **Always run `scripts/deploy-safe.sh`**, never raw `docker compose up`.
   The script enforces pre-checks and post-verification. Do not bypass.

2. **Never use `${VAR}` interpolation for secrets in docker-compose.yml.**
   Secrets MUST come from `env_file:` only. The deploy script's pre-check
   #4 will reject any compose file that violates this.

3. **Never edit `.env.production` and `docker-compose.yml` in the same
   deploy.** Stage them in separate deploys with verification between.

4. **Never touch cloudflared and triton-crm in the same deploy.** The
   tunnel containers have their own deploy path
   (`scripts/migrate-cloudflared-to-credentials.sh` for major mode
   changes; `docker restart triton-tunnel triton-tunnel-backup` for minor
   restarts).
   `deploy-safe.sh` only restarts `triton-crm`.

5. **Cloudflare config files must be readable by the cloudflared user.**
   `chmod 644` for both `credentials.json` and `config.yml`. Do not use
   600 — the container's nonroot user cannot read it.

6. **Always verify three things post-deploy** (the deploy script does this):
   - `/api/ready` returns 200 (database OK)
   - `/api/clients` returns 401 not 500 (auth subsystem OK)
   - `https://crm.tritonwealth.ca` returns 2xx/3xx (public path OK)

## Standard Deploy Procedure

```sh
ssh wellce101@192.168.50.158
cd /volume1/docker/triton-crm
bash scripts/deploy-safe.sh
```

The script will:
1. Pre-check env vars, file permissions, compose syntax, container state
2. Take a SQLite backup labelled `triton-{timestamp}-pre-deploy.db.gz`
3. Build the new image
4. Restart only `triton-crm` (tunnel never touched)
5. Verify auth, public URL, error logs, tunnel state
6. Refuse to declare success unless all checks pass

## What to Do If a Deploy Fails

1. Check the script's last output line for which check failed.
2. Look at `docker logs --tail 50 triton-crm` for the actual error.
3. The pre-deploy backup is at
   `/volume1/docker/triton-crm/backups/triton-{timestamp}-pre-deploy.db.gz`.
4. To roll back:
   ```sh
   git -C /tmp/triton-crm-local revert HEAD
   git -C /tmp/triton-crm-local push origin main
   # Then sync the revert back to the NAS via rsync and re-run deploy-safe.sh
   ```

## Tunnel-Only Operations

If the public URL is down but `triton-crm` is healthy locally
(`curl http://192.168.50.158:3001/api/ready` returns 200), it's a tunnel
issue:

```sh
docker logs --tail 30 triton-tunnel        # diagnose primary connector
docker logs --tail 30 triton-tunnel-backup # diagnose backup connector
docker restart triton-tunnel triton-tunnel-backup
```

The watchdog at `scripts/ensure-tunnel-online.sh` runs on a cron
schedule and will auto-recover most tunnel hiccups within a few minutes.
