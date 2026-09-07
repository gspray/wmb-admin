#!/usr/bin/env bash
# SSH wrapper: run scripts/deploy-server.sh on the remote Admin host.
set -euo pipefail

SSH_TARGET="${1:-}"
if [[ -z "$SSH_TARGET" ]]; then
	echo "Usage: $0 user@host" >&2
	exit 1
fi

expand_path() {
	local p="${1:-}"
	if [[ "$p" == "~/"* ]]; then
		printf '%s' "${HOME}${p#\~}"
	elif [[ "$p" == "~" ]]; then
		printf '%s' "$HOME"
	else
		printf '%s' "$p"
	fi
}

SSH_KEY="$(expand_path "${SSH_KEY:-}")"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [[ -n "$SSH_KEY" && -f "$SSH_KEY" ]]; then
	SSH_OPTS+=(-i "$SSH_KEY")
fi

if [[ -z "${DOPPLER_TOKEN_FILE:-}" ]]; then
	if [[ "${WMB_ADMIN_STAGE:-false}" == "true" || "${DOPPLER_CONFIG:-}" == "stg" ]]; then
		DOPPLER_TOKEN_FILE="/etc/wmb-admin/doppler.stg.token"
	else
		DOPPLER_TOKEN_FILE="/etc/wmb-admin/doppler.token"
	fi
fi

ssh -T "${SSH_OPTS[@]}" "$SSH_TARGET" \
	"APP_DIR=$(printf %q "${REMOTE_DIR}") PM2_APP_NAME=$(printf %q "${APP_NAME}") \
	PORT=$(printf %q "${APP_PORT}") BASE_PATH=$(printf %q "${APP_BASE_PATH}") \
	PUBLIC_HOST=$(printf %q "${PUBLIC_HOST}") DEPLOY_REF=$(printf %q "${DEPLOY_REF:-main}") \
	COMMIT_SHA=$(printf %q "${COMMIT_SHA:-}") DEPLOY_DRY_RUN=$(printf %q "${DEPLOY_DRY_RUN:-0}") \
	DEPLOY_SKIP_SMOKE=$(printf %q "${DEPLOY_SKIP_SMOKE:-0}") SKIP_NPM_CI=$(printf %q "${SKIP_NPM_CI:-0}") \
	DOPPLER_PROJECT=$(printf %q "${DOPPLER_PROJECT:-wmb-admin}") \
	DOPPLER_CONFIG=$(printf %q "${DOPPLER_CONFIG:-prd}") DOPPLER_TOKEN_FILE=$(printf %q "${DOPPLER_TOKEN_FILE}") \
	WMB_ADMIN_STAGE=$(printf %q "${WMB_ADMIN_STAGE:-false}") bash -s" \
	< "$(cd "$(dirname "$0")/.." && pwd)/scripts/deploy-server.sh"
