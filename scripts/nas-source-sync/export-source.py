#!/usr/bin/env python3
"""Export an explicit source inventory; runtime files are never candidates."""
import hashlib
import os
import re
from pathlib import Path
import shutil
import sys

root, stage, tracked_file = map(Path, sys.argv[1:])
tracked = set(tracked_file.read_bytes().decode().strip('\0').split('\0'))
blocked = {'node_modules', '.git', '.next', '.github-sync', 'backups', 'uploads',
           'data', 'disaster-recovery', 'backup-secrets', 'cloudflared', '.secrets',
           'secrets', '__pycache__', '.cache', 'coverage', 'logs', '.claude', '.kiro', '.vscode'}
code_roots = {'app', 'components', 'lib', 'scripts', 'tests', 'prisma', 'docs', 'docker', 'server', 'src'}
extensions = {'.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.sh', '.py', '.sql', '.prisma', '.md', '.html'}
forbidden = ('.db', '.sqlite', '.sqlite3', '.csv', '.log', '.pem', '.key', '.age', '.gz', '.tgz', '.zip', '.pyc', '.tsbuildinfo', '.tmp', '.bak')
manifest = {}
for directory, dirs, files in os.walk(root, followlinks=False):
    dirs[:] = [d for d in dirs if d not in blocked and not (Path(directory) / d).is_symlink()]
    for name in files:
        path = Path(directory) / name
        rel = path.relative_to(root)
        if name.startswith('._') or name == '.DS_Store':
            continue
        if name.startswith('.env') and name != '.env.example':
            continue
        if name.lower().endswith(forbidden) or any(word in name.lower() for word in ('credential', 'secret', 'token', '.triton-auth', '.triton-remembered', 'id_ed25519')):
            continue
        if str(rel) not in tracked and not (rel.parts[0] in code_roots and path.suffix in extensions):
            continue
        if path.is_symlink() or not path.is_file():
            raise SystemExit(f'Unsafe source file: {rel}')
        content = path.read_bytes()
        if re.search(rb'-----BEGIN [A-Z ]*PRIVATE KEY-----', content) or re.search(rb'AGE-SECRET-KEY-' + rb'1[A-Z0-9]{58}', content):
            raise SystemExit(f'Credential detected in source file: {rel}')
        target = stage / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
        target.chmod(0o755 if os.access(path, os.X_OK) else 0o644)
        manifest[str(rel)] = hashlib.sha256(content).hexdigest()
for rel, digest in manifest.items():
    if hashlib.sha256((root / rel).read_bytes()).hexdigest() != digest:
        raise SystemExit('Source changed during snapshot; retry on the next run')
if len(manifest) < 5:
    raise SystemExit('Source tree appears empty; refusing to publish')
print(f'Exported {len(manifest)} source files')
