#!/usr/bin/env bash
#
# Server deploy: pull the latest code and restart the stack.
#
# Usage (on the server, from the project root):
#   ./scripts/deploy.sh            # docker compose deploy (default)
#   MODE=pm2 ./scripts/deploy.sh   # bare-metal deploy via pm2
#
# Safe to re-run. Does NOT touch your .env — that stays server-side only.

set -euo pipefail

MODE="${MODE:-docker}"
BRANCH="${BRANCH:-main}"

log()  { printf '\n\033[36m▸ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ -f package.json ] || die "Run this from the project root (package.json not found)."

# --- 1. Preconditions -------------------------------------------------------

if [ ! -f .env ]; then
  die ".env is missing. Create it on the server first (cp .env.example .env && edit, or npm run setup).
     Never commit .env — it is gitignored on purpose."
fi

log "Deploying branch '${BRANCH}' in ${MODE} mode"

# --- 2. Pull latest ---------------------------------------------------------

if [ -d .git ]; then
  log "Fetching latest code"
  git fetch --all --prune
  # Refuse to blow away uncommitted server-side edits without the operator knowing.
  if ! git diff --quiet || ! git diff --cached --quiet; then
    die "There are uncommitted changes on the server. Commit, stash, or discard them first:
       git status
       git stash        # to set them aside
       git checkout .   # to discard them"
  fi
  git checkout "${BRANCH}"
  git pull --ff-only origin "${BRANCH}"
else
  die "No .git directory here. Clone the repo first, e.g.:
       git clone <your-repo-url> ai-personal-assistant-ecosystem"
fi

git log --oneline -1

# --- 3. Deploy --------------------------------------------------------------

case "${MODE}" in
  docker)
    command -v docker >/dev/null || die "docker is not installed."

    # Compose v2 (docker compose) with a v1 (docker-compose) fallback.
    if docker compose version >/dev/null 2>&1; then
      DC="docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
      DC="docker-compose"
    else
      die "Neither 'docker compose' nor 'docker-compose' is available."
    fi

    log "Rebuilding and restarting containers"
    # The API image runs `prisma migrate deploy` on startup (docker/entrypoint.sh),
    # so migrations are applied automatically as the new container boots.
    $DC up -d --build

    log "Waiting for the API to report healthy"
    for i in $(seq 1 30); do
      if curl -fsS http://localhost:3000/health/live >/dev/null 2>&1; then
        printf '\033[32m✓ API is live\033[0m\n'
        break
      fi
      [ "$i" -eq 30 ] && {
        printf '\033[31m✗ API did not come up in 60s. Recent logs:\033[0m\n'
        $DC logs --tail=60 api
        exit 1
      }
      sleep 2
    done

    log "Container status"
    $DC ps
    ;;

  pm2)
    command -v node >/dev/null || die "node is not installed."
    command -v pm2  >/dev/null || die "pm2 is not installed (npm i -g pm2)."

    log "Installing dependencies"
    npm ci --omit=dev || npm ci

    log "Applying database migrations"
    npx prisma migrate deploy
    npx prisma generate

    log "Building"
    npm run build

    log "Building dashboard"
    ( cd dashboard-frontend && npm ci && npm run build )

    log "Restarting via pm2"
    pm2 describe ai-assistant >/dev/null 2>&1 \
      && pm2 restart ai-assistant --update-env \
      || pm2 start dist/main.js --name ai-assistant
    pm2 save
    pm2 status ai-assistant
    ;;

  *)
    die "Unknown MODE '${MODE}'. Use 'docker' or 'pm2'."
    ;;
esac

log "Deploy complete"
echo "Health:  curl -s http://localhost:3000/health | head"
