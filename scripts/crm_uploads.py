#!/usr/bin/env python3
"""Strict file inventory and verified copy. Inventory stays inside encrypted backups."""
import hashlib
import os
from pathlib import Path
import shutil
import stat
import sys


def inventory(directory):
    root = Path(directory)
    if not root.is_dir() or root.is_symlink():
        raise ValueError("Uploads directory is missing or unsafe")
    result = []
    def on_error(_error):
        raise ValueError("Uploads directory cannot be read")
    for parent, dirs, files in os.walk(root, onerror=on_error, followlinks=False):
        for name in dirs + files:
            path = Path(parent) / name
            info = path.lstat()
            if stat.S_ISLNK(info.st_mode) or not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
                raise ValueError("Uploads contain an unsupported file type")
            if stat.S_ISDIR(info.st_mode):
                continue
            digest = hashlib.sha256()
            with path.open("rb") as handle:
                for block in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(block)
            after = path.stat()
            if (info.st_size, info.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise ValueError("Uploads changed during verification; retry backup")
            result.append({"path": path.relative_to(root).as_posix(), "bytes": after.st_size, "sha256": digest.hexdigest()})
    return sorted(result, key=lambda item: item["path"])


def copy_verified(source, destination):
    before = inventory(source)
    shutil.copytree(source, destination, dirs_exist_ok=True)
    if before != inventory(source) or before != inventory(destination):
        raise ValueError("Uploads copy failed verification; no backup may be published")
    return before


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("Usage: crm_uploads.py SOURCE DESTINATION")
        copied = copy_verified(sys.argv[1], sys.argv[2])
        print("Uploads verified: %d files" % len(copied))
    except Exception:
        # Filenames may contain PII; keep detailed inventories inside the encrypted package.
        print("Uploads copy/verification failed. Check permissions, source availability and disk space.", file=sys.stderr)
        sys.exit(1)
