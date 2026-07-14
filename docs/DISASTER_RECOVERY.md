# Triton CRM Disaster Recovery

When B2 and backup-notification SMTP credentials are present, each completed
full backup is encrypted, verified, uploaded, and reported by email. Before
those offsite credentials are configured, `Full backup now` and the biweekly
schedule still create and verify an encrypted local archive. The Settings page
marks those archives `B2 pending`; they are not an offsite disaster-recovery
substitute.

## First-time NAS setup

1. Create a private Backblaze B2 bucket and least-privilege Application Key.
2. Create `/volume1/docker/triton-crm/backup-secrets/backup.env` from
   `backup-secrets/README.md`, then save the same age private key and B2
   credentials in a password manager.
3. Add the following private values to `/volume1/docker/triton-crm/.env.production`:
   `BACKUP_CONTROL_SECRET`, `BACKUP_EMAIL_TO`, `BACKUP_SMTP_HOST`,
   `BACKUP_SMTP_PORT`, `BACKUP_SMTP_SECURE`, `BACKUP_SMTP_USER`,
   `BACKUP_SMTP_PASSWORD`, `BACKUP_SMTP_FROM_EMAIL`, and
   `BACKUP_SMTP_FROM_NAME`.
4. Run `sh scripts/install-disaster-recovery.sh` on the NAS, then deploy the
   CRM so its read-only backup/status mounts and request queue are active.
5. Run `./backup-crm.sh --reason manual`, then run the isolated restore test
   before considering the system operational.

## Everyday operations

```sh
./backup-crm.sh
./verify-crm-backup.sh latest-backup-file.tar.gz.age
./restore-crm.sh latest
```

The scheduled full backup checks each Sunday at 02:20 Vancouver time but only
creates a new full backup after 14 days. Existing weekly per-user CRM snapshot
jobs remain enabled separately.

## New NAS or replacement disks

Install Docker, restore the CRM source, recreate `.env.production` and
`backup-secrets/backup.env` from the password manager, run the setup script,
then use `./restore-crm.sh latest`. If the local backup directory is empty,
the script downloads the most recent encrypted archive and checksum from B2.

The package intentionally excludes SMTP passwords, B2 credentials, Cloudflare
credentials, and the age identity. Those secrets must come from the password
manager; customer data never enters Git.
