#!/usr/bin/env python3
"""Print completed, unpinned disaster-recovery backups eligible for retention cleanup."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


def parse_date(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: prune_crm_backups.py METADATA_DIRECTORY")
    directory = Path(sys.argv[1])
    records = []
    for file in directory.glob("*.meta.json"):
        try:
            record = json.loads(file.read_text(encoding="utf-8"))
            if not (record.get("encrypted") and record.get("remote", {}).get("uploaded") and record.get("email", {}).get("sent")):
                continue
            record["_path"] = file
            record["_date"] = parse_date(record["createdAt"])
            records.append(record)
        except (KeyError, ValueError, json.JSONDecodeError):
            continue
    records.sort(key=lambda record: record["_date"], reverse=True)
    keep: set[str] = set()

    for record in records:
        if record.get("important"):
            keep.add(record["filename"])

    for category, limit in (("biweekly", 6), ("monthly", 6)):
        kept = 0
        for record in records:
            if category in record.get("classes", []):
                keep.add(record["filename"])
                kept += 1
                if kept >= limit:
                    break

    cutoff = datetime.now(timezone.utc) - timedelta(days=183)
    for record in records:
        if "pre-deploy" in record.get("classes", []) and record["_date"] >= cutoff:
            keep.add(record["filename"])

    # Manual and pre-restore files are operator-controlled. Keep them unless
    # manually removed or marked by a future explicit retention policy.
    for record in records:
        if any(kind in record.get("classes", []) for kind in ("manual", "pre-restore")):
            keep.add(record["filename"])

    for record in records:
        if record["filename"] not in keep:
            print(record["filename"])


if __name__ == "__main__":
    main()
