#!/usr/bin/env python3
"""Build a PII-free manifest for a full Triton CRM SQLite backup."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path


def scalar(conn: sqlite3.Connection, sql: str) -> int:
    row = conn.execute(sql).fetchone()
    return int(row[0] if row else 0)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def upload_stats(directory: Path) -> dict[str, int]:
    files = [path for path in directory.rglob("*") if path.is_file()] if directory.exists() else []
    return {"count": len(files), "bytes": sum(path.stat().st_size for path in files)}


def main() -> None:
    if len(sys.argv) != 7:
        raise SystemExit(
            "usage: build_crm_backup_manifest.py DB UPLOADS OUTPUT REASON APP_VERSION MIGRATIONS_DIR"
        )

    db_path = Path(sys.argv[1]).resolve()
    uploads_dir = Path(sys.argv[2]).resolve()
    output_path = Path(sys.argv[3]).resolve()
    reason = sys.argv[4]
    app_version = sys.argv[5]
    migrations_dir = Path(sys.argv[6]).resolve()

    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        counts = {
            "clients": scalar(conn, "SELECT COUNT(*) FROM Client"),
            "policies": scalar(conn, "SELECT COUNT(*) FROM Policy"),
            "beneficiaries": scalar(conn, "SELECT COUNT(*) FROM Beneficiary"),
            "familyRelationships": scalar(conn, "SELECT COUNT(*) FROM ClientRelationship"),
            "clientNotes": scalar(conn, "SELECT COUNT(*) FROM Client WHERE trim(COALESCE(notes, '')) <> ''"),
            "policyNotes": scalar(conn, "SELECT COUNT(*) FROM Policy WHERE trim(COALESCE(notes, '')) <> ''"),
            "followUps": scalar(conn, "SELECT COUNT(*) FROM FollowUp"),
            "emailHistory": scalar(conn, "SELECT COUNT(*) FROM EmailHistory"),
            "emailReminders": scalar(conn, "SELECT COUNT(*) FROM EmailReminderSend"),
            "users": scalar(conn, "SELECT COUNT(*) FROM User"),
            "settings": scalar(conn, "SELECT COUNT(*) FROM Settings"),
            "auditLogs": scalar(conn, "SELECT COUNT(*) FROM AuditLog"),
            "clientPolicyLinks": scalar(conn, "SELECT COUNT(*) FROM Policy WHERE clientId IS NOT NULL"),
            "policyBeneficiaryLinks": scalar(conn, "SELECT COUNT(*) FROM Beneficiary WHERE policyId IS NOT NULL"),
            "emailAttachmentMetadata": scalar(conn, "SELECT COUNT(*) FROM EmailHistory WHERE trim(COALESCE(attachments, '')) <> ''"),
        }
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        foreign_key_errors = list(conn.execute("PRAGMA foreign_key_check"))
        relationship_checks = {
            "policyClientOrphans": scalar(conn, "SELECT COUNT(*) FROM Policy p LEFT JOIN Client c ON c.id = p.clientId WHERE c.id IS NULL"),
            "beneficiaryPolicyOrphans": scalar(conn, "SELECT COUNT(*) FROM Beneficiary b LEFT JOIN Policy p ON p.id = b.policyId WHERE p.id IS NULL"),
            "familyClientOrphans": scalar(conn, "SELECT COUNT(*) FROM ClientRelationship r LEFT JOIN Client a ON a.id = r.fromClientId LEFT JOIN Client b ON b.id = r.toClientId WHERE a.id IS NULL OR b.id IS NULL"),
            "followUpClientOrphans": scalar(conn, "SELECT COUNT(*) FROM FollowUp f LEFT JOIN Client c ON c.id = f.clientId WHERE c.id IS NULL"),
            "reminderClientOrphans": scalar(conn, "SELECT COUNT(*) FROM EmailReminderSend r LEFT JOIN Client c ON c.id = r.clientId WHERE c.id IS NULL"),
            "policyUserClientMismatch": scalar(conn, "SELECT COUNT(*) FROM Policy p JOIN Client c ON c.id = p.clientId WHERE p.userId <> c.userId"),
            "jointClientReferenceOrphans": scalar(conn, "SELECT COUNT(*) FROM Policy p LEFT JOIN Client c ON c.id = p.jointWithClientId WHERE p.jointWithClientId IS NOT NULL AND c.id IS NULL"),
            "ownerClientReferenceOrphans": scalar(conn, "SELECT COUNT(*) FROM Policy p LEFT JOIN Client a ON a.id = p.policyOwnerClientId LEFT JOIN Client b ON b.id = p.policyOwner2ClientId WHERE (p.policyOwnerClientId IS NOT NULL AND a.id IS NULL) OR (p.policyOwner2ClientId IS NOT NULL AND b.id IS NULL)"),
            "legacyLinkedClientOrphans": scalar(conn, "SELECT COUNT(*) FROM Client c LEFT JOIN Client l ON l.id = c.linkedToId WHERE c.linkedToId IS NOT NULL AND l.id IS NULL"),
        }
        migrations = [path.name for path in migrations_dir.iterdir() if path.is_dir()] if migrations_dir.exists() else []
        applied_migrations = [row[0] for row in conn.execute("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at")]
    finally:
        conn.close()

    manifest = {
        "formatVersion": 1,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
        "application": {"version": app_version, "schemaMigrations": sorted(migrations), "appliedMigrations": applied_migrations},
        "database": {"filename": "data/triton.db", "sha256": sha256(db_path), "integrityCheck": integrity},
        "counts": counts,
        "uploads": upload_stats(uploads_dir),
        "validation": {"foreignKeyErrors": len(foreign_key_errors), **relationship_checks},
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
