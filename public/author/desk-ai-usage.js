'use strict';

/**
 * Admin Desk — AI Usage (ElevenLabs daily limit + ledger).
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

function formatNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString() : '—';
}

function formatDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.valueOf())) return raw;
    return parsed.toLocaleString();
}

export async function launchAiUsagePanel(deps) {
    const {
        renderMyDeskList: renderMyDeskListDep,
        setMyDeskWorkspaceMode: setMyDeskWorkspaceModeDep,
        returnToAdminDeskHome: returnToAdminDeskHomeDep,
    } = deps || {};
    if (typeof renderMyDeskListDep !== 'function'
        || typeof setMyDeskWorkspaceModeDep !== 'function'
        || typeof returnToAdminDeskHomeDep !== 'function') {
        throw new Error('launchAiUsagePanel requires desk host deps');
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
        <div class="desk-workspace-shell desk-workspace-shell--ai-usage">
            <header class="desk-workspace-head">
                <h3>AI Usage</h3>
                <button id="my-desk-ai-usage-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <div class="desk-workspace-body desk-settings-body-wrap desk-ai-usage-body">
                <div class="desk-workspace-panel-card desk-ai-usage-card">
                    <p class="desk-workspace-intro">Limit and monitor ElevenLabs text-to-speech. Counts only new ElevenLabs API calls — cached narration playback and OpenAI fallback do not appear here. Call / Discuss / narration fall back to OpenAI when the daily character limit is hit; voice previews return an error.</p>
                    <div id="my-desk-ai-usage-el-warn" class="desk-ai-usage-warn" hidden></div>
                    <div id="my-desk-ai-usage-el-summary" class="desk-ai-usage-summary"></div>
                    <div id="my-desk-ai-usage-el-progress" class="desk-ai-usage-progress" hidden>
                        <div id="my-desk-ai-usage-el-progress-bar" class="desk-ai-usage-progress-bar"></div>
                    </div>
                    <form id="my-desk-ai-usage-el-form" class="desk-ai-usage-form">
                        <label class="desk-ai-usage-enable-row">
                            <input type="checkbox" id="my-desk-ai-usage-el-enabled" />
                            <span>ElevenLabs TTS enabled</span>
                        </label>
                        <label class="desk-ai-usage-field">
                            <span>Daily character limit (UTC day)</span>
                            <input type="number" id="my-desk-ai-usage-el-limit" class="auth-field" min="0" step="1000" />
                            <span class="desk-ai-usage-field-hint">Default 50,000. Use 0 for unlimited.</span>
                        </label>
                        <div class="desk-ai-usage-models">
                            <h4 class="desk-ai-usage-section-title">ElevenLabs TTS models</h4>
                            <p class="desk-ai-usage-section-desc">Choose which model each feature uses. Env overrides (WMB_CALL_TTS_MODEL, WMB_ELEVENLABS_TTS_MODEL_*) win at runtime when set.</p>
                            <label class="desk-ai-usage-field">
                                <span id="my-desk-ai-usage-model-call-label">Ghostwriter talking (Call / Discuss)</span>
                                <select id="my-desk-ai-usage-model-call" class="auth-field" data-tts-purpose="call"></select>
                                <span class="desk-ai-usage-field-hint" id="my-desk-ai-usage-model-call-source"></span>
                            </label>
                            <label class="desk-ai-usage-field">
                                <span id="my-desk-ai-usage-model-narration-label">In-app chapter narration</span>
                                <select id="my-desk-ai-usage-model-narration" class="auth-field" data-tts-purpose="chapter-narration"></select>
                                <span class="desk-ai-usage-field-hint" id="my-desk-ai-usage-model-narration-source"></span>
                            </label>
                            <label class="desk-ai-usage-field">
                                <span id="my-desk-ai-usage-model-publish-label">Publish audiobook export</span>
                                <select id="my-desk-ai-usage-model-publish" class="auth-field" data-tts-purpose="audiobook-publish"></select>
                                <span class="desk-ai-usage-field-hint" id="my-desk-ai-usage-model-publish-source"></span>
                            </label>
                        </div>
                        <div class="desk-ai-usage-form-actions">
                            <button type="button" class="btn btn-ghost" id="my-desk-ai-usage-el-refresh">Refresh</button>
                            <button type="submit" class="btn btn-primary" id="my-desk-ai-usage-el-save">Save settings</button>
                        </div>
                        <span id="my-desk-ai-usage-el-status" class="desk-workspace-status"></span>
                    </form>
                </div>
                <div class="desk-workspace-panel-card desk-ai-usage-card">
                    <h4 class="desk-ai-usage-section-title">Usage ledger</h4>
                    <p class="desk-ai-usage-section-desc">Recent ElevenLabs TTS calls (characters billed). Re-playing a cached book section will not add a row.</p>
                    <div class="desk-ai-usage-filters">
                        <label class="desk-ai-usage-field">
                            <span>Feature</span>
                            <select id="my-desk-ai-usage-feature" class="auth-field">
                                <option value="">All features</option>
                            </select>
                        </label>
                        <label class="desk-ai-usage-field">
                            <span>Days</span>
                            <select id="my-desk-ai-usage-days" class="auth-field">
                                <option value="1">Today (1)</option>
                                <option value="7" selected>Last 7</option>
                                <option value="14">Last 14</option>
                                <option value="30">Last 30</option>
                            </select>
                        </label>
                        <label class="desk-ai-usage-field">
                            <span>Limit</span>
                            <input type="number" id="my-desk-ai-usage-limit" class="auth-field" value="100" min="1" max="500" />
                        </label>
                        <div class="desk-ai-usage-form-actions desk-ai-usage-form-actions--filters">
                            <button type="button" class="btn btn-primary" id="my-desk-ai-usage-load">Load ledger</button>
                        </div>
                    </div>
                    <div id="my-desk-ai-usage-ledger-summary" class="desk-ai-usage-summary"></div>
                    <p id="my-desk-ai-usage-ledger-message" class="desk-ai-usage-ledger-message"></p>
                    <div id="my-desk-ai-usage-ledger-table" class="desk-ai-usage-table-wrap"></div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('my-desk-ai-usage-close')?.addEventListener('click', () => {
        returnToAdminDeskHome();
    });

    const elWarnEl = document.getElementById('my-desk-ai-usage-el-warn');
    const elSummaryEl = document.getElementById('my-desk-ai-usage-el-summary');
    const elProgressEl = document.getElementById('my-desk-ai-usage-el-progress');
    const elProgressBarEl = document.getElementById('my-desk-ai-usage-el-progress-bar');
    const elEnabledEl = document.getElementById('my-desk-ai-usage-el-enabled');
    const elLimitEl = document.getElementById('my-desk-ai-usage-el-limit');
    const elStatusEl = document.getElementById('my-desk-ai-usage-el-status');
    const modelCallEl = document.getElementById('my-desk-ai-usage-model-call');
    const modelNarrationEl = document.getElementById('my-desk-ai-usage-model-narration');
    const modelPublishEl = document.getElementById('my-desk-ai-usage-model-publish');
    const modelCallSourceEl = document.getElementById('my-desk-ai-usage-model-call-source');
    const modelNarrationSourceEl = document.getElementById('my-desk-ai-usage-model-narration-source');
    const modelPublishSourceEl = document.getElementById('my-desk-ai-usage-model-publish-source');
    const modelCallLabelEl = document.getElementById('my-desk-ai-usage-model-call-label');
    const modelNarrationLabelEl = document.getElementById('my-desk-ai-usage-model-narration-label');
    const modelPublishLabelEl = document.getElementById('my-desk-ai-usage-model-publish-label');
    const featureEl = document.getElementById('my-desk-ai-usage-feature');
    const daysEl = document.getElementById('my-desk-ai-usage-days');
    const limitEl = document.getElementById('my-desk-ai-usage-limit');
    const ledgerSummaryEl = document.getElementById('my-desk-ai-usage-ledger-summary');
    const ledgerMessageEl = document.getElementById('my-desk-ai-usage-ledger-message');
    const ledgerTableEl = document.getElementById('my-desk-ai-usage-ledger-table');

    const setElStatus = (msg, isError = false) => {
        if (!elStatusEl) return;
        elStatusEl.textContent = msg || '';
        elStatusEl.style.color = isError ? 'var(--c-danger)' : (msg ? 'var(--c-success)' : 'var(--c-muted)');
    };

    function fillModelSelect(selectEl, allowed, selected) {
        if (!selectEl) return;
        const models = Array.isArray(allowed) && allowed.length
            ? allowed
            : ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5', 'eleven_v3'];
        const current = String(selected || models[0] || '').trim();
        selectEl.innerHTML = models.map((model) => (
            `<option value="${esc(model)}">${esc(model)}</option>`
        )).join('');
        selectEl.value = models.includes(current) ? current : models[0];
        selectEl.disabled = false;
    }

    function sourceHint(source, envActive) {
        if (envActive) return 'Source: env override (admin value stored but not used at runtime)';
        if (source === 'settings') return 'Source: admin settings';
        if (source === 'env') return 'Source: environment';
        return 'Source: default';
    }

    function renderElevenLabsStatus(status) {
        const s = status && typeof status === 'object' ? status : {};
        const limit = s.dailyCharacterLimit;
        const used = Number(s.charactersUsedToday) || 0;
        const remaining = s.charactersRemainingToday;
        const models = s.ttsModels || {};
        const sources = s.ttsModelSources || {};
        const labels = s.ttsModelLabels || {};
        const cards = [
            ['UTC day', s.utcDay || '—'],
            ['Used today', formatNumber(used)],
            ['Daily limit', limit == null ? 'Unlimited' : formatNumber(limit)],
            ['Remaining', limit == null ? '—' : formatNumber(remaining)],
            ['Requests today', formatNumber(s.requestsToday)],
            ['TTS enabled', s.ttsEnabled === false ? 'No' : 'Yes'],
            ['Limit source', s.limitSource || '—'],
            ['Call model', models.call || '—'],
            ['In-app narration', models['chapter-narration'] || '—'],
            ['Publish audiobook', models['audiobook-publish'] || '—'],
        ];
        if (elSummaryEl) {
            elSummaryEl.innerHTML = cards.map(([label, value]) => `
                <div class="desk-ai-usage-stat">
                    <span>${esc(label)}</span>
                    <strong>${esc(value)}</strong>
                </div>
            `).join('');
        }
        if (elEnabledEl) elEnabledEl.checked = s.ttsEnabled !== false;
        if (elLimitEl) elLimitEl.value = limit == null ? '0' : String(limit);
        if (modelCallLabelEl && labels.call) modelCallLabelEl.textContent = labels.call;
        if (modelNarrationLabelEl && labels['chapter-narration']) {
            modelNarrationLabelEl.textContent = labels['chapter-narration'];
        }
        if (modelPublishLabelEl && labels['audiobook-publish']) {
            modelPublishLabelEl.textContent = labels['audiobook-publish'];
        }
        fillModelSelect(modelCallEl, s.allowedTtsModels, models.call);
        fillModelSelect(modelNarrationEl, s.allowedTtsModels, models['chapter-narration']);
        fillModelSelect(modelPublishEl, s.allowedTtsModels, models['audiobook-publish']);
        if (modelCallSourceEl) {
            modelCallSourceEl.textContent = sourceHint(sources.call, s.envOverrides?.ttsModels?.call);
        }
        if (modelNarrationSourceEl) {
            modelNarrationSourceEl.textContent = sourceHint(
                sources['chapter-narration'],
                s.envOverrides?.ttsModels?.['chapter-narration'],
            );
        }
        if (modelPublishSourceEl) {
            modelPublishSourceEl.textContent = sourceHint(
                sources['audiobook-publish'],
                s.envOverrides?.ttsModels?.['audiobook-publish'],
            );
        }
        const envLocksModels = Boolean(
            s.envOverrides?.ttsModels?.call
            || s.envOverrides?.ttsModels?.['chapter-narration']
            || s.envOverrides?.ttsModels?.['audiobook-publish'],
        );
        if (modelCallEl) modelCallEl.disabled = Boolean(s.envOverrides?.ttsModels?.call);
        if (modelNarrationEl) {
            modelNarrationEl.disabled = Boolean(s.envOverrides?.ttsModels?.['chapter-narration']);
        }
        if (modelPublishEl) {
            modelPublishEl.disabled = Boolean(s.envOverrides?.ttsModels?.['audiobook-publish']);
        }
        if (elProgressEl && elProgressBarEl) {
            if (limit == null || limit <= 0) {
                elProgressEl.hidden = true;
            } else {
                const pct = Math.min(100, Math.round((used / limit) * 100));
                elProgressEl.hidden = false;
                elProgressBarEl.style.width = `${pct}%`;
                elProgressEl.classList.toggle('is-hot', pct >= 85);
            }
        }
        if (elWarnEl) {
            const notes = [];
            if (s.limitReached) {
                notes.push('Daily ElevenLabs character limit reached. Call / Discuss / narration fall back to OpenAI; voice previews are blocked.');
            }
            if (s.envOverrides?.dailyCharacterLimit || s.envOverrides?.ttsEnabled || envLocksModels) {
                notes.push('Environment overrides are active (WMB_ELEVENLABS_* / WMB_CALL_TTS_MODEL); admin saves still store values but env wins at runtime.');
            }
            if (notes.length) {
                elWarnEl.hidden = false;
                elWarnEl.textContent = notes.join(' ');
            } else {
                elWarnEl.hidden = true;
                elWarnEl.textContent = '';
            }
        }
        if (Array.isArray(s.features) && featureEl) {
            const current = String(featureEl.value || '');
            featureEl.innerHTML = '<option value="">All features</option>';
            s.features.forEach((feature) => {
                const option = document.createElement('option');
                option.value = feature;
                option.textContent = feature;
                featureEl.appendChild(option);
            });
            featureEl.value = current;
        }
    }

    async function loadElevenLabsStatus() {
        setElStatus('Loading…');
        try {
            const status = await api('GET', '/api/system/ai-usage/elevenlabs');
            renderElevenLabsStatus(status);
            setElStatus('');
            return status;
        } catch (err) {
            setElStatus(err.message || 'Could not load ElevenLabs usage', true);
            throw err;
        }
    }

    async function saveElevenLabsSettings(event) {
        event?.preventDefault?.();
        const dailyCharacterLimit = Number(elLimitEl?.value);
        setElStatus('Saving…');
        try {
            const status = await api('PATCH', '/api/system/ai-usage/elevenlabs', {
                ttsEnabled: Boolean(elEnabledEl?.checked),
                dailyCharacterLimit: Number.isFinite(dailyCharacterLimit) ? dailyCharacterLimit : 0,
                ttsModels: {
                    call: String(modelCallEl?.value || '').trim(),
                    'chapter-narration': String(modelNarrationEl?.value || '').trim(),
                    'audiobook-publish': String(modelPublishEl?.value || '').trim(),
                },
            });
            renderElevenLabsStatus(status);
            setElStatus('Saved');
        } catch (err) {
            setElStatus(err.message || 'Could not save', true);
        }
    }

    function renderLedger(payload) {
        const summary = payload?.summary || {};
        const cards = [
            ['Records', formatNumber(summary.count)],
            ['Succeeded', formatNumber(summary.succeededCount)],
            ['Failed', formatNumber(summary.failedCount)],
            ['Characters', formatNumber(summary.totalCharacters)],
        ];
        if (ledgerSummaryEl) {
            ledgerSummaryEl.innerHTML = cards.map(([label, value]) => `
                <div class="desk-ai-usage-stat">
                    <span>${esc(label)}</span>
                    <strong>${esc(value)}</strong>
                </div>
            `).join('');
        }
        const byFeature = summary.byFeature && typeof summary.byFeature === 'object' ? summary.byFeature : {};
        const featureBits = Object.entries(byFeature)
            .sort((a, b) => (b[1]?.characters || 0) - (a[1]?.characters || 0))
            .map(([feature, row]) => `${feature}: ${formatNumber(row.characters)} chars (${formatNumber(row.count)})`)
            .join(' · ');
        if (ledgerMessageEl) {
            const range = `${formatDate(payload?.filters?.startDate)} → ${formatDate(payload?.filters?.endDate)}`;
            ledgerMessageEl.textContent = [
                `Loaded ${formatNumber(payload?.recordCount || 0)} records for ${range}`,
                payload?.truncated ? '(truncated)' : '',
                featureBits,
            ].filter(Boolean).join(' — ');
        }
        const rows = Array.isArray(payload?.records) ? payload.records : [];
        if (!ledgerTableEl) return;
        if (!rows.length) {
            ledgerTableEl.innerHTML = '<p class="desk-ai-usage-empty">No ElevenLabs usage records matched these filters. Cached narration and OpenAI fallback do not create ledger rows.</p>';
            return;
        }
        ledgerTableEl.innerHTML = `
            <table class="desk-ai-usage-table">
                <thead>
                    <tr>
                        <th>When</th>
                        <th>Feature</th>
                        <th>Status</th>
                        <th>Chars</th>
                        <th>Project</th>
                        <th>Latency</th>
                        <th>Error</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((row) => `
                        <tr>
                            <td>${esc(formatDate(row.createdAt))}</td>
                            <td>${esc(row.feature || '—')}</td>
                            <td>${esc(row.status || '—')}</td>
                            <td>${esc(formatNumber(row.characters))}</td>
                            <td class="desk-ai-usage-wrap" title="${esc(row.projectId || '')}">${esc(row.projectId || '—')}</td>
                            <td>${esc(row.latencyMs != null ? `${formatNumber(row.latencyMs)} ms` : '—')}</td>
                            <td class="desk-ai-usage-wrap">${esc(row.errorMessage || row.errorCode || '—')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    async function loadLedger() {
        if (ledgerMessageEl) ledgerMessageEl.textContent = 'Loading ledger…';
        const days = Math.max(1, Number(daysEl?.value) || 7);
        const end = new Date();
        const start = new Date(end.getTime() - (days * 24 * 60 * 60 * 1000));
        const params = new URLSearchParams();
        const feature = String(featureEl?.value || '').trim();
        const limit = Math.min(Math.max(Number(limitEl?.value) || 100, 1), 500);
        if (feature) params.set('feature', feature);
        params.set('startDate', start.toISOString());
        params.set('endDate', end.toISOString());
        params.set('limit', String(limit));
        try {
            const payload = await api('GET', `/api/system/ai-usage?${params.toString()}`);
            renderLedger(payload);
        } catch (err) {
            if (ledgerMessageEl) ledgerMessageEl.textContent = err.message || 'Could not load ledger';
            if (ledgerTableEl) ledgerTableEl.innerHTML = '';
        }
    }

    document.getElementById('my-desk-ai-usage-el-form')?.addEventListener('submit', saveElevenLabsSettings);
    document.getElementById('my-desk-ai-usage-el-refresh')?.addEventListener('click', () => {
        void loadElevenLabsStatus();
    });
    document.getElementById('my-desk-ai-usage-load')?.addEventListener('click', () => {
        void loadLedger();
    });

    try {
        await loadElevenLabsStatus();
        await loadLedger();
    } catch (_) {
        /* status already shown */
    }
}
