'use strict';

/**
 * Admin Desk — Chapter Strategies settings (per book type).
 * Full CRUD for strategies + chapter lists for Career Memoir and Pet Memoir.
 */

import { state } from './state.js';
import { adminApi as api } from '../admin-desk-api.js';
import { esc } from './ui-helpers.js';
import { reorderListItem } from './desk-list-reorder.js';

let _renderMyDeskList = null;
let _setMyDeskWorkspaceMode = null;
let _returnToAdminDeskHome = null;

function renderMyDeskList() { return _renderMyDeskList?.(); }
function setMyDeskWorkspaceMode(enabled) { return _setMyDeskWorkspaceMode?.(enabled); }
function returnToAdminDeskHome() { return _returnToAdminDeskHome?.(); }

const DEFAULT_TABS = [
    { id: 'memoir', label: 'Career Memoir' },
    { id: 'pets_memoir', label: "Pet's Memoir" },
];

function newStrategyId(existing) {
    const used = new Set((existing || []).map((s) => String(s.id || '')));
    let n = 1;
    let id = `strategy_${n}`;
    while (used.has(id)) {
        n += 1;
        id = `strategy_${n}`;
    }
    return id;
}

function cloneStrategies(list) {
    return (Array.isArray(list) ? list : []).map((s) => ({
        id: String(s.id || '').trim(),
        name: String(s.name || '').trim(),
        description: String(s.description || '').trim(),
        enabled: s.enabled !== false,
        chapters: Array.isArray(s.chapters) ? s.chapters.map((t) => String(t || '')) : [],
        chapterPlan: Array.isArray(s.chapterPlan) ? s.chapterPlan.map((t) => String(t || '')) : [],
    }));
}

function renderStringListEditor(kind, strategyIdx, items, label) {
    const rows = (items || []).map((text, i) => `
        <div class="desk-strategy-list-row" data-kind="${esc(kind)}" data-sidx="${strategyIdx}" data-i="${i}">
            <span class="qe-drag-handle desk-strategy-drag-handle" draggable="true"
                data-kind="${esc(kind)}" data-sidx="${strategyIdx}" data-i="${i}"
                title="Drag to reorder" aria-label="Drag to reorder ${esc(label)} ${i + 1}">
                <i class="fa-solid fa-arrows-up-down-left-right" aria-hidden="true"></i>
            </span>
            <input type="text" class="desk-strategy-list-input" value="${esc(text)}"
                data-kind="${esc(kind)}" data-sidx="${strategyIdx}" data-i="${i}"
                aria-label="${esc(label)} ${i + 1}" />
            <div class="desk-strategy-list-actions">
                <button type="button" class="btn btn-ghost btn-sm desk-strategy-remove-item"
                    data-kind="${esc(kind)}" data-sidx="${strategyIdx}" data-i="${i}" title="Remove">✕</button>
            </div>
        </div>
    `).join('');
    return `
        <div class="desk-strategy-list-block">
            <div class="desk-strategy-list-head">
                <span class="desk-strategy-list-label">${esc(label)}</span>
                <button type="button" class="btn btn-ghost btn-sm desk-strategy-add-item"
                    data-kind="${esc(kind)}" data-sidx="${strategyIdx}">Add</button>
            </div>
            <div class="desk-strategy-list-rows" data-kind="${esc(kind)}" data-sidx="${strategyIdx}">${rows || `<p class="desk-strategy-list-empty">No ${esc(label.toLowerCase())} yet.</p>`}</div>
        </div>
    `;
}

