'use strict';

import { formatUiDateTime } from '../../platform/client/ui/datetime-format.js';

const FINDING_GROUPS = [
    { key: 'duplication', label: 'Duplication' },
    { key: 'unsupported', label: 'Unsupported / invented detail' },
    { key: 'missedMaterial', label: 'Missed Material' },
    { key: 'warnings', label: 'Warnings' },
];

function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function severityRank(value) {
    const order = { high: 4, medium: 3, review: 2, low: 1 };
    return order[String(value || '').toLowerCase()] ?? 0;
}

function severityClass(value) {
    const v = String(value || '').toLowerCase();
    if (v === 'high') return 'audit-sev--high';
    if (v === 'medium') return 'audit-sev--medium';
    if (v === 'review') return 'audit-sev--review';
    return 'audit-sev--low';
}

function formatWhen(value) {
    return formatUiDateTime(value) || '—';
}

function chapterLabel(finding) {
    const chapters = Array.isArray(finding?.chapters)
        ? finding.chapters.filter((n) => Number.isFinite(Number(n)))
        : [];
    if (chapters.length) return chapters.map((n) => `Ch ${n}`).join(', ');
    if (Number.isFinite(Number(finding?.chapterNumber))) return `Ch ${finding.chapterNumber}`;
    if (Number.isFinite(Number(finding?.allocatedChapter))) return `Allocated Ch ${finding.allocatedChapter}`;
    return '—';
}

function idRefs(finding) {
    const parts = [];
    if (finding?.episodeId) parts.push(`Episode ${finding.episodeId}`);
    if (finding?.draftRevisionKey) parts.push(`Draft ${finding.draftRevisionKey}`);
    return parts.length ? parts.join(' · ') : '—';
}

