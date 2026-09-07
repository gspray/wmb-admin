'use strict';

/**
 * Admin Desk — Ghostwriter Settings.
 * Extracted from author-app.js (Phase 2 Admin Desk separation).
 */

import { state } from './state.js';
import { adminApi as api } from '../admin-desk-api.js';
import { esc } from './ui-helpers.js';
import {
    loadGhostwriterSettings,
    loadBookSituationOptionsCatalog,
} from './static-data.js';

let _renderMyDeskList = null;
let _setMyDeskWorkspaceMode = null;
let _returnToAdminDeskHome = null;
let _loadDiscoveryConfig = null;
let _refreshStartMyBookAfterQuestionsModeChange = null;

function renderMyDeskList() { return _renderMyDeskList?.(); }
function setMyDeskWorkspaceMode(enabled) { return _setMyDeskWorkspaceMode?.(enabled); }
function returnToAdminDeskHome() { return _returnToAdminDeskHome?.(); }
async function loadDiscoveryConfig(opts = {}) { return _loadDiscoveryConfig?.(opts); }
async function refreshStartMyBookAfterQuestionsModeChange() { return _refreshStartMyBookAfterQuestionsModeChange?.(); }

function renderGhostwriterSelectField({ id, label, helper, options, selected }) {
    const opts = (options || []).map((opt) => {
        const val = String(opt.id || '').trim();
        const lab = String(opt.label || val);
        return `<option value="${esc(val)}" ${selected === val ? 'selected' : ''}>${esc(lab)}</option>`;
    }).join('');
    return `
        <div class="desk-ghostwriter-field">
            <label class="desk-ghostwriter-field-label" for="${esc(id)}">${esc(label)}</label>
            <p class="desk-ghostwriter-field-helper">${esc(helper)}</p>
            <select id="${esc(id)}" class="auth-field desk-ghostwriter-select">${opts}</select>
        </div>
    `;
}

