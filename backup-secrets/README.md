# Disaster-Recovery Secrets

This directory is intentionally ignored by Git. On the NAS, create these files
with mode `600` and keep matching recovery credentials in a password manager.

## `backup.env`

```sh
BACKUP_AGE_IMAGE=alpine:3.20
BACKUP_AGE_RECIPIENT=age1...
BACKUP_AGE_IDENTITY_FILE=/volume1/docker/triton-crm/backup-secrets/age-identity.txt

B2_AWS_CLI_IMAGE=amazon/aws-cli:2.17.44
B2_S3_ENDPOINT=https://s3.<region>.backblazeb2.com
B2_BUCKET=triton-crm-disaster-recovery
B2_PREFIX=production
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

```

`age-identity.txt` must contain the matching private `AGE-SECRET-KEY-...` line.
It must never be committed, emailed with a backup, or stored in the CRM database.

The `BACKUP_AGE_*` values are sufficient for verified local encrypted backups.
The B2 values are required before the worker enables offsite upload and backup
email delivery.

The notification SMTP values and `BACKUP_EMAIL_TO` belong in NAS
`.env.production` because the CRM's authenticated notification endpoint sends
the email. They must also remain mode `600` and out of Git.

## GitHub Releases (alternative offsite storage)

Do not upload CRM archives to the public source repository. Create a separate
private repository, then add a fine-grained token limited to that repository:

```sh
GITHUB_BACKUP_REPOSITORY=jieyuan166-stack/Triton-CRM-Encrypted-Backups
GITHUB_BACKUP_TOKEN=github_pat_...
```

The token needs repository `Contents: Read and write` permission. The NAS only
uploads `.tar.gz.age` encrypted archives, SHA-256 files, and non-sensitive
metadata as private Release assets. It never uploads an unencrypted database,
uploads directory, or recovery key.
