# Tunnel Watchdog

`scripts/ensure-tunnel-online.sh` keeps `https://crm.tritonwealth.ca`
reachable. It is designed to run every minute and self-heal any tunnel
outage in under 60 seconds.

## What it checks (in order)

1. `triton-tunnel` and `triton-tunnel-backup` containers exist and are
   running. They are two active Cloudflare Tunnel connectors for the same
   hostname, both running on the NAS.
2. `triton-crm` container is running.
3. Local `http://127.0.0.1:3001/api/ready` responds (otherwise the
   problem is the app, not the tunnel).
4. `https://crm.tritonwealth.ca` is reachable through Cloudflare.
   If this fails the watchdog restarts both tunnel connectors.
5. `https://www.tritonwealth.ca/` (marketing site) — informational,
   does not trigger a restart on its own.

## How to install on UGREEN NAS

UGREEN NAS uses systemd-timer for scheduled tasks. Run once on the NAS:

```sh
ssh wellce101@192.168.50.158
sudo tee /etc/systemd/system/triton-tunnel-watchdog.service >/dev/null <<'UNIT'
[Unit]
Description=Triton CRM tunnel watchdog
After=docker.service

[Service]
Type=oneshot
ExecStart=/bin/sh /volume1/docker/triton-crm/scripts/ensure-tunnel-online.sh
User=wellce101
UNIT

sudo tee /etc/systemd/system/triton-tunnel-watchdog.timer >/dev/null <<'TIMER'
[Unit]
Description=Run Triton CRM tunnel watchdog every minute

[Timer]
OnBootSec=60
OnUnitActiveSec=60
AccuracySec=10s
Persistent=true

[Install]
WantedBy=timers.target
TIMER

sudo systemctl daemon-reload
sudo systemctl enable --now triton-tunnel-watchdog.timer
sudo systemctl status triton-tunnel-watchdog.timer
```

If your NAS does not have systemd, the alternative is the UGREEN
"Schedule" panel in the Control Panel — create a task that runs
`/bin/sh /volume1/docker/triton-crm/scripts/ensure-tunnel-online.sh`
every minute as user `wellce101`.

## Inspecting the watchdog log

```sh
tail -50 /volume1/docker/triton-crm/tunnel-watchdog.log
```

Empty log = nothing has gone wrong. Lines appear only when the
watchdog detects and recovers an issue.

## Mac independence

The public CRM path does not depend on the Mac mini. Both Cloudflare
Tunnel connectors run as Docker containers on the NAS. If the Mac is
offline, asleep, or sold, `crm.tritonwealth.ca` remains reachable as
long as the NAS, Docker, and internet connection are running.

## Manual trigger

```sh
bash /volume1/docker/triton-crm/scripts/ensure-tunnel-online.sh
```

Always safe to run — it does nothing when everything is healthy.
