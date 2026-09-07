#!/usr/bin/env bash
# Server-side Admin deploy: git checkout, Doppler build, PM2 restart, smoke, rollback.
set -euo pipefail
set -E

APP_DIR="${APP_DIR:-/home/admin/apps/wmb-admin}"
PM2_APP_NAME="${PM2_APP_NAME:-wmb-admin}"
PORT="${PORT:-3018}"
BASE_PATH="${BASE_PATH:-}"
DEPLOY_REF="${DEPLOY_REF:-main}"
COMMIT_SHA="${COMMIT_SHA:-}"
DEPLOY_DRY_RUN="${DEPLOY_DRY_RUN:-0}"
DEPLOY_SKIP_SMOKE="${DEPLOY_SKIP_SMOKE:-0}"
SKIP_NPM_CI="${SKIP_NPM_CI:-0}"
DOPPLER_PROJECT="${DOPPLER_PROJECT:-wmb-admin}"
DOPPLER_CONFIG="${DOPPLER_CONFIG:-prd}"
DOPPLER_TOKEN_FILE="${DOPPLER_TOKEN_FILE:-/etc/wmb-admin/doppler.token}"
if [[ "${WMB_ADMIN_STAGE:-false}" == "true" || "${DOPPLER_CONFIG:-}" == "stg" || "${PM2_APP_NAME:-}" == "wmb-admin-stage" ]]; then
	PUBLIC_HOST="${PUBLIC_HOST:-stage.writemybook.com}"
else
	PUBLIC_HOST="${PUBLIC_HOST:-writemybook.now}"
fi
WMB_ADMIN_STAGE="${WMB_ADMIN_STAGE:-false}"

log() { printf '[wmb-admin deploy-server] %s\n' "$*"; }
fail() { printf '[wmb-admin deploy-server] error: %s\n' "$*" >&2; exit 1; }

doppler_cmd() {
	if command -v doppler >/dev/null 2>&1; then
		if [[ -n "${DOPPLER_TOKEN:-}" ]]; then
			DOPPLER_TOKEN="$DOPPLER_TOKEN" doppler "$@"
			return
		fi
		if [[ -f "$DOPPLER_TOKEN_FILE" ]]; then
			DOPPLER_TOKEN="$(tr -d '\n' < "$DOPPLER_TOKEN_FILE")" doppler "$@"
			return
		fi
	fi
	fail "Doppler CLI not available and no token at ${DOPPLER_TOKEN_FILE}"
}

run_with_config() {
	doppler_cmd run --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" -- "$@"
}

cd "$APP_DIR" || fail "APP_DIR does not exist: ${APP_DIR}"
[[ -d .git ]] || fail "APP_DIR is not a git clone: ${APP_DIR}"

if [[ "$DEPLOY_DRY_RUN" == "1" ]]; then
	log "DEPLOY_DRY_RUN=1: would checkout ${COMMIT_SHA:-$DEPLOY_REF} in ${APP_DIR}"
	git fetch --prune origin
	if [[ -n "$COMMIT_SHA" ]]; then
		git cat-file -e "${COMMIT_SHA}^{commit}" 2>/dev/null || fail "commit not found: ${COMMIT_SHA}"
	else
		git rev-parse --short "origin/${DEPLOY_REF}" >/dev/null 2>&1 || fail "branch not found: origin/${DEPLOY_REF}"
	fi
	exit 0
fi

PREVIOUS_SHA="${DEPLOY_ROLLBACK_SHA:-$(git rev-parse HEAD)}"
log "Rollback point: ${PREVIOUS_SHA}"
ROLLBACK_ATTEMPTED=0

rollback() {
	local reason="$1"
	if [[ "$ROLLBACK_ATTEMPTED" == "1" ]]; then
		fail "deploy and rollback both failed: ${reason}"
	fi
	ROLLBACK_ATTEMPTED=1
	trap - ERR
	log "Rolling back to ${PREVIOUS_SHA}: ${reason}"
	git checkout --force "$PREVIOUS_SHA"
	deploy_active_tree || fail "deploy failed; rollback to ${PREVIOUS_SHA} also failed"
	fail "deploy failed; rolled back to ${PREVIOUS_SHA}"
}

trap 'status=$?; if [[ $status -ne 0 ]]; then rollback "unexpected error (exit ${status})"; fi' ERR

