#!/usr/bin/env bash
# deploy.sh — Admin-only deploy (Issue #348 Phase 6). Does not touch Pet/Career PM2 apps.
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[wmb-admin deploy]${NC} $*"; }
warn()    { echo -e "${YELLOW}[wmb-admin deploy]${NC} $*"; }
die()     { echo -e "${RED}[wmb-admin deploy] ERROR:${NC} $*" >&2; exit 1; }

usage() {
  cat <<USAGE
Usage: bash deploy.sh [options]

Options:
  --host=HOST          Remote host (default: writemybook.now)
  --public-host=HOST   Public hostname for smoke links
  --user=USER          SSH user (default: admin)
  --dir=PATH           Remote app directory (default: /home/USER/apps/wmb-admin)
  --key=PATH           SSH private key
  --port=PORT          Node port (default: 3018 prod, 3019 stage)
  --stage              Stage profile (origin/stage, port 3019)
  --dry-run            Preview remote checkout only
  --env-only           Restart PM2 only (no git deploy)
  -h, --help           Show help

Environment: DEPLOY_HOST, DEPLOY_USER, DEPLOY_DIR, DEPLOY_PORT, SSH_KEY, COMMIT_SHA, DEPLOY_REF
USAGE
}

REMOTE_USER="${DEPLOY_USER:-admin}"
REMOTE_HOST="${DEPLOY_HOST:-writemybook.now}"
PUBLIC_HOST="${DEPLOY_PUBLIC_HOST:-}"
expand_path() {
  local p="${1:-}"
  if [[ "$p" == "~/"* ]]; then printf '%s' "${HOME}${p#\~}"; elif [[ "$p" == "~" ]]; then printf '%s' "$HOME"; else printf '%s' "$p"; fi
}
SSH_KEY="$(expand_path "${SSH_KEY:-${SSH_KEY_PATH:-$HOME/.ssh/id_rsa}}")"

REMOTE_DIR="${DEPLOY_DIR:-}"
APP_NAME="wmb-admin"
APP_PORT="${DEPLOY_PORT:-3018}"
APP_BASE_PATH="${DEPLOY_BASE_PATH-}"
DRY_RUN=false
STAGE=false
ENV_ONLY=false
REMOTE_DIR_SET=false
APP_PORT_SET=false
PUBLIC_HOST_SET=false
[[ -n "${DEPLOY_DIR:-}" ]] && REMOTE_DIR_SET=true
[[ -n "${DEPLOY_PORT:-}" ]] && APP_PORT_SET=true
[[ -n "${DEPLOY_PUBLIC_HOST:-}" ]] && PUBLIC_HOST_SET=true

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --stage) STAGE=true ;;
    --env-only) ENV_ONLY=true ;;
    --host=*) REMOTE_HOST="${arg#--host=}" ;;
    --public-host=*) PUBLIC_HOST="${arg#--public-host=}"; PUBLIC_HOST_SET=true ;;
    --user=*) REMOTE_USER="${arg#--user=}" ;;
    --dir=*) REMOTE_DIR="${arg#--dir=}"; REMOTE_DIR_SET=true ;;
    --key=*) SSH_KEY="${arg#--key=}" ;;
    --port=*) APP_PORT="${arg#--port=}"; APP_PORT_SET=true ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $arg" ;;
  esac
done

if ! $REMOTE_DIR_SET; then
  REMOTE_DIR="/home/${REMOTE_USER}/apps/wmb-admin"
fi
[[ -n "$PUBLIC_HOST" ]] || PUBLIC_HOST="$REMOTE_HOST"

if $STAGE; then
  $REMOTE_DIR_SET || REMOTE_DIR="/home/${REMOTE_USER}/apps/wmb-admin-stage"
  APP_NAME="wmb-admin-stage"
  $APP_PORT_SET || APP_PORT=3019
  $PUBLIC_HOST_SET || PUBLIC_HOST="stage.writemybook.com"
  DEPLOY_REF="${DEPLOY_REF:-stage}"
  DOPPLER_CONFIG="${DOPPLER_CONFIG:-stg}"
  WMB_ADMIN_STAGE=true
