'use strict';

(function initBookAuditModule(global) {
    const state = {
        api: null,
        flash: null,
        isAdmin: false,
        projectId: '',
        onOpenReference: null,
        onCloseDesk: null,
        formatAnswerReference: null,
        formatQuestionReference: null,
        loading: false,
        report: null,
    };

    const LOOKUP_TIMEOUT_MS = 2500;

    function esc(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function severityRank(value) {
        const v = String(value || '').toLowerCase();
        if (v === 'critical') return 4;
        if (v === 'high') return 3;
        if (v === 'medium') return 2;
        if (v === 'low') return 1;
        return 0;
    }

    function severityClass(value) {
        const v = String(value || '').toLowerCase();
        if (v === 'critical') return 'audit-sev--critical';
        if (v === 'high') return 'audit-sev--high';
        if (v === 'medium') return 'audit-sev--medium';
        return 'audit-sev--low';
    }

    function parseParagraphRef(value) {
        const match = String(value || '').trim().match(/^C(\d+)-P(\d+)$/i);
        if (!match) return null;
        return {
            chapter: Number(match[1]),
            paragraph: Number(match[2]),
            ref: `C${Number(match[1])}-P${Number(match[2])}`,
        };
    }

    function renderRefLink(value) {
        const parsed = parseParagraphRef(value);
        if (!parsed) return esc(value || '—');
        return `<button type="button" class="audit-ref-link" data-audit-ref="${esc(parsed.ref)}">${esc(parsed.ref)}</button>`;
    }

    function linkifyReferenceText(text) {
        const raw = String(text || '');
        if (!raw) return '—';
        const escaped = esc(raw);
        return escaped.replace(/\bC\d+-P\d+\b/g, (match) => renderRefLink(match));
    }

    function renderReferenceSet(values) {
        const refs = (values || []).map(v => String(v || '').trim()).filter(Boolean);
        if (!refs.length) return '—';
        return refs.map(ref => renderRefLink(ref)).join(', ');
    }

    function answerReferenceMap(report) {
        const answers = Array.isArray(report?.references?.answers) ? report.references.answers : [];
        return new Map(answers
            .map(answer => [String(answer?.id || '').trim(), answer])
            .filter(([id]) => id));
    }

    function questionReferenceMap(report) {
        const questions = Array.isArray(report?.references?.questions) ? report.references.questions : [];
        return new Map(questions
            .map(question => [String(question?.id || '').trim(), question])
            .filter(([id]) => id));
    }

    function renderAnswerReferenceSet(values, report) {
        const refs = (values || []).map(v => String(v || '').trim()).filter(Boolean);
        if (!refs.length) return '—';

        const byId = answerReferenceMap(report);
        return refs.map((ref) => {
            const answerRef = byId.get(ref) || null;
            if (answerRef && typeof state.formatAnswerReference === 'function') {
                const formatted = String(state.formatAnswerReference(answerRef) || '').trim();
                if (formatted) return esc(formatted);
            }
            if (answerRef?.referenceLabel) return esc(answerRef.referenceLabel);
            if (answerRef?.questionId) return esc(`Question ${answerRef.questionId}`);
            return esc(ref);
        }).join(', ');
    }

    function renderQuestionReferenceSet(values, report) {
        const refs = (values || []).map(v => String(v || '').trim()).filter(Boolean);
        if (!refs.length) return '—';

        const questionsById = questionReferenceMap(report);
        const answersById = answerReferenceMap(report);
        return refs.map((ref) => {
            const questionRef = questionsById.get(ref) || null;
            if (questionRef && typeof state.formatQuestionReference === 'function') {
                const formatted = String(state.formatQuestionReference(questionRef) || '').trim();
                if (formatted) return esc(formatted);
            }
            if (questionRef?.referenceLabel) return esc(questionRef.referenceLabel);

            const answerRef = answersById.get(ref) || null;
            if (answerRef && typeof state.formatAnswerReference === 'function') {
                const formatted = String(state.formatAnswerReference(answerRef) || '').trim();
                if (formatted) return esc(formatted);
            }
            if (answerRef?.referenceLabel) return esc(answerRef.referenceLabel);
            if (answerRef?.questionId) return esc(`Question ${answerRef.questionId}`);

            if (typeof state.formatQuestionReference === 'function') {
                const formatted = String(state.formatQuestionReference({ id: ref }) || '').trim();
                if (formatted) return esc(formatted);
            }
            return 'Unknown question';
        }).join(', ');
    }

    function setLoading(container, label) {
        container.innerHTML = `
            <div class="audit-loading">
                <div class="spinner" style="margin:0 auto .7rem;"></div>
                <p>${esc(label || 'Analyzing manuscript, sources, and Q&A...')}</p>
            </div>
        `;
    }

    function toDate(iso) {
        const dt = new Date(iso || '');
        if (Number.isNaN(dt.getTime())) return '';
        return dt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    }

    function cacheKey() {
        return `wmb-book-audit-meta-${state.projectId || 'default'}`;
    }

    function readCachedMeta() {
        try {
            const raw = localStorage.getItem(cacheKey());
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            if (!parsed.generatedAt && !parsed.updatedAt) return null;
            return parsed;
        } catch (_) {
            return null;
        }
    }

    function writeCachedMeta(report) {
        try {
            localStorage.setItem(cacheKey(), JSON.stringify({
                generatedAt: report?.generatedAt || '',
                updatedAt: report?.updatedAt || '',
                headline: report?.summary?.headline || '',
            }));
        } catch (_) {}
    }

    function clearCachedMeta() {
        try {
            localStorage.removeItem(cacheKey());
        } catch (_) {}
    }

    async function fetchExistingReport(timeoutMs = 0) {
        let timeoutId = null;
        let controller = null;

        if (timeoutMs > 0 && typeof AbortController !== 'undefined') {
            controller = new AbortController();
            timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
        }

        try {
            const response = await state.api('GET', '/api/system/author/project/book-audit-report', undefined, controller ? { signal: controller.signal } : {});
            if (!response || response.exists !== true || !response.report) {
                clearCachedMeta();
                return null;
            }
            writeCachedMeta(response.report);
            return response.report;
        } catch (err) {
            const msg = String(err?.message || '');
            if (/aborted/i.test(msg)) {
                const timeoutErr = new Error('Saved book audit lookup timed out');
                timeoutErr.code = 'BOOK_AUDIT_LOOKUP_TIMEOUT';
                throw timeoutErr;
            }
            throw err;
        } finally {
            if (timeoutId) window.clearTimeout(timeoutId);
        }
    }

    function renderAuditWorkspace(container, report, opts = {}) {
        const hasExisting = Boolean(report);
        const running = opts.running === true;
        const generatedAt = toDate(report?.updatedAt || report?.generatedAt) || '';
        const actionLabel = hasExisting ? 'Rerun Audit' : 'Create Audit';
        const actionHint = hasExisting
            ? `Current report: ${esc(generatedAt || 'saved previously')}`
            : 'No report yet. Run a new audit to generate findings.';

        container.innerHTML = `
            <div class="book-audit-frame">
                <div class="book-audit-actions">
                    <button type="button" class="btn btn-primary" data-audit-run ${running ? 'disabled' : ''}>${actionLabel}</button>
                    <span class="book-audit-actions-meta">${actionHint}</span>
                    <button type="button" class="reader-close book-audit-close" data-audit-close aria-label="Close">✕</button>
                </div>
                <div class="book-audit-content" data-audit-content></div>
            </div>
        `;

        const contentEl = container.querySelector('[data-audit-content]');
        if (!contentEl) return;
        if (report) {
            renderReport(contentEl, report);
        } else {
            contentEl.innerHTML = '<div class="audit-empty">No Book Audit report yet. Click "Create Audit" to generate one.</div>';
        }

        const runBtn = container.querySelector('[data-audit-run]');
        runBtn?.addEventListener('click', () => {
            runAudit(container).catch((err) => {
                if (typeof state.flash === 'function') {
                    state.flash(`Book Audit failed: ${err?.message || 'unknown error'}`, 'error', 3600);
                }
            });
        });

        const closeBtn = container.querySelector('[data-audit-close]');
        closeBtn?.addEventListener('click', () => {
            if (typeof state.onCloseDesk === 'function') state.onCloseDesk();
        });
    }

    async function runAudit(container) {
        const hadExisting = Boolean(state.report);
        renderAuditWorkspace(container, state.report, { running: true });
        const contentEl = container.querySelector('[data-audit-content]');
        if (contentEl) {
            setLoading(
                contentEl,
                hadExisting
                    ? 'Rerunning Book Audit Report... this may take up to a minute.'
                    : 'Running Book Audit Report... this may take up to a minute.'
            );
        }
        const report = await state.api('POST', '/api/system/author/project/book-audit-report', {});
        writeCachedMeta(report);
        state.report = report;
        renderAuditWorkspace(container, report, { running: false });
    }

    function renderIssueRows(report) {
        const issues = Array.isArray(report?.issues) ? report.issues.slice() : [];
        if (!issues.length) {
            return '<div class="audit-empty">No major issues found in this pass.</div>';
        }

        issues.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

        return issues.map((issue) => {
            const fallbackRef = issue.chapterNumber ? `C${Number(issue.chapterNumber)}-P1` : '';
            const resolvedRef = String(issue.paragraphRef || fallbackRef || '').trim();
            const paragraphRef = resolvedRef ? `<div class="audit-ref">Affected: ${renderRefLink(resolvedRef)}</div>` : '';
            const sourceLine = [
                (issue.sourceQuestionIds || []).length ? `Q: ${renderQuestionReferenceSet(issue.sourceQuestionIds, report)}` : '',
                (issue.sourceAnswerIds || []).length ? `A: ${renderAnswerReferenceSet(issue.sourceAnswerIds, report)}` : '',
                (issue.sourceDocumentIds || []).length ? `Docs: ${esc(issue.sourceDocumentIds.join(', '))}` : '',
            ].filter(Boolean).join(' · ');

            return `
                <article class="audit-issue-card">
                    <div class="audit-issue-top">
                        <span class="audit-cat">${esc(issue.category || 'General')}</span>
                        <span class="audit-sev ${severityClass(issue.severity)}">${esc((issue.severity || 'medium').toUpperCase())}</span>
                    </div>
                    <h4>${esc(issue.title || 'Issue detected')}</h4>
                    <p>${esc(issue.detail || '')}</p>
                    ${paragraphRef}
                    ${sourceLine ? `<div class="audit-ref">${sourceLine}</div>` : ''}
                    <div class="audit-fix"><strong>Suggested fix:</strong> ${esc(issue.suggestion || '')}</div>
                    <div class="audit-actions"></div>
                </article>
            `;
        }).join('');
    }

    function renderSectionTable(title, rows, columns) {
        if (!rows.length) {
            return `
                <section class="audit-section">
                    <h3>${esc(title)}</h3>
                    <div class="audit-empty">No findings in this section.</div>
                </section>
            `;
        }

        const head = columns.map(c => `<th>${esc(c.label)}</th>`).join('');
        const body = rows.map((row) => {
            const cells = columns.map((col) => `<td>${col.render(row)}</td>`).join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        return `
            <section class="audit-section">
                <h3>${esc(title)}</h3>
                <div class="audit-table-wrap">
                    <table class="audit-table">
                        <thead><tr>${head}</tr></thead>
                        <tbody>${body}</tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function renderReport(container, report) {
        const totals = report?.summary?.totals || {};
        const generatedAt = toDate(report?.generatedAt);
        const repeated = report?.sections?.repeatedStoryDetection?.clusters || [];
        const authenticity = report?.sections?.authenticity?.items || [];
        const provenance = report?.sections?.provenance?.entries || [];
        const chronology = report?.sections?.chronology?.issues || [];

        container.innerHTML = `
            <div class="book-audit-report">
                <div class="audit-hero">
                    <div>
                        <p class="audit-eyebrow">Admin Audit</p>
                        <h2>Book Audit Report</h2>
                        <p class="audit-sub">${esc(report?.summary?.overview || 'AI review across manuscript, sources, and question-answer data.')}</p>
                    </div>
                    <div class="audit-hero-meta">
                        <div><strong>${Number(totals.issuesFound || 0)}</strong><span>Issues</span></div>
                        <div><strong>${Number(totals.paragraphsAnalyzed || 0)}</strong><span>Paragraphs</span></div>
                        <div><strong>${Number(totals.sourcesAnalyzed || 0)}</strong><span>Docs</span></div>
                        <div><strong>${Number(totals.answersAnalyzed || 0)}</strong><span>Answers</span></div>
                    </div>
                </div>

                <div class="audit-meta-line">Generated: ${esc(generatedAt || 'now')}</div>

                <section class="audit-section">
                    <h3>Issues Found</h3>
                    <div class="audit-issues-grid">${renderIssueRows(report)}</div>
                </section>

                ${renderSectionTable(
                    '1. Repeated Story Detection',
                    repeated,
                    [
                        { label: 'Cluster', render: (row) => esc(row.title || '') },
                        { label: 'Severity', render: (row) => `<span class="audit-sev ${severityClass(row.severity)}">${esc((row.severity || 'medium').toUpperCase())}</span>` },
                        { label: 'Overlap', render: (row) => renderReferenceSet(row.overlapRefs || []) },
                        { label: 'Suggested Consolidation', render: (row) => esc(row.suggestion || '') },
                    ]
                )}

                ${renderSectionTable(
                    '2. Invented / Weakly Supported Stories',
                    authenticity,
                    [
                        { label: 'Paragraph', render: (row) => renderRefLink(row.paragraphRef || '') },
                        { label: 'Authenticity', render: (row) => esc((row.authenticityConfidence || 'medium').toUpperCase()) },
                        { label: 'Concern', render: (row) => esc(row.concern || '') },
                        { label: 'Suggested Fix', render: (row) => esc(row.suggestion || '') },
                    ]
                )}

                ${renderSectionTable(
                    '3. Provenance Tracking',
                    provenance,
                    [
                        { label: 'Paragraph', render: (row) => renderRefLink(row.paragraphRef || '') },
                        { label: 'Trace', render: (row) => esc(row.trace || '') },
                        { label: 'Confidence', render: (row) => esc((row.confidence || 'medium').toUpperCase()) },
                    ]
                )}

                ${renderSectionTable(
                    '4. Chronological Consistency Check',
                    chronology,
                    [
                        { label: 'Severity', render: (row) => `<span class="audit-sev ${severityClass(row.severity)}">${esc((row.severity || 'medium').toUpperCase())}</span>` },
                        { label: 'Issue', render: (row) => esc(row.issue || '') },
                        { label: 'Evidence', render: (row) => linkifyReferenceText(row.evidence || row.paragraphRef || '') },
                        { label: 'Timeline Smoothing', render: (row) => esc(row.suggestion || '') },
                    ]
                )}
            </div>
        `;

        container.querySelectorAll('[data-audit-ref]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const ref = String(btn.getAttribute('data-audit-ref') || '').trim();
                if (!ref || typeof state.onOpenReference !== 'function') return;
                try {
                    await state.onOpenReference(ref);
                } catch (err) {
                    if (typeof state.flash === 'function') {
                        state.flash(`Could not open ${ref}: ${err?.message || 'unknown error'}`, 'error', 3200);
                    }
                }
            });
        });
    }

    async function launch(container) {
        if (!container) return;
        if (!state.api || typeof state.api !== 'function') return;
        if (!state.isAdmin) {
            if (typeof state.flash === 'function') state.flash('Admin access required for Book Audit Report.', 'error', 2600);
            return;
        }

        state.loading = true;

        try {
            let existingReport = null;
            renderAuditWorkspace(container, null, { running: false });
            const contentEl = container.querySelector('[data-audit-content]');
            if (contentEl) {
                setLoading(contentEl, 'Checking for saved Book Audit Report...');
            }
            try {
                existingReport = await fetchExistingReport(LOOKUP_TIMEOUT_MS);
            } catch (err) {
                if (err?.code === 'BOOK_AUDIT_LOOKUP_TIMEOUT') {
                    if (typeof state.flash === 'function') {
                        state.flash('Saved Book Audit lookup took too long. You can create a fresh audit now.', 'error', 2800);
                    }
                } else {
                    throw err;
                }
            }
            state.report = existingReport || null;
            renderAuditWorkspace(container, state.report, { running: false });
        } catch (err) {
            renderAuditWorkspace(container, state.report || null, { running: false });
            const contentEl = container.querySelector('[data-audit-content]');
            if (contentEl) {
                contentEl.innerHTML = `
                    <div class="audit-empty">
                        Could not open Book Audit Report: ${esc(err?.message || 'Unknown error')}
                    </div>
                `;
            }
        } finally {
            state.loading = false;
        }
    }

    function init(opts = {}) {
        state.api = opts.api;
        state.flash = opts.flash;
        state.isAdmin = opts.isAdmin === true;
        state.projectId = String(opts.projectId || '').trim();
        state.onOpenReference = opts.onOpenReference;
        state.onCloseDesk = opts.onCloseDesk;
        state.formatAnswerReference = opts.formatAnswerReference;
        state.formatQuestionReference = opts.formatQuestionReference;
    }

    global.WmbBookAuditReport = {
        init,
        launch,
    };
})(window);
