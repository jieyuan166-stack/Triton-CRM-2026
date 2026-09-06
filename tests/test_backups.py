import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from crm_uploads import copy_verified, inventory


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="triton-files-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        (self.source / "attachment.pdf").write_bytes(b"synthetic test file")

    def test_copy_hashes_and_sizes(self):
        destination = self.root / "destination"
        copy_verified(self.source, destination)
        self.assertEqual(inventory(self.source), inventory(destination))
        # Same count and size do not mean the same file.
        (destination / "attachment.pdf").write_bytes(b"x" * len(b"synthetic test file"))
        self.assertNotEqual(inventory(self.source), inventory(destination))

    def test_missing_directory_and_symlink_rejected(self):
        with self.assertRaises(ValueError):
            copy_verified(self.root / "missing", self.root / "destination")
        (self.source / "link").symlink_to("attachment.pdf")
        with self.assertRaises(ValueError):
            inventory(self.source)

    def test_copy_permission_error_is_fatal(self):
        with mock.patch("crm_uploads.shutil.copytree", side_effect=PermissionError("denied")):
            with self.assertRaises(PermissionError):
                copy_verified(self.source, self.root / "destination")

    def restore_fixture(self, fail_start=False):
        url = os.environ.get("DATABASE_URL", "")
        self.assertIn("triton-core-test-", url)
        stage = self.root / "stage"
        (stage / "data").mkdir(parents=True)
        with sqlite3.connect(url.removeprefix("file:")) as source:
            with sqlite3.connect(stage / "data/triton.db") as destination:
                source.backup(destination)
        copy_verified(self.source, stage / "uploads")
        subprocess.run([sys.executable, str(ROOT / "scripts/build_crm_backup_manifest.py"), str(stage / "data/triton.db"), str(stage / "uploads"), str(stage / "manifest.json"), "test", "test-version", str(ROOT / "prisma/migrations")], check=True)
        dbdir = self.root / "db"
        dbdir.mkdir()
        (dbdir / "triton.db").write_bytes(b"original database")
        (dbdir / "triton.db-wal").write_bytes(b"original wal")
        (dbdir / "triton.db-shm").write_bytes(b"original shm")
        uploads = self.root / "uploads"
        uploads.mkdir()
        (uploads / "old.txt").write_bytes(b"original upload")
        bindir = self.root / "bin"
        bindir.mkdir()
        state = self.root / "up-count"
        # Fake service control is confined to this temp directory. No real Docker or network calls.
        docker = bindir / "docker"
        docker.write_text('#!/bin/sh\ncase " $* " in *" up "*) n=0; [ ! -f "$TEST_STATE" ] || n=$(cat "$TEST_STATE"); echo $((n+1)) > "$TEST_STATE";; esac\n')
        curl = bindir / "curl"
        curl.write_text('#!/bin/sh\n[ "$TEST_FAIL_START" = false ] || [ "$(cat "$TEST_STATE")" -gt 1 ]\n')
        docker.chmod(0o755)
        curl.chmod(0o755)
        env = dict(os.environ, PATH=str(bindir) + os.pathsep + os.environ["PATH"], TEST_STATE=str(state), TEST_FAIL_START=str(fail_start).lower(), RESTORE_READY_ATTEMPTS="1", RESTORE_READY_INTERVAL="0")
        args = ["sh", str(ROOT / "scripts/restore-crm-install.sh"), str(stage), str(dbdir), str(uploads), "isolated-test", str(self.root), "http://unused.invalid", str(ROOT)]
        return args, env, stage, dbdir, uploads, state

    def test_restore_failure_rolls_back_database_wal_and_uploads(self):
        args, env, _stage, dbdir, uploads, state = self.restore_fixture(True)
        result = subprocess.run(args, env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(state.read_text().strip(), "2")
        self.assertEqual((dbdir / "triton.db").read_bytes(), b"original database")
        self.assertEqual((dbdir / "triton.db-wal").read_bytes(), b"original wal")
        self.assertEqual((dbdir / "triton.db-shm").read_bytes(), b"original shm")
        self.assertEqual((uploads / "old.txt").read_bytes(), b"original upload")

    def test_restore_success_verifies_all_files(self):
        args, env, stage, dbdir, uploads, _state = self.restore_fixture()
        result = subprocess.run(args, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((dbdir / "triton.db").read_bytes(), (stage / "data/triton.db").read_bytes())
        self.assertEqual(inventory(uploads), inventory(stage / "uploads"))
        self.assertFalse((dbdir / "triton.db-wal").exists())

    def test_corrupt_upload_blocks_restore_before_service_stop(self):
        args, env, stage, dbdir, _uploads, state = self.restore_fixture()
        (stage / "uploads/attachment.pdf").write_bytes(b"x" * len(b"synthetic test file"))
        result = subprocess.run(args, env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(state.exists())
        self.assertEqual((dbdir / "triton.db").read_bytes(), b"original database")

    def test_manifest_hashes_remain_encrypted_not_public_metadata(self):
        _args, _env, stage, _dbdir, _uploads, _state = self.restore_fixture()
        manifest = json.loads((stage / "manifest.json").read_text())
        self.assertEqual(manifest["formatVersion"], 2)
        self.assertEqual(len(manifest["uploads"]["files"]), 1)


if __name__ == "__main__":
    unittest.main()
