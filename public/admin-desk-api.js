'use strict';

/**
 * Minimal Admin API client — no dependency on Career Author SPA state or api.js.
 * Calls the same /api/* endpoints using Admin-local auth state.
 */

import { BASE } from './author/config.js';
import { adminDeskState } from './admin-desk-state.js';

const WMB_TOKEN_KEY = 'wmb-admin-token';
const WMB_AUTHOR_PROJECT_KEY = 'wmb-author-project-id';

/** Get the best available auth token for Admin API calls. */
export async function getAdminApiToken() {
    if (adminDeskState.user) {
        try { return adminDeskState.user.getIdToken(); } catch (_) {}
    }
    return adminDeskState._adminToken || localStorage.getItem(WMB_TOKEN_KEY) || null;
}

/**
 * Minimal Admin HTTP client — drop-in replacement for the Career `api()` function
 * used in desk panels. Handles dev-mode, admin-preview, and Firebase auth paths.
 *
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method
 * @param {string} path  — must start with /api/
 * @param {unknown} [body]
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function adminApi(method, path, body, opts = {}) {
    const devMode = adminDeskState._devMode && adminDeskState._devProjectId;
    const adminPreviewMode = adminDeskState._adminPreviewMode && adminDeskState._adminToken;
    const token = (devMode || adminPreviewMode) ? null : await getAdminApiToken();

    const headers = {
        'Content-Type': 'application/json',
        ...(devMode
            ? {
                'X-Dev-Project-Id': adminDeskState._devProjectId,
                'X-Author-Project-Id': adminDeskState._devProjectId,
            }
            : adminPreviewMode
            ? {
                Authorization: `Bearer ${adminDeskState._adminToken}`,
                'X-Author-Project-Id': localStorage.getItem(WMB_AUTHOR_PROJECT_KEY) || '',
            }
            : token
            ? {
                Authorization: `Bearer ${token}`,
                'X-Author-Project-Id': localStorage.getItem(WMB_AUTHOR_PROJECT_KEY) || '',
            }
            : {}),
    };

    const fetchOpts = {
        method,
        headers,
        ...(opts.signal ? { signal: opts.signal } : {}),
    };
    if (body !== undefined) fetchOpts.body = JSON.stringify(body);

    const res = await fetch(`${BASE}${path}`, fetchOpts);

    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        const err = Object.assign(new Error(`Admin API ${method} ${path} → ${res.status}`), {
            status: res.status,
            detail,
        });
        throw err;
    }

    const ct = String(res.headers.get('content-type') || '');
    if (ct.includes('application/json')) return res.json();
    return res.text();
}

/** GET project outline; null when the current book has none yet. */
export async function loadAdminProjectOutline() {
    try {
        const data = await adminApi('GET', '/api/system/author/project/outline');
        return data?.hasOutline === false ? null : data;
    } catch (err) {
        if (err?.status === 404) return null;
        throw err;
    }
}
