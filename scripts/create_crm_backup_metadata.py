#!/usr/bin/env python3
"""Create/update the non-sensitive sidecar used by the admin UI and retention."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--reason", required=True)
    parser.add_argument("--remote-key", default="")
    parser.add_argument("--remote-uploaded", action="store_true")
    parser.add_argument("--email-sent", action="store_true")
    parser.add_argument("--download-url", default="")
    parser.add_argument("--important", action="store_true")
    parser.add_argument("--metadata-dir", default="")
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    archive = Path(args.archive)
    output = Path(args.output)
    reason = args.reason.lower()
    created_at = manifest["createdAt"]
    classes = ["manual"] if reason == "manual" else [reason]
    if reason == "scheduled":
        classes = ["biweekly"]
        metadata_dir = Path(args.metadata_dir) if args.metadata_dir else output.parent
        month = created_at[:7]
        has_monthly_backup = False
        for sidecar in metadata_dir.glob("*.meta.json"):
            try:
                prior = json.loads(sidecar.read_text(encoding="utf-8"))
                has_monthly_backup = month == str(prior.get("createdAt", ""))[:7] and "monthly" in prior.get("classes", [])
                if has_monthly_backup:
                    break
            except (json.JSONDecodeError, OSError):
                continue
        if not has_monthly_backup:
            classes.append("monthly")

    previous = {}
    if output.exists():
        previous = json.loads(output.read_text(encoding="utf-8"))

    metadata = {
        "formatVersion": 1,
        "filename": archive.name,
        "createdAt": created_at,
        "reason": reason,
        "classes": classes,
        "important": bool(args.important or previous.get("important", False)),
        "encrypted": True,
        "sizeBytes": archive.stat().st_size,
        "sha256": sha256(archive),
        "verifiedAt": previous.get("verifiedAt") or datetime.now(timezone.utc).isoformat(),
        "remote": {
            "uploaded": bool(args.remote_uploaded or previous.get("remote", {}).get("uploaded", False)),
            "key": args.remote_key or previous.get("remote", {}).get("key", ""),
            "uploadedAt": datetime.now(timezone.utc).isoformat() if args.remote_uploaded else previous.get("remote", {}).get("uploadedAt"),
        },
        "email": {
            "sent": bool(args.email_sent or previous.get("email", {}).get("sent", False)),
            "sentAt": datetime.now(timezone.utc).isoformat() if args.email_sent else previous.get("email", {}).get("sentAt"),
            "downloadUrl": args.download_url or previous.get("email", {}).get("downloadUrl", ""),
        },
        "counts": manifest.get("counts", {}),
        "uploads": manifest.get("uploads", {}),
        "validation": manifest.get("validation", {}),
        "application": manifest.get("application", {}),
    }
    output.write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
