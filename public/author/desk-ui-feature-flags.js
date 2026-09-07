'use strict';

/**
 * Admin Desk — UI Features (global chrome / feature switches).
 * Catalog is empty for now; the panel stays so new switches can land later.
 */

import { state } from './state.js';
import { adminApi as api } from '../admin-desk-api.js';
import { esc } from './ui-helpers.js';

let _renderMyDeskList = null;
let _setMyDeskWorkspaceMode = null;
let _returnToAdminDeskHome = null;

function renderMyDeskList() { return _renderMyDeskList?.(); }
function setMyDeskWorkspaceMode(enabled) { return _setMyDeskWorkspaceMode?.(enabled); }
function returnToAdminDeskHome() { return _returnToAdminDeskHome?.(); }

function groupCatalog(catalog = []) {
    const groups = new Map();
    for (const row of catalog) {
        const group = String(row.group || 'General').trim() || 'General';
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(row);
    }
    return [...groups.entries()];
}

function switchRowHtml(flag, enabled) {
    const id = String(flag.id || '').trim();
    const checked = enabled ? ' checked' : '';
    return `
        <label class="desk-ui-flag-row" for="desk-ui-flag-${esc(id)}">
            <span class="desk-ui-flag-copy">
                <span class="desk-ui-flag-label">${esc(flag.label || id)}</span>
                <span class="desk-ui-flag-desc">${esc(flag.description || '')}</span>
            </span>
            <span class="desk-ui-flag-switch">
                <input type="checkbox" role="switch" id="desk-ui-flag-${esc(id)}"
                    data-ui-flag="${esc(id)}"${checked}
                    aria-checked="${enabled ? 'true' : 'false'}" />
            </span>
        </label>
    `;
}

/**
 * @param {object} deps
 */
export async function launchUiFeatureFlagsPanel(deps) {
    const {
        renderMyDeskList: renderMyDeskListDep,
        setMyDeskWorkspaceMode: setMyDeskWorkspaceModeDep,
        returnToAdminDeskHome: returnToAdminDeskHomeDep,
    } = deps || {};
    if (typeof renderMyDeskListDep !== 'function'
        || typeof setMyDeskWorkspaceModeDep !== 'function'
        || typeof returnToAdminDeskHomeDep !== 'function') {
        throw new Error('launchUiFeatureFlagsPanel requires desk host deps');
    }
    _renderMyDeskList = renderMyDeskListDep;
    _setMyDeskWorkspaceMode = setMyDeskWorkspaceModeDep;
    _returnToAdminDeskHome = returnToAdminDeskHomeDep;

    const emptyEl = document.getElementById('my-desk-empty');
    const editorEl = document.getElementById('my-desk-editor');
    const comingSoon = document.getElementById('my-desk-coming-soon');
    if (!emptyEl) return;

    state.librarySelected = null;
    renderMyDeskList();
    if (comingSoon) comingSoon.classList.add('hidden');
    if (editorEl) editorEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    emptyEl.classList.add('book-audit-host');
    setMyDeskWorkspaceMode(true);
    emptyEl.innerHTML = `
        <div class="desk-workspace-shell desk-workspace-shell--ui-feature-flags">
            <header class="desk-workspace-head">
                <h3>UI Features</h3>
                <button id="my-desk-ui-flags-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <div class="desk-workspace-body desk-settings-body-wrap">
                <div class="desk-workspace-panel-card">
                    <p class="desk-workspace-intro">Product chrome switches will appear here when available.</p>
                    <div id="my-desk-ui-flags-content"></div>
                </div>
            </div>
            <footer class="desk-workspace-foot desk-workspace-foot--spread">
                <span id="my-desk-ui-flags-status" class="desk-workspace-status"></span>
            </footer>
        </div>
    `;

    document.getElementById('my-desk-ui-flags-close')?.addEventListener('click', () => {
        returnToAdminDeskHome();
    });

    const contentEl = document.getElementById('my-desk-ui-flags-content');
    const statusEl = document.getElementById('my-desk-ui-flags-status');
    if (!contentEl || !statusEl) return;

    const setStatus = (msg, isError = false) => {
        statusEl.textContent = msg || '';
        statusEl.style.color = isError ? 'var(--c-danger)' : 'var(--c-success)';
    };

    contentEl.innerHTML = '<p style="color:var(--c-muted);font-size:.82rem;margin:0;">Loading…</p>';

    let flags = {};
    let catalog = [];
    try {
        const loaded = await api('GET', '/api/system/ui-feature-flags');
        flags = loaded?.flags && typeof loaded.flags === 'object' ? { ...loaded.flags } : {};
        catalog = Array.isArray(loaded?.catalog) ? loaded.catalog : [];
    } catch (err) {
        contentEl.innerHTML = `<p style="color:var(--c-danger);font-size:.82rem;margin:0;">${esc(err.message || 'Could not load flags')}</p>`;
        return;
    }

    const paint = () => {
        const groups = groupCatalog(catalog);
        if (!groups.length) {
            contentEl.innerHTML = '<p style="color:var(--c-muted);font-size:.82rem;margin:0;">No feature switches yet.</p>';
            return;
        }
        contentEl.innerHTML = groups.map(([group, rows]) => `
            <section class="desk-ui-flag-group" aria-labelledby="desk-ui-flag-group-${esc(group)}">
                <h4 id="desk-ui-flag-group-${esc(group)}" class="desk-ui-flag-group-title">${esc(group)}</h4>
                <div class="desk-ui-flag-list">
                    ${rows.map((row) => switchRowHtml(row, flags[row.id] !== false)).join('')}
                </div>
            </section>
        `).join('');

        contentEl.querySelectorAll('[data-ui-flag]').forEach((input) => {
            input.addEventListener('change', () => {
                void onToggle(input);
            });
        });
    };

    async function onToggle(input) {
        const id = String(input.getAttribute('data-ui-flag') || '').trim();
        if (!id) return;
        const next = Boolean(input.checked);
        input.setAttribute('aria-checked', next ? 'true' : 'false');
        input.disabled = true;
        setStatus('Saving…');
        try {
            const saved = await api('PATCH', '/api/system/ui-feature-flags', {
                flags: { [id]: next },
            });
            flags = saved?.flags && typeof saved.flags === 'object' ? { ...saved.flags } : { ...flags, [id]: next };
            setStatus('Saved');
        } catch (err) {
            input.checked = !next;
            input.setAttribute('aria-checked', input.checked ? 'true' : 'false');
            setStatus(err.message || 'Could not save', true);
        } finally {
            input.disabled = false;
        }
    }

    paint();
}
