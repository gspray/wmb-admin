'use strict';

import { formatUiDateTime } from '../../platform/client/ui/datetime-format.js';

function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function severityRank(value) {
    const order = { high: 4, medium: 3, review: 2, low: 1 };
    return order[String(value || '').toLowerCase()] ?? 0;
}

function formatWhen(value) {
    return formatUiDateTime(value) || '—';
}

function formatChapters(chapters) {
    const nums = (Array.isArray(chapters) ? chapters : [])
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n));
    return nums.length ? nums.join(', ') : '—';
}

function formatAiVerdict(value) {
    const verdict = cleanText(value).toLowerCase();
    if (verdict === 'real_issue') return 'Real issue';
    if (verdict === 'false_positive') return 'False positive';
    if (verdict === 'uncertain') return 'Uncertain';
    return '—';
}

function formatNature(value) {
    const nature = cleanText(value).toLowerCase();
    if (nature === 'verbatim_repeat') return 'Verbatim repeat';
    if (nature === 'paraphrased_repeat') return 'Paraphrased repeat';
    if (nature === 'thematic_callback') return 'Thematic callback';
    if (nature === 'plan_mismatch') return 'Plan mismatch';
    if (nature === 'uncertain') return 'Uncertain';
    return '—';
}

function formatRecommendedAction(value) {
    const action = cleanText(value).toLowerCase();
    if (action === 'keep') return 'Keep';
    if (action === 'trim_to_callback') return 'Trim to callback';
    if (action === 'consolidate_in_home_chapter') return 'Consolidate in home chapter';
    if (action === 'move_allocation') return 'Move allocation';
    if (action === 'review_manually') return 'Review manually';
    return '—';
}

function materialIdsForFinding(finding) {
    return [...new Set([
        finding?.materialId,
        ...(Array.isArray(finding?.materialIds) ? finding.materialIds : []),
    ].map(cleanText).filter(Boolean))];
}

function materialTopic(finding, materialById) {
    for (const id of materialIdsForFinding(finding)) {
        const row = materialById?.get(id);
        const label = cleanText(row?.title || row?.questionText);
        if (label) return label;
    }
    return cleanText(finding?.summary || finding?.kind || 'Finding');
}

function aiItemForFinding(finding, aiItems = []) {
    const materialId = cleanText(finding?.materialId);
    if (!materialId) return null;
    return (aiItems || []).find((item) => cleanText(item?.materialId) === materialId) || null;
}

export function buildIntegrityMaterialIndex(rows = []) {
    return new Map(
        (rows || [])
            .filter((row) => cleanText(row?.id))
            .map((row) => [cleanText(row.id), row]),
    );
}

export function summarizeIntegrityReport(report = null) {
    const summary = report?.summary || {};
    const aiEvaluation = report?.aiEvaluation || null;
    return {
        exists: Boolean(report?.auditedAt || report?.updatedAt),
        auditedAt: report?.auditedAt || report?.updatedAt || '',
        auditable: report?.readiness?.auditable !== false,
        draftedChapterCount: Number(report?.readiness?.draftedChapterCount) || 0,
        materialCount: Number(report?.readiness?.materialCount) || 0,
        highCount: Number(summary.highCount) || 0,
        mediumCount: Number(summary.mediumCount) || 0,
        reviewCount: Number(summary.reviewCount) || 0,
        aiEvaluation,
        aiVerdictCounts: aiEvaluation?.counts || null,
    };
}

export function buildIntegrityTableRows(report = null, materialById = new Map()) {
    const findings = report?.findings || {};
    const aiItems = report?.aiEvaluation?.items || [];
    const groups = [
        { key: 'duplication', label: 'Duplication' },
        { key: 'unsupported', label: 'Unsupported detail' },
        { key: 'missedMaterial', label: 'Missed Material' },
        { key: 'warnings', label: 'Warning' },
    ];
    const rows = [];

    for (const group of groups) {
        for (const finding of findings[group.key] || []) {
            const aiItem = aiItemForFinding(finding, aiItems);
            const hasAi = Boolean(aiItem?.verdict);
            rows.push({
                category: group.label,
                topic: materialTopic(finding, materialById),
                plannedChapter: Number.isFinite(Number(finding?.allocatedChapter))
                    ? Number(finding.allocatedChapter)
                    : (Number.isFinite(Number(finding?.chapterNumber)) ? Number(finding.chapterNumber) : null),
                detectedIn: formatChapters(finding?.chapters),
                heuristic: cleanText(finding?.severity) || 'review',
                reviewedBy: hasAi ? 'AI' : 'Heuristic',
                ai: hasAi ? formatAiVerdict(aiItem.verdict) : '—',
                nature: hasAi ? formatNature(aiItem.nature) : '—',
                suggestedAction: hasAi ? formatRecommendedAction(aiItem.recommendedAction) : '—',
                sortRank: severityRank(finding?.severity),
            });
        }
    }

    rows.sort((a, b) => b.sortRank - a.sortRank);
    return rows;
}

