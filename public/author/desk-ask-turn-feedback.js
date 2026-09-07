'use strict';

/**
 * Admin Desk — Ask Feedback (Ask WMB turn thumbs triage).
 */

import { adminApi as api } from '../admin-desk-api.js';
import { esc } from './ui-helpers.js';
import { ISSUE_CATEGORY_LABELS, DISPOSITION_LABELS } from './ask-turn-feedback-labels.js';

let _renderMyDeskList = null;
let _setMyDeskWorkspaceMode = null;
let _returnToAdminDeskHome = null;

/** @type {object[]} */
let lastItems = [];
let openFeedbackId = '';

const DISPOSITIONS = Object.keys(DISPOSITION_LABELS);

function utcDayString(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function shiftUtcDay(day, deltaDays) {
    const ms = Date.parse(`${day}T00:00:00.000Z`);
    if (!Number.isFinite(ms)) return utcDayString();
    return new Date(ms + (deltaDays * 86400000)).toISOString().slice(0, 10);
}

function truncate(value, max = 80) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatAgentText(item) {
    return [
        '# Write My Book Ask Feedback',
        '',
        `Feedback ID: ${item?.id || '—'}`,
        `Rating: ${item?.rating || '—'}`,
        `Issue category: ${item?.issueCategory || '—'}`,
        `Created (UTC): ${item?.createdAt || '—'}`,
        `Actor: ${item?.actorUserId || '—'}`,
        `Project: ${item?.context?.projectId || '—'}`,
        `Conversation: ${item?.conversationId || '—'}`,
        `Turn: ${item?.turnId || '—'}`,
        `Request: ${item?.requestId || '—'}`,
        `Capability: ${item?.interpretation?.selectedCapability || '—'}`,
        `Route type: ${item?.interpretation?.routeType || '—'}`,
        `Review: ${item?.review?.status || '—'} / ${item?.review?.disposition || '—'}`,
        '',
        'User ask:',
        item?.originalUserText || '—',
        '',
        'User explanation:',
        item?.userExplanation || '—',
        '',
        'Assistant response:',
        item?.response?.textSnapshot || '—',
        '',
        'Execution:',
        JSON.stringify(item?.execution || {}, null, 2),
        '',
        'Interpretation:',
        JSON.stringify(item?.interpretation || {}, null, 2),
        '',
        'Routing trace:',
        JSON.stringify(item?.routingTrace || [], null, 2),
        '',
        'Context:',
        JSON.stringify(item?.context || {}, null, 2),
    ].join('\n');
}

function dispositionOptionsHtml(selected) {
    const current = String(selected || '');
    return ['<option value="">—</option>'].concat(
        DISPOSITIONS.map((value) => (
            `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(DISPOSITION_LABELS[value] || value)}</option>`
        )),
    ).join('');
}

function matchesFilters(item, filters) {
    const rating = String(filters.rating || '').trim().toLowerCase();
    if (rating && String(item?.rating || '').toLowerCase() !== rating) return false;
    const category = String(filters.category || '').trim().toLowerCase();
    if (category && String(item?.issueCategory || '').toLowerCase() !== category) return false;
    const review = String(filters.review || '').trim().toLowerCase();
    if (review && String(item?.review?.status || '').toLowerCase() !== review) return false;
    const disposition = String(filters.disposition || '').trim().toLowerCase();
    if (disposition && String(item?.review?.disposition || '').toLowerCase() !== disposition) return false;
    const capabilityNeedle = String(filters.capability || '').trim().toLowerCase();
    const capability = String(item?.interpretation?.selectedCapability || '').toLowerCase();
    if (capabilityNeedle && !capability.includes(capabilityNeedle)) return false;
    const search = String(filters.search || '').trim().toLowerCase();
    if (!search) return true;
    const haystack = [
        item?.id,
        item?.actorUserId,
        item?.turnId,
        item?.conversationId,
        item?.requestId,
        item?.originalUserText,
        item?.userExplanation,
        item?.response?.textSnapshot,
        item?.interpretation?.selectedCapability,
        item?.issueCategory,
        item?.review?.disposition,
        item?.review?.reviewerNotes,
        item?.context?.projectId,
    ].map((value) => String(value || '').toLowerCase()).join(' ');
    return haystack.includes(search);
}

function readFilters(root) {
    return {
        rating: root.querySelector('#ask-fb-filter-rating')?.value || '',
        category: root.querySelector('#ask-fb-filter-category')?.value || '',
        review: root.querySelector('#ask-fb-filter-review')?.value || '',
        disposition: root.querySelector('#ask-fb-filter-disposition')?.value || '',
        capability: root.querySelector('#ask-fb-filter-capability')?.value || '',
        search: root.querySelector('#ask-fb-filter-search')?.value || '',
    };
}

function renderDetail(item) {
    const review = item?.review || {};
    const params = item?.interpretation?.extractedParameters || {};
    return `
        <div class="ask-fb-detail-grid">
            <div class="ask-fb-detail-block">
                <h4>User ask</h4>
                <p>${esc(item?.originalUserText || '—')}</p>
            </div>
            <div class="ask-fb-detail-block">
                <h4>Explanation</h4>
                <p>${esc(item?.userExplanation || '—')}</p>
            </div>
            <div class="ask-fb-detail-block">
                <h4>Assistant response</h4>
                <p>${esc(item?.response?.textSnapshot || '—')}</p>
            </div>
            <div class="ask-fb-detail-block">
                <h4>Capability / route</h4>
                <p>${esc(item?.interpretation?.selectedCapability || '—')} · ${esc(item?.interpretation?.routeType || '—')}</p>
            </div>
            <div class="ask-fb-detail-block">
                <h4>Ids</h4>
                <p class="ask-fb-mono">${esc(item?.id || '')}<br>${esc(item?.actorUserId || '')}<br>${esc(item?.turnId || '')}<br>${esc(item?.conversationId || '')}<br>${esc(item?.context?.projectId || '')}</p>
            </div>
            <div class="ask-fb-detail-block">
                <h4>Parameters</h4>
                <pre>${esc(JSON.stringify(params, null, 2))}</pre>
            </div>
            <div class="ask-fb-detail-block">
                <h4>Execution</h4>
                <pre>${esc(JSON.stringify(item?.execution || {}, null, 2))}</pre>
            </div>
            <div class="ask-fb-detail-block">
                <h4>Context / versions</h4>
                <pre>${esc(JSON.stringify({ context: item?.context || {}, versions: item?.versions || {} }, null, 2))}</pre>
            </div>
        </div>
        <form class="ask-fb-review-form" data-review-form="${esc(item?.id || '')}">
            <label>
                <span>Disposition</span>
                <select name="disposition">${dispositionOptionsHtml(review.disposition)}</select>
            </label>
            <label>
                <span>Reviewer notes</span>
                <textarea name="reviewerNotes" rows="3" maxlength="500">${esc(review.reviewerNotes || '')}</textarea>
            </label>
            <div class="ask-fb-review-actions">
                <button type="submit" class="btn btn-primary" data-review-action="reviewed">Mark reviewed</button>
                <button type="button" class="btn btn-secondary" data-review-action="unreviewed">Mark unreviewed</button>
                <p class="ask-fb-review-status">
                    ${esc(review.status || 'unreviewed')}
                    ${review.reviewedBy ? ` · by ${esc(review.reviewedBy)}` : ''}
                    ${review.reviewedAt ? ` · ${esc(review.reviewedAt)}` : ''}
                </p>
            </div>
        </form>
    `;
}

function renderList(root) {
    const contentEl = root.querySelector('#ask-fb-content');
    const statusEl = root.querySelector('#ask-fb-status');
    if (!contentEl) return;
    const filters = readFilters(root);
    const filtered = lastItems.filter((item) => matchesFilters(item, filters));
    if (!lastItems.length) {
        contentEl.innerHTML = '<div class="ask-fb-empty">No feedback in this window. Choose a day range and click Load feedback.</div>';
        if (statusEl) statusEl.textContent = 'Loaded 0 feedback records.';
        return;
    }
    if (!filtered.length) {
        contentEl.innerHTML = '<div class="ask-fb-empty">No feedback matches the current filters.</div>';
        if (statusEl) statusEl.textContent = `Showing 0 of ${lastItems.length} loaded.`;
        return;
    }
    contentEl.innerHTML = `<div class="ask-fb-list">${filtered.map((item) => {
        const isOpen = openFeedbackId === item.id;
        const reviewStatus = item?.review?.status === 'reviewed' ? 'reviewed' : 'unreviewed';
        const preview = truncate(item.originalUserText || item.userExplanation || item.response?.textSnapshot || item.id);
        return `
            <article class="ask-fb-card${isOpen ? ' is-open' : ''}" data-feedback-id="${esc(item.id)}">
                <div class="ask-fb-card-header">
                    <button type="button" class="ask-fb-card-row" aria-expanded="${isOpen ? 'true' : 'false'}">
                        <span class="ask-fb-card-message">
                            <span class="ask-fb-badge ask-fb-badge--${esc(item.rating || 'down')}">${esc(item.rating || '?')}</span>
                            <span class="ask-fb-badge ask-fb-badge--${reviewStatus}">${esc(reviewStatus)}</span>
                            ${esc(preview)}
                        </span>
                        <span class="ask-fb-card-meta">${esc(ISSUE_CATEGORY_LABELS[item.issueCategory] || item.issueCategory || '—')}</span>
                        <span class="ask-fb-card-meta">${esc(truncate(item.interpretation?.selectedCapability || '—', 22))}</span>
                        <span class="ask-fb-card-meta">${esc((item.createdAt || '').slice(11, 19) || '—')}</span>
                    </button>
                    <button type="button" class="btn btn-secondary ask-fb-copy" data-copy-id="${esc(item.id)}">Copy</button>
                </div>
                <div class="ask-fb-card-details" ${isOpen ? '' : 'hidden'}>
                    ${isOpen ? renderDetail(item) : ''}
                </div>
            </article>
        `;
    }).join('')}</div>`;
    if (statusEl) statusEl.textContent = `Showing ${filtered.length} of ${lastItems.length} loaded.`;
}

async function loadFeedback(root) {
    const startDay = String(root.querySelector('#ask-fb-start-day')?.value || '').trim();
    const endDay = String(root.querySelector('#ask-fb-end-day')?.value || '').trim();
    const statusEl = root.querySelector('#ask-fb-status');
    const loadBtn = root.querySelector('#ask-fb-load');
    if (!startDay || !endDay) {
        if (statusEl) statusEl.textContent = 'Choose start and end days (UTC).';
        return;
    }
    const params = new URLSearchParams({ startDay, endDay, limit: '200' });
    const rating = String(root.querySelector('#ask-fb-server-rating')?.value || '').trim();
    if (rating) params.set('rating', rating);
    const reviewStatus = String(root.querySelector('#ask-fb-server-review')?.value || '').trim();
    if (reviewStatus) params.set('reviewStatus', reviewStatus);
    if (loadBtn) loadBtn.disabled = true;
    if (statusEl) statusEl.textContent = 'Loading feedback…';
    try {
        const payload = await api('GET', `/api/system/ask-turn-feedback?${params.toString()}`);
        lastItems = Array.isArray(payload?.items) ? payload.items : [];
        openFeedbackId = '';
        const filtersPanel = root.querySelector('#ask-fb-filters-panel');
        if (filtersPanel) filtersPanel.hidden = false;
        renderList(root);
    } catch (error) {
        if (statusEl) statusEl.textContent = error?.message || 'Failed to load feedback.';
        console.warn('[desk-ask-turn-feedback] load failed', error);
    } finally {
        if (loadBtn) loadBtn.disabled = false;
    }
}

async function saveReview(root, item, { status, disposition, reviewerNotes }) {
    const payload = await api('PATCH', '/api/system/ask-turn-feedback/item', {
        actorUserId: item.actorUserId,
        feedbackId: item.id,
        status,
        disposition: disposition || null,
        reviewerNotes: reviewerNotes || null,
    });
    const updated = payload?.item;
    if (!updated) throw new Error('Review save returned no item');
    lastItems = lastItems.map((entry) => (entry.id === updated.id ? updated : entry));
    openFeedbackId = updated.id;
    renderList(root);
    const statusEl = root.querySelector('#ask-fb-status');
    if (statusEl) statusEl.textContent = `Saved review for ${updated.id}.`;
}

function applyPreset(root, preset) {
    const today = utcDayString();
    const startEl = root.querySelector('#ask-fb-start-day');
    const endEl = root.querySelector('#ask-fb-end-day');
    if (preset === '7d') {
        if (startEl) startEl.value = shiftUtcDay(today, -6);
        if (endEl) endEl.value = today;
        return;
    }
    if (startEl) startEl.value = today;
    if (endEl) endEl.value = today;
}

function wirePanel(root) {
    applyPreset(root, 'today');
    const ratingEl = root.querySelector('#ask-fb-server-rating');
    if (ratingEl) ratingEl.value = 'down';

    root.querySelector('#my-desk-ask-fb-close')?.addEventListener('click', () => {
        _returnToAdminDeskHome?.();
    });
    root.querySelector('#ask-fb-preset-today')?.addEventListener('click', () => applyPreset(root, 'today'));
    root.querySelector('#ask-fb-preset-7d')?.addEventListener('click', () => applyPreset(root, '7d'));
    root.querySelector('#ask-fb-load')?.addEventListener('click', () => {
        void loadFeedback(root);
    });
    [
        '#ask-fb-filter-search',
        '#ask-fb-filter-rating',
        '#ask-fb-filter-category',
        '#ask-fb-filter-review',
        '#ask-fb-filter-disposition',
        '#ask-fb-filter-capability',
    ].forEach((selector) => {
        root.querySelector(selector)?.addEventListener('input', () => renderList(root));
        root.querySelector(selector)?.addEventListener('change', () => renderList(root));
    });

    root.querySelector('#ask-fb-content')?.addEventListener('click', (event) => {
        const copyBtn = event.target.closest('[data-copy-id]');
        if (copyBtn) {
            const id = copyBtn.getAttribute('data-copy-id');
            const item = lastItems.find((entry) => entry.id === id);
            if (!item) return;
            void navigator.clipboard.writeText(formatAgentText(item)).then(() => {
                copyBtn.textContent = 'Copied';
                setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1600);
            }).catch((error) => {
                const statusEl = root.querySelector('#ask-fb-status');
                if (statusEl) statusEl.textContent = `Could not copy: ${error.message || error}`;
            });
            return;
        }
        const row = event.target.closest('.ask-fb-card-row');
        if (row) {
            const card = row.closest('[data-feedback-id]');
            const id = card?.getAttribute('data-feedback-id') || '';
            openFeedbackId = openFeedbackId === id ? '' : id;
            renderList(root);
        }
    });

    root.querySelector('#ask-fb-content')?.addEventListener('submit', (event) => {
        const form = event.target.closest('[data-review-form]');
        if (!form) return;
        event.preventDefault();
        const id = form.getAttribute('data-review-form');
        const item = lastItems.find((entry) => entry.id === id);
        if (!item) return;
        const disposition = form.querySelector('[name="disposition"]')?.value || '';
        const reviewerNotes = form.querySelector('[name="reviewerNotes"]')?.value || '';
        void saveReview(root, item, {
            status: 'reviewed',
            disposition,
            reviewerNotes,
        }).catch((error) => {
            const statusEl = root.querySelector('#ask-fb-status');
            if (statusEl) statusEl.textContent = error?.message || 'Failed to save review.';
        });
    });

    root.querySelector('#ask-fb-content')?.addEventListener('click', (event) => {
        const unreviewedBtn = event.target.closest('[data-review-action="unreviewed"]');
        if (!unreviewedBtn) return;
        const form = unreviewedBtn.closest('[data-review-form]');
        const id = form?.getAttribute('data-review-form');
        const item = lastItems.find((entry) => entry.id === id);
        if (!item) return;
        void saveReview(root, item, {
            status: 'unreviewed',
            disposition: null,
            reviewerNotes: '',
        }).catch((error) => {
            const statusEl = root.querySelector('#ask-fb-status');
            if (statusEl) statusEl.textContent = error?.message || 'Failed to save review.';
        });
    });

    void loadFeedback(root);
}

