# NAS source backups

Four repositories receive source snapshots on their `nas-autosave` branches.
The NAS checks every five minutes; only changed source creates a commit.
This is a source snapshot, not a release, test result, or database backup.

The service lives at `/volume1/docker/triton-crm-source-sync`, outside all
deployment directories and Personal Folder. Each repository has a dedicated
write-enabled deploy key in `secrets/`. Never commit those keys.

Run `sh /volume1/docker/triton-crm-source-sync/sync-all.sh` after each completed
editing step, or run `sync.sh crm`, `sync.sh website`, `sync.sh kyc`, or
`sync.sh proposal` for one project. Inspect `state/<project>/last-success-at`
and `last-success-commit` to confirm the push. Cron output is in
`state/cron.log`; a failed push leaves the previous remote snapshot intact.

The exporter includes tracked source/assets and new code files within source
directories. Runtime databases, uploads, secrets, environment files, caches,
and archives are excluded. New untracked binary assets must first be reviewed
and added to the main source inventory. Source snapshots do not replace the
CRM's encrypted database backups or weekly user backups.

To rebuild the service on another NAS, restore the three files in
`scripts/nas-source-sync/` to the service directory, provision separate
repository deploy keys and pinned GitHub known_hosts, and install the same
five-minute cron command. Keep the service directory owner-only (700) and
private key files 600. No Mac or home-directory configuration is required.
