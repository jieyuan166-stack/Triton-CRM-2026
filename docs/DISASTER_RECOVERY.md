# Triton CRM Disaster Recovery

Each completed full backup is encrypted with age, verified locally, and pushed
to the private `Triton-CRM-Encrypted-Backups` GitHub repository. The public
source repository never receives CRM data. Backblaze B2 remains an optional
second offsite copy; it is not required for the GitHub-backed recovery path.

## First-time NAS setup

1. Ensure the private GitHub backup repository and its single-repository NAS
   deploy key are configured in `/volume1/docker/triton-crm/backup-secrets/backup.env`.
2. Create `/volume1/docker/triton-crm/backup-secrets/backup.env` from
   `backup-secrets/README.md`, then save the age private key and GitHub backup
   repository access in a password manager. Backblaze B2 credentials are
   optional and provide a second independent copy.
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

Install Docker, restore the CRM source from the public GitHub repository,
recreate `.env.production` and `backup-secrets/backup.env` from the password
manager, run the setup script, then use `./restore-crm.sh latest`. If the local
backup directory is empty, the script downloads the newest encrypted archive
and checksum from the private GitHub backup repository (or B2 if configured).

If the NAS itself is lost, generate a new single-repository deploy key after
rebuilding the NAS, or download the encrypted archive from GitHub using the
repository owner's account and place it in
`/volume1/docker/triton-crm/disaster-recovery/backups/` before running restore.
The only non-repository recovery material that must be preserved outside the
NAS is the age private identity in the password manager. GitHub stores only
encrypted archives, checksums, and non-sensitive count metadata; no customer
data is ever committed to the public source repository.

The package intentionally excludes SMTP passwords, B2 credentials, Cloudflare
credentials, and the age identity. Those secrets must come from the password
manager; customer data never enters Git.