function renderSummaryLine(summary) {
    if (!summary.auditable) {
        return `${summary.draftedChapterCount} drafted chapters · ${summary.materialCount} Material answers`;
    }
    const parts = [
        `${summary.highCount} high`,
        `${summary.mediumCount} medium`,
        `${summary.reviewCount} review`,
    ];
    const aiCounts = summary.aiVerdictCounts;
    if (aiCounts) {
        parts.push(
            `AI: ${Number(aiCounts.realIssue) || 0} real`,
            `${Number(aiCounts.falsePositive) || 0} false positive`,
        );
    }
    const actionCounts = summary.aiEvaluation?.actionCounts;
    if (actionCounts) {
        const actionParts = [];
        if (actionCounts.trimToCallback) actionParts.push(`${actionCounts.trimToCallback} trim`);
        if (actionCounts.moveAllocation) actionParts.push(`${actionCounts.moveAllocation} reallocate`);
        if (actionCounts.keep) actionParts.push(`${actionCounts.keep} keep`);
        if (actionParts.length) parts.push(`Actions: ${actionParts.join(', ')}`);
    }
    return parts.join(' · ');
}

function renderReadinessBanner(esc, report) {
    const readiness = report?.readiness || {};
    if (readiness.auditable !== false) return '';
    return `
        <p class="desk-integrity-note" role="status">
            This book is not ready for a full integrity check yet. Finish drafting and book allocation first.
        </p>
    `;
}

function renderReport(esc, report, materialById = new Map()) {
    const summary = summarizeIntegrityReport(report);
    const rows = buildIntegrityTableRows(report, materialById);

    if (!rows.length) {
        return `
            <div class="desk-integrity-report">
                ${renderReadinessBanner(esc, report)}
                <p class="desk-integrity-empty">No issues found.</p>
                <p class="desk-integrity-summary">${esc(renderSummaryLine(summary))}</p>
            </div>
        `;
    }

    const body = rows.map((row, index) => `
        <tr>
            <td>${esc(String(index + 1))}</td>
            <td>${esc(row.topic)}</td>
            <td>${esc(row.plannedChapter == null ? '—' : String(row.plannedChapter))}</td>
            <td>${esc(row.detectedIn)}</td>
            <td>${esc(row.heuristic)}</td>
            <td>${esc(row.reviewedBy)}</td>
            <td>${esc(row.ai)}</td>
            <td>${esc(row.nature)}</td>
            <td>${esc(row.suggestedAction)}</td>
        </tr>
    `).join('');

    return `
        <div class="desk-integrity-report">
            ${renderReadinessBanner(esc, report)}
            <div class="desk-integrity-table-wrap">
                <table class="desk-integrity-table">
                    <thead>
                        <tr>
                            <th scope="col">#</th>
                            <th scope="col">Material (topic)</th>
                            <th scope="col">Planned ch</th>
                            <th scope="col">Detected in</th>
                            <th scope="col">Heuristic</th>
                            <th scope="col">Reviewed by</th>
                            <th scope="col">AI</th>
                            <th scope="col">Nature</th>
                            <th scope="col">Suggested action</th>
                        </tr>
                    </thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
            <p class="desk-integrity-summary">${esc(renderSummaryLine(summary))}</p>
        </div>
    `;
}

/**
 * Admin Desk panel for Final Draft Integrity on the current book.
 * @param {{ api: Function, esc: Function, onClose: () => void, projectTitle?: string }} opts
 */
