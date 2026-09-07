'use strict';

/** Query keys stripped when comparing or logging navigation URLs. */
export const NAV_IGNORED_QUERY_KEYS = Object.freeze([
    'wmb_refresh',
    'admin_token',
]);

/**
 * @param {string} href
 * @param {{ stripIgnored?: boolean }} [opts]
 * @returns {string}
 */
export function normalizeNavUrl(href, opts = {}) {
    const stripIgnored = opts.stripIgnored !== false;
    let url;
    try {
        url = new URL(href, 'http://local.invalid');
    } catch (_) {
        return String(href || '').trim();
    }
    const path = String(url.pathname || '/').replace(/\/+$/, '') || '/';
    const params = new URLSearchParams(url.search);
    if (stripIgnored) {
        for (const key of NAV_IGNORED_QUERY_KEYS) params.delete(key);
    }
    const keys = [...params.keys()].sort();
    const sorted = new URLSearchParams();
    for (const key of keys) sorted.set(key, params.get(key));
    const qs = sorted.toString();
    const hash = String(url.hash || '').trim();
    return `${path}${qs ? `?${qs}` : ''}${hash}`;
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
export function navUrlsEquivalent(left, right) {
    return normalizeNavUrl(left) === normalizeNavUrl(right);
}

/**
 * @param {string} [pathname]
 * @returns {'pet' | 'admin' | 'legacy' | 'unknown'}
 */
export function detectNavProduct(pathname = '') {
    let path = String(pathname || '/');
    if (!path.startsWith('/')) path = `/${path}`;
    path = path.replace(/\/+$/, '') || '/';
    if (path === '/pet' || path.startsWith('/pet/')) return 'pet';
    if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
    if (path === '/' || path.startsWith('/author')) return 'legacy';
    return 'unknown';
}
