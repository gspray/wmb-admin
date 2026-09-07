'use strict';

/** Admin application URL helpers — canonical `/admin` route (no legacy hash view). */

export function adminBasePath() {
    const base = String(window.__WMB__?.basePath || '').replace(/\/+$/, '');
    return `${base}/admin`;
}

/**
 * @param {string} [pathname]
 * @returns {boolean}
 */
export function isAdminApplicationPath(pathname) {
    const base = String(window.__WMB__?.basePath || '').replace(/\/+$/, '');
    const path = String(pathname || window.location.pathname || '/');
    const routes = [`${base}/admin`, '/admin'];
    return routes.some((route) => path === route || path === `${route}/`);
}

/**
 * Serialize admin shell URL without legacy `#admin` hash.
 * @param {URL} url
 */
export function canonicalAdminHistoryUrl(url) {
    if (isAdminApplicationPath(url.pathname)) {
        url.hash = '';
        // Explicit ?project= is the canonical Admin Desk book pin; dev_project is only
        // for OTP-free bootstrap when no project is in the URL.
        if (String(url.searchParams.get('project') || '').trim()) {
            url.searchParams.delete('dev_project');
        }
        return `${url.pathname}${url.search}`;
    }
    const hashView = (url.hash || '#admin').replace(/\?.*$/, '') || '#admin';
    url.hash = hashView;
    return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Build deep link into Admin Desk or Book Projects tab.
 * @param {string} [desk]
 * @param {string} [projectId]
 * @param {{ devProjectId?: string }} [opts]
 */
export function buildAdminDeskUrl(desk = 'home', projectId = '', opts = {}) {
    const params = new URLSearchParams();
    const slug = String(desk || 'home').trim() || 'home';
    params.set('desk', slug);
    const pid = String(projectId || '').trim();
    if (pid) params.set('project', pid);
    const devId = String(opts.devProjectId || '').trim();
    if (devId) params.set('dev_project', devId);
    const qs = params.toString();
    return `${adminBasePath()}${qs ? `?${qs}` : ''}`;
}
