#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
temp="$(mktemp -d /tmp/triton-core-test-XXXXXX)"
trap 'rm -rf "$temp"' EXIT INT TERM
export DATABASE_URL="file:$temp/test.db"
touch "$temp/test.db"
export NODE_ENV=test
pnpm exec prisma migrate deploy > "$temp/migrations.log" 2>&1 || { cat "$temp/migrations.log"; exit 1; }
node --conditions=react-server --import tsx --test tests/core.test.ts
python3 -m unittest discover -s tests -p 'test_*.py'