deploy_active_tree() {
	if [[ "$SKIP_NPM_CI" != "1" ]]; then
		log "npm ci (devDependencies for Admin bundle build)"
		run_with_config bash -c 'unset NODE_ENV; npm ci --include=dev --ignore-scripts --no-audit --no-fund'
	else
		log "SKIP_NPM_CI=1: skipping npm ci"
	fi

	log "Building Admin Desk frontend bundle"
	run_with_config env NODE_ENV=production npm run build:frontend

	local admin_bundle="public/dist/admin-desk.bundle.js"
	[[ -f "$admin_bundle" ]] || fail "Missing ${admin_bundle} after build:frontend"
	local admin_bytes
	admin_bytes="$(wc -c < "$admin_bundle" | tr -d ' ')"
	[[ "$admin_bytes" -ge 10000 ]] || fail "Admin bundle too small (${admin_bytes} bytes)"

	mkdir -p logs

	log "Restarting PM2 app: ${PM2_APP_NAME}"
	export WMB_PM2_APP_NAME="$PM2_APP_NAME"
	export PORT BASE_PATH
	export DOPPLER_TOKEN_FILE DOPPLER_PROJECT DOPPLER_CONFIG

	if npx pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
		npx pm2 delete "$PM2_APP_NAME" || true
	fi
	npx pm2 start ecosystem.config.js --only "$PM2_APP_NAME" --update-env
	npx pm2 save

	sleep 2
	if ! npx pm2 describe "$PM2_APP_NAME" 2>/dev/null | grep -q "online"; then
		npx pm2 logs "$PM2_APP_NAME" --lines 20 --nostream >&2 || true
		fail "PM2 app ${PM2_APP_NAME} is not online after restart"
	fi

	if [[ "$DEPLOY_SKIP_SMOKE" == "1" ]]; then
		log "DEPLOY_SKIP_SMOKE=1: skipping post-deploy smoke"
		return 0
	fi

	local smoke_url="http://127.0.0.1:${PORT}"
	if [[ -n "$BASE_PATH" && "$BASE_PATH" != "/" ]]; then
		smoke_url="${smoke_url}${BASE_PATH}"
	fi
	log "Waiting for HTTP ready (${smoke_url})"
	local ready=0
	local attempt
	local code
	for attempt in $(seq 1 45); do
		code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 "$smoke_url/admin" 2>/dev/null || true)"
		if [[ "$code" =~ ^(200|301|302|303|307|308)$ ]]; then
			ready=1
			log "HTTP ready after ${attempt}s (HTTP ${code})"
			break
		fi
		sleep 1
	done
	if [[ "$ready" != "1" ]]; then
		npx pm2 logs "$PM2_APP_NAME" --lines 40 --nostream >&2 || true
		fail "HTTP not ready at ${smoke_url}/admin after 45s"
	fi
	log "Post-deploy Admin smoke (${smoke_url})"
	run_with_config node scripts/smoke-test.js --base-url "$smoke_url"
}

log "Fetching origin"
git fetch --prune origin

if [[ -n "$COMMIT_SHA" ]]; then
	TARGET_REF="$COMMIT_SHA"
	git cat-file -e "${COMMIT_SHA}^{commit}" 2>/dev/null || fail "commit not found: ${COMMIT_SHA}"
else
	TARGET_REF="origin/${DEPLOY_REF}"
	git rev-parse --short "$TARGET_REF" >/dev/null 2>&1 || fail "branch not found: ${TARGET_REF}"
fi

if [[ "${DEPLOY_SERVER_POST_CHECKOUT:-}" != "1" ]]; then
	log "Checking out ${TARGET_REF}"
	git checkout --force "$TARGET_REF"
	CURRENT_SHA="$(git rev-parse HEAD)"
	log "Active commit: ${CURRENT_SHA}"
	trap - ERR
	log "Re-exec checked-out deploy-server.sh for build/smoke"
	export DEPLOY_SERVER_POST_CHECKOUT=1
	export DEPLOY_ROLLBACK_SHA="$PREVIOUS_SHA"
	export COMMIT_SHA="$CURRENT_SHA"
	exec bash "${APP_DIR}/scripts/deploy-server.sh"
fi

CURRENT_SHA="$(git rev-parse HEAD)"
log "Post-checkout build/smoke at ${CURRENT_SHA}"

log "Verifying Doppler config ${DOPPLER_PROJECT}/${DOPPLER_CONFIG}"
run_with_config bash -c 'test -n "${FIREBASE_DATABASE_URL:-}${FIREBASE_SERVICE_ACCOUNT_JSON:-}${FIREBASE_SERVICE_ACCOUNT:-}${ADMIN_TOKEN_SECRET:-}"' \
	|| fail "Doppler config appears empty — check project/config and token scope"

deploy_active_tree

trap - ERR
log "Deploy complete: ${CURRENT_SHA} (Admin /admin on https://${PUBLIC_HOST}${BASE_PATH:-/}admin — proxy cutover may still be pending)"
