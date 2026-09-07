#!/usr/bin/env bash
# Admin-only PM2 entry (Issue #348 Phase 6). Does not build or restart Pet/Career.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DOPPLER_TOKEN_FILE="${DOPPLER_TOKEN_FILE:-/etc/wmb-admin/doppler.token}"
export WMB_CONFIG_SOURCE=doppler

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
	return 1
}

if doppler_cmd run --project "${DOPPLER_PROJECT:-wmb-admin}" --config "${DOPPLER_CONFIG:-prd}" -- node server.js; then
	exit 0
fi

exec node server.js
