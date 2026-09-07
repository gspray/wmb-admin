'use strict';

import { normalizeNavUrl } from '../platform/client/nav-url-normalize.js';
import { state } from './author/state.js';

/**
 * @param {URL} url
 * @returns {{ desk: string, project: string }}
 */
function parseAdminRouteFromUrl(url) {
    const search = url.searchParams;
    const rawHash = String(url.hash || '').replace(/^#/, '');
    const hashParts = rawHash.split('?');
    const hashParams = new URLSearchParams(hashParts[1] || '');
    const desk = String(search.get('desk') || hashParams.get('desk') || 'home').trim() || 'home';
    const project = String(search.get('project') || hashParams.get('project') || '').trim();
    return { desk, project };
}

/**
 * Phase 1 — expected Admin URL from query + loaded project context.
 * @returns {string | null}
 */
export function deriveAdminUrlFromState() {
    if (typeof window === 'undefined') return null;
    const url = new URL(window.location.href);
    const base = String(window.__WMB__?.basePath || '').replace(/\/+$/, '');
    const path = `${base}/admin`.replace(/\/{2,}/g, '/');
    const parsed = parseAdminRouteFromUrl(url);
    const params = new URLSearchParams();

    const desk = parsed.desk || 'home';
    if (desk) params.set('desk', desk);

    const projectId = String(
        parsed.project
        || state.project?.id
        || '',
    ).trim();
    if (projectId) params.set('project', projectId);

    const qs = params.toString();
    return normalizeNavUrl(`${path}${qs ? `?${qs}` : ''}`);
}
