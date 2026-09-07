#!/bin/sh
# scripts/push-to-github.sh
#
# UGREEN NAS doesn't ship with git. This wraps the alpine/git Docker image
# to commit and push the repo to GitHub without installing anything on the
# host. Run on the NAS:
#
#   bash scripts/push-to-github.sh
#
# Requirements:
#   - $REPO_DIR is already a git clone of the GitHub repo (origin set).
#   - $HOME/.ssh has a key that's added to the GitHub account, OR
#     a PAT-encoded HTTPS URL is configured for origin.
#
# The container mounts the repo and ~/.ssh read-only so push-via-SSH works.

set -eu

REPO_DIR="/volume1/docker/triton-crm"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-Security and stability hardening pass

- Lock CSP-adjacent X-Powered-By header off
- Constant-time bearer-token check for /api/automation/* cron routes
- Health check now hits /api/ready so DB outages are detected
- Sanitize signature/template HTML before dangerouslySetInnerHTML
- Document Prisma client global caching (dev only)
- Log rate-limit hits on forgot-password while preserving anti-enumeration
- Validate snapshot schema version with backwards-compatible parser
- Enable SQLite WAL via dedicated entrypoint script (multi-user write safety)
- FollowUp.createdById now ON DELETE CASCADE; admin user delete no longer
  fails when the user has activity history
- Explicit onDelete declarations for EmailHistory.user and AuditLog.user}"

cd "$REPO_DIR"

echo "==> Inspecting repo state via alpine/git"
docker run --rm \
  -v "$REPO_DIR:/repo" \
  -v "$HOME/.ssh:/root/.ssh:ro" \
  -v "$HOME/.gitconfig:/root/.gitconfig:ro" \
  -w /repo \
  alpine/git status

echo
echo "==> Staging changes"
docker run --rm \
  -v "$REPO_DIR:/repo" \
  -v "$HOME/.ssh:/root/.ssh:ro" \
  -v "$HOME/.gitconfig:/root/.gitconfig:ro" \
  -w /repo \
  alpine/git add -A

echo "==> Committing"
docker run --rm \
  -v "$REPO_DIR:/repo" \
  -v "$HOME/.ssh:/root/.ssh:ro" \
  -v "$HOME/.gitconfig:/root/.gitconfig:ro" \
  -w /repo \
  alpine/git commit -m "$COMMIT_MESSAGE" || echo "    (nothing to commit)"

echo "==> Pushing to origin/main"
docker run --rm \
  -v "$REPO_DIR:/repo" \
  -v "$HOME/.ssh:/root/.ssh:ro" \
  -v "$HOME/.gitconfig:/root/.gitconfig:ro" \
  -e GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new" \
  -w /repo \
  alpine/git push origin main

echo
echo "==> Done. Latest commit:"
docker run --rm \
  -v "$REPO_DIR:/repo" \
  -v "$HOME/.ssh:/root/.ssh:ro" \
  -v "$HOME/.gitconfig:/root/.gitconfig:ro" \
  -w /repo \
  alpine/git log --oneline -3
