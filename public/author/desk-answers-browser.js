'use strict';

import { formatUiDateTime } from '../../platform/client/ui/datetime-format.js';

function formatAnswerDisplayText(raw) {
    const text = String(raw || '').trim();
    if (!text) return '';
    if (text === '__wmb_title_suggestions_later__') return 'TBD';
    if (text.startsWith('{')) {
        try {
            const parsed = JSON.parse(text);
            if (parsed?.mode === 'suggestions_later') return 'TBD';
            if (parsed?.mode === 'own_title') return String(parsed.title || '').trim() || text;
        } catch (_) {
            // fall through
        }
    }
    return text;
}

function formatSourceContextLabel(ctx) {
    const raw = String(ctx || '').trim();
    if (!raw) return 'general';
    if (raw === 'start_my_book' || raw === 'align') return 'Start My Book';
    if (raw.startsWith('assignment:')) return `Assignment ${raw.split(':')[1] || ''}`.trim();
    return raw.replace(/_/g, ' ');
}

function formatWhen(iso) {
    return formatUiDateTime(iso) || '—';
}

/**
 * Admin Desk — browse current project answers + per-question save history.
 * @param {{ api: Function, esc: Function, onClose: () => void, projectTitle?: string }} opts
 */
export async function launchDeskAnswersBrowser(opts) {
    const { api, esc, onClose, projectTitle = '' } = opts;
    const emptyEl = document.getElementById('my-desk-empty');
    const editorEl = document.getElementById('my-desk-editor');
    const comingSoon = document.getElementById('my-desk-coming-soon');
    if (!emptyEl) return;

    if (comingSoon) comingSoon.classList.add('hidden');
    if (editorEl) editorEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    emptyEl.classList.add('book-audit-host');
    emptyEl.innerHTML = `
        <div class="desk-workspace-shell">
            <header class="desk-workspace-head">
                <div>
                    <h3>Answer Logs</h3>
                    <p class="desk-answers-subtitle">${esc(projectTitle || 'Current project')}</p>
                </div>
                <button id="desk-answers-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <div class="desk-workspace-body desk-revisions-main">
                <div class="desk-revisions-toolbar">
                    <input id="desk-answers-search" class="auth-field desk-answers-search" type="search" placeholder="Search question, answer, or question ID…" />
                    <button class="btn btn-ghost desk-revisions-toolbar-btn" id="desk-answers-refresh" type="button">Refresh</button>
                    <span id="desk-answers-status" class="desk-revisions-toolbar-status"></span>
                </div>
                <div class="desk-revisions-grid desk-answers-grid">
                    <div id="desk-answers-list" class="desk-revisions-list-pane desk-answers-list"></div>
                    <div id="desk-answers-detail" class="desk-revisions-preview-pane desk-answers-detail">
                        <p class="desk-revisions-preview-placeholder">Select an answer to inspect details and save history.</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('desk-answers-close')?.addEventListener('click', () => onClose());

    const statusEl = document.getElementById('desk-answers-status');
    const listEl = document.getElementById('desk-answers-list');
    const detailEl = document.getElementById('desk-answers-detail');
    const searchEl = document.getElementById('desk-answers-search');
    let rows = [];
    let selectedId = '';
    let eventCache = new Map();

    const setStatus = (msg, { error = false } = {}) => {
        if (!statusEl) return;
        statusEl.textContent = msg || '';
        statusEl.style.color = error ? 'var(--c-danger)' : 'var(--c-muted)';
    };

    const filteredRows = () => {
        const q = String(searchEl?.value || '').trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((row) => {
            const hay = [
                row.questionId,
                row.questionText,
                row.answerText,
                row.sourceContext,
                row.id,
            ].join(' ').toLowerCase();
            return hay.includes(q);
        });
    };

    const renderDetail = async (row) => {
        if (!detailEl || !row) return;
        selectedId = row.id;
        renderList();

        let eventsHtml = '<p class="desk-answers-events-empty">Loading save history…</p>';
        detailEl.innerHTML = `
            <div class="desk-answers-detail-inner">
                <div class="desk-answers-detail-meta">
                    <div><span class="desk-answers-meta-label">Question ID</span><code>${esc(row.questionId || '—')}</code></div>
                    <div><span class="desk-answers-meta-label">Answer ID</span><code>${esc(row.id)}</code></div>
                    <div><span class="desk-answers-meta-label">Source</span>${esc(formatSourceContextLabel(row.sourceContext))}</div>
                    <div><span class="desk-answers-meta-label">Added by</span>${esc(row.addedBy || 'author')}</div>
                    <div><span class="desk-answers-meta-label">Updated</span>${esc(formatWhen(row.updatedAt || row.createdAt))}</div>
                    <div><span class="desk-answers-meta-label">Created</span>${esc(formatWhen(row.createdAt))}</div>
                    ${row.hidden ? '<div><span class="desk-answers-meta-label">Visibility</span>Hidden</div>' : ''}
                </div>
                <h4 class="desk-answers-detail-question">${esc(row.questionText || 'Untitled question')}</h4>
                <pre class="desk-answers-detail-body">${esc(formatAnswerDisplayText(row.answerText))}</pre>
                <button class="btn btn-danger" id="desk-answer-erase" type="button">Erase Material permanently</button>
                <details class="desk-answers-events-wrap" open>
                    <summary>Save history${row.questionId ? ` (${esc(row.questionId)})` : ''}</summary>
                    <div id="desk-answers-events" class="desk-answers-events">${eventsHtml}</div>
                </details>
            </div>
        `;
        document.getElementById('desk-answer-erase')?.addEventListener('click', async (event) => {
            const button = event.currentTarget;
            const message = 'Erase this Material permanently? Its save history, linked interview session, story graph provenance, preparation, plan, chapter drafts, manuscript, and audit artifacts may be deleted. This cannot be undone.';
            const dialogs = window.WmbDialogs;
            const confirmed = dialogs?.confirm
                ? await dialogs.confirm(message, {
                    title: 'Erase Material permanently',
                    okText: 'Erase permanently',
                    cancelText: 'Keep',
                })
                : window.confirm(message);
            if (!confirmed) return;
            button.disabled = true;
            try {
                await api('POST', '/api/system/author/project/evidence/erase', {
                    evidenceType: 'material',
                    evidenceId: row.id,
                    assignmentNum: row.assignmentNum,
                    sessionId: row.sessionId,
                });
                await loadAnswers();
            } catch (err) {
                button.disabled = false;
                setStatus(err.message || 'Permanent erasure failed safely.', { error: true });
            }
        });

        const eventsHost = document.getElementById('desk-answers-events');
        if (!eventsHost) return;

        const cacheKey = String(row.questionId || row.id);
        try {
            let events = eventCache.get(cacheKey);
            if (!events) {
                const qs = row.questionId
                    ? `?questionId=${encodeURIComponent(row.questionId)}&limit=100`
                    : '?limit=100';
                const payload = await api('GET', `/api/system/author/project/answer-events${qs}`);
                events = Array.isArray(payload?.events) ? payload.events : [];
                eventCache.set(cacheKey, events);
            }
            const filtered = row.questionId
                ? events.filter((ev) => String(ev.questionId || '') === String(row.questionId))
                : events.filter((ev) => String(ev.answerId || '') === String(row.id));

            if (!filtered.length) {
                eventsHost.innerHTML = '<p class="desk-answers-events-empty">No save events recorded yet for this question.</p>';
                return;
            }

            eventsHost.innerHTML = filtered.slice().reverse().map((ev) => `
                <div class="desk-answers-event-row">
                    <div class="desk-answers-event-head">
                        <span>${esc(formatWhen(ev.savedAt))}</span>
                        <span class="desk-answers-event-trigger">${esc(ev.trigger || 'system')}</span>
                    </div>
                    <pre class="desk-answers-event-body">${esc(formatAnswerDisplayText(ev.answerText))}</pre>
                    ${ev.previousAnswerText != null && String(ev.previousAnswerText) !== String(ev.answerText)
                        ? `<p class="desk-answers-event-prev"><span>Previous:</span> ${esc(formatAnswerDisplayText(ev.previousAnswerText).slice(0, 240))}</p>`
                        : ''}
                </div>
            `).join('');
        } catch (err) {
            eventsHost.innerHTML = `<p class="desk-answers-events-empty">${esc(err.message || 'Could not load save history.')}</p>`;
        }
    };

    const renderList = () => {
        if (!listEl) return;
        const visible = filteredRows();
        setStatus(`${visible.length} answer${visible.length === 1 ? '' : 's'}${visible.length !== rows.length ? ` (filtered from ${rows.length})` : ''}`);

        if (!visible.length) {
            listEl.innerHTML = '<p class="desk-answers-list-empty">No answers match your search.</p>';
            return;
        }

        listEl.innerHTML = visible.map((row) => {
            const selectedClass = selectedId === row.id ? ' desk-answers-row--selected' : '';
            const preview = formatAnswerDisplayText(row.answerText);
            const previewShort = preview.length > 90 ? `${preview.slice(0, 90)}…` : preview;
            return `
                <button type="button" class="desk-answers-row${selectedClass}" data-id="${esc(row.id)}">
                    <span class="desk-answers-row-qid">${esc(row.questionId || '—')}</span>
                    <span class="desk-answers-row-question">${esc(row.questionText || 'Untitled question')}</span>
                    <span class="desk-answers-row-preview">${esc(previewShort || '(empty)')}</span>
                    <span class="desk-answers-row-meta">${esc(formatSourceContextLabel(row.sourceContext))} · ${esc(formatWhen(row.updatedAt || row.createdAt))}</span>
                </button>
            `;
        }).join('');

        listEl.querySelectorAll('.desk-answers-row').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const row = rows.find((r) => r.id === id);
                if (row) renderDetail(row);
            });
        });
    };

    const loadAnswers = async () => {
        setStatus('Loading…');
        eventCache = new Map();
        try {
            const payload = await api('GET', '/api/system/author/project/answers');
            rows = Array.isArray(payload?.answers) ? payload.answers : [];
            selectedId = rows[0]?.id || '';
            renderList();
            if (rows[0]) await renderDetail(rows[0]);
            else if (detailEl) {
                detailEl.innerHTML = '<p class="desk-revisions-preview-placeholder">No saved answers for this project yet.</p>';
            }
        } catch (err) {
            setStatus(err.message || 'Could not load answers.', { error: true });
            if (listEl) listEl.innerHTML = '';
            if (detailEl) {
                detailEl.innerHTML = `<p class="desk-revisions-preview-placeholder">${esc(err.message || 'Load failed')}</p>`;
            }
        }
    };

    searchEl?.addEventListener('input', () => renderList());
    document.getElementById('desk-answers-refresh')?.addEventListener('click', () => loadAnswers());

    await loadAnswers();
}
