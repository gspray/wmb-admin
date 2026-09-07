'use strict';

import {
    detectNavProduct,
    navUrlsEquivalent,
    normalizeNavUrl,
} from './nav-url-normalize.js';

const LOG_PREFIX = '[wmb nav]';
const DUPLICATE_WINDOW_MS = 500;
const MAX_EVENTS = 40;

/** @type {Array<object>} */
const _events = [];

/** @type {Array<(event: { kind: string, url: string }) => void>} */
const _activityListeners = [];

/** @type {(() => string | null) | null} */
let _derivedUrlProvider = null;

let _enabled = false;
let _installed = false;

/**
 * @returns {boolean}
 */
export function isNavInstrumentationEnabled() {
    if (typeof window === 'undefined') return false;
    try {
        if (String(window.WMB_NAV_INSTRUMENT || '').trim() === '1') return true;
        const env = String(window.__WMB__?.env || '').toLowerCase();
        if (env === 'production') return false;
        if (env === 'development') return true;
        const host = String(window.location.hostname || '').trim().toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1') return true;
    } catch (_) {
        return false;
    }
    return false;
}

/**
 * @param {(event: { kind: string, url: string }) => void} fn
 */
export function registerNavActivityListener(fn) {
    if (typeof fn === 'function') _activityListeners.push(fn);
}

function notifyActivityListeners(kind, url) {
    if (!_activityListeners.length) return;
    const payload = { kind: String(kind || ''), url: String(url || '') };
    for (const fn of _activityListeners) {
        try { fn(payload); } catch (_) { /* activity is best-effort */ }
    }
}

/**
 * @param {() => string | null} provider
 */
export function registerDerivedUrlProvider(provider) {
    _derivedUrlProvider = typeof provider === 'function' ? provider : null;
    logNavMismatchIfNeeded();
}

/**
 * @returns {string | null}
 */
export function getDerivedUrl() {
    if (!_derivedUrlProvider) return null;
    try {
        const raw = _derivedUrlProvider();
        if (!raw) return null;
        return normalizeNavUrl(raw);
    } catch (err) {
        console.warn(`${LOG_PREFIX} derived URL provider failed`, err);
        return null;
    }
}

/**
 * @returns {{ href: string, derived: string | null, equivalent: boolean | null, product: string }}
 */
export function getNavMismatchSnapshot() {
    const href = typeof window !== 'undefined' ? window.location.href : '';
    const derived = getDerivedUrl();
    return {
        href,
        derived,
        equivalent: derived == null ? null : navUrlsEquivalent(href, derived),
        product: typeof window !== 'undefined'
            ? detectNavProduct(window.location.pathname)
            : 'unknown',
    };
}

/**
 * @returns {object[]}
 */
export function getNavInstrumentationEvents() {
    return _events.slice();
}

function pushEvent(entry) {
    _events.push(entry);
    while (_events.length > MAX_EVENTS) _events.shift();
}

function logNavMismatchIfNeeded() {
    if (!_enabled) return;
    const snap = getNavMismatchSnapshot();
    if (snap.derived == null || snap.equivalent) return;
    console.warn(`${LOG_PREFIX} mismatch`, {
        url: normalizeNavUrl(snap.href),
        derived: snap.derived,
    });
}

/**
 * @param {string} kind
 * @param {string} targetUrl
 * @param {{ source?: string, stack?: string }} [meta]
 */
function recordNavigation(kind, targetUrl, meta = {}) {
    const normalized = normalizeNavUrl(targetUrl);
    const now = Date.now();
    const prev = _events[_events.length - 1];
    const duplicate = prev
        && (prev.kind === 'push' || prev.kind === 'replace' || prev.kind === 'assign' || prev.kind === 'replace-location')
        && prev.normalized === normalized
        && (now - prev.at) <= DUPLICATE_WINDOW_MS;

    const entry = {
        at: now,
        kind,
        url: String(targetUrl || ''),
        normalized,
        duplicate: Boolean(duplicate),
        source: meta.source || '',
    };
    pushEvent(entry);
    if (!duplicate) notifyActivityListeners(kind, normalized);

    if (!_enabled) return;

    const suffix = duplicate ? ' (duplicate within 500ms)' : '';
    const msg = `${LOG_PREFIX} ${kind} → ${normalized}${suffix}`;
    if (duplicate) console.warn(msg, meta.source ? { source: meta.source } : undefined);
    else console.info(msg, meta.source ? { source: meta.source } : undefined);

    if (duplicate) {
        console.warn(`${LOG_PREFIX} nav.loop.detected`, { url: normalized, kind });
    }

    logNavMismatchIfNeeded();
}

function onPopState() {
    const href = window.location.href;
    pushEvent({
        at: Date.now(),
        kind: 'pop',
        url: href,
        normalized: normalizeNavUrl(href),
        duplicate: false,
        source: 'popstate',
    });
    if (_enabled) console.info(`${LOG_PREFIX} popstate → ${normalizeNavUrl(href)}`);
    notifyActivityListeners('pop', normalizeNavUrl(href));
    logNavMismatchIfNeeded();
}

function patchHistory() {
    const originalPush = history.pushState.bind(history);
    const originalReplace = history.replaceState.bind(history);

    // Record + mismatch-check AFTER the mutation so location.href matches the write.
    // Checking before replaceState false-positives (e.g. admin ?preview= → derived screen URL).
    history.pushState = function patchedPushState(state, title, url) {
        const result = originalPush(state, title, url);
        if (url != null) {
            recordNavigation('push', String(url), { source: 'history.pushState' });
        }
        return result;
    };

    history.replaceState = function patchedReplaceState(state, title, url) {
        const result = originalReplace(state, title, url);
        if (url != null) {
            recordNavigation('replace', String(url), { source: 'history.replaceState' });
        }
        return result;
    };
}

function patchLocation() {
    const proto = typeof Location !== 'undefined' ? Location.prototype : null;
    if (!proto) return;

    const originalAssign = proto.assign;
    const originalReplace = proto.replace;

    if (typeof originalAssign === 'function') {
        proto.assign = function patchedAssign(url) {
            // Navigation may unload the page; log before leaving.
            recordNavigation('assign', String(url), { source: 'location.assign' });
            return originalAssign.call(this, url);
        };
    }

    if (typeof originalReplace === 'function') {
        proto.replace = function patchedReplace(url) {
            recordNavigation('replace-location', String(url), { source: 'location.replace' });
            return originalReplace.call(this, url);
        };
    }
}

/**
 * @param {{ force?: boolean }} [opts]
 * @returns {object}
 */
export function installNavInstrumentation(opts = {}) {
    if (_installed) return getNavInstrumentationApi();
    _installed = true;
    _enabled = Boolean(opts.force || isNavInstrumentationEnabled());

    patchHistory();
    patchLocation();
    window.addEventListener('popstate', onPopState);

    return getNavInstrumentationApi();
}

/**
 * @returns {object}
 */
export function getNavInstrumentationApi() {
    return {
        enabled: _enabled,
        getEvents: getNavInstrumentationEvents,
        getMismatchSnapshot: getNavMismatchSnapshot,
        registerDerivedUrlProvider,
    };
}

if (typeof window !== 'undefined') {
    window.WmbNavInstrumentation = getNavInstrumentationApi();
}
