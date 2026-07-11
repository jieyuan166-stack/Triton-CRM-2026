#!/usr/bin/env python3
"""Verify a restored/extracted CRM backup without printing PII."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
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


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: verify_crm_backup.py MANIFEST DB UPLOADS")
    manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    db_path = Path(sys.argv[2])
    uploads_dir = Path(sys.argv[3])
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        fk_errors = list(conn.execute("PRAGMA foreign_key_check"))
        actual = {
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
        manual_orphans = {
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
    finally:
        conn.close()

    upload_files = [path for path in uploads_dir.rglob("*") if path.is_file()] if uploads_dir.exists() else []
    expected_counts = manifest.get("counts", {})
    mismatches = {name: {"expected": expected_counts.get(name), "actual": value} for name, value in actual.items() if expected_counts.get(name) != value}
    expected_uploads = manifest.get("uploads", {}).get("count", 0)
    if expected_uploads != len(upload_files):
        mismatches["uploadedFiles"] = {"expected": expected_uploads, "actual": len(upload_files)}
    expected_db_hash = manifest.get("database", {}).get("sha256")
    database_hash_matches = isinstance(expected_db_hash, str) and expected_db_hash == sha256(db_path)
    if not database_hash_matches:
        mismatches["databaseSha256"] = {"expected": expected_db_hash, "actual": "mismatch"}
    broken = len(fk_errors) + sum(manual_orphans.values())
    report = {
        "ok": integrity == "ok" and not mismatches and broken == 0,
        "integrityCheck": integrity,
        "counts": actual,
        "uploads": {"count": len(upload_files), "bytes": sum(path.stat().st_size for path in upload_files)},
        "foreignKeyErrors": len(fk_errors),
        "databaseHashMatches": database_hash_matches,
        "manualRelationshipErrors": manual_orphans,
        "brokenRelationships": broken,
        "mismatches": mismatches,
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    if not report["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
