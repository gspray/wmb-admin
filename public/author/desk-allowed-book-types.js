'use strict';

/**
 * Admin Desk — Allowed Book Types catalog.
 * Persists `allowedBookTypes` (+ enablement) via Ghostwriter Settings RTDB.
 */

import { state } from './state.js';
import { adminApi as api } from '../admin-desk-api.js';
import { esc } from './ui-helpers.js';

let _renderMyDeskList = null;
let _setMyDeskWorkspaceMode = null;
let _returnToAdminDeskHome = null;
let _launchDeskBySlug = null;

function renderMyDeskList() { return _renderMyDeskList?.(); }
function setMyDeskWorkspaceMode(enabled) { return _setMyDeskWorkspaceMode?.(enabled); }
function returnToAdminDeskHome() { return _returnToAdminDeskHome?.(); }

function isValidBookTypeId(raw) {
    return /^[a-z][a-z0-9_]{1,47}$/.test(String(raw || '').trim());
}

function slugifyLabelToId(label) {
    return String(label || '')
        .trim()
        .toLowerCase()
        .replace(/['']/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
}

/**
 * @param {object} deps
 * @param {Function} deps.renderMyDeskList
 * @param {Function} deps.setMyDeskWorkspaceMode
 * @param {Function} deps.returnToAdminDeskHome
 * @param {Function} [deps.launchDeskBySlug]
 */
export async function launchAllowedBookTypesPanel(deps) {
    const {
        renderMyDeskList: renderMyDeskListDep,
        setMyDeskWorkspaceMode: setMyDeskWorkspaceModeDep,
        returnToAdminDeskHome: returnToAdminDeskHomeDep,
        launchDeskBySlug: launchDeskBySlugDep,
    } = deps || {};
    if (typeof renderMyDeskListDep !== 'function'
        || typeof setMyDeskWorkspaceModeDep !== 'function'
        || typeof returnToAdminDeskHomeDep !== 'function') {
        throw new Error('launchAllowedBookTypesPanel requires desk host deps');
    }
    _renderMyDeskList = renderMyDeskListDep;
    _setMyDeskWorkspaceMode = setMyDeskWorkspaceModeDep;
    _returnToAdminDeskHome = returnToAdminDeskHomeDep;
    _launchDeskBySlug = typeof launchDeskBySlugDep === 'function' ? launchDeskBySlugDep : null;

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
        <div class="desk-workspace-shell desk-workspace-shell--allowed-book-types">
            <header class="desk-workspace-head">
                <h3>Allowed Book Types</h3>
                <button id="my-desk-allowed-book-types-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <div class="desk-workspace-body desk-settings-body-wrap desk-allowed-book-types-body">
                <div class="desk-workspace-panel-card">
                    <p class="desk-workspace-intro">
                        Source of truth for Discover book-type chips and the Start My Book gate.
                        Built-in types cannot be removed. Enable at least one type for authors.
                        Saving updates the shared gate automatically — no manual option editing in Start My Book Editor.
                    </p>
                    <div id="my-desk-allowed-book-types-content"></div>
                </div>
            </div>
            <footer id="my-desk-allowed-book-types-footer" class="desk-workspace-foot desk-workspace-foot--spread">
                <div class="desk-ghostwriter-settings-actions">
                    <button class="btn btn-ghost" id="my-desk-reset-allowed-book-types" type="button">Reset catalog</button>
                    <button class="btn btn-primary" id="my-desk-save-allowed-book-types" type="button">Save</button>
                </div>
                <span id="my-desk-allowed-book-types-status" class="desk-workspace-status"></span>
            </footer>
        </div>
    `;

    document.getElementById('my-desk-allowed-book-types-close')?.addEventListener('click', () => {
        returnToAdminDeskHome();
    });

    const contentEl = document.getElementById('my-desk-allowed-book-types-content');
    const saveBtn = document.getElementById('my-desk-save-allowed-book-types');
    const resetBtn = document.getElementById('my-desk-reset-allowed-book-types');
    const statusEl = document.getElementById('my-desk-allowed-book-types-status');
    if (!contentEl || !saveBtn || !resetBtn || !statusEl) return;

    const setStatus = (msg, isError = false) => {
        statusEl.textContent = msg || '';
        statusEl.style.color = isError ? 'var(--c-danger)' : 'var(--c-success)';
    };

    /** @type {{ id: string, label: string, builtin: boolean, enabled: boolean }[]} */
    let rows = [];

    const collectRowsFromDom = () => {
        const next = [];
        contentEl.querySelectorAll('.desk-abt-row').forEach((rowEl) => {
            const id = String(rowEl.dataset.id || '').trim();
            if (!id) return;
            const builtin = rowEl.dataset.builtin === '1';
            const labelInput = rowEl.querySelector('.desk-abt-label-input');
            const enabledInput = rowEl.querySelector('.desk-abt-enabled');
            const label = String(labelInput?.value || id).trim() || id;
            next.push({
                id,
                label,
                builtin,
                enabled: Boolean(enabledInput?.checked),
            });
        });
        return next;
    };

    const renderRows = () => {
        const listHtml = rows.map((row) => {
            const id = String(row.id || '').trim();
            const label = String(row.label || id);
            const builtin = Boolean(row.builtin);
            const enabled = Boolean(row.enabled);
            return `
                <div class="desk-abt-row" data-id="${esc(id)}" data-builtin="${builtin ? '1' : '0'}">
                    <label class="desk-abt-enabled-wrap" title="Offer to authors">
                        <input type="checkbox" class="desk-abt-enabled" ${enabled ? 'checked' : ''} aria-label="Enable ${esc(label)}" />
                    </label>
                    <div class="desk-abt-id-wrap">
                        <code class="desk-abt-id">${esc(id)}</code>
                        ${builtin ? '<span class="desk-abt-badge">Built-in</span>' : '<span class="desk-abt-badge desk-abt-badge--custom">Custom</span>'}
                    </div>
                    <input type="text" class="auth-field desk-abt-label-input" value="${esc(label)}" aria-label="Label for ${esc(id)}" />
                    ${builtin
                        ? '<span class="desk-abt-remove-spacer" aria-hidden="true"></span>'
                        : `<button type="button" class="btn btn-ghost desk-abt-remove" data-id="${esc(id)}" aria-label="Remove ${esc(id)}">Remove</button>`}
                </div>
            `;
        }).join('');

        contentEl.innerHTML = `
            <section class="desk-ghostwriter-dimension" aria-labelledby="desk-abt-list-title">
                <h4 id="desk-abt-list-title" class="desk-ghostwriter-dimension-title">Catalog</h4>
                <p class="desk-ghostwriter-dimension-desc">Check a type to enable it for authors. Labels appear in Discover / Start My Book.</p>
                <div class="desk-abt-list-head" aria-hidden="true">
                    <span>On</span>
                    <span>Id</span>
                    <span>Label</span>
                    <span></span>
                </div>
                <div class="desk-abt-list">${listHtml || '<p class="desk-ghostwriter-dimension-desc">No book types.</p>'}</div>
            </section>
            <section class="desk-ghostwriter-dimension" aria-labelledby="desk-abt-add-title">
                <h4 id="desk-abt-add-title" class="desk-ghostwriter-dimension-title">Add book type</h4>
                <p class="desk-ghostwriter-dimension-desc">Ids are lowercase letters, numbers, and underscores (e.g. <code>family_history</code>). After adding, mirror the same id on the Start My Book book-type gate options.</p>
                <div class="desk-abt-add-row">
                    <div class="desk-ghostwriter-field">
                        <label class="desk-ghostwriter-field-label" for="desk-abt-new-id">Id</label>
                        <input id="desk-abt-new-id" class="auth-field" type="text" autocomplete="off" placeholder="family_history" />
                    </div>
                    <div class="desk-ghostwriter-field">
                        <label class="desk-ghostwriter-field-label" for="desk-abt-new-label">Label</label>
                        <input id="desk-abt-new-label" class="auth-field" type="text" autocomplete="off" placeholder="Family History" />
                    </div>
                    <button type="button" class="btn btn-ghost" id="desk-abt-add-btn">Add</button>
                </div>
            </section>
            <p class="desk-ghostwriter-dimension-desc">
                Situation options and narrative defaults still live in
                <button type="button" class="desk-abt-link-btn" id="desk-abt-open-gw">Ghostwriter Settings</button>.
            </p>
        `;

        contentEl.querySelectorAll('.desk-abt-remove').forEach((btn) => {
            btn.addEventListener('click', () => {
                rows = collectRowsFromDom().filter((r) => r.id !== btn.dataset.id);
                setStatus('');
                renderRows();
            });
        });

        document.getElementById('desk-abt-add-btn')?.addEventListener('click', () => {
            rows = collectRowsFromDom();
            const idInput = document.getElementById('desk-abt-new-id');
            const labelInput = document.getElementById('desk-abt-new-label');
            let id = String(idInput?.value || '').trim().toLowerCase();
            const label = String(labelInput?.value || '').trim();
            if (!id && label) id = slugifyLabelToId(label);
            if (!isValidBookTypeId(id)) {
                setStatus('Id must be 2–48 chars: start with a letter, then letters, numbers, or underscores.', true);
                return;
            }
            if (rows.some((r) => r.id === id)) {
                setStatus(`“${id}” is already in the catalog.`, true);
                return;
            }
            rows.push({
                id,
                label: label || id,
                builtin: false,
                enabled: false,
            });
            if (idInput) idInput.value = '';
            if (labelInput) labelInput.value = '';
            setStatus(`Added ${id} (not enabled yet).`);
            renderRows();
        });

        document.getElementById('desk-abt-open-gw')?.addEventListener('click', () => {
            if (_launchDeskBySlug) {
                _launchDeskBySlug('ghostwriter-settings').catch(() => {});
            }
        });

        const newLabel = document.getElementById('desk-abt-new-label');
        const newId = document.getElementById('desk-abt-new-id');
        newLabel?.addEventListener('blur', () => {
            if (newId && !String(newId.value || '').trim() && String(newLabel.value || '').trim()) {
                newId.value = slugifyLabelToId(newLabel.value);
            }
        });
    };

    contentEl.innerHTML = '<p style="color:var(--c-muted);font-size:.82rem;margin:0;">Loading…</p>';

    try {
        const loaded = await api('GET', '/api/system/ghostwriter-settings');
        const catalog = Array.isArray(loaded?.allowedBookTypes) && loaded.allowedBookTypes.length
            ? loaded.allowedBookTypes
            : (Array.isArray(loaded?.availableBookTypes) ? loaded.availableBookTypes : []);
        const enabledSet = new Set(Array.isArray(loaded?.enabledBookTypes) ? loaded.enabledBookTypes : ['memoir']);
        rows = catalog.map((opt) => {
            const id = String(opt.id || '').trim();
            return {
                id,
                label: String(opt.label || id),
                builtin: opt.builtin === true || ['memoir', 'pets_memoir', 'life_story', 'novel_fiction'].includes(id),
                enabled: enabledSet.has(id),
            };
        }).filter((r) => r.id);
        renderRows();
    } catch (err) {
        contentEl.innerHTML = `<p style="color:var(--c-danger);font-size:.82rem;margin:0;">${esc(err.message || 'Could not load settings')}</p>`;
        saveBtn.disabled = true;
        resetBtn.disabled = true;
        return;
    }

    saveBtn.addEventListener('click', async () => {
        rows = collectRowsFromDom();
        const allowedBookTypes = rows.map(({ id, label }) => ({ id, label }));
        const enabledBookTypes = rows.filter((r) => r.enabled).map((r) => r.id);
        if (!enabledBookTypes.length) {
            setStatus('Enable at least one book type.', true);
            return;
        }
        saveBtn.disabled = true;
        resetBtn.disabled = true;
        setStatus('Saving…');
        try {
            const saved = await api('PATCH', '/api/system/ghostwriter-settings', {
                allowedBookTypes,
                enabledBookTypes,
            });
            const catalog = Array.isArray(saved?.allowedBookTypes) ? saved.allowedBookTypes : allowedBookTypes;
            const enabledSet = new Set(Array.isArray(saved?.enabledBookTypes) ? saved.enabledBookTypes : enabledBookTypes);
            rows = catalog.map((opt) => {
                const id = String(opt.id || '').trim();
                return {
                    id,
                    label: String(opt.label || id),
                    builtin: opt.builtin === true || ['memoir', 'pets_memoir', 'life_story', 'novel_fiction'].includes(id),
                    enabled: enabledSet.has(id),
                };
            }).filter((r) => r.id);
            renderRows();
            setStatus('Saved.');
        } catch (err) {
            setStatus(err.message || 'Save failed', true);
        } finally {
            saveBtn.disabled = false;
            resetBtn.disabled = false;
        }
    });

    resetBtn.addEventListener('click', async () => {
        if (!window.confirm('Reset the allowed book types catalog to built-in types only? Custom types will be removed. Enablement resets to Career Memoir only.')) {
            return;
        }
        saveBtn.disabled = true;
        resetBtn.disabled = true;
        setStatus('Resetting…');
        try {
            const saved = await api('PATCH', '/api/system/ghostwriter-settings', {
                allowedBookTypes: null,
                enabledBookTypes: ['memoir'],
            });
            const catalog = Array.isArray(saved?.allowedBookTypes) && saved.allowedBookTypes.length
                ? saved.allowedBookTypes
                : (Array.isArray(saved?.availableBookTypes) ? saved.availableBookTypes : []);
            const enabledSet = new Set(Array.isArray(saved?.enabledBookTypes) ? saved.enabledBookTypes : ['memoir']);
            rows = catalog.map((opt) => {
                const id = String(opt.id || '').trim();
                return {
                    id,
                    label: String(opt.label || id),
                    builtin: true,
                    enabled: enabledSet.has(id),
                };
            }).filter((r) => r.id);
            renderRows();
            setStatus('Catalog reset to built-in types.');
        } catch (err) {
            setStatus(err.message || 'Reset failed', true);
        } finally {
            saveBtn.disabled = false;
            resetBtn.disabled = false;
        }
    });
}
