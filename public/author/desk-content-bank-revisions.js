'use strict';

/**
 * Admin Desk — content-bank revision history for Start My Book + Assignment editors.
 * Separate from per-project Book Revision Manager.
 */

import { adminApi as api } from '../admin-desk-api.js';
import { esc, formatUiDateTime } from './ui-helpers.js';

function selectorQuery(selector) {
    const params = new URLSearchParams();
    params.set('kind', String(selector.kind || ''));
    if (selector.scope) params.set('scope', String(selector.scope));
    if (selector.bookType) params.set('bookType', String(selector.bookType));
    if (selector.situationKey || selector.bookSituation) {
        params.set('situation', String(selector.situationKey || selector.bookSituation));
    }
    return params.toString();
}

function summaryLine(row) {
    const s = row?.summary || {};
    const parts = [];
    if (Number.isFinite(Number(s.assignmentCount))) {
        parts.push(`${Number(s.assignmentCount)} assignment${Number(s.assignmentCount) === 1 ? '' : 's'}`);
    }
    if (Number.isFinite(Number(s.questionCount))) {
        parts.push(`${Number(s.questionCount)} question${Number(s.questionCount) === 1 ? '' : 's'}`);
    }
    if (s.title) parts.push(String(s.title));
    return parts.join(' · ') || 'Snapshot';
}

function triggerLabel(trigger) {
    const t = String(trigger || 'save');
    if (t === 'manual') return 'Manual';
    if (t === 'restore') return 'Restore';
    if (t === 'restore_before') return 'Before restore';
    return 'Save';
}

/**
 * Open a history overlay bound to the current editor scope.
 * @param {{ kind: 'smb'|'assignment', scope?: string, bookType?: string, situationKey?: string }} selector
 * @param {{ onRestored?: () => void|Promise<void>, title?: string }} [opts]
 */
