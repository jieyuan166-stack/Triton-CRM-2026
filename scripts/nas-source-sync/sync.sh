#!/bin/sh
# Runtime state and credentials live outside all four deployment directories.
set -eu
BASE=/volume1/docker/triton-crm-source-sync
case "${1:-}" in
  crm) ROOT=/volume1/docker/triton-crm; REPO=Triton-CRM-2026; KEY=id_ed25519 ;;
  website) ROOT='/volume1/docker/TRITON WEBSITE'; REPO=Triton-Website; KEY=website ;;
  kyc) ROOT='/volume1/docker/Triton KYC'; REPO=KYC2026; KEY=kyc ;;
  proposal) ROOT='/volume1/docker/Triton Fund proposal'; REPO=Fund-proposal; KEY=proposal ;;
  *) echo 'Usage: sync.sh crm|website|kyc|proposal' >&2; exit 2 ;;
esac
STATE="$BASE/state/$1"
mkdir -p "$STATE"
exec 9>"$STATE/sync.lock"
flock -n 9 || exit 0
git_run() {
  docker run --rm -e "HOST_UID=$(id -u)" -e "HOST_GID=$(id -g)" \
    -v "$STATE:/state" -v "$BASE/secrets:/secrets:ro" -w /state \
    -e "GIT_SSH_COMMAND=ssh -i /secrets/$KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/secrets/known_hosts" \
    --entrypoint sh alpine/git -c 'git -c safe.directory=/state/repo "$@"; result=$?; chown -R "$HOST_UID:$HOST_GID" /state; exit "$result"' sh "$@"
}
test -r "$BASE/secrets/$KEY"
if [ ! -d "$STATE/repo/.git" ]; then
  git_run clone "git@github.com:jieyuan166-stack/$REPO.git" repo
fi
git_run -C repo fetch origin
if git_run -C repo show-ref --verify --quiet refs/remotes/origin/nas-autosave; then
  git_run -C repo checkout -B nas-autosave origin/nas-autosave
else
  git_run -C repo checkout -B nas-autosave origin/main
fi
git_run -C repo ls-tree -rz --name-only origin/main > "$STATE/tracked-files"
stage="$(mktemp -d "$STATE/snapshot.XXXXXX")"
trap 'rm -rf "$stage"' EXIT INT TERM
python3 "$BASE/export-source.py" "$ROOT" "$stage" "$STATE/tracked-files"
rsync -a --delete --exclude='.git' "$stage/" "$STATE/repo/"
git_run -C repo add -A
if ! git_run -C repo diff --cached --quiet; then
  git_run -C repo -c user.name='Triton NAS Source Backup' \
    -c user.email='nas-source-backup@users.noreply.github.com' \
    commit -m "${COMMIT_MESSAGE:-NAS source snapshot $(date -u +%Y-%m-%dT%H:%M:%SZ)}"
fi
git_run -C repo push origin HEAD:refs/heads/nas-autosave
git_run -C repo rev-parse HEAD > "$STATE/last-success-commit"
date -u +%Y-%m-%dT%H:%M:%SZ > "$STATE/last-success-at"
echo "$REPO saved to GitHub nas-autosave"