export async function launchDraftIntegrityPanel(opts) {
    const {
        api,
        esc,
        onClose,
        projectTitle = '',
    } = opts || {};
    if (typeof api !== 'function' || typeof esc !== 'function' || typeof onClose !== 'function') {
        throw new Error('Draft Integrity panel requires api, esc, and onClose');
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
        <div class="desk-workspace-shell desk-workspace-shell--integrity">
            <header class="desk-workspace-head">
                <div>
                    <h3>Draft Integrity</h3>
                    <p class="desk-integrity-subtitle">${esc(projectTitle || 'Current book')}</p>
                </div>
                <button id="desk-integrity-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <div class="desk-workspace-body desk-integrity-body">
                <div class="desk-integrity-toolbar">
                    <button class="btn btn-primary" id="desk-integrity-run" type="button">Run integrity audit</button>
                    <label class="desk-integrity-ai-toggle">
                        <input id="desk-integrity-use-ai" type="checkbox" checked>
                        Include AI review
                    </label>
                </div>
                <div id="desk-integrity-status" class="desk-workspace-status" aria-live="polite"></div>
                <div id="desk-integrity-content" class="desk-integrity-content">
                    <div class="audit-loading">
                        <div class="spinner" style="margin:0 auto .7rem;"></div>
                        <p>Loading…</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    const statusEl = emptyEl.querySelector('#desk-integrity-status');
    const contentEl = emptyEl.querySelector('#desk-integrity-content');
    const runBtn = emptyEl.querySelector('#desk-integrity-run');
    const useAiInput = emptyEl.querySelector('#desk-integrity-use-ai');
    const closeBtn = emptyEl.querySelector('#desk-integrity-close');

    let currentReport = null;
    let materialById = new Map();

    function setStatus(message, tone = '') {
        if (!statusEl) return;
        statusEl.textContent = cleanText(message);
        statusEl.className = `desk-workspace-status${tone ? ` desk-workspace-status--${tone}` : ''}`;
    }

    function renderCurrentReport() {
        if (!contentEl) return;
        if (!currentReport) {
            contentEl.innerHTML = '<p class="desk-integrity-empty">No integrity audit yet. Run one to check this draft.</p>';
            return;
        }
        contentEl.innerHTML = renderReport(esc, currentReport, materialById);
    }

    async function loadMaterialContext() {
        const response = await api('GET', '/api/system/author/project/final-draft-integrity/material-context');
        materialById = buildIntegrityMaterialIndex(response?.materials || []);
        return materialById;
    }

    async function loadSavedReport() {
        setStatus('Loading…');
        const response = await api('GET', '/api/system/author/project/final-draft-integrity');
        if (!response || response.exists !== true || !response.report) {
            currentReport = null;
            setStatus('');
            renderCurrentReport();
            return null;
        }
        currentReport = response.report;
        const summary = summarizeIntegrityReport(currentReport);
        setStatus(summary.auditedAt ? `Last checked ${formatWhen(summary.auditedAt)}` : '');
        renderCurrentReport();
        return currentReport;
    }

    async function runAudit() {
        if (runBtn) runBtn.disabled = true;
        const useAi = Boolean(useAiInput?.checked);
        if (contentEl) {
            contentEl.innerHTML = `
                <div class="audit-loading">
                    <div class="spinner" style="margin:0 auto .7rem;"></div>
                    <p>Running integrity audit…</p>
                </div>
            `;
        }
        setStatus('Running integrity audit…');
        try {
            const report = await api('POST', '/api/system/author/project/final-draft-integrity', {
                useAi,
                persist: true,
            });
            currentReport = report;
            const summary = summarizeIntegrityReport(report);
            setStatus(summary.auditedAt ? `Last checked ${formatWhen(summary.auditedAt)}` : '');
            renderCurrentReport();
        } finally {
            if (runBtn) runBtn.disabled = false;
        }
    }

    closeBtn?.addEventListener('click', onClose);
    runBtn?.addEventListener('click', () => {
        runAudit().catch((err) => setStatus(err?.message || 'Integrity audit failed', 'error'));
    });

    await loadMaterialContext().catch(() => {
        materialById = new Map();
    });
    await loadSavedReport().catch((err) => {
        setStatus(err?.message || 'Could not load saved audit', 'error');
        if (contentEl) {
            contentEl.innerHTML = '<p class="desk-integrity-empty">Could not load integrity audit.</p>';
        }
    });
}