export async function launchGhostwriterSettingsPanel(deps) {
    const {
        renderMyDeskList: renderMyDeskListDep,
        setMyDeskWorkspaceMode: setMyDeskWorkspaceModeDep,
        returnToAdminDeskHome: returnToAdminDeskHomeDep,
        loadDiscoveryConfig: loadDiscoveryConfigDep,
        refreshStartMyBookAfterQuestionsModeChange: refreshStartMyBookAfterQuestionsModeChangeDep,
    } = deps || {};
    if (typeof renderMyDeskListDep !== 'function'
        || typeof setMyDeskWorkspaceModeDep !== 'function'
        || typeof returnToAdminDeskHomeDep !== 'function'
        || typeof loadDiscoveryConfigDep !== 'function'
        || typeof refreshStartMyBookAfterQuestionsModeChangeDep !== 'function') {
        throw new Error('launchGhostwriterSettingsPanel requires desk host deps');
    }
    _renderMyDeskList = renderMyDeskListDep;
    _setMyDeskWorkspaceMode = setMyDeskWorkspaceModeDep;
    _returnToAdminDeskHome = returnToAdminDeskHomeDep;
    _loadDiscoveryConfig = loadDiscoveryConfigDep;
    _refreshStartMyBookAfterQuestionsModeChange = refreshStartMyBookAfterQuestionsModeChangeDep;
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
        <div class="desk-workspace-shell desk-workspace-shell--ghostwriter-settings">
            <header class="desk-workspace-head">
                <h3>Ghostwriter Settings</h3>
                <button id="my-desk-ghostwriter-settings-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <div class="desk-workspace-body desk-settings-body-wrap desk-ghostwriter-settings-body">
                <div class="desk-workspace-panel-card">
                    <p class="desk-workspace-intro">Configure how your AI Ghostwriter writes by default.</p>
                    <div id="my-desk-ghostwriter-settings-content"></div>
                </div>
            </div>
            <footer id="my-desk-ghostwriter-settings-footer" class="desk-workspace-foot desk-workspace-foot--spread">
                <div class="desk-ghostwriter-settings-actions">
                    <button class="btn btn-ghost" id="my-desk-reset-ghostwriter-settings" type="button">Reset to Defaults</button>
                    <button class="btn btn-primary" id="my-desk-save-ghostwriter-settings" type="button">Save Settings</button>
                </div>
                <span id="my-desk-ghostwriter-settings-status" class="desk-workspace-status"></span>
            </footer>
        </div>
    `;

    document.getElementById('my-desk-ghostwriter-settings-close')?.addEventListener('click', () => {
        returnToAdminDeskHome();
    });

    const contentEl = document.getElementById('my-desk-ghostwriter-settings-content');
    const saveBtn = document.getElementById('my-desk-save-ghostwriter-settings');
    const resetBtn = document.getElementById('my-desk-reset-ghostwriter-settings');
    const statusEl = document.getElementById('my-desk-ghostwriter-settings-status');
    if (!contentEl || !saveBtn || !resetBtn || !statusEl) return;

    const setStatus = (msg, isError = false) => {
        statusEl.textContent = msg || '';
        statusEl.style.color = isError ? 'var(--c-danger)' : 'var(--c-success)';
    };

    contentEl.innerHTML = '<p style="color:var(--c-muted);font-size:.82rem;margin:0;">Loading…</p>';

    const selectedBookType = String(deps?.bookType || 'memoir').trim() || 'memoir';
    let loaded = null;
    try {
        loaded = await api('GET', `/api/system/ghostwriter-settings?bookType=${encodeURIComponent(selectedBookType)}`);
    } catch (err) {
        contentEl.innerHTML = `<p style="color:var(--c-danger);font-size:.82rem;margin:0;">${esc(err.message || 'Could not load settings')}</p>`;
        saveBtn.disabled = true;
        resetBtn.disabled = true;
        return;
    }

    const availableBookTypes = Array.isArray(loaded?.availableBookTypes) ? loaded.availableBookTypes : [];
    const productProviders = Array.isArray(loaded?.productProviders) ? loaded.productProviders : [];
    const enabledSet = new Set(Array.isArray(loaded?.enabledBookTypes) ? loaded.enabledBookTypes : ['memoir']);
    const availableByType = loaded?.availableBookSituationsByType
        && typeof loaded.availableBookSituationsByType === 'object'
        ? loaded.availableBookSituationsByType
        : {};
    const enabledByType = loaded?.enabledBookSituationsByType
        && typeof loaded.enabledBookSituationsByType === 'object'
        ? loaded.enabledBookSituationsByType
        : {};
    let availableBookSituations = Array.isArray(loaded?.availableBookSituations) && loaded.availableBookSituations.length
        ? loaded.availableBookSituations
        : [];
    if (!availableBookSituations.length && !Object.keys(availableByType).length) {
        availableBookSituations = await loadBookSituationOptionsCatalog();
    }
    const povOptions = Array.isArray(loaded?.availablePointOfView) ? loaded.availablePointOfView : [];
    const accessOptions = Array.isArray(loaded?.availableNarratorAccess) ? loaded.availableNarratorAccess : [];
    const pointOfView = String(loaded?.pointOfView || 'first_person');
    const narratorAccess = String(loaded?.narratorAccess || 'personal');
    const questionsModeEnabled = loaded?.questionsModeEnabled !== false;
    const discoverResearchPacketTarget = Number.isFinite(Number(loaded?.discoverResearchPacketTarget))
        ? Math.max(4, Math.min(200, Math.floor(Number(loaded.discoverResearchPacketTarget))))
        : 100;
    const discoverRelatedResearchPacketTarget = Number.isFinite(Number(loaded?.discoverRelatedResearchPacketTarget))
        ? Math.max(4, Math.min(200, Math.floor(Number(loaded.discoverRelatedResearchPacketTarget))))
        : 50;

    const bookTypeMarkup = availableBookTypes.map((opt) => {
        const id = String(opt.id || '').trim();
        const label = String(opt.label || id || 'Untitled');
        const checked = enabledSet.has(id);
        return `
            <label class="desk-ghostwriter-check-row">
                <input type="checkbox" class="my-desk-ghostwriter-book-type-checkbox" data-id="${esc(id)}" ${checked ? 'checked' : ''} />
                <span>${esc(label)}</span>
            </label>
        `;
    }).join('');

    const bookSituationMarkup = (availableBookTypes.length
        ? availableBookTypes
        : [{ id: 'memoir', label: 'Career Memoir' }]
    ).map((typeOpt) => {
        const typeId = String(typeOpt.id || '').trim();
        const typeLabel = String(typeOpt.label || typeId || 'Untitled');
        const typeSituations = Array.isArray(availableByType[typeId]) && availableByType[typeId].length
            ? availableByType[typeId]
            : (typeId === 'memoir' ? availableBookSituations : []);
        const enabledForType = new Set(
            Array.isArray(enabledByType[typeId]) && enabledByType[typeId].length
                ? enabledByType[typeId]
                : (typeSituations[0]?.id ? [typeSituations[0].id] : []),
        );
        const rows = typeSituations.map((opt) => {
            const id = String(opt.id || '').trim();
            const label = String(opt.label || id || 'Untitled');
            const checked = enabledForType.has(id);
            return `
                <label class="desk-ghostwriter-check-row desk-ghostwriter-check-row--long">
                    <input type="checkbox" class="my-desk-ghostwriter-book-situation-checkbox" data-book-type="${esc(typeId)}" data-id="${esc(id)}" ${checked ? 'checked' : ''} />
                    <span>${esc(label)}</span>
                </label>
            `;
        }).join('');
        return `
            <div class="desk-ghostwriter-situation-type-group" data-book-type="${esc(typeId)}">
                <h5 class="desk-ghostwriter-situation-type-title">${esc(typeLabel)}</h5>
                <div class="desk-ghostwriter-check-list">${rows || '<p class="desk-ghostwriter-dimension-desc">No situations defined for this type.</p>'}</div>
            </div>
        `;
    }).join('');

    let discoverySettings = null;
    try {
        discoverySettings = await api('GET', '/api/system/discovery-settings');
    } catch (_) {
        // Discovery settings are optional on older/local system configurations.
    }

    const discoverySection = discoverySettings ? `
        <section class="desk-ghostwriter-dimension desk-discovery-settings" aria-labelledby="desk-discovery-global">
            <h4 id="desk-discovery-global" class="desk-ghostwriter-dimension-title">Discovery &amp; coverage</h4>
            <p class="desk-ghostwriter-dimension-desc">Coverage rules replace legacy readiness todos. Conversation Material expires after the retention period.</p>
            <div class="desk-discovery-fields">
                <label class="auth-field-label">Minimum substantive answers
                    <input id="desk-discovery-min-answers" class="auth-field" type="number" min="1" step="1" value="${esc(String(discoverySettings.minimumSubstantiveAnswers))}" />
                </label>
                <label class="auth-field-label">Minimum answer characters
                    <input id="desk-discovery-min-chars" class="auth-field" type="number" min="1" step="1" value="${esc(String(discoverySettings.minimumAnswerChars))}" />
                </label>
                <label class="auth-field-label">Transcript retention (days, 0 = never expire)
                    <input id="desk-discovery-retention" class="auth-field" type="number" min="0" step="1" value="${esc(String(discoverySettings.transcriptRetentionDays))}" />
                </label>
                <label class="desk-ghostwriter-check-row">
                    <input type="checkbox" id="desk-discovery-auto-merge" ${discoverySettings.autoMergeEnabled ? 'checked' : ''} />
                    <span>Allow authors to merge duplicate Material</span>
                </label>
            </div>
            ${state.project?.id ? `
            <h4 class="desk-ghostwriter-dimension-title" style="margin-top:1.25rem">Preview project cohort</h4>
            <div class="desk-discovery-fields">
                <label class="auth-field-label">Discovery mode
                    <select id="desk-project-discovery-mode" class="auth-field">
                        ${(discoverySettings.discoveryModes || ['questionnaire', 'conversational', 'hybrid']).map((m) =>
                            `<option value="${esc(m)}" ${(state.project.discoveryMode || 'questionnaire') === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
                    </select>
                </label>
                <label class="auth-field-label">Cohort label (optional)
                    <input id="desk-project-discovery-cohort" class="auth-field" type="text" value="${esc(state.project.discoveryCohort || '')}" placeholder="e.g. hybrid-A" />
                </label>
                <button type="button" class="btn btn-secondary btn-sm" id="desk-save-project-discovery">Save project discovery</button>
            </div>` : ''}
        </section>
    ` : '';

    const productTabs = productProviders.flatMap((provider) => (
        (provider.bookTypes || []).map((bookType) => {
            const option = availableBookTypes.find((row) => String(row?.id || '') === String(bookType));
            const label = String(option?.label || bookType);
            return `<button type="button" class="desk-strategy-tab${bookType === selectedBookType ? ' is-active' : ''}"
                data-ghostwriter-book-type="${esc(bookType)}">${esc(label)}</button>`;
        })
    )).join('');

    contentEl.innerHTML = `
        <div class="desk-strategy-tabs" role="tablist" aria-label="Ghostwriter settings book type">
            ${productTabs}
        </div>
        <section class="desk-ghostwriter-dimension" aria-labelledby="desk-gw-dim-start-my-book">
            <h4 id="desk-gw-dim-start-my-book" class="desk-ghostwriter-dimension-title">Questions mode</h4>
            <p class="desk-ghostwriter-dimension-desc">When on, authors see a Mode label with Discuss · Questions in Start My Book and Assignments. When off, Questions is hidden and the Mode label is omitted — Discuss · Review · Preview stay so authors can return from check lenses.</p>
            <label class="desk-ghostwriter-check-row">
                <input type="checkbox" id="desk-gw-questions-mode-enabled" ${questionsModeEnabled ? 'checked' : ''} />
                <span>Questions mode enabled</span>
            </label>
        </section>
        <section class="desk-ghostwriter-dimension" aria-labelledby="desk-gw-dim-book-type">
            <h4 id="desk-gw-dim-book-type" class="desk-ghostwriter-dimension-title">Work type</h4>
            <p class="desk-ghostwriter-dimension-desc">Authors choose one enabled work type in Start My Book (What kind of book is this?). Saving here syncs Discover chips and the Start My Book gate. Add or rename types in <strong>Allowed Book Types</strong>.</p>
            <div id="my-desk-ghostwriter-book-type-list" class="desk-ghostwriter-check-list">${bookTypeMarkup}</div>
        </section>
        <section class="desk-ghostwriter-dimension" aria-labelledby="desk-gw-dim-prompts">
            <h4 id="desk-gw-dim-prompts" class="desk-ghostwriter-dimension-title">Ghostwriter prompts by work type</h4>
            <p class="desk-ghostwriter-dimension-desc">Read-only guidance injected into the AI as <code>GHOSTWRITER GUIDANCE</code> for each work type. Edit in code for now (<code>services/contentProfileRegistry.js</code> and experience modules).</p>
            <div class="desk-ghostwriter-prompt-list">
                ${(Array.isArray(loaded?.bookTypePrompts) ? loaded.bookTypePrompts : []).map((row) => {
                    const label = String(row.label || row.id || 'Untitled').trim();
                    const promptLabel = String(row.promptLabel || '').trim();
                    const guidance = String(row.ghostwriterPrompt || '').trim() || '(No guidance string yet.)';
                    return `
                        <article class="desk-ghostwriter-prompt-card">
                            <h5 class="desk-ghostwriter-prompt-card-title">${esc(label)}</h5>
                            ${promptLabel ? `<p class="desk-ghostwriter-prompt-card-meta">BOOK TYPE: ${esc(promptLabel)}</p>` : ''}
                            <p class="desk-ghostwriter-prompt-card-body">${esc(guidance)}</p>
                        </article>
                    `;
                }).join('') || '<p class="desk-ghostwriter-dimension-desc">No work-type prompts available.</p>'}
            </div>
        </section>
        <section class="desk-ghostwriter-dimension" aria-labelledby="desk-gw-dim-narrative">
            <h4 id="desk-gw-dim-narrative" class="desk-ghostwriter-dimension-title">Narrative Style</h4>
            <div class="desk-ghostwriter-fields">
                ${renderGhostwriterSelectField({
                    id: 'desk-gw-point-of-view',
                    label: 'Point of View',
                    helper: 'Determines who tells the story.',
                    options: povOptions,
                    selected: pointOfView,
                })}
                ${renderGhostwriterSelectField({
                    id: 'desk-gw-narrator-access',
                    label: 'Narrator Access',
                    helper: 'Determines what thoughts and knowledge the narrator can reveal.',
                    options: accessOptions,
                    selected: narratorAccess,
                })}
            </div>
        </section>
        <section class="desk-ghostwriter-dimension" aria-labelledby="desk-gw-dim-book-situation">
            <h4 id="desk-gw-dim-book-situation" class="desk-ghostwriter-dimension-title">Story situation options</h4>
            <p class="desk-ghostwriter-dimension-desc">Authors choose one enabled story situation for their selected work type in Start My Book. Enable at least one situation per type you offer.</p>
            <div id="my-desk-ghostwriter-book-situation-list" class="desk-ghostwriter-situation-by-type">${bookSituationMarkup}</div>
        </section>
        <section class="desk-ghostwriter-dimension" aria-labelledby="desk-gw-dim-discover-research">
            <h4 id="desk-gw-dim-discover-research" class="desk-ghostwriter-dimension-title">Discover research</h4>
            <p class="desk-ghostwriter-dimension-desc">Controls how many research packets Discover Research gathers for prep (citeable story/research units). Packets are bundled into For study Sources — they are not the author’s 10 Source slots. Author and related searches have separate targets.</p>
            <div class="desk-ghostwriter-fields">
                <div class="desk-ghostwriter-field">
                    <label class="desk-ghostwriter-field-label" for="desk-gw-discover-research-packet-target">Author research packet target</label>
                    <p class="desk-ghostwriter-field-helper">Higher values give richer coverage for well-documented subjects (e.g. public figures). Brief and interviews consume packets through Interview Preparation — do not dump every packet into every turn. Gather cost and time scale with this number. Allowed range: 4–200 (default 100).</p>
                    <input
                        id="desk-gw-discover-research-packet-target"
                        class="auth-field desk-ghostwriter-select"
                        type="number"
                        min="4"
                        max="200"
                        step="1"
                        value="${esc(String(discoverResearchPacketTarget))}"
                    />
                </div>
                <div class="desk-ghostwriter-field">
                    <label class="desk-ghostwriter-field-label" for="desk-gw-discover-related-research-packet-target">Related research packet target</label>
                    <p class="desk-ghostwriter-field-helper">Default is lower than author research so related people/companies/events finish faster without lowering research quality ambition. Same soft-stop rules. Allowed range: 4–200 (default 50).</p>
                    <input
                        id="desk-gw-discover-related-research-packet-target"
                        class="auth-field desk-ghostwriter-select"
                        type="number"
                        min="4"
                        max="200"
                        step="1"
                        value="${esc(String(discoverRelatedResearchPacketTarget))}"
                    />
                </div>
            </div>
        </section>
        ${discoverySection}
    `;

    contentEl.querySelectorAll('[data-ghostwriter-book-type]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const nextBookType = String(btn.dataset.ghostwriterBookType || '').trim();
            if (nextBookType && nextBookType !== selectedBookType) {
                void launchGhostwriterSettingsPanel({ ...deps, bookType: nextBookType });
            }
        });
    });

    document.getElementById('desk-save-project-discovery')?.addEventListener('click', async () => {
        try {
            await api('PATCH', '/api/system/author/project/discovery', {
                discoveryMode: document.getElementById('desk-project-discovery-mode')?.value,
                discoveryCohort: document.getElementById('desk-project-discovery-cohort')?.value || '',
            });
            await loadDiscoveryConfig({ force: true });
            setStatus('Project discovery settings saved.');
        } catch (err) {
            setStatus(err.message || 'Save failed', true);
        }
    });

    document.getElementById('desk-gw-questions-mode-enabled')?.addEventListener('change', (e) => {
        state.ghostwriterQuestionsModeEnabled = Boolean(e.target?.checked);
        void refreshStartMyBookAfterQuestionsModeChange();
    });

    const collectPayload = () => {
        const enabledBookTypes = Array.from(document.querySelectorAll('.my-desk-ghostwriter-book-type-checkbox'))
            .filter((cb) => cb.checked)
            .map((cb) => String(cb.dataset.id || '').trim())
            .filter(Boolean);
        const enabledBookSituationsByType = {};
        document.querySelectorAll('.my-desk-ghostwriter-book-situation-checkbox').forEach((cb) => {
            const typeId = String(cb.dataset.bookType || '').trim();
            const id = String(cb.dataset.id || '').trim();
            if (!typeId || !id) return;
            if (!enabledBookSituationsByType[typeId]) enabledBookSituationsByType[typeId] = [];
            if (cb.checked) enabledBookSituationsByType[typeId].push(id);
        });
        return {
            bookType: selectedBookType,
            enabledBookTypes,
            enabledBookSituationsByType,
            pointOfView: String(document.getElementById('desk-gw-point-of-view')?.value || '').trim(),
            narratorAccess: String(document.getElementById('desk-gw-narrator-access')?.value || '').trim(),
            questionsModeEnabled: Boolean(document.getElementById('desk-gw-questions-mode-enabled')?.checked),
            discoverResearchPacketTarget: Number(
                document.getElementById('desk-gw-discover-research-packet-target')?.value || 100,
            ),
            discoverRelatedResearchPacketTarget: Number(
                document.getElementById('desk-gw-discover-related-research-packet-target')?.value || 50,
            ),
        };
    };

    saveBtn.addEventListener('click', async () => {
        const payload = collectPayload();
        if (!payload.enabledBookTypes.length) {
            setStatus('Enable at least one book type.', true);
            return;
        }
        const anySituation = Object.values(payload.enabledBookSituationsByType || {})
            .some((list) => Array.isArray(list) && list.length > 0);
        if (!anySituation) {
            setStatus('Enable at least one book situation option.', true);
            return;
        }
        saveBtn.disabled = true;
        resetBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        statusEl.textContent = '';
        statusEl.style.color = 'var(--c-muted)';
        try {
            await api('PATCH', '/api/system/ghostwriter-settings', payload);
            if (discoverySettings) {
                await api('PATCH', '/api/system/discovery-settings', {
                    minimumSubstantiveAnswers: Number(document.getElementById('desk-discovery-min-answers')?.value || 3),
                    minimumAnswerChars: Number(document.getElementById('desk-discovery-min-chars')?.value || 20),
                    transcriptRetentionDays: Number(document.getElementById('desk-discovery-retention')?.value || 365),
                    autoMergeEnabled: Boolean(document.getElementById('desk-discovery-auto-merge')?.checked),
                });
            }
            await loadGhostwriterSettings();
            await refreshStartMyBookAfterQuestionsModeChange();
            setStatus('Ghostwriter and discovery settings saved.');
        } catch (err) {
            setStatus(err.message || 'Save failed', true);
        } finally {
            saveBtn.disabled = false;
            resetBtn.disabled = false;
            saveBtn.textContent = 'Save Settings';
        }
    });

    resetBtn.addEventListener('click', async () => {
        const ok = window.WmbDialogs && typeof window.WmbDialogs.confirm === 'function'
            ? await window.WmbDialogs.confirm('Reset Ghostwriter settings to default values?', {
                title: 'Reset to Defaults',
                okText: 'Reset',
                cancelText: 'Cancel',
            })
            : window.confirm('Reset Ghostwriter settings to default values?');
        if (!ok) return;

        saveBtn.disabled = true;
        resetBtn.disabled = true;
        statusEl.style.color = 'var(--c-muted)';
        statusEl.textContent = '';
        try {
            const result = await api('POST', '/api/system/ghostwriter-settings/reset', {
                bookType: selectedBookType,
            });
            await loadGhostwriterSettings();
            await refreshStartMyBookAfterQuestionsModeChange();
            const enabledSetAfter = new Set(result?.enabledBookTypes || ['memoir']);
            document.querySelectorAll('.my-desk-ghostwriter-book-type-checkbox').forEach((cb) => {
                cb.checked = enabledSetAfter.has(String(cb.dataset.id || '').trim());
            });
            const byTypeAfter = result?.enabledBookSituationsByType || {};
            document.querySelectorAll('.my-desk-ghostwriter-book-situation-checkbox').forEach((cb) => {
                const typeId = String(cb.dataset.bookType || '').trim();
                const id = String(cb.dataset.id || '').trim();
                const enabled = Array.isArray(byTypeAfter[typeId]) ? byTypeAfter[typeId] : [];
                cb.checked = enabled.includes(id);
            });
            const povEl = document.getElementById('desk-gw-point-of-view');
            const accessEl = document.getElementById('desk-gw-narrator-access');
            const questionsModeEl = document.getElementById('desk-gw-questions-mode-enabled');
            const packetTargetEl = document.getElementById('desk-gw-discover-research-packet-target');
            const relatedPacketTargetEl = document.getElementById('desk-gw-discover-related-research-packet-target');
            if (povEl) povEl.value = result?.pointOfView || 'first_person';
            if (accessEl) accessEl.value = result?.narratorAccess || 'personal';
            if (questionsModeEl) questionsModeEl.checked = result?.questionsModeEnabled !== false;
            if (packetTargetEl) {
                packetTargetEl.value = String(
                    Number.isFinite(Number(result?.discoverResearchPacketTarget))
                        ? result.discoverResearchPacketTarget
                        : 100,
                );
            }
            if (relatedPacketTargetEl) {
                relatedPacketTargetEl.value = String(
                    Number.isFinite(Number(result?.discoverRelatedResearchPacketTarget))
                        ? result.discoverRelatedResearchPacketTarget
                        : 50,
                );
            }
            setStatus('Ghostwriter settings reset.');
        } catch (err) {
            statusEl.style.color = 'var(--c-danger)';
            statusEl.textContent = err.message || 'Reset failed';
        } finally {
            saveBtn.disabled = false;
            resetBtn.disabled = false;
        }
    });
}
