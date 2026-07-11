# Disaster-Recovery Secrets

This directory is intentionally ignored by Git. On the NAS, create these files
with mode `600` and keep matching recovery credentials in a password manager.

## `backup.env`

```sh
BACKUP_AGE_IMAGE=ghcr.io/filosottile/age:v1.2.1
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

The notification SMTP values and `BACKUP_EMAIL_TO` belong in NAS
`.env.production` because the CRM's authenticated notification endpoint sends
the email. They must also remain mode `600` and out of Git.
