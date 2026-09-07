'use strict';

import { detectNavProduct, NAV_IGNORED_QUERY_KEYS } from './nav-url-normalize.js';

const LOGIN_PATH_RE = /\/login(?:\/|$|\?)/i;

/**
 * @param {string} pathname
 * @returns {boolean}
 */
function isAllowedReturnPath(pathname) {
    const product = detectNavProduct(pathname);
    return product === 'author' || product === 'pet' || product === 'admin' || product === 'legacy';
}

/**
 * Validate a post-login or cross-shell return target (same-origin product routes only).
 * @param {string} raw
 * @param {{ origin?: string }} [opts]
 * @returns {string | null} pathname + search + hash
 */
export function resolveNavReturnUrl(raw, opts = {}) {
    const decoded = decodeURIComponent(String(raw || '').trim());
    if (!decoded) return null;
    const origin = opts.origin || (typeof window !== 'undefined' ? window.location.origin : '');
    try {
        const url = new URL(decoded, origin || 'http://local.invalid');
        if (origin && url.origin !== origin) return null;
        if (!isAllowedReturnPath(url.pathname)) return null;
        if (LOGIN_PATH_RE.test(`${url.pathname}${url.search}`)) return null;
        return `${url.pathname}${url.search}${url.hash}`;
    } catch (_) {
        return null;
    }
}

/**
 * @param {URLSearchParams | string} searchParams
 * @param {{ origin?: string }} [opts]
 * @returns {string | null}
 */
export function readNavReturnParam(searchParams, opts = {}) {
    const params = searchParams instanceof URLSearchParams
        ? searchParams
        : new URLSearchParams(String(searchParams || ''));
    return resolveNavReturnUrl(params.get('return'), opts);
}

/**
 * Current location as a return target (strips one-shot / ignored keys).
 * @param {{ origin?: string }} [opts]
 * @returns {string}
 */
export function currentNavReturnHref(opts = {}) {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    for (const key of NAV_IGNORED_QUERY_KEYS) url.searchParams.delete(key);
    url.searchParams.delete('return');
    return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * @param {string} loginUrl
 * @param {string} [returnHref]
 * @param {{ origin?: string }} [opts]
 * @returns {string}
 */
export function buildLoginUrlWithReturn(loginUrl, returnHref, opts = {}) {
    const resolved = resolveNavReturnUrl(returnHref, opts)
        || resolveNavReturnUrl(currentNavReturnHref(opts), opts);
    if (!resolved) return loginUrl;
    try {
        const url = new URL(loginUrl, opts.origin || (typeof window !== 'undefined' ? window.location.origin : 'http://local.invalid'));
        url.searchParams.set('return', resolved);
        return `${url.pathname}${url.search}`;
    } catch (_) {
        return loginUrl;
    }
}
