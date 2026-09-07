'use strict';

import { formatUiDateTime } from '../../platform/client/ui/datetime-format.js';

const ACTIVE_JOB_STATES = new Set(['queued', 'leased', 'retry_wait']);

function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function titleCase(value) {
    return cleanText(value)
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatWhen(value) {
    return formatUiDateTime(value) || '—';
}

function collectLists(container, scope, scopeLabel, output) {
    for (const [group, value] of Object.entries(container || {})) {
        if (!Array.isArray(value)) continue;
        for (const item of value) {
            if (!item || typeof item !== 'object') continue;
            if (!item.id && !item.text) continue;
            output.push({
                ...item,
                scope,
                scopeLabel,
                group,
                groupLabel: titleCase(group),
            });
        }
    }
}

export function flattenInterviewPreparationItems(preparation) {
    const items = [];
    collectLists(preparation?.spine, 'spine', 'Project spine', items);
    const overlays = Object.entries(preparation?.overlays || {})
        .sort(([left], [right]) => Number(left) - Number(right));
    for (const [assignmentNum, overlay] of overlays) {
        collectLists(
            overlay,
            `assignment:${assignmentNum}`,
            `Assignment ${assignmentNum}`,
            items,
        );
    }
    return items;
}

export function summarizeInterviewPreparation(payload = {}) {
    const preparation = payload.preparation || null;
    const job = payload.job || null;
    const items = flattenInterviewPreparationItems(preparation);
    const overlays = Object.keys(preparation?.overlays || {});
    const dirtyEvents = preparation?.dirty?.events || {};
    return {
        exists: Boolean(preparation?.schemaVersion),
        freshness: cleanText(preparation?.meta?.freshness || 'missing'),
        runtimeEligibility: cleanText(preparation?.meta?.runtimeEligibility || 'unknown'),
        generationStatus: cleanText(preparation?.generation?.status || 'missing'),
        jobStatus: cleanText(job?.status || 'none'),
        jobActive: ACTIVE_JOB_STATES.has(cleanText(job?.status)),
        itemCount: items.length,
        overlayCount: overlays.length,
        dirtyCount: Object.keys(dirtyEvents).length,
        version: Number(preparation?.meta?.version || 0),
        generatedAt: preparation?.meta?.generatedAt || '',
    };
}

export function describeRegenerationOutcome(payload = {}) {
    const summary = summarizeInterviewPreparation(payload);
    if (summary.jobActive) {
        return {
            message: 'Regeneration is still running. Reload to check again.',
            error: false,
        };
    }
    if (summary.jobStatus === 'dead') {
        return {
            message: cleanText(payload.job?.lastError) || 'Preparation regeneration failed.',
            error: true,
        };
    }
    if (summary.jobStatus === 'cancelled') {
        return { message: 'Regeneration was cancelled.', error: true };
    }
    return { message: 'Preparation refreshed.', error: false };
}

function badgeHtml(esc, label, value, tone = '') {
    const text = cleanText(value);
    if (!text) return '';
    return `<span class="desk-prep-badge${tone ? ` desk-prep-badge--${tone}` : ''}">${esc(label)}: ${esc(text)}</span>`;
}

function statusTone(value) {
    const status = cleanText(value).toLowerCase();
    if (['complete', 'current', 'usable', 'ready'].includes(status)) return 'ok';
    if (['dead', 'error', 'invalid', 'cancelled'].includes(status)) return 'error';
    if (['queued', 'leased', 'retry_wait', 'running', 'stale', 'restricted'].includes(status)) {
        return 'warn';
    }
    return 'muted';
}

/**
 * Admin Desk visual inspector for one project's Interview Preparation.
 * @param {{ api: Function, esc: Function, onClose: () => void, projectTitle?: string }} opts
 */
export async function launchInterviewPreparationInspector(opts) {
    const {
        api,
        esc,
        onClose,
        projectTitle = '',
    } = opts || {};
    if (typeof api !== 'function' || typeof esc !== 'function' || typeof onClose !== 'function') {
        throw new Error('Interview Preparation inspector requires api, esc, and onClose');
    }

    const emptyEl = document.getElementById('my-desk-empty');
    const editorEl = document.getElementById('my-desk-editor');
    const comingSoon = document.getElementById('my-desk-coming-soon');
    if (!emptyEl) return;

    if (comingSoon) comingSoon.classList.add('hidden');
    if (editorEl) editorEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    emptyEl.classList.add('book-audit-host');
    emptyEl.innerHTML = `
        <div class="desk-workspace-shell desk-workspace-shell--preparation">
            <header class="desk-workspace-head">
                <div>
                    <h3>Interview Preparation</h3>
                    <p class="desk-prep-subtitle">${esc(projectTitle || 'Current book')}</p>
                </div>
                <button id="desk-prep-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <div class="desk-workspace-body desk-prep-body">
                <div class="desk-prep-toolbar">
                    <div>
                        <button class="btn btn-ghost" id="desk-prep-reload" type="button">Reload</button>
                        <button class="btn btn-primary" id="desk-prep-regenerate" type="button">Regenerate preparation</button>
                    </div>
                    <span id="desk-prep-status" class="desk-prep-toolbar-status" role="status"></span>
                </div>
                <div id="desk-prep-overview" class="desk-prep-overview" aria-live="polite"></div>
                <div class="desk-prep-filters">
                    <input id="desk-prep-search" class="auth-field" type="search" placeholder="Search claims, gaps, conflicts, IDs, or provenance…" />
                    <select id="desk-prep-scope" class="auth-field" aria-label="Preparation scope">
                        <option value="all">All scopes</option>
                    </select>
                </div>
                <div id="desk-prep-items" class="desk-prep-items"></div>
                <details class="desk-prep-diagnostics">
                    <summary>Generation and job diagnostics</summary>
                    <div id="desk-prep-diagnostics-body"></div>
                </details>
            </div>
        </div>
    `;

    let payload = {};
    let disposed = false;
    let regenerating = false;
    let activeJobPollTimer = null;
    const statusEl = document.getElementById('desk-prep-status');
    const overviewEl = document.getElementById('desk-prep-overview');
    const itemsEl = document.getElementById('desk-prep-items');
    const diagnosticsEl = document.getElementById('desk-prep-diagnostics-body');
    const searchEl = document.getElementById('desk-prep-search');
    const scopeEl = document.getElementById('desk-prep-scope');
    const regenerateBtn = document.getElementById('desk-prep-regenerate');

    const setStatus = (message, { error = false } = {}) => {
        if (!statusEl) return;
        statusEl.textContent = message || '';
        statusEl.classList.toggle('desk-prep-toolbar-status--error', error);
    };

    const renderOverview = () => {
        if (!overviewEl) return;
        const summary = summarizeInterviewPreparation(payload);
        const preparation = payload.preparation || {};
        const counts = payload.counts || {};
        const cards = [
            ['Freshness', summary.freshness, statusTone(summary.freshness)],
            ['Runtime', summary.runtimeEligibility, statusTone(summary.runtimeEligibility)],
            ['Generation', summary.generationStatus, statusTone(summary.generationStatus)],
            ['Job', summary.jobStatus, statusTone(summary.jobStatus)],
            ['Items', String(summary.itemCount), 'muted'],
            ['Overlays', String(summary.overlayCount), 'muted'],
            ['Dirty events', String(summary.dirtyCount), summary.dirtyCount ? 'warn' : 'ok'],
            ['Sources / Material', `${Number(counts.sources || 0)} / ${Number(counts.material || 0)}`, 'muted'],
        ];
        overviewEl.innerHTML = `
            <div class="desk-prep-health-grid">
                ${cards.map(([label, value, tone]) => `
                    <div class="desk-prep-health-card desk-prep-health-card--${tone}">
                        <span>${esc(label)}</span>
                        <strong>${esc(value)}</strong>
                    </div>
                `).join('')}
            </div>
            <p class="desk-prep-generated">
                Version ${esc(String(summary.version || '—'))}
                · generated ${esc(formatWhen(summary.generatedAt))}
                ${preparation?.meta?.confidence ? `· confidence ${esc(preparation.meta.confidence)}` : ''}
            </p>
        `;
    };

    const renderScopeOptions = () => {
        if (!scopeEl) return;
        const current = scopeEl.value || 'all';
        const assignments = Object.keys(payload.preparation?.overlays || {})
            .sort((left, right) => Number(left) - Number(right));
        scopeEl.innerHTML = `
            <option value="all">All scopes</option>
            <option value="spine">Project spine</option>
            ${assignments.map((num) => (
        `<option value="assignment:${esc(num)}">Assignment ${esc(num)}</option>`
    )).join('')}
        `;
        scopeEl.value = [...scopeEl.options].some((option) => option.value === current)
            ? current
            : 'all';
    };

    const renderItems = () => {
        if (!itemsEl) return;
        const allItems = flattenInterviewPreparationItems(payload.preparation);
        const query = cleanText(searchEl?.value).toLowerCase();
        const selectedScope = scopeEl?.value || 'all';
        const visible = allItems.filter((item) => {
            if (selectedScope !== 'all' && item.scope !== selectedScope) return false;
            if (!query) return true;
            const provenance = (item.provenance || [])
                .map((row) => `${row.type || ''} ${row.id || ''} ${row.version || ''}`)
                .join(' ');
            return [
                item.id,
                item.text,
                item.kind,
                item.group,
                item.scopeLabel,
                provenance,
            ].join(' ').toLowerCase().includes(query);
        });
        if (!visible.length) {
            itemsEl.innerHTML = `
                <p class="desk-prep-empty">${allItems.length
        ? 'No Preparation items match these filters.'
        : 'No inspectable Preparation items yet.'}</p>`;
            return;
        }
        itemsEl.innerHTML = visible.map((item) => {
            const restricted = !cleanText(item.text)
                || ['restricted', 'invalid'].includes(cleanText(item.runtimeEligibility));
            const provenance = Array.isArray(item.provenance) ? item.provenance : [];
            return `
                <details class="desk-prep-item">
                    <summary>
                        <span class="desk-prep-item-scope">${esc(item.scopeLabel)} · ${esc(item.groupLabel)}</span>
                        <span class="desk-prep-item-text">${esc(
        cleanText(item.text) || (restricted ? 'Restricted diagnostic item' : 'Untitled item'),
    )}</span>
                        <span class="desk-prep-item-badges">
                            ${badgeHtml(esc, 'kind', item.kind)}
                            ${badgeHtml(esc, 'eligibility', item.runtimeEligibility, statusTone(item.runtimeEligibility))}
                            ${badgeHtml(esc, 'confirmation', item.confirmation)}
                        </span>
                    </summary>
                    <div class="desk-prep-item-detail">
                        <dl>
                            <div><dt>Item ID</dt><dd><code>${esc(item.id || '—')}</code></dd></div>
                            <div><dt>Origin</dt><dd>${esc(item.origin || '—')}</dd></div>
                            <div><dt>Ownership</dt><dd>${esc(item.ownership || '—')}</dd></div>
                            <div><dt>Priority</dt><dd>${esc(item.priority || '—')}</dd></div>
                        </dl>
                        <div>
                            <h4>Provenance (${provenance.length})</h4>
                            ${provenance.length
        ? `<ul>${provenance.map((row) => `
                                    <li>${esc(row.type || 'evidence')}: <code>${esc(row.id || '—')}</code>${row.version ? ` · ${esc(row.version)}` : ''}</li>
                                `).join('')}</ul>`
        : '<p>No direct provenance recorded.</p>'}
                        </div>
                    </div>
                </details>
            `;
        }).join('');
    };

    const renderDiagnostics = () => {
        if (!diagnosticsEl) return;
        const preparation = payload.preparation || {};
        const generation = preparation.generation || {};
        const job = payload.job || {};
        const rows = [
            ['Prompt version', generation.promptVersion],
            ['Mode', generation.mode],
            ['Generation started', formatWhen(generation.startedAt)],
            ['Generation completed', formatWhen(generation.completedAt)],
            ['Input hash', preparation.meta?.inputHash],
            ['Job status', job.status],
            ['Job reason', job.reason],
            ['Attempt', job.attempt != null ? `${job.attempt} / ${job.maxAttempts || '—'}` : '—'],
            ['Next attempt', formatWhen(job.nextAttemptAt)],
            ['Lease owner', job.leaseOwner],
            ['Lease expires', formatWhen(job.leaseExpiresAt)],
        ];
        diagnosticsEl.innerHTML = `
            <dl class="desk-prep-diagnostic-list">
                ${rows.map(([label, value]) => `
                    <div><dt>${esc(label)}</dt><dd>${esc(value == null || value === '' ? '—' : String(value))}</dd></div>
                `).join('')}
            </dl>
            ${job.lastError || generation.error
        ? `<p class="desk-prep-error"><strong>Last error:</strong> ${esc(job.lastError || generation.error)}</p>`
        : ''}
        `;
    };

    const render = () => {
        renderOverview();
        renderScopeOptions();
        renderItems();
        renderDiagnostics();
        const summary = summarizeInterviewPreparation(payload);
        if (regenerateBtn) {
            regenerateBtn.disabled = regenerating || summary.jobActive;
            regenerateBtn.textContent = regenerating || summary.jobActive
                ? 'Regenerating…'
                : 'Regenerate preparation';
        }
    };

    const load = async ({ quiet = false } = {}) => {
        if (!quiet) setStatus('Loading…');
        try {
            payload = await api('GET', '/api/system/author/project/interview-preparation');
            if (disposed) return payload;
            render();
            if (activeJobPollTimer) clearTimeout(activeJobPollTimer);
            activeJobPollTimer = null;
            if (!regenerating && summarizeInterviewPreparation(payload).jobActive) {
                activeJobPollTimer = setTimeout(() => {
                    activeJobPollTimer = null;
                    load({ quiet: true }).catch(() => {});
                }, 1_500);
            }
            if (!quiet) {
                const total = flattenInterviewPreparationItems(payload.preparation).length;
                setStatus(`${total} Preparation item${total === 1 ? '' : 's'}`);
            }
            return payload;
        } catch (err) {
            if (!disposed) {
                setStatus(err.message || 'Could not load Interview Preparation.', { error: true });
                if (itemsEl) {
                    itemsEl.innerHTML = `<p class="desk-prep-empty">${esc(err.message || 'Load failed')}</p>`;
                }
            }
            throw err;
        }
    };

    const waitForJob = async () => {
        const startedAt = Date.now();
        while (!disposed && Date.now() - startedAt < 5 * 60 * 1000) {
            await new Promise((resolve) => setTimeout(resolve, 1_500));
            const next = await load({ quiet: true });
            if (!summarizeInterviewPreparation(next).jobActive) return next;
        }
        return payload;
    };

    document.getElementById('desk-prep-close')?.addEventListener('click', () => {
        disposed = true;
        if (activeJobPollTimer) clearTimeout(activeJobPollTimer);
        onClose();
    });
    document.getElementById('desk-prep-reload')?.addEventListener('click', () => {
        load().catch(() => {});
    });
    searchEl?.addEventListener('input', renderItems);
    scopeEl?.addEventListener('change', renderItems);
    regenerateBtn?.addEventListener('click', async () => {
        if (regenerating) return;
        regenerating = true;
        render();
        setStatus('Regeneration queued…');
        try {
            await api('POST', '/api/system/author/project/interview-preparation/refresh', { force: true });
            const latest = await waitForJob();
            if (!disposed) {
                const outcome = describeRegenerationOutcome(latest);
                setStatus(outcome.message, { error: outcome.error });
            }
        } catch (err) {
            if (!disposed) {
                setStatus(err.message || 'Could not regenerate Preparation.', { error: true });
            }
        } finally {
            regenerating = false;
            if (!disposed) render();
        }
    });

    await load();
}