else
  DEPLOY_REF="${DEPLOY_REF:-main}"
  DOPPLER_CONFIG="${DOPPLER_CONFIG:-prd}"
  WMB_ADMIN_STAGE=false
fi

resolve_and_validate_deploy_commit() {
  local remote_ref="origin/${DEPLOY_REF}"
  git fetch --prune origin "$DEPLOY_REF" 2>/dev/null || git fetch --prune origin
  git rev-parse --verify "${remote_ref}^{commit}" >/dev/null 2>&1 \
    || die "Remote ref not found: ${remote_ref}"
  local remote_tip="$(git rev-parse "${remote_ref}")"
  if [[ -z "${COMMIT_SHA:-}" ]]; then
    COMMIT_SHA="$remote_tip"
    info "Deploy commit: ${COMMIT_SHA} (${remote_ref})"
  else
    git cat-file -e "${COMMIT_SHA}^{commit}" 2>/dev/null \
      || die "COMMIT_SHA is not a valid commit: ${COMMIT_SHA}"
    git merge-base --is-ancestor "$COMMIT_SHA" "$remote_tip" 2>/dev/null \
      || die "COMMIT_SHA ${COMMIT_SHA} is not on ${remote_ref}"
    info "Deploy commit: ${COMMIT_SHA} (validated on ${remote_ref})"
  fi
}

if ! $ENV_ONLY; then
  resolve_and_validate_deploy_commit
fi

SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
[[ -f "$SSH_KEY" ]] && SSH_OPTS=(-i "$SSH_KEY" "${SSH_OPTS[@]}")

command -v ssh >/dev/null 2>&1 || die "ssh not found"
command -v git >/dev/null 2>&1 || die "git not found"

if ! $ENV_ONLY && ! $DRY_RUN && [[ "${DEPLOY_SKIP_CLEAN_CHECK:-}" != "1" ]]; then
  [[ -z "$(git status --porcelain 2>/dev/null)" ]] || die "Working tree is not clean"
fi

info "Target: ${SSH_TARGET}:${REMOTE_DIR} (${APP_NAME} — port ${APP_PORT})"
$STAGE && warn "STAGING Admin deploy — /admin proxy cutover may still point at Pet until Phase 7"
$DRY_RUN && warn "DRY RUN — remote checkout preview only"

if $DRY_RUN; then
  export SSH_KEY REMOTE_DIR APP_NAME APP_PORT APP_BASE_PATH PUBLIC_HOST
  export DEPLOY_REF COMMIT_SHA DEPLOY_DRY_RUN=1 DOPPLER_CONFIG WMB_ADMIN_STAGE
  bash scripts/deploy-remote.sh "${SSH_TARGET}"
  exit 0
fi

if $ENV_ONLY; then
  ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" bash <<REMOTE
set -euo pipefail
cd "${REMOTE_DIR}"
export WMB_PM2_APP_NAME="${APP_NAME}" PORT="${APP_PORT}" BASE_PATH="${APP_BASE_PATH}"
npx pm2 restart "${APP_NAME}" --update-env || npx pm2 start ecosystem.config.js --only "${APP_NAME}"
npx pm2 save
REMOTE
  info "PM2 restart complete."
  exit 0
fi

export SSH_KEY REMOTE_DIR APP_NAME APP_PORT APP_BASE_PATH PUBLIC_HOST
export DEPLOY_REF COMMIT_SHA DEPLOY_DRY_RUN=0 DEPLOY_SKIP_SMOKE="${DEPLOY_SKIP_SMOKE:-0}" SKIP_NPM_CI="${SKIP_NPM_CI:-0}"
export DOPPLER_CONFIG WMB_ADMIN_STAGE DOPPLER_PROJECT="${DOPPLER_PROJECT:-wmb-admin}"
bash scripts/deploy-remote.sh "${SSH_TARGET}"

info "Admin deploy complete. Loopback /admin on port ${APP_PORT}."
