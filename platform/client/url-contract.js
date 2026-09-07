'use strict';

/**
 * URL contract helpers — path-based book identity + chooser flash.
 * See docs/URL_CONTRACT.md.
 */

/** Reserved first segments under /book and /pet (not project ids). */
export const PRODUCT_RESERVED_SEGMENTS = Object.freeze([
    'login',
    'select',
    'join',
    'preview',
    'new',
    'manifest.json',
]);

export const AUTHOR_PROJECT_LS_KEY = 'wmb-author-project-id';
export const CHOOSER_FLASH_KEY = 'wmb-chooser-flash';
export const DEV_ENTRY_SESSION_KEY = 'wmb-dev-entry';
export const FORCE_DESKTOP_SESSION_KEY = 'wmb-force-desktop';

/**
 * @param {unknown} segment
 * @returns {boolean}
 */
export function isReservedProductSegment(segment) {
    const s = String(segment || '').trim().toLowerCase();
    return Boolean(s) && PRODUCT_RESERVED_SEGMENTS.includes(s);
}

/**
 * @param {string} pathname
 * @param {string} [basePath]
 * @returns {string}
 */
export function stripBasePath(pathname, basePath = '') {
    let path = String(pathname || '/');
    const base = String(basePath || '').replace(/\/+$/, '');
    if (base && path.startsWith(base)) {
        path = path.slice(base.length) || '/';
    }
    if (!path.startsWith('/')) path = `/${path}`;
    return path.replace(/\/+$/, '') || '/';
}

/**
 * @typedef {{
 *   product: 'book'|'pet'|'',
 *   kind: 'home'|'select'|'login'|'join'|'new'|'preview'|'project'|'',
 *   projectId: string,
 * }} ProductPathIntent
 */

/**
 * Parse /book/* or /pet/* path identity (no query).
 * @param {string} pathname
 * @param {{ basePath?: string }} [opts]
 * @returns {ProductPathIntent}
 */
export function parseProductPath(pathname, opts = {}) {
    const path = stripBasePath(pathname, opts.basePath);
    const empty = { product: '', kind: '', projectId: '' };
    let rest = '';
    let product = '';
    if (path === '/book' || path.startsWith('/book/')) {
        product = 'book';
        rest = path === '/book' ? '' : path.slice('/book/'.length);
    } else if (path === '/pet' || path.startsWith('/pet/')) {
        product = 'pet';
        rest = path === '/pet' ? '' : path.slice('/pet/'.length);
    } else {
        return empty;
    }

    const parts = rest.split('/').filter(Boolean);
    if (!parts.length) {
        return { product, kind: 'home', projectId: '' };
    }

    const first = parts[0];
    if (first === 'select') return { product, kind: 'select', projectId: '' };
    if (first === 'login') return { product, kind: 'login', projectId: '' };
    if (first === 'join') return { product, kind: 'join', projectId: '' };
    if (first === 'new' && product === 'pet') return { product, kind: 'new', projectId: '' };
    if (first === 'preview') {
        const id = String(parts[1] || '').trim();
        return { product, kind: 'preview', projectId: id };
    }
    if (isReservedProductSegment(first)) {
        return { product, kind: '', projectId: '' };
    }
    return { product, kind: 'project', projectId: String(first || '').trim() };
}

/**
 * @param {'book'|'pet'} product
 * @param {{
 *   kind?: 'home'|'select'|'login'|'join'|'new'|'preview'|'project',
 *   projectId?: string,
 *   basePath?: string,
 * }} [opts]
 * @returns {string}
 */
export function buildProductPath(product, opts = {}) {
    const base = String(opts.basePath || '').replace(/\/+$/, '');
    const root = product === 'pet' ? '/pet' : '/book';
    const kind = String(opts.kind || 'home').trim() || 'home';
    const id = String(opts.projectId || '').trim();
    let sub = '';
    if (kind === 'select') sub = '/select';
    else if (kind === 'login') sub = '/login';
    else if (kind === 'join') sub = '/join';
    else if (kind === 'new') sub = '/new';
    else if (kind === 'preview' && id) sub = `/preview/${encodeURIComponent(id)}`;
    else if (kind === 'project' && id) sub = `/${encodeURIComponent(id)}`;
    const path = `${base}${root}${sub}`.replace(/\/{2,}/g, '/');
    return path || `${root}${sub}`;
}

/**
 * Legacy query book pin → path kind + id.
 * @param {URLSearchParams | string | Record<string, string>} search
 * @returns {{ kind: 'project'|'preview'|'new'|'', projectId: string, legacyDev: boolean }}
 */
export function legacyQueryBookPin(search) {
    const params = search instanceof URLSearchParams
        ? search
        : typeof search === 'string'
            ? new URLSearchParams(search)
            : new URLSearchParams(Object.entries(search || {}));
    const start = String(params.get('start') || '').trim() === '1';
    const preview = String(params.get('preview') || '').trim();
    const project = String(params.get('project') || '').trim();
    const dev = String(params.get('dev_project') || '').trim();
    if (start) return { kind: 'new', projectId: '', legacyDev: false };
    if (preview) return { kind: 'preview', projectId: preview, legacyDev: false };
    if (dev && dev.toLowerCase() !== 'auto') {
        return { kind: 'project', projectId: dev, legacyDev: true };
    }
    if (dev && dev.toLowerCase() === 'auto') {
        return { kind: 'project', projectId: 'auto', legacyDev: true };
    }
    if (project) return { kind: 'project', projectId: project, legacyDev: false };
    return { kind: '', projectId: '', legacyDev: false };
}

/**
 * @param {Storage} [storage]
 * @param {'closed'|'choose'|string} [flash]
 */
export function setChooserFlash(storage, flash = 'closed') {
    if (!storage) return;
    try {
        storage.setItem(CHOOSER_FLASH_KEY, String(flash || 'closed'));
    } catch (_) { /* ignore */ }
}

/**
 * @param {Storage} [storage]
 * @returns {string}
 */
export function consumeChooserFlash(storage) {
    if (!storage) return '';
    try {
        const value = String(storage.getItem(CHOOSER_FLASH_KEY) || '').trim();
        storage.removeItem(CHOOSER_FLASH_KEY);
        return value;
    } catch (_) {
        return '';
    }
}

/**
 * Consumer query keys that must not be written to author/pet address bars.
 * (Login may still use `return` once.)
 */
export const CONSUMER_KILLED_QUERY_KEYS = Object.freeze([
    'closed',
    'choose',
    'call',
    'studio',
    'mode',
    'stage',
    'tab',
    'panel',
    'settingsView',
    'assignment',
    'q',
    'lens',
    'start',
    'desktop',
    'mobile',
    'dev_step',
]);