export function openContentBankRevisionsPanel(selector, opts = {}) {
    const existing = document.getElementById('cbr-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cbr-overlay';
    overlay.className = 'cbr-overlay';
    overlay.innerHTML = `
        <div class="cbr-modal" role="dialog" aria-modal="true" aria-labelledby="cbr-title">
            <header class="cbr-modal-head">
                <h3 id="cbr-title">${esc(opts.title || 'Content history')}</h3>
                <button type="button" class="reader-close" id="cbr-close" aria-label="Close">✕</button>
            </header>
            <div class="cbr-toolbar">
                <button type="button" class="btn btn-primary cbr-toolbar-btn" id="cbr-snapshot">Snapshot now</button>
                <button type="button" class="btn btn-ghost cbr-toolbar-btn" id="cbr-delete">Delete selected</button>
                <button type="button" class="btn btn-ghost cbr-toolbar-btn" id="cbr-refresh">Refresh</button>
                <span id="cbr-status" class="cbr-status"></span>
            </div>
            <div class="cbr-grid">
                <div id="cbr-list" class="cbr-list"></div>
                <div id="cbr-preview" class="cbr-preview">
                    <p class="desk-revisions-preview-placeholder">Select a revision to preview.</p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const statusEl = overlay.querySelector('#cbr-status');
    const listEl = overlay.querySelector('#cbr-list');
    const previewEl = overlay.querySelector('#cbr-preview');
    let rows = [];
    let selectedId = null;

    function setStatus(msg, isError = false) {
        if (!statusEl) return;
        statusEl.textContent = msg || '';
        statusEl.style.color = isError ? 'var(--c-danger)' : 'var(--c-muted)';
    }

    function close() {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
    }

    function onKey(e) {
        if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);

    overlay.querySelector('#cbr-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    async function loadList() {
        setStatus('Loading…');
        try {
            const q = selectorQuery(selector);
            const data = await api('GET', `/api/system/content-bank-revisions?${q}`);
            rows = Array.isArray(data?.revisions) ? data.revisions : [];
            setStatus(`${rows.length} / ${data?.limit || 50} versions`);
            renderList();
            if (selectedId && rows.some((r) => r.id === selectedId)) {
                await showPreview(selectedId);
            } else {
                selectedId = null;
                if (previewEl) {
                    previewEl.innerHTML = '<p class="desk-revisions-preview-placeholder">Select a revision to preview.</p>';
                }
            }
        } catch (err) {
            setStatus(err.message || 'Load failed', true);
            if (listEl) listEl.innerHTML = `<p class="desk-revisions-preview-placeholder">${esc(err.message || 'Load failed')}</p>`;
        }
    }

    function renderList() {
        if (!listEl) return;
        if (!rows.length) {
            listEl.innerHTML = '<p class="desk-revisions-preview-placeholder">No history yet. Saves create versions automatically.</p>';
            return;
        }
        listEl.innerHTML = rows.map((r) => {
            const selected = r.id === selectedId ? ' cbr-card--selected' : '';
            const who = r.actor?.email || r.actor?.uid || 'unknown';
            return `
                <div class="card cbr-card${selected}" data-id="${esc(r.id)}">
                    <label class="cbr-card-check">
                        <input type="checkbox" class="cbr-row-check" data-id="${esc(r.id)}" />
                    </label>
                    <button type="button" class="cbr-card-main" data-id="${esc(r.id)}">
                        <div class="cbr-card-title">${esc(formatUiDateTime(r.createdAt) || r.createdAt || '')}</div>
                        <div class="cbr-card-meta">${esc(triggerLabel(r.trigger))} · ${esc(who)}</div>
                        <div class="cbr-card-summary">${esc(summaryLine(r))}</div>
                    </button>
                    <button type="button" class="btn btn-ghost cbr-restore-btn" data-id="${esc(r.id)}">Restore</button>
                </div>
            `;
        }).join('');
    }

    function previewMarkdown(record) {
        const payload = record?.payload || {};
        const lines = [];
        lines.push(`# ${triggerLabel(record.trigger)} · ${formatUiDateTime(record.createdAt) || record.createdAt || ''}`);
        lines.push(`Actor: ${record.actor?.email || record.actor?.uid || 'unknown'}`);
        if (record.note) lines.push(`Note: ${record.note}`);
        lines.push('');
        if (payload.kind === 'smb') {
            const qs = Array.isArray(payload.content?.questions) ? payload.content.questions : [];
            lines.push(`## Start My Book (${payload.scope || 'gate'})`);
            if (payload.bookType) lines.push(`Book type: ${payload.bookType}`);
            if (payload.situationKey) lines.push(`Situation: ${payload.situationKey}`);
            lines.push('');
            if (!qs.length) {
                lines.push('_No questions._');
            } else {
                qs.forEach((q, i) => {
                    lines.push(`### ${i + 1}. ${q.id || 'question'}`);
                    lines.push(String(q.text || q.question || '').trim() || '_Empty_');
                    lines.push('');
                });
            }
        } else {
            const assignments = Array.isArray(payload.assignmentConfig?.assignments)
                ? payload.assignmentConfig.assignments
                : [];
            const cq = payload.chapterQuestions && typeof payload.chapterQuestions === 'object'
                ? payload.chapterQuestions
                : {};
            lines.push('## Assignment Editor');
            if (payload.bookType) lines.push(`Book type: ${payload.bookType}`);
            if (payload.situationKey) lines.push(`Situation: ${payload.situationKey}`);
            lines.push('');
            lines.push('### Assignments');
            if (!assignments.length) {
                lines.push('_None._');
            } else {
                for (const a of assignments) {
                    lines.push(`- **${a.num}**: ${a.label || '(untitled)'}${a.description ? ` — ${a.description}` : ''}`);
                }
            }
            lines.push('');
            lines.push('### Questions by bucket');
            const keys = Object.keys(cq).sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b)));
            if (!keys.length) {
                lines.push('_No chapter questions._');
            } else {
                for (const key of keys) {
                    const items = Array.isArray(cq[key]) ? cq[key] : Object.values(cq[key] || {});
                    lines.push(`#### Bucket ${key} (${items.length})`);
                    items.forEach((q, i) => {
                        lines.push(`${i + 1}. \`${q.id || '?'}\` ${String(q.text || q.question || '').trim()}`);
                    });
                    lines.push('');
                }
            }
        }
        return lines.join('\n');
    }

    async function showPreview(id) {
        selectedId = id;
        renderList();
        if (!previewEl) return;
        previewEl.innerHTML = '<p class="desk-revisions-preview-placeholder">Loading preview…</p>';
        try {
            const q = selectorQuery(selector);
            const record = await api('GET', `/api/system/content-bank-revisions/${encodeURIComponent(id)}?${q}`);
            const md = previewMarkdown(record);
            previewEl.innerHTML = `<pre class="cbr-preview-pre">${esc(md)}</pre>`;
        } catch (err) {
            previewEl.innerHTML = `<p class="desk-revisions-preview-placeholder">${esc(err.message || 'Preview failed')}</p>`;
        }
    }

    listEl?.addEventListener('click', async (e) => {
        const restoreBtn = e.target.closest('.cbr-restore-btn');
        if (restoreBtn) {
            const id = restoreBtn.getAttribute('data-id');
            if (!id) return;
            if (!window.confirm('Restore this version? Current live content will be snapshotted first.')) return;
            setStatus('Restoring…');
            try {
                const q = selectorQuery(selector);
                await api('POST', `/api/system/content-bank-revisions/${encodeURIComponent(id)}/restore?${q}`, {
                    ...selector,
                });
                setStatus('Restored.');
                if (typeof opts.onRestored === 'function') await opts.onRestored();
                await loadList();
            } catch (err) {
                setStatus(err.message || 'Restore failed', true);
            }
            return;
        }
        const main = e.target.closest('.cbr-card-main');
        if (main) {
            const id = main.getAttribute('data-id');
            if (id) await showPreview(id);
        }
    });

    overlay.querySelector('#cbr-refresh')?.addEventListener('click', () => loadList());
    overlay.querySelector('#cbr-snapshot')?.addEventListener('click', async () => {
        setStatus('Creating snapshot…');
        try {
            await api('POST', '/api/system/content-bank-revisions', {
                ...selector,
                note: 'Manual snapshot',
            });
            setStatus('Snapshot saved.');
            await loadList();
        } catch (err) {
            setStatus(err.message || 'Snapshot failed', true);
        }
    });
    overlay.querySelector('#cbr-delete')?.addEventListener('click', async () => {
        const ids = Array.from(overlay.querySelectorAll('.cbr-row-check:checked'))
            .map((el) => el.getAttribute('data-id'))
            .filter(Boolean);
        if (!ids.length) {
            setStatus('Select revisions to delete.', true);
            return;
        }
        if (!window.confirm(`Delete ${ids.length} revision${ids.length === 1 ? '' : 's'}?`)) return;
        setStatus('Deleting…');
        try {
            await api('DELETE', '/api/system/content-bank-revisions', {
                ...selector,
                ids,
            });
            if (ids.includes(selectedId)) selectedId = null;
            setStatus('Deleted.');
            await loadList();
        } catch (err) {
            setStatus(err.message || 'Delete failed', true);
        }
    });

    loadList();
    return { close, reload: loadList };
}