export async function launchStrategySettingsPanel(deps) {
    const {
        renderMyDeskList: renderMyDeskListDep,
        setMyDeskWorkspaceMode: setMyDeskWorkspaceModeDep,
        returnToAdminDeskHome: returnToAdminDeskHomeDep,
    } = deps || {};
    if (typeof renderMyDeskListDep !== 'function'
        || typeof setMyDeskWorkspaceModeDep !== 'function'
        || typeof returnToAdminDeskHomeDep !== 'function') {
        throw new Error('launchStrategySettingsPanel requires desk host deps');
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
        <div class="desk-workspace-shell">
            <header class="desk-workspace-head">
                <h3>Chapter Strategies</h3>
                <button id="my-desk-settings-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <div class="desk-workspace-body desk-settings-body-wrap">
                <div id="my-desk-settings-content"></div>
            </div>
            <footer id="my-desk-settings-footer" class="desk-workspace-foot">
                <span id="my-desk-settings-status" class="desk-workspace-status"></span>
            </footer>
        </div>
    `;

    document.getElementById('my-desk-settings-close')?.addEventListener('click', () => {
        returnToAdminDeskHome();
    });

    const contentEl = document.getElementById('my-desk-settings-content');
    const footerEl = document.getElementById('my-desk-settings-footer');
    if (!contentEl || !footerEl) return;

    let activeBookType = 'memoir';
    let bookTypeTabs = DEFAULT_TABS.slice();
    let defaultStrategyId = 'chronological';
    let strategies = [];
    let readinessPolicy = null;
    let selectedStrategyIdx = 0;
    let dirty = false;

    const setStatus = (msg, isError = false) => {
        const statusEl = document.getElementById('my-desk-settings-status');
        if (!statusEl) return;
        statusEl.textContent = msg || '';
        statusEl.style.color = isError ? 'var(--c-danger)' : 'var(--c-muted)';
    };

    const clampSelectedStrategyIdx = () => {
        if (!strategies.length) {
            selectedStrategyIdx = 0;
            return;
        }
        if (selectedStrategyIdx < 0 || selectedStrategyIdx >= strategies.length) {
            selectedStrategyIdx = 0;
        }
    };

    const readFormIntoState = ({ keepEmptyListItems = false } = {}) => {
        const card = contentEl.querySelector('.desk-strategy-card');
        if (!card) return;
        const idx = Number(card.dataset.sidx);
        if (!Number.isInteger(idx) || idx < 0 || idx >= strategies.length) return;
        const prev = strategies[idx] || {};
        const idInput = card.querySelector('.desk-strategy-id');
        const nameInput = card.querySelector('.desk-strategy-name');
        const descInput = card.querySelector('.desk-strategy-desc');
        const enabledCb = card.querySelector('.desk-strategy-enabled');
        const id = String(idInput?.value || prev.id || '').trim();
        const chapterInputs = Array.from(card.querySelectorAll('.desk-strategy-list-input[data-kind="chapters"]'));
        const planInputs = Array.from(card.querySelectorAll('.desk-strategy-list-input[data-kind="chapterPlan"]'));
        const mapList = (inputs) => {
            const values = inputs.map((el) => String(el.value || '').trim());
            return keepEmptyListItems ? values : values.filter(Boolean);
        };
        strategies[idx] = {
            id,
            name: String(nameInput?.value || '').trim(),
            description: String(descInput?.value || '').trim(),
            enabled: id === defaultStrategyId ? true : Boolean(enabledCb?.checked),
            chapters: mapList(chapterInputs),
            chapterPlan: mapList(planInputs),
        };
        const field = (name) => Number(contentEl.querySelector(`[data-readiness-policy="${name}"]`)?.value);
        if (readinessPolicy) {
            readinessPolicy = {
                minEpisodesPerChapter: field('minEpisodesPerChapter'),
                targetPages: { low: field('targetPages.low'), high: field('targetPages.high') },
                draftEvidence: {
                    materialEnoughUnits: field('materialEnoughUnits'),
                    materialStrongUnits: field('materialStrongUnits'),
                    minimumStrongScenes: field('minimumStrongScenes'),
                },
                bookWideUniqueEventsWarning: field('bookWideUniqueEventsWarning'),
            };
        }
    };

    const paint = () => {
        clampSelectedStrategyIdx();
        const tabsHtml = bookTypeTabs.map((tab) => `
            <button type="button" class="desk-strategy-tab${tab.id === activeBookType ? ' is-active' : ''}"
                data-book-type="${esc(tab.id)}">${esc(tab.label)}</button>
        `).join('');

        const pickerOptions = strategies.map((s, sidx) => {
            const label = s.name || s.id || `Strategy ${sidx + 1}`;
            const suffix = s.id === defaultStrategyId ? ' (default)' : (s.enabled === false ? ' (disabled)' : '');
            return `<option value="${sidx}"${sidx === selectedStrategyIdx ? ' selected' : ''}>${esc(label)}${esc(suffix)}</option>`;
        }).join('');

        const s = strategies[selectedStrategyIdx];
        const sidx = selectedStrategyIdx;
        let cardHtml = '<p class="desk-strategy-list-empty">No strategies for this book type yet.</p>';
        if (s) {
            const isDefault = s.id === defaultStrategyId;
            cardHtml = `
                <article class="desk-strategy-card" data-sidx="${sidx}" data-id="${esc(s.id)}">
                    <div class="desk-strategy-card-top">
                        <label class="desk-strategy-enable">
                            <input type="checkbox" class="desk-strategy-enabled"
                                ${s.enabled || isDefault ? 'checked' : ''}
                                ${isDefault ? 'disabled' : ''} />
                            <span>Enabled${isDefault ? ' (default)' : ''}</span>
                        </label>
                        ${isDefault ? '' : `
                            <button type="button" class="btn btn-ghost btn-sm desk-strategy-delete" data-sidx="${sidx}">Delete</button>
                        `}
                    </div>
                    <div class="desk-strategy-fields">
                        <label class="desk-strategy-field">
                            <span>Id</span>
                            <input type="text" class="desk-strategy-id" value="${esc(s.id)}"
                                ${isDefault ? 'readonly' : ''} autocomplete="off" />
                        </label>
                        <label class="desk-strategy-field">
                            <span>Name</span>
                            <input type="text" class="desk-strategy-name" value="${esc(s.name)}" autocomplete="off" />
                        </label>
                    </div>
                    <label class="desk-strategy-field desk-strategy-field--full">
                        <span>Description</span>
                        <textarea class="desk-strategy-desc" rows="2">${esc(s.description)}</textarea>
                    </label>
                    ${renderStringListEditor('chapters', sidx, s.chapters, 'Chapters')}
                    ${renderStringListEditor('chapterPlan', sidx, s.chapterPlan, 'Chapter plan cues')}
                </article>
            `;
        }

        contentEl.innerHTML = `
            <div class="desk-settings-subview desk-strategy-editor">
                <p class="desk-settings-subcopy">
                    Edit chapter strategies for each book type separately. Enabled strategies appear in the author’s Chapter Strategy picker; chapters define the book’s chapter slots.
                </p>
                <div class="desk-strategy-tabs" role="tablist">${tabsHtml}</div>
                <div class="desk-strategy-picker">
                    <label class="desk-strategy-picker-label" for="desk-strategy-select">Strategy</label>
                    <select id="desk-strategy-select" class="desk-strategy-select"
                        ${strategies.length ? '' : 'disabled'}
                        aria-label="Select chapter strategy to edit">
                        ${pickerOptions || '<option value="">No strategies</option>'}
                    </select>
                </div>
                <div class="desk-strategy-cards">${cardHtml}</div>
                ${readinessPolicy ? `<section class="desk-strategy-card">
                    <h4>Readiness & story targets</h4>
                    <p>These apply to every chapter for this book type.</p>
                    <div class="desk-strategy-fields">
                    <label class="desk-strategy-field"><span>Stories per chapter</span><input type="number" min="1" data-readiness-policy="minEpisodesPerChapter" value="${readinessPolicy.minEpisodesPerChapter}" /></label>
                    <label class="desk-strategy-field"><span>Book-wide story warning</span><input type="number" min="1" data-readiness-policy="bookWideUniqueEventsWarning" value="${readinessPolicy.bookWideUniqueEventsWarning}" /></label>
                    <label class="desk-strategy-field"><span>Target pages (low)</span><input type="number" min="1" data-readiness-policy="targetPages.low" value="${readinessPolicy.targetPages.low}" /></label>
                    <label class="desk-strategy-field"><span>Target pages (high)</span><input type="number" min="1" data-readiness-policy="targetPages.high" value="${readinessPolicy.targetPages.high}" /></label>
                    <label class="desk-strategy-field"><span>Minimum evidence units</span><input type="number" min="1" data-readiness-policy="materialEnoughUnits" value="${readinessPolicy.draftEvidence.materialEnoughUnits}" /></label>
                    <label class="desk-strategy-field"><span>Strong evidence units</span><input type="number" min="1" data-readiness-policy="materialStrongUnits" value="${readinessPolicy.draftEvidence.materialStrongUnits}" /></label>
                    <label class="desk-strategy-field"><span>Minimum strong stories</span><input type="number" min="1" data-readiness-policy="minimumStrongScenes" value="${readinessPolicy.draftEvidence.minimumStrongScenes}" /></label>
                    </div></section>` : ''}
            </div>
        `;

        footerEl.innerHTML = `
            <button class="btn btn-ghost" id="my-desk-add-strategy" type="button">Add strategy</button>
            <button class="btn btn-primary" id="my-desk-save-strategy-settings" type="button">Save Settings</button>
            <span id="my-desk-settings-status" class="desk-workspace-status"></span>
        `;

        wireInteractions();
    };

    const wireInteractions = () => {
        contentEl.querySelectorAll('.desk-strategy-tab').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const next = String(btn.dataset.bookType || '').trim();
                if (!next || next === activeBookType) return;
                if (dirty) {
                    const ok = window.confirm('Discard unsaved changes for this book type?');
                    if (!ok) return;
                }
                activeBookType = next;
                await loadCatalog(activeBookType);
            });
        });

        contentEl.querySelector('#desk-strategy-select')?.addEventListener('change', (ev) => {
            readFormIntoState();
            const next = Number(ev.target?.value);
            if (!Number.isInteger(next) || next < 0 || next >= strategies.length) return;
            selectedStrategyIdx = next;
            paint();
        });

        contentEl.querySelectorAll('.desk-strategy-delete').forEach((btn) => {
            btn.addEventListener('click', () => {
                readFormIntoState();
                const sidx = Number(btn.dataset.sidx);
                const target = strategies[sidx];
                if (!target || target.id === defaultStrategyId) return;
                if (!window.confirm(`Delete strategy “${target.name || target.id}”?`)) return;
                strategies.splice(sidx, 1);
                if (selectedStrategyIdx >= strategies.length) {
                    selectedStrategyIdx = Math.max(0, strategies.length - 1);
                } else if (selectedStrategyIdx > sidx) {
                    selectedStrategyIdx -= 1;
                }
                dirty = true;
                paint();
            });
        });

        contentEl.querySelectorAll('.desk-strategy-add-item').forEach((btn) => {
            btn.addEventListener('click', () => {
                readFormIntoState();
                const sidx = Number(btn.dataset.sidx);
                const kind = String(btn.dataset.kind || '');
                if (!strategies[sidx] || (kind !== 'chapters' && kind !== 'chapterPlan')) return;
                strategies[sidx][kind].push(kind === 'chapters' ? 'New chapter' : '');
                dirty = true;
                paint();
            });
        });

        contentEl.querySelectorAll('.desk-strategy-remove-item').forEach((btn) => {
            btn.addEventListener('click', () => {
                readFormIntoState();
                const sidx = Number(btn.dataset.sidx);
                const i = Number(btn.dataset.i);
                const kind = String(btn.dataset.kind || '');
                if (!strategies[sidx]?.[kind]) return;
                if (kind === 'chapters' && strategies[sidx].chapters.length <= 1) {
                    setStatus('Each strategy needs at least one chapter.', true);
                    return;
                }
                strategies[sidx][kind].splice(i, 1);
                dirty = true;
                paint();
            });
        });

        let strategyListDrag = null;
        contentEl.querySelectorAll('.desk-strategy-list-rows').forEach((listEl) => {
            listEl.querySelectorAll('.desk-strategy-drag-handle').forEach((handle) => {
                handle.addEventListener('dragstart', (e) => {
                    const row = handle.closest('.desk-strategy-list-row');
                    if (!row || !listEl.contains(row)) return;
                    const kind = String(handle.dataset.kind || '');
                    const sidx = Number(handle.dataset.sidx);
                    const index = Number(handle.dataset.i);
                    if ((kind !== 'chapters' && kind !== 'chapterPlan') || !Number.isInteger(sidx) || !Number.isInteger(index)) return;
                    strategyListDrag = { kind, sidx, index };
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(index));
                    row.classList.add('desk-strategy-list-row--dragging');
                });
                handle.addEventListener('dragend', () => {
                    listEl.querySelectorAll('.desk-strategy-list-row').forEach((r) => {
                        r.classList.remove('desk-strategy-list-row--dragging', 'desk-strategy-list-row--drop-target');
                    });
                    strategyListDrag = null;
                });
            });
            listEl.addEventListener('dragover', (e) => {
                if (!strategyListDrag) return;
                const row = e.target.closest?.('.desk-strategy-list-row');
                if (!row || !listEl.contains(row)) return;
                const kind = String(row.dataset.kind || '');
                const sidx = Number(row.dataset.sidx);
                if (strategyListDrag.kind !== kind || strategyListDrag.sidx !== sidx) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                listEl.querySelectorAll('.desk-strategy-list-row').forEach((r) => {
                    r.classList.toggle('desk-strategy-list-row--drop-target', r === row);
                });
            });
            listEl.addEventListener('dragleave', (e) => {
                if (!listEl.contains(e.relatedTarget)) {
                    listEl.querySelectorAll('.desk-strategy-list-row').forEach((r) => {
                        r.classList.remove('desk-strategy-list-row--drop-target');
                    });
                }
            });
            listEl.addEventListener('drop', (e) => {
                const row = e.target.closest?.('.desk-strategy-list-row');
                if (!row || !listEl.contains(row)) return;
                e.preventDefault();
                listEl.querySelectorAll('.desk-strategy-list-row').forEach((r) => {
                    r.classList.remove('desk-strategy-list-row--drop-target');
                });
                if (!strategyListDrag) return;
                const kind = String(row.dataset.kind || '');
                const sidx = Number(row.dataset.sidx);
                const to = Number(row.dataset.i);
                if (strategyListDrag.kind !== kind || strategyListDrag.sidx !== sidx) return;
                // Keep empty slots so drag indices stay aligned with the rendered rows.
                readFormIntoState({ keepEmptyListItems: true });
                const list = strategies[sidx]?.[kind];
                if (!reorderListItem(list, strategyListDrag.index, to)) {
                    strategyListDrag = null;
                    return;
                }
                strategyListDrag = null;
                dirty = true;
                paint();
            });
        });

        contentEl.querySelectorAll('input, textarea').forEach((el) => {
            el.addEventListener('input', () => { dirty = true; });
            el.addEventListener('change', () => { dirty = true; });
        });

        document.getElementById('my-desk-add-strategy')?.addEventListener('click', () => {
            readFormIntoState();
            const id = newStrategyId(strategies);
            strategies.push({
                id,
                name: 'New strategy',
                description: '',
                enabled: true,
                chapters: ['Introduction', 'Chapter 1'],
                chapterPlan: ['introduction framing', 'story'],
            });
            selectedStrategyIdx = strategies.length - 1;
            dirty = true;
            paint();
        });

        document.getElementById('my-desk-save-strategy-settings')?.addEventListener('click', async () => {
            readFormIntoState();
            const saveBtn = document.getElementById('my-desk-save-strategy-settings');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
            }
            setStatus('');
            try {
                for (const s of strategies) {
                    if (!s.id) throw new Error('Every strategy needs an id.');
                    if (!s.chapters.length) throw new Error(`“${s.name || s.id}” needs at least one chapter.`);
                }
                const ids = strategies.map((s) => s.id);
                if (new Set(ids).size !== ids.length) {
                    throw new Error('Strategy ids must be unique.');
                }
                if (!strategies.some((s) => s.id === defaultStrategyId)) {
                    throw new Error(`Default strategy “${defaultStrategyId}” is missing.`);
                }
                const data = await api('PUT', '/api/system/chapter-strategy-settings', {
                    bookType: activeBookType,
                    defaultStrategyId,
                    strategies,
                    readinessPolicy,
                });
                strategies = cloneStrategies(data?.strategies || strategies);
                defaultStrategyId = String(data?.defaultStrategyId || defaultStrategyId);
                readinessPolicy = data?.readinessPolicy || readinessPolicy;
                clampSelectedStrategyIdx();
                dirty = false;
                setStatus('Settings saved.');
                paint();
                setStatus('Settings saved.');
            } catch (err) {
                setStatus(err.message || 'Save failed', true);
            } finally {
                const btn = document.getElementById('my-desk-save-strategy-settings');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Save Settings';
                }
            }
        });
    };

    const loadCatalog = async (bookType) => {
        contentEl.innerHTML = '<p style="color:var(--c-muted);font-size:.82rem;margin:0;">Loading strategies...</p>';
        footerEl.innerHTML = '<span id="my-desk-settings-status" class="desk-workspace-status"></span>';
        try {
            const data = await api('GET', `/api/system/chapter-strategy-settings?bookType=${encodeURIComponent(bookType)}`);
            if (Array.isArray(data?.bookTypeTabs) && data.bookTypeTabs.length) {
                bookTypeTabs = data.bookTypeTabs.map((t) => ({
                    id: String(t.id || '').trim(),
                    label: String(t.label || t.id || '').trim(),
                })).filter((t) => t.id);
            }
            activeBookType = String(data?.bookType || bookType);
            defaultStrategyId = String(data?.defaultStrategyId || (activeBookType === 'pets_memoir' ? 'pets_life' : 'chronological'));
            strategies = cloneStrategies(data?.strategies || data?.availableStrategies || []);
            readinessPolicy = data?.readinessPolicy || null;
            const defaultIdx = strategies.findIndex((s) => s.id === defaultStrategyId);
            selectedStrategyIdx = defaultIdx >= 0 ? defaultIdx : 0;
            dirty = false;
            paint();
            setStatus('');
        } catch (err) {
            contentEl.innerHTML = `<p style="color:var(--c-danger);font-size:.82rem;margin:0;">${esc(err.message || 'Could not load settings')}</p>`;
            setStatus(err.message || 'Could not load settings', true);
        }
    };

    await loadCatalog(activeBookType);
}
