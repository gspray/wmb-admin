'use strict';

/**
 * Admin Desk — Voice Clone Settings (enable + recording prompts for the book).
 * Authors record in Book Settings → Clone Voice.
 */

import { state } from './state.js';
import { adminApi as api } from '../admin-desk-api.js';
import { esc } from './ui-helpers.js';

let _renderMyDeskList = null;
let _setMyDeskWorkspaceMode = null;
let _returnToAdminDeskHome = null;
let _refreshAlignVoiceQuestionFromServer = null;

function renderMyDeskList() { return _renderMyDeskList?.(); }
function setMyDeskWorkspaceMode(enabled) { return _setMyDeskWorkspaceMode?.(enabled); }
function returnToAdminDeskHome() { return _returnToAdminDeskHome?.(); }

export async function launchVoiceCloneSettingsPanel(deps) {
    const {
        renderMyDeskList: renderMyDeskListDep,
        setMyDeskWorkspaceMode: setMyDeskWorkspaceModeDep,
        returnToAdminDeskHome: returnToAdminDeskHomeDep,
        refreshAlignVoiceQuestionFromServer: refreshAlignVoiceQuestionFromServerDep,
    } = deps || {};
    if (typeof renderMyDeskListDep !== 'function'
        || typeof setMyDeskWorkspaceModeDep !== 'function'
        || typeof returnToAdminDeskHomeDep !== 'function') {
        throw new Error('launchVoiceCloneSettingsPanel requires desk host deps');
    }
    _renderMyDeskList = renderMyDeskListDep;
    _setMyDeskWorkspaceMode = setMyDeskWorkspaceModeDep;
    _returnToAdminDeskHome = returnToAdminDeskHomeDep;
    _refreshAlignVoiceQuestionFromServer = typeof refreshAlignVoiceQuestionFromServerDep === 'function'
        ? refreshAlignVoiceQuestionFromServerDep
        : null;

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
        <div class="desk-workspace-shell desk-workspace-shell--voice-clone-settings">
            <header class="desk-workspace-head">
                <h3>Voice Clone Settings</h3>
                <button id="my-desk-voice-clone-settings-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <div class="desk-workspace-body desk-settings-body-wrap desk-voice-clone-settings-body">
                <div class="desk-workspace-panel-card desk-voice-clone-settings-card">
                    <p class="desk-workspace-intro">Control voice cloning for the current book. Authors complete six short recordings in Settings → Clone Voice.</p>
                    <div id="my-desk-voice-clone-settings-content" class="desk-voice-clone-settings-content">
                        <p style="color:var(--c-muted);font-size:.82rem;margin:0;">Loading…</p>
                    </div>
                </div>
            </div>
            <footer class="desk-workspace-foot desk-workspace-foot--spread">
                <div class="desk-voice-clone-settings-actions">
                    <button class="btn btn-ghost" id="my-desk-reset-voice-clone-script" type="button">Reset prompts to default</button>
                    <button class="btn btn-primary" id="my-desk-save-voice-clone-settings" type="button">Save settings</button>
                </div>
                <span id="my-desk-voice-clone-settings-status" class="desk-workspace-status"></span>
            </footer>
        </div>
    `;

    document.getElementById('my-desk-voice-clone-settings-close')?.addEventListener('click', () => {
        returnToAdminDeskHome();
    });

    const contentEl = document.getElementById('my-desk-voice-clone-settings-content');
    const saveBtn = document.getElementById('my-desk-save-voice-clone-settings');
    const resetBtn = document.getElementById('my-desk-reset-voice-clone-script');
    const statusEl = document.getElementById('my-desk-voice-clone-settings-status');
    if (!contentEl || !saveBtn || !resetBtn || !statusEl) return;

    const setStatus = (msg, isError = false) => {
        statusEl.textContent = msg || '';
        statusEl.style.color = isError ? 'var(--c-danger)' : (msg ? 'var(--c-success)' : 'var(--c-muted)');
    };

    let loaded = null;
    try {
        loaded = await api('GET', '/api/system/author/project/voice-clone-settings');
    } catch (err) {
        contentEl.innerHTML = `<p style="color:var(--c-danger);font-size:.82rem;margin:0;">${esc(err.message || 'Could not load settings')}</p>`;
        saveBtn.disabled = true;
        resetBtn.disabled = true;
        return;
    }

    const renderForm = (data) => {
        const enabled = Boolean(data?.enabled);
        const prompts = Array.isArray(data?.prompts) ? data.prompts : [];
        const wordCount = Number(data?.wordCount) || 0;
        const estSec = Number(data?.estimatedSeconds) || 0;
        const serverReady = data?.voiceCloneServer?.available !== false;
        const serverHint = String(data?.voiceCloneServer?.adminHint || '').trim();
        contentEl.innerHTML = `
            ${!serverReady && serverHint ? `
            <p class="desk-voice-clone-server-hint" role="status">${serverHint}</p>
            ` : ''}
            <section class="desk-voice-clone-settings-section desk-voice-clone-settings-section--enable" aria-labelledby="desk-vc-enable-heading">
                <h4 id="desk-vc-enable-heading" class="desk-voice-clone-settings-title">Enable voice cloning</h4>
                <p class="desk-voice-clone-settings-desc">When off, authors cannot create or replace a voice clone for this book, and <strong>My Voice</strong> is disabled in Start My Book.</p>
                <label class="desk-voice-clone-enable-row">
                    <input type="checkbox" id="my-desk-voice-clone-enabled" ${enabled ? 'checked' : ''}${serverReady ? '' : ' disabled'} />
                    <span>Allow voice cloning for this book</span>
                </label>
            </section>
            <section class="desk-voice-clone-settings-section desk-voice-clone-settings-section--prompts" aria-labelledby="desk-vc-prompts-heading">
                <h4 id="desk-vc-prompts-heading" class="desk-voice-clone-settings-title">Recording prompts (6 steps)</h4>
                <p class="desk-voice-clone-settings-desc">Authors record one prompt at a time in Settings → Clone Voice.${estSec ? ` About ${estSec} seconds total (${wordCount} words).` : ''}</p>
                <div class="desk-voice-clone-prompts-list">
                    ${prompts.map((p, i) => `
                    <label class="desk-voice-clone-prompt-item" for="my-desk-voice-clone-prompt-${i}">
                        <span class="desk-voice-clone-prompt-label">${i + 1} / ${prompts.length} — ${esc(p.title || `Step ${i + 1}`)}</span>
                        <textarea id="my-desk-voice-clone-prompt-${i}" class="desk-voice-clone-prompt-area" data-prompt-index="${i}" rows="3">${esc(p.text || '')}</textarea>
                    </label>
                    `).join('')}
                </div>
            </section>
        `;
    };

    renderForm(loaded);

    const collectPayload = () => {
        const basePrompts = Array.isArray(loaded?.prompts) ? loaded.prompts : [];
        const prompts = basePrompts.map((p, i) => {
            const el = document.querySelector(`[data-prompt-index="${i}"]`);
            return {
                id: p.id,
                title: p.title,
                text: String(el?.value || '').trim(),
            };
        });
        return {
            enabled: Boolean(document.getElementById('my-desk-voice-clone-enabled')?.checked),
            prompts,
        };
    };

    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        setStatus('Saving…');
        try {
            const result = await api('PUT', '/api/system/author/project/voice-clone-settings', collectPayload());
            loaded = result;
            if (state.project) {
                state.project.voiceCloneEnabled = Boolean(result.enabled);
                state.project.voiceCloneReadingScript = result.isDefaultPrompts ? '' : String(result.readingScript || '');
                state.project.voiceClonePrompts = result.isDefaultPrompts ? null : result.prompts;
            }
            renderForm(result);
            setStatus('Settings saved.');
            if (_refreshAlignVoiceQuestionFromServer) {
                await _refreshAlignVoiceQuestionFromServer();
            }
        } catch (err) {
            setStatus(err.message || 'Save failed.', true);
        } finally {
            saveBtn.disabled = false;
        }
    });

    resetBtn.addEventListener('click', async () => {
        const ok = window.WmbDialogs?.confirm
            ? await window.WmbDialogs.confirm(
                'Reset all six recording prompts to the defaults? Your custom text will be discarded.',
                { title: 'Reset prompts', okText: 'Reset', cancelText: 'Cancel' },
            )
            : window.confirm('Reset all six recording prompts to the defaults?');
        if (!ok) return;
        resetBtn.disabled = true;
        setStatus('Resetting prompts…');
        try {
            const result = await api('POST', '/api/system/author/project/voice-clone-settings/reset-reading-script');
            loaded = result;
            if (state.project) {
                state.project.voiceCloneReadingScript = '';
            }
            renderForm(result);
            setStatus('Prompts reset to default.');
        } catch (err) {
            setStatus(err.message || 'Reset failed.', true);
        } finally {
            resetBtn.disabled = false;
        }
    });
}