function excerpt(value, maxChars = 500) {
    const text = cleanText(value);
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars).trim()}…`;
}

export function buildIntegrityMaterialIndex(rows = []) {
    return new Map(
        (rows || [])
            .filter((row) => cleanText(row?.id))
            .map((row) => [cleanText(row.id), row]),
    );
}

function materialIdsForFinding(finding) {
    return [...new Set([
        finding?.materialId,
        ...(Array.isArray(finding?.materialIds) ? finding.materialIds : []),
    ].map(cleanText).filter(Boolean))];
}

function renderMaterialContext(esc, finding, materialById) {
    const ids = materialIdsForFinding(finding);
    if (!ids.length) return '';
    return ids.map((id) => {
        const row = materialById?.get(id);
        if (!row) {
            return `<div class="desk-integrity-material"><span>Material content unavailable</span><code>${esc(id)}</code></div>`;
        }
        const label = cleanText(row.title || row.questionText) || 'Material';
        const answer = excerpt(row.answerText);
        return `
            <div class="desk-integrity-material">
                <strong>${esc(label)}</strong>
                ${answer ? `<p>${esc(answer)}</p>` : '<p>No saved content.</p>'}
            </div>
        `;
    }).join('');
}

function displayFindingSummary(finding, materialById) {
    let summary = cleanText(finding?.summary || finding?.claim || '');
    for (const id of materialIdsForFinding(finding)) {
        const row = materialById?.get(id);
        const label = cleanText(row?.title || row?.questionText);
        if (label) summary = summary.replaceAll(id, `"${label}"`);
    }
    return summary;
}

export function summarizeIntegrityReport(report = null) {
    const summary = report?.summary || {};
    const scorecard = report?.scorecard || {};
    const findings = report?.findings || {};
    return {
        exists: Boolean(report?.auditedAt || report?.updatedAt),
        auditedAt: report?.auditedAt || report?.updatedAt || '',
        manuscriptRevision: cleanText(report?.manuscriptRevision),
        auditable: report?.readiness?.auditable !== false,
        readinessStatus: cleanText(report?.readiness?.status) || 'unknown',
        draftedChapterCount: Number(report?.readiness?.draftedChapterCount) || 0,
        reconciliationSnapshotCount: Number(report?.readiness?.reconciliationSnapshotCount) || 0,
        allocationEntryCount: Number(report?.readiness?.allocationEntryCount) || 0,
        materialCount: Number(report?.readiness?.materialCount) || 0,
        highCount: Number(summary.highCount) || 0,
        mediumCount: Number(summary.mediumCount) || 0,
        reviewCount: Number(summary.reviewCount) || 0,
        duplication: cleanText(scorecard.duplication) || '—',
        grounding: cleanText(scorecard.grounding) || '—',
        coverage: cleanText(scorecard.coverage) || '—',
        allocationCompliance: cleanText(scorecard.allocationCompliance) || '—',
        findingCounts: FINDING_GROUPS.reduce((acc, group) => {
            acc[group.key] = Array.isArray(findings[group.key]) ? findings[group.key].length : 0;
            return acc;
        }, {}),
        stages: Array.isArray(report?.stages) ? report.stages.slice() : [],
    };
}

export function flattenIntegrityFindings(report = null) {
    const findings = report?.findings || {};
    const rows = [];
    for (const group of FINDING_GROUPS) {
        for (const item of findings[group.key] || []) {
            rows.push({
                ...item,
                group: group.key,
                groupLabel: group.label,
            });
        }
    }
    rows.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
    return rows;
}

function renderScorecard(esc, report) {
    const summary = summarizeIntegrityReport(report);
    const badges = [
        ['Duplication', summary.duplication],
        ['Grounding', summary.grounding],
        ['Coverage', summary.coverage],
        ['Allocation', summary.allocationCompliance],
    ];
    return `
        <div class="desk-integrity-scorecard">
            ${badges.map(([label, value]) => `
                <div class="desk-integrity-scorecard-item">
                    <span class="desk-integrity-scorecard-label">${esc(label)}</span>
                    <strong>${esc(value)}</strong>
                </div>
            `).join('')}
            <div class="desk-integrity-scorecard-item">
                <span class="desk-integrity-scorecard-label">Findings</span>
                <strong>${esc(`${summary.highCount} high · ${summary.mediumCount} medium`)}</strong>
            </div>
        </div>
    `;
}

function renderFindingSection(esc, title, rows, materialById) {
    if (!rows.length) {
        return `
            <section class="audit-section desk-integrity-section">
                <h3>${esc(title)}</h3>
                <div class="audit-empty">No findings in this section.</div>
            </section>
        `;
    }

    const body = rows.map((row) => `
        <article class="desk-integrity-finding">
            <div class="desk-integrity-finding-head">
                <span class="audit-sev ${severityClass(row.severity)}">${esc(String(row.severity || 'review').toUpperCase())}</span>
                <strong>${esc(row.kind || row.signal || 'finding')}</strong>
            </div>
            <p class="desk-integrity-finding-summary">${esc(displayFindingSummary(row, materialById))}</p>
            ${renderMaterialContext(esc, row, materialById)}
            <dl class="desk-integrity-finding-meta">
                <div><dt>Chapters</dt><dd>${esc(chapterLabel(row))}</dd></div>
                ${idRefs(row) !== '—' ? `<div><dt>References</dt><dd>${esc(idRefs(row))}</dd></div>` : ''}
                ${row.disposition ? `<div><dt>Disposition</dt><dd>${esc(row.disposition)}</dd></div>` : ''}
                ${row.signal ? `<div><dt>Signal</dt><dd>${esc(row.signal)}</dd></div>` : ''}
            </dl>
        </article>
    `).join('');

    return `
        <section class="audit-section desk-integrity-section">
            <h3>${esc(title)}</h3>
            <div class="desk-integrity-findings">${body}</div>
        </section>
    `;
}

function renderReadinessBanner(esc, report) {
    const readiness = report?.readiness || {};
    if (readiness.auditable !== false) return '';
    const drafted = Number(readiness.draftedChapterCount) || 0;
    const material = Number(readiness.materialCount) || 0;
    const allocation = Number(readiness.allocationEntryCount) || 0;
    return `
        <div class="audit-banner audit-banner--blocked desk-integrity-readiness" role="status">
            <strong>Audit not ready.</strong>
            This book does not yet have enough draft pipeline state for a meaningful integrity pass.
            Drafted chapters: ${esc(String(drafted))}.
            Material answers: ${esc(String(material))}.
            Allocation entries: ${esc(String(allocation))}.
            Finish Book Plan, allocation, and chapter drafting before treating a clean scorecard as proof of quality.
        </div>
    `;
}

function renderReport(esc, report, materialById = new Map()) {
    const summary = summarizeIntegrityReport(report);
    const findings = report?.findings || {};
    return `
        <div class="desk-integrity-report">
            ${renderReadinessBanner(esc, report)}
            <div class="audit-hero desk-integrity-hero">
                <div>
                    <p class="audit-eyebrow">Pipeline integrity</p>
                    <h2>Draft Integrity Report</h2>
                    <p class="audit-sub">Deterministic audit of duplication, unsupported detail, and missed Material using allocation and reconciliation metadata.</p>
                </div>
                <div class="audit-hero-meta">
                    <div><strong>${esc(summary.highCount)}</strong><span>High</span></div>
                    <div><strong>${esc(summary.mediumCount)}</strong><span>Medium</span></div>
                    <div><strong>${esc(summary.reviewCount)}</strong><span>Review</span></div>
                    <div><strong>${esc(summary.findingCounts.duplication + summary.findingCounts.unsupported + summary.findingCounts.missedMaterial)}</strong><span>Total</span></div>
                </div>
            </div>
            <div class="audit-meta-line">
                Audited: ${esc(formatWhen(summary.auditedAt))}
                · Revision: ${esc(summary.manuscriptRevision || '—')}
                · Stages: ${esc((summary.stages || []).join(', ') || 'deterministic')}
            </div>
            ${renderScorecard(esc, report)}
            ${renderFindingSection(esc, 'Duplication', findings.duplication || [], materialById)}
            ${renderFindingSection(esc, 'Unsupported / invented detail', findings.unsupported || [], materialById)}
            ${renderFindingSection(esc, 'Missed Material', findings.missedMaterial || [], materialById)}
            ${renderFindingSection(esc, 'Warnings', findings.warnings || [], materialById)}
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
                    <div>
                        <button class="btn btn-primary" id="desk-integrity-run" type="button">Run integrity audit</button>
                        <button class="btn btn-ghost" id="desk-integrity-reload" type="button">Reload saved</button>
                    </div>
                    <p class="desk-integrity-hint">Deterministic pass only — fast, no LLM. Uses chapter reconciliation and book allocation.</p>
                </div>
                <div id="desk-integrity-status" class="desk-workspace-status" aria-live="polite"></div>
                <div id="desk-integrity-content" class="desk-integrity-content">
                    <div class="audit-loading">
                        <div class="spinner" style="margin:0 auto .7rem;"></div>
                        <p>Loading saved integrity audit…</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    const statusEl = emptyEl.querySelector('#desk-integrity-status');
    const contentEl = emptyEl.querySelector('#desk-integrity-content');
    const runBtn = emptyEl.querySelector('#desk-integrity-run');
    const reloadBtn = emptyEl.querySelector('#desk-integrity-reload');
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
            contentEl.innerHTML = '<div class="audit-empty">No integrity audit yet. Run one to check duplication, grounding, and missed Material.</div>';
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
        setStatus('Loading saved audit…');
        const response = await api('GET', '/api/system/author/project/final-draft-integrity');
        if (!response || response.exists !== true || !response.report) {
            currentReport = null;
            setStatus('No saved integrity audit yet.');
            renderCurrentReport();
            return null;
        }
        currentReport = response.report;
        const summary = summarizeIntegrityReport(currentReport);
        setStatus(
            summary.auditable
                ? `Saved audit from ${formatWhen(summary.auditedAt)} · ${summary.highCount} high findings`
                : `Saved audit not ready · ${summary.draftedChapterCount} drafted chapters · ${summary.materialCount} Material answers`,
            summary.auditable && summary.highCount > 0 ? 'warn' : (summary.auditable ? 'ok' : 'warn'),
        );
        renderCurrentReport();
        return currentReport;
    }

    async function runAudit() {
        if (runBtn) runBtn.disabled = true;
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
                useAi: false,
                persist: true,
            });
            currentReport = report;
            const summary = summarizeIntegrityReport(report);
            setStatus(
                summary.auditable
                    ? `Audit complete · ${summary.highCount} high, ${summary.mediumCount} medium`
                    : `Audit not ready · ${summary.draftedChapterCount} drafted chapters · ${summary.materialCount} Material answers`,
                summary.auditable && summary.highCount > 0 ? 'warn' : (summary.auditable ? 'ok' : 'warn'),
            );
            renderCurrentReport();
        } finally {
            if (runBtn) runBtn.disabled = false;
        }
    }

    closeBtn?.addEventListener('click', onClose);
    reloadBtn?.addEventListener('click', () => {
        loadSavedReport().catch((err) => setStatus(err?.message || 'Could not reload audit', 'error'));
    });
    runBtn?.addEventListener('click', () => {
        runAudit().catch((err) => setStatus(err?.message || 'Integrity audit failed', 'error'));
    });

    await loadMaterialContext().catch(() => {
        materialById = new Map();
    });
    await loadSavedReport().catch((err) => {
        setStatus(err?.message || 'Could not load saved audit', 'error');
        if (contentEl) {
            contentEl.innerHTML = '<div class="audit-empty">Could not load saved integrity audit.</div>';
        }
    });
}
