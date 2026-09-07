'use strict';

/**
 * Admin Desk — Pet Talk listen timing (global QA overrides).
 */

import { adminApi as api } from '../admin-desk-api.js';
import { esc } from '../../platform/client/ui/text-format.js';

let _renderMyDeskList = null;
let _setMyDeskWorkspaceMode = null;
let _returnToAdminDeskHome = null;

function renderMyDeskList() { return _renderMyDeskList?.(); }
function setMyDeskWorkspaceMode(enabled) { return _setMyDeskWorkspaceMode?.(enabled); }
function returnToAdminDeskHome() { return _returnToAdminDeskHome?.(); }

function fieldRow(id, label, helper, valueSec) {
    return `
        <div class="desk-ghostwriter-field">
            <label class="desk-ghostwriter-field-label" for="${esc(id)}">${esc(label)}</label>
            <p class="desk-ghostwriter-field-helper">${esc(helper)}</p>
            <input type="number" min="3" step="1" id="${esc(id)}" class="auth-field desk-pet-talk-listen-input"
                value="${esc(String(valueSec))}" />
        </div>
    `;
}

/**
 * @param {object} deps
 */
export async function launchPetTalkListenSettingsPanel(deps) {
    const {
        renderMyDeskList: renderMyDeskListDep,
        setMyDeskWorkspaceMode: setMyDeskWorkspaceModeDep,
        returnToAdminDeskHome: returnToAdminDeskHomeDep,
    } = deps || {};
    if (typeof renderMyDeskListDep !== 'function'
        || typeof setMyDeskWorkspaceModeDep !== 'function'
        || typeof returnToAdminDeskHomeDep !== 'function') {
        throw new Error('launchPetTalkListenSettingsPanel requires desk host deps');
    }
    _renderMyDeskList = renderMyDeskListDep;
    _setMyDeskWorkspaceMode = setMyDeskWorkspaceModeDep;
    _returnToAdminDeskHome = returnToAdminDeskHomeDep;

    const emptyEl = document.getElementById('my-desk-empty');
    const editorEl = document.getElementById('my-desk-editor');
    const comingSoon = document.getElementById('my-desk-coming-soon');
    if (!emptyEl) return;

    renderMyDeskList();
    if (comingSoon) comingSoon.classList.add('hidden');
    if (editorEl) editorEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    emptyEl.classList.add('book-audit-host');
    setMyDeskWorkspaceMode(true);
    emptyEl.innerHTML = `
        <div class="desk-workspace-shell desk-workspace-shell--pet-talk-listen">
            <header class="desk-workspace-head">
                <h3>Pet Talk Listen Timing</h3>
                <button id="my-desk-pet-talk-listen-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <div class="desk-workspace-body desk-settings-body-wrap">
                <div class="desk-workspace-panel-card">
                    <p class="desk-workspace-intro">Shorten Pet Talk listen beats for QA. Applies to all Pet books after reload. Production defaults stay when custom timing is off.</p>
                    <div id="my-desk-pet-talk-listen-content">
                        <p style="color:var(--c-muted);font-size:.82rem;margin:0;">Loading…</p>
                    </div>
                </div>
            </div>
            <footer class="desk-workspace-foot desk-workspace-foot--spread">
                <div class="desk-pet-talk-listen-actions">
                    <button class="btn btn-ghost" id="my-desk-pet-talk-listen-preset-quick" type="button">Quick test preset</button>
                    <button class="btn btn-ghost" id="my-desk-pet-talk-listen-preset-default" type="button">Production defaults</button>
                    <button class="btn btn-primary" id="my-desk-pet-talk-listen-save" type="button">Save</button>
                </div>
                <span id="my-desk-pet-talk-listen-status" class="desk-workspace-status"></span>
            </footer>
        </div>
    `;

    document.getElementById('my-desk-pet-talk-listen-close')?.addEventListener('click', () => {
        returnToAdminDeskHome();
    });

    const contentEl = document.getElementById('my-desk-pet-talk-listen-content');
    const saveBtn = document.getElementById('my-desk-pet-talk-listen-save');
    const quickBtn = document.getElementById('my-desk-pet-talk-listen-preset-quick');
    const defaultBtn = document.getElementById('my-desk-pet-talk-listen-preset-default');
    const statusEl = document.getElementById('my-desk-pet-talk-listen-status');
    if (!contentEl || !saveBtn || !quickBtn || !defaultBtn || !statusEl) return;

    const setStatus = (msg, isError = false) => {
        statusEl.textContent = msg || '';
        statusEl.style.color = isError ? 'var(--c-danger)' : (msg ? 'var(--c-success)' : 'var(--c-muted)');
    };

    let loaded = null;

    const readFormSec = () => ({
        enabled: Boolean(document.getElementById('my-desk-pet-talk-listen-enabled')?.checked),
        longAnswerWarningSec: Number(document.getElementById('my-desk-pet-talk-listen-warn')?.value),
        softMaxActiveSpeechSec: Number(document.getElementById('my-desk-pet-talk-listen-soft')?.value),
        softGraceSec: Number(document.getElementById('my-desk-pet-talk-listen-grace')?.value),
        maxRecordSec: Number(document.getElementById('my-desk-pet-talk-listen-hard')?.value),
    });

    const paintForm = (data) => {
        const sec = data?.settingsSec || data?.defaultsSec || {};
        const displayBudget = Number(data?.displayBudgetSec)
            || (Number(sec.softMaxActiveSpeechSec) + Number(sec.softGraceSec));
        contentEl.innerHTML = `
            <label class="desk-pet-talk-listen-enable-row">
                <input type="checkbox" id="my-desk-pet-talk-listen-enabled"${sec.enabled ? ' checked' : ''} />
                <span>Use custom listen timing</span>
            </label>
            ${fieldRow(
                'my-desk-pet-talk-listen-warn',
                'Yellow beat — long answer warning (seconds)',
                'Active speech time before the yellow bar, hint, and pill.',
                sec.longAnswerWarningSec ?? 90,
            )}
            ${fieldRow(
                'my-desk-pet-talk-listen-soft',
                'Soft cap — orange beat (seconds)',
                'Active speech time before auto-save waits for a pause.',
                sec.softMaxActiveSpeechSec ?? 120,
            )}
            ${fieldRow(
                'my-desk-pet-talk-listen-grace',
                'Grace window (seconds)',
                'Wall-clock time after soft cap before force-save.',
                sec.softGraceSec ?? 45,
            )}
            ${fieldRow(
                'my-desk-pet-talk-listen-hard',
                'Hard cap (seconds)',
                'Maximum mic open time (safety ceiling).',
                sec.maxRecordSec ?? 180,
            )}
            <p class="desk-pet-talk-listen-summary" id="my-desk-pet-talk-listen-summary">
                Countdown starts at <strong>${esc(String(displayBudget))}:00</strong> (soft + grace).
                Reload Pet after saving.
            </p>
        `;
        const updateSummary = () => {
            const form = readFormSec();
            const budget = (Number(form.softMaxActiveSpeechSec) || 0) + (Number(form.softGraceSec) || 0);
            const summary = document.getElementById('my-desk-pet-talk-listen-summary');
            if (summary) {
                summary.innerHTML = `Countdown starts at <strong>${esc(String(budget))}:00</strong> (soft + grace). Reload Pet after saving.`;
            }
        };
        contentEl.querySelectorAll('.desk-pet-talk-listen-input').forEach((input) => {
            input.addEventListener('input', updateSummary);
        });
    };

    try {
        loaded = await api('GET', '/api/system/pet-talk-listen-settings');
        paintForm(loaded);
    } catch (err) {
        contentEl.innerHTML = `<p style="color:var(--c-danger);font-size:.82rem;margin:0;">${esc(err.message || 'Could not load settings')}</p>`;
        saveBtn.disabled = true;
        quickBtn.disabled = true;
        defaultBtn.disabled = true;
        return;
    }

    quickBtn.addEventListener('click', () => {
        const preset = loaded?.quickTestPresetSec || {
            longAnswerWarningSec: 8,
            softMaxActiveSpeechSec: 16,
            softGraceSec: 8,
            maxRecordSec: 30,
        };
        document.getElementById('my-desk-pet-talk-listen-enabled').checked = true;
        document.getElementById('my-desk-pet-talk-listen-warn').value = String(preset.longAnswerWarningSec);
        document.getElementById('my-desk-pet-talk-listen-soft').value = String(preset.softMaxActiveSpeechSec);
        document.getElementById('my-desk-pet-talk-listen-grace').value = String(preset.softGraceSec);
        document.getElementById('my-desk-pet-talk-listen-hard').value = String(preset.maxRecordSec);
        setStatus('Quick test preset loaded — save to apply');
    });

    defaultBtn.addEventListener('click', () => {
        const preset = loaded?.defaultsSec || {
            longAnswerWarningSec: 90,
            softMaxActiveSpeechSec: 120,
            softGraceSec: 45,
            maxRecordSec: 180,
        };
        document.getElementById('my-desk-pet-talk-listen-enabled').checked = false;
        document.getElementById('my-desk-pet-talk-listen-warn').value = String(preset.longAnswerWarningSec);
        document.getElementById('my-desk-pet-talk-listen-soft').value = String(preset.softMaxActiveSpeechSec);
        document.getElementById('my-desk-pet-talk-listen-grace').value = String(preset.softGraceSec);
        document.getElementById('my-desk-pet-talk-listen-hard').value = String(preset.maxRecordSec);
        setStatus('Production defaults loaded — save to apply');
    });

    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        setStatus('Saving…');
        try {
            const saved = await api('PUT', '/api/system/pet-talk-listen-settings', readFormSec());
            loaded = saved;
            paintForm(saved);
            setStatus('Saved — reload Pet Talk to apply');
        } catch (err) {
            setStatus(err.message || 'Could not save', true);
        } finally {
            saveBtn.disabled = false;
        }
    });
}