export async function launchAskTurnFeedbackPanel(deps) {
    const {
        renderMyDeskList: renderMyDeskListDep,
        setMyDeskWorkspaceMode: setMyDeskWorkspaceModeDep,
        returnToAdminDeskHome: returnToAdminDeskHomeDep,
    } = deps || {};
    if (typeof renderMyDeskListDep !== 'function'
        || typeof setMyDeskWorkspaceModeDep !== 'function'
        || typeof returnToAdminDeskHomeDep !== 'function') {
        throw new Error('launchAskTurnFeedbackPanel requires desk host deps');
    }
    _renderMyDeskList = renderMyDeskListDep;
    _setMyDeskWorkspaceMode = setMyDeskWorkspaceModeDep;
    _returnToAdminDeskHome = returnToAdminDeskHomeDep;

    const emptyEl = document.getElementById('my-desk-empty');
    const editorEl = document.getElementById('my-desk-editor');
    const comingSoon = document.getElementById('my-desk-coming-soon');
    if (!emptyEl) return;

    lastItems = [];
    openFeedbackId = '';

    _renderMyDeskList();
    if (comingSoon) comingSoon.classList.add('hidden');
    if (editorEl) editorEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    emptyEl.classList.add('book-audit-host');
    _setMyDeskWorkspaceMode(true);

    const categoryOptions = Object.entries(ISSUE_CATEGORY_LABELS)
        .map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`)
        .join('');
    const dispositionFilterOptions = DISPOSITIONS
        .map((id) => `<option value="${esc(id)}">${esc(DISPOSITION_LABELS[id] || id)}</option>`)
        .join('');

    emptyEl.innerHTML = `
        <div class="desk-workspace-shell desk-workspace-shell--ask-feedback">
            <header class="desk-workspace-head">
                <h3>Ask Feedback</h3>
                <button id="my-desk-ask-fb-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <div class="desk-workspace-body desk-settings-body-wrap ask-fb-body">
                <p class="desk-workspace-intro">Triage thumbs feedback on Ask WMB answers. Default server filter is thumbs-down. UTC day window max 7 days.</p>
                <div class="ask-fb-panel">
                    <div class="ask-fb-window-grid">
                        <label>
                            <span>Start day (UTC)</span>
                            <input type="date" id="ask-fb-start-day" />
                        </label>
                        <label>
                            <span>End day (UTC)</span>
                            <input type="date" id="ask-fb-end-day" />
                        </label>
                        <label>
                            <span>Server rating</span>
                            <select id="ask-fb-server-rating">
                                <option value="">All</option>
                                <option value="down">Down</option>
                                <option value="up">Up</option>
                            </select>
                        </label>
                        <label>
                            <span>Server review</span>
                            <select id="ask-fb-server-review">
                                <option value="">All</option>
                                <option value="unreviewed">Unreviewed</option>
                                <option value="reviewed">Reviewed</option>
                            </select>
                        </label>
                    </div>
                    <div class="ask-fb-actions">
                        <button type="button" class="btn btn-secondary" id="ask-fb-preset-today">Today</button>
                        <button type="button" class="btn btn-secondary" id="ask-fb-preset-7d">Last 7 days</button>
                        <button type="button" class="btn btn-primary" id="ask-fb-load">Load feedback</button>
                    </div>
                    <p id="ask-fb-status" class="ask-fb-status" role="status"></p>
                </div>
                <div id="ask-fb-filters-panel" class="ask-fb-panel" hidden>
                    <div class="ask-fb-window-grid">
                        <label class="ask-fb-field-wide">
                            <span>Search</span>
                            <input type="search" id="ask-fb-filter-search" placeholder="Ask text, capability, ids…" />
                        </label>
                        <label>
                            <span>Rating</span>
                            <select id="ask-fb-filter-rating">
                                <option value="">All</option>
                                <option value="down">Down</option>
                                <option value="up">Up</option>
                            </select>
                        </label>
                        <label>
                            <span>Category</span>
                            <select id="ask-fb-filter-category">
                                <option value="">All</option>
                                ${categoryOptions}
                            </select>
                        </label>
                        <label>
                            <span>Review</span>
                            <select id="ask-fb-filter-review">
                                <option value="">All</option>
                                <option value="unreviewed">Unreviewed</option>
                                <option value="reviewed">Reviewed</option>
                            </select>
                        </label>
                        <label>
                            <span>Disposition</span>
                            <select id="ask-fb-filter-disposition">
                                <option value="">All</option>
                                ${dispositionFilterOptions}
                            </select>
                        </label>
                        <label>
                            <span>Capability contains</span>
                            <input type="search" id="ask-fb-filter-capability" placeholder="e.g. open_chapter" />
                        </label>
                    </div>
                </div>
                <div id="ask-fb-content"></div>
            </div>
        </div>
    `;

    wirePanel(emptyEl);
}
