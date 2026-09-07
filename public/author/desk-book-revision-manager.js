'use strict';

/**
 * Admin Desk — Book Revision Manager.
 * Extracted from author-app.js (Phase 2 Admin Desk separation).
 */

import { state } from './state.js';
import { BASE } from './config.js';
import { adminApi as api, loadAdminProjectOutline as loadProjectOutline } from '../admin-desk-api.js';
import { esc, formatUiDateTime, renderMarkdown } from './ui-helpers.js';
import { loadProjectAlign, chapterNumberForChapterBankQuestionId } from './static-data.js';

let _renderMyDeskList = null;
let _setMyDeskWorkspaceMode = null;
let _returnToAdminDeskHome = null;
let _hydrateAlignQuestionsFromList = null;
let _loadSavedChaptersFromServer = null;
let _renderStep = null;
let _buildAlignQuestionOrderMap = null;
let _resolveAssignmentBankQuestionMeta = null;
let _formatRevisionQuestionLabel = null;
let _revisionChapterSectionTitle = null;

function renderMyDeskList() { return _renderMyDeskList?.(); }
function setMyDeskWorkspaceMode(enabled) { return _setMyDeskWorkspaceMode?.(enabled); }
function returnToAdminDeskHome() { return _returnToAdminDeskHome?.(); }
function hydrateAlignQuestionsFromList(all, introCardMeta = null) { return _hydrateAlignQuestionsFromList?.(all, introCardMeta); }
async function loadSavedChaptersFromServer(opts = {}) { return _loadSavedChaptersFromServer?.(opts); }
async function renderStep() { return _renderStep?.(); }
function buildAlignQuestionOrderMap() { return _buildAlignQuestionOrderMap?.(); }
function resolveAssignmentBankQuestionMeta(qid) { return _resolveAssignmentBankQuestionMeta?.(qid); }
function formatRevisionQuestionLabel(qid, answerRef = {}) { return _formatRevisionQuestionLabel?.(qid, answerRef); }
function revisionChapterSectionTitle(chapterNum) { return _revisionChapterSectionTitle?.(chapterNum); }

export async function launchBookRevisionManagerPanel(deps) {
    const {
        renderMyDeskList: renderMyDeskListDep,
        setMyDeskWorkspaceMode: setMyDeskWorkspaceModeDep,
        returnToAdminDeskHome: returnToAdminDeskHomeDep,
        hydrateAlignQuestionsFromList: hydrateAlignQuestionsFromListDep,
        loadSavedChaptersFromServer: loadSavedChaptersFromServerDep,
        renderStep: renderStepDep,
        buildAlignQuestionOrderMap: buildAlignQuestionOrderMapDep,
        resolveAssignmentBankQuestionMeta: resolveAssignmentBankQuestionMetaDep,
        formatRevisionQuestionLabel: formatRevisionQuestionLabelDep,
        revisionChapterSectionTitle: revisionChapterSectionTitleDep,
    } = deps || {};
    if (typeof renderMyDeskListDep !== 'function'
        || typeof setMyDeskWorkspaceModeDep !== 'function'
        || typeof returnToAdminDeskHomeDep !== 'function'
        || typeof hydrateAlignQuestionsFromListDep !== 'function'
        || typeof loadSavedChaptersFromServerDep !== 'function'
        || typeof renderStepDep !== 'function'
        || typeof buildAlignQuestionOrderMapDep !== 'function'
        || typeof resolveAssignmentBankQuestionMetaDep !== 'function'
        || typeof formatRevisionQuestionLabelDep !== 'function'
        || typeof revisionChapterSectionTitleDep !== 'function') {
        throw new Error('launchBookRevisionManagerPanel requires desk host deps');
    }
    _renderMyDeskList = renderMyDeskListDep;
    _setMyDeskWorkspaceMode = setMyDeskWorkspaceModeDep;
    _returnToAdminDeskHome = returnToAdminDeskHomeDep;
    _hydrateAlignQuestionsFromList = hydrateAlignQuestionsFromListDep;
    _loadSavedChaptersFromServer = loadSavedChaptersFromServerDep;
    _renderStep = renderStepDep;
    _buildAlignQuestionOrderMap = buildAlignQuestionOrderMapDep;
    _resolveAssignmentBankQuestionMeta = resolveAssignmentBankQuestionMetaDep;
    _formatRevisionQuestionLabel = formatRevisionQuestionLabelDep;
    _revisionChapterSectionTitle = revisionChapterSectionTitleDep;
    const emptyEl = document.getElementById('my-desk-empty');
    const editorEl = document.getElementById('my-desk-editor');
    const comingSoon = document.getElementById('my-desk-coming-soon');
    if (!emptyEl) return;

    try {
        if (!(state.alignQuestions || []).length) {
            const result = await loadProjectAlign().catch(() => null);
            if (result?.questions?.length) {
                hydrateAlignQuestionsFromList(result.questions);
            } else {
                const fallback = await fetch(`${BASE}/align.json`).then((r) => r.json()).catch(() => ({}));
                hydrateAlignQuestionsFromList(fallback.questions || [], fallback.introCard);
            }
        }
    } catch (_) {}

    state.librarySelected = null;
    renderMyDeskList();
    if (comingSoon) comingSoon.classList.add('hidden');
    if (editorEl) editorEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    emptyEl.classList.add('book-audit-host');
    setMyDeskWorkspaceMode(true);
    emptyEl.innerHTML = `
        <div class="desk-workspace-shell">
            <header class="desk-workspace-head">
                <h3>Book Revision Manager</h3>
                <button id="book-revisions-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <div class="desk-workspace-body desk-revisions-main">
                <div class="desk-revisions-toolbar">
                    <button class="btn btn-primary desk-revisions-toolbar-btn" id="book-revisions-create" type="button">Create Revision Now</button>
                    <button class="btn btn-ghost desk-revisions-toolbar-btn" id="book-revisions-delete-selected" type="button">Delete Selected</button>
                    <span id="book-revisions-status" class="desk-revisions-toolbar-status"></span>
                </div>
                <div class="desk-revisions-grid">
                    <div id="book-revisions-list" class="desk-revisions-list-pane"></div>
                    <div class="desk-revisions-preview-pane">
                        <div class="desk-revisions-find-bar">
                            <input id="book-revisions-find" class="auth-field desk-revisions-find-input" type="text" placeholder="Find in preview…" />
                            <button class="btn btn-ghost desk-revisions-find-btn" id="book-revisions-find-prev" type="button">Prev</button>
                            <button class="btn btn-ghost desk-revisions-find-btn" id="book-revisions-find-next" type="button">Next</button>
                            <button class="btn btn-ghost desk-revisions-find-btn" id="book-revisions-find-clear" type="button">Clear</button>
                            <span id="book-revisions-find-status" class="desk-revisions-find-status"></span>
                        </div>
                        <div id="book-revisions-preview" class="desk-revisions-preview-inner">
                            <p class="desk-revisions-preview-placeholder">Click a revision card to preview full content.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const statusEl = document.getElementById('book-revisions-status');
    const listEl = document.getElementById('book-revisions-list');
    const previewEl = document.getElementById('book-revisions-preview');
    const findInputEl = document.getElementById('book-revisions-find');
    const findPrevBtn = document.getElementById('book-revisions-find-prev');
    const findNextBtn = document.getElementById('book-revisions-find-next');
    const findClearBtn = document.getElementById('book-revisions-find-clear');
    const findStatusEl = document.getElementById('book-revisions-find-status');
    const setStatus = (msg, { error = false, ok = false } = {}) => {
        if (!statusEl) return;
        statusEl.textContent = msg || '';
        statusEl.style.color = error ? 'var(--c-danger)' : (ok ? 'var(--c-success)' : 'var(--c-muted)');
    };
    let rows = [];
    let revisionListLimit = 50;
    let selectedRevisionId = '';
    let findMatches = [];
    let activeFindIndex = -1;

    const setRevisionCountStatus = () => {
        setStatus(`${rows.length} / ${revisionListLimit} recent versions`);
    };

    const clearFindHighlights = () => {
        if (!previewEl) return;
        const marks = Array.from(previewEl.querySelectorAll('mark[data-revision-find="1"]'));
        for (const mark of marks) {
            const parent = mark.parentNode;
            if (!parent) continue;
            parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
            parent.normalize();
        }
        findMatches = [];
        activeFindIndex = -1;
        if (findStatusEl) findStatusEl.textContent = '';
    };

    const setActiveFindMatch = (idx) => {
        if (!findMatches.length) {
            activeFindIndex = -1;
            return;
        }
        activeFindIndex = ((idx % findMatches.length) + findMatches.length) % findMatches.length;
        findMatches.forEach((el, i) => {
            if (i === activeFindIndex) {
                el.style.background = '#ffb020';
                el.style.color = '#111';
            } else {
                el.style.background = '#fff36d';
                el.style.color = 'inherit';
            }
        });
        const current = findMatches[activeFindIndex];
        current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (findStatusEl) findStatusEl.textContent = `${activeFindIndex + 1}/${findMatches.length}`;
    };

    const applyFindHighlights = () => {
        clearFindHighlights();
        if (!previewEl) return;
        const term = String(findInputEl?.value || '').trim();
        if (!term) return;
        const termLower = term.toLowerCase();
        const walker = document.createTreeWalker(previewEl, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest('mark[data-revision-find="1"]')) return NodeFilter.FILTER_REJECT;
                if (['SCRIPT', 'STYLE'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) textNodes.push(node);

        for (const textNode of textNodes) {
            const raw = textNode.nodeValue || '';
            const lower = raw.toLowerCase();
            let from = 0;
            let hit = lower.indexOf(termLower, from);
            if (hit < 0) continue;
            const frag = document.createDocumentFragment();
            while (hit >= 0) {
                if (hit > from) frag.appendChild(document.createTextNode(raw.slice(from, hit)));
                const mark = document.createElement('mark');
                mark.setAttribute('data-revision-find', '1');
                mark.style.background = '#fff36d';
                mark.textContent = raw.slice(hit, hit + term.length);
                frag.appendChild(mark);
                findMatches.push(mark);
                from = hit + term.length;
                hit = lower.indexOf(termLower, from);
            }
            if (from < raw.length) frag.appendChild(document.createTextNode(raw.slice(from)));
            textNode.parentNode?.replaceChild(frag, textNode);
        }
        if (findMatches.length) setActiveFindMatch(0);
        else if (findStatusEl) findStatusEl.textContent = '0 matches';
    };

    const renderList = () => {
        if (!listEl) return;
        if (!rows.length) {
            listEl.innerHTML = '<p style="color:var(--c-muted);font-size:.82rem;margin:0;">No revisions yet.</p>';
            return;
        }
        listEl.innerHTML = rows.map((r) => {
            const title = r.summary?.workingTitle || state.project?.workingTitle || 'Untitled';
            const selectedClass = selectedRevisionId === r.id ? ' desk-revision-card--selected' : '';
            return `
                <div class="card desk-revision-card${selectedClass}" data-id="${esc(r.id)}" style="padding:.45rem .5rem;margin:.2rem 0;">
                    <div style="display:flex;align-items:flex-start;gap:.45rem;">
                        <input class="book-revision-row-check" data-id="${esc(r.id)}" type="checkbox" style="margin-top:.2rem;" />
                        <div style="min-width:0;flex:1;">
                            <div style="font-size:.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(title)}</div>
                            <div style="font-size:.75rem;color:var(--c-muted);">${esc(formatUiDateTime(r.createdAt) || '—')} · ${esc(r.trigger || 'manual')}</div>
                        </div>
                        <div style="display:flex;gap:.3rem;flex-wrap:wrap;justify-content:flex-end;align-items:flex-start;">
                            <button class="btn btn-ghost book-revision-restore" data-id="${esc(r.id)}" type="button" style="padding:.2rem .45rem;font-size:.74rem;">Restore</button>
                            <button class="book-revision-delete" data-id="${esc(r.id)}" type="button" aria-label="Delete revision"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    const renderPreview = (record) => {
        if (!previewEl) return;
        const payload = record?.payload || {};
        const projectTitle = String(payload?.project?.workingTitle || 'Untitled').trim();
        const questions = Array.isArray(payload?.questions) ? payload.questions : [];
        const answers = Array.isArray(payload?.answers) ? payload.answers : [];
        const chapters = Array.isArray(payload?.chapters) ? payload.chapters : [];
        const questionTextById = new Map();
        for (const q of questions) {
            const qid = String(q?.id || '').trim();
            const qText = String(q?.question || '').trim();
            if (qid && qText) questionTextById.set(qid, qText);
        }

        // Keep latest answer per questionId to avoid duplicates from updates.
        const latestAnswerByQuestionId = new Map();
        const freeformAnswers = [];
        for (const a of answers) {
            const qid = String(a?.questionId || '').trim();
            const ts = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
            if (!qid) {
                freeformAnswers.push(a);
                continue;
            }
            const prev = latestAnswerByQuestionId.get(qid);
            const prevTs = new Date(prev?.updatedAt || prev?.createdAt || 0).getTime();
            if (!prev || ts >= prevTs) latestAnswerByQuestionId.set(qid, a);
        }

        const startRows = [];
        const chapterRows = new Map(); // bookChapter -> rows
        const alignOrder = buildAlignQuestionOrderMap();
        for (const [qid, ans] of latestAnswerByQuestionId.entries()) {
            const ts = new Date(ans?.updatedAt || ans?.createdAt || 0).getTime();
            const qText = String(
                ans?.questionText
                || ans?.originalQuestionText
                || questionTextById.get(qid)
                || qid
            ).trim();
            const aText = String(ans?.answerText || '').trim();
            const bankMeta = resolveAssignmentBankQuestionMeta(qid);
            if (bankMeta && bankMeta.bookChapter != null && Number.isFinite(Number(bankMeta.bookChapter))) {
                const bookChapter = Number(bankMeta.bookChapter);
                if (!chapterRows.has(bookChapter)) chapterRows.set(bookChapter, []);
                chapterRows.get(bookChapter).push({
                    qid, q: qText, a: aText, ts, bankMeta, referenceLabel: ans?.referenceLabel || '',
                });
            } else {
                const legacyChapter = chapterNumberForChapterBankQuestionId(qid);
                if (legacyChapter != null && Number.isFinite(legacyChapter) && legacyChapter > 0) {
                    if (!chapterRows.has(legacyChapter)) chapterRows.set(legacyChapter, []);
                    chapterRows.get(legacyChapter).push({
                        qid, q: qText, a: aText, ts, bankMeta: null, referenceLabel: ans?.referenceLabel || '',
                    });
                } else {
                    startRows.push({
                        qid, q: qText, a: aText, ts, referenceLabel: ans?.referenceLabel || '',
                        sortOrder: alignOrder.has(qid) ? alignOrder.get(qid) : 9999,
                    });
                }
            }
        }
        for (const ans of freeformAnswers) {
            const ts = new Date(ans?.updatedAt || ans?.createdAt || 0).getTime();
            const qText = String(ans?.questionText || ans?.originalQuestionText || 'Freeform').trim();
            const aText = String(ans?.answerText || '').trim();
            const qid = String(ans?.questionId || '').trim();
            const bankMeta = qid ? resolveAssignmentBankQuestionMeta(qid) : null;
            if (bankMeta && bankMeta.bookChapter != null && Number.isFinite(Number(bankMeta.bookChapter))) {
                const bookChapter = Number(bankMeta.bookChapter);
                if (!chapterRows.has(bookChapter)) chapterRows.set(bookChapter, []);
                chapterRows.get(bookChapter).push({
                    qid: qid || `chapter-${bookChapter}`, q: qText, a: aText, ts, bankMeta,
                    referenceLabel: ans?.referenceLabel || '',
                });
            } else {
                const legacyChapter = qid ? chapterNumberForChapterBankQuestionId(qid) : null;
                if (legacyChapter != null && Number.isFinite(legacyChapter) && legacyChapter > 0) {
                    if (!chapterRows.has(legacyChapter)) chapterRows.set(legacyChapter, []);
                    chapterRows.get(legacyChapter).push({
                        qid: qid || `chapter-${legacyChapter}`, q: qText, a: aText, ts, bankMeta: null,
                        referenceLabel: ans?.referenceLabel || '',
                    });
                } else {
                    startRows.push({
                        qid: qid || `freeform-${ts}`, q: qText, a: aText, ts,
                        referenceLabel: ans?.referenceLabel || '',
                        sortOrder: qid && alignOrder.has(qid) ? alignOrder.get(qid) : 9999,
                    });
                }
            }
        }

        startRows.sort((a, b) => {
            const ao = Number(a.sortOrder);
            const bo = Number(b.sortOrder);
            if (ao !== bo) return ao - bo;
            return a.ts - b.ts;
        });
        const questionLines = [];
        questionLines.push('### Start My Book');
        if (!startRows.length) {
            questionLines.push('_No Start My Book answers in this revision._');
            questionLines.push('');
        } else {
            for (const row of startRows) {
                const qLabel = formatRevisionQuestionLabel(row.qid, { referenceLabel: row.referenceLabel });
                questionLines.push(`**${qLabel}: ${row.q || row.qid || 'Untitled question'}**`);
                questionLines.push(`**A:** ${row.a || '_No answer captured._'}`);
                questionLines.push('');
            }
        }

        const chapterNums = Array.from(chapterRows.keys())
            .filter((n) => Number.isFinite(n) && n >= 0)
            .sort((a, b) => a - b);
        if (!chapterNums.length) {
            questionLines.push('### Chapter Questions');
            questionLines.push('_No chapter questions found in this revision._');
            questionLines.push('');
        } else {
            for (const chapterNum of chapterNums) {
                const rowsForChapter = (chapterRows.get(chapterNum) || []).slice().sort((a, b) => {
                    const aAssign = Number(a.bankMeta?.assignment?.num ?? 9999);
                    const bAssign = Number(b.bankMeta?.assignment?.num ?? 9999);
                    if (aAssign !== bAssign) return aAssign - bAssign;
                    const aIdx = Number(a.bankMeta?.questionIndex ?? 9999);
                    const bIdx = Number(b.bankMeta?.questionIndex ?? 9999);
                    if (aIdx !== bIdx) return aIdx - bIdx;
                    return a.ts - b.ts;
                });
                questionLines.push(`### ${revisionChapterSectionTitle(chapterNum)}`);
                for (const row of rowsForChapter) {
                    const qLabel = formatRevisionQuestionLabel(row.qid, { referenceLabel: row.referenceLabel });
                    questionLines.push(`**${qLabel}: ${row.q || row.qid || 'Untitled question'}**`);
                    questionLines.push(`**A:** ${row.a || '_No answer captured._'}`);
                    questionLines.push('');
                }
            }
        }

        const chapterLines = [];
        const sortedChapters = chapters.slice().sort((a, b) => Number(a?.number || 0) - Number(b?.number || 0));
        if (!sortedChapters.length) {
            chapterLines.push('_No chapter drafts in this revision._');
        } else {
            for (const ch of sortedChapters) {
                const chapterNum = Number(ch?.number || 0);
                const chapterTitle = String(ch?.title || `Chapter ${chapterNum || '?'}`).trim();
                const chapterMarkdown = String(ch?.draft?.markdown || ch?.draft?.content || '').trim();
                chapterLines.push(`## Chapter ${chapterNum || '?'}: ${chapterTitle}`);
                if (!chapterMarkdown) {
                    chapterLines.push('_No draft text._');
                    chapterLines.push('');
                    continue;
                }
                chapterLines.push(chapterMarkdown);
                chapterLines.push('');
                chapterLines.push('---');
                chapterLines.push('');
            }
        }

        const previewMarkdown = [
            `# ${projectTitle}`,
            `Created: ${formatUiDateTime(record.createdAt) || '—'} (${String(record.trigger || 'manual')})`,
            '',
            '## Questions and Answers',
            ...questionLines,
            '',
            '## Chapter Drafts',
            ...chapterLines,
        ].join('\n');

        previewEl.innerHTML = renderMarkdown(previewMarkdown);
        applyFindHighlights();
    };

    const fetchRows = async () => {
        const data = await api('GET', '/api/system/author/project/revisions');
        rows = Array.isArray(data?.revisions) ? data.revisions : [];
        revisionListLimit = Number(data?.limit || 50);
        state.revisionLimitReached = rows.length >= revisionListLimit;
        renderList();
        setRevisionCountStatus();
    };

    const previewRevision = async (id) => {
        selectedRevisionId = id;
        renderList();
        const record = await api('GET', `/api/system/author/project/revisions/${encodeURIComponent(id)}`);
        renderPreview(record);
    };

    document.getElementById('book-revisions-close')?.addEventListener('click', () => returnToAdminDeskHome());
    document.getElementById('book-revisions-create')?.addEventListener('click', async () => {
        setStatus('Creating...');
        try {
            await api('POST', '/api/system/author/project/revisions', { trigger: 'manual' });
            state.revisionDirty = false;
            state.revisionLastAutoAt = Date.now();
            await fetchRows();
            setStatus('Revision created.', { ok: true });
        } catch (err) {
            setStatus(err.message || 'Failed to create revision.', { error: true });
        }
    });
    document.getElementById('book-revisions-delete-selected')?.addEventListener('click', async () => {
        const ids = Array.from(document.querySelectorAll('.book-revision-row-check:checked')).map(el => String(el.dataset.id || '')).filter(Boolean);
        if (!ids.length) {
            setStatus('Select at least one revision.', { error: true });
            return;
        }
        if (!window.confirm(`Delete ${ids.length} selected revision(s)?`)) return;
        try {
            await api('DELETE', '/api/system/author/project/revisions/bulk', { revisionIds: ids });
            await fetchRows();
            previewEl.innerHTML = '<p class="desk-revisions-preview-placeholder">Click a revision card to preview full content.</p>';
            selectedRevisionId = '';
            setStatus('Deleted selected revisions.', { ok: true });
        } catch (err) {
            setStatus(err.message || 'Delete failed.', { error: true });
        }
    });
    findInputEl?.addEventListener('input', () => applyFindHighlights());
    findInputEl?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        if (!findMatches.length) return;
        e.preventDefault();
        setActiveFindMatch(activeFindIndex + (e.shiftKey ? -1 : 1));
    });
    findPrevBtn?.addEventListener('click', () => {
        if (!findMatches.length) return;
        setActiveFindMatch(activeFindIndex - 1);
    });
    findNextBtn?.addEventListener('click', () => {
        if (!findMatches.length) return;
        setActiveFindMatch(activeFindIndex + 1);
    });
    findClearBtn?.addEventListener('click', () => {
        if (findInputEl) findInputEl.value = '';
        clearFindHighlights();
    });

    listEl?.addEventListener('click', async (e) => {
        const restoreBtn = e.target.closest('.book-revision-restore');
        const deleteBtn = e.target.closest('.book-revision-delete');
        const checkEl = e.target.closest('.book-revision-row-check');
        const card = e.target.closest('.desk-revision-card');
        const idFromBtn = String(restoreBtn?.dataset.id || deleteBtn?.dataset.id || '').trim();
        const idFromCard = String(card?.dataset.id || '').trim();

        if (deleteBtn && idFromBtn) {
            const id = idFromBtn;
            const newestId = rows[0]?.id || '';
            const deletingNewest = id === newestId;
            if (!window.confirm('Delete this revision permanently?')) return;
            const confirmDeleteNewest = deletingNewest && window.confirm('This is the newest revision. Delete anyway?');
            try {
                await api('DELETE', '/api/system/author/project/revisions/bulk', { revisionIds: [id], confirmDeleteNewest });
                await fetchRows();
                previewEl.innerHTML = '<p class="desk-revisions-preview-placeholder">Click a revision card to preview full content.</p>';
                selectedRevisionId = '';
                setStatus('Revision deleted.', { ok: true });
            } catch (err) {
                setStatus(err.message || 'Delete failed.', { error: true });
            }
            return;
        }
        if (restoreBtn && idFromBtn) {
            const id = idFromBtn;
            const typed = window.prompt('Type RESTORE to confirm full restore.');
            if (typed !== 'RESTORE') return;
            try {
                setStatus('Restoring revision...');
                await api('POST', `/api/system/author/project/revisions/${encodeURIComponent(id)}/restore`, {});
                await fetchRows();
                await Promise.all([
                    (async () => { state.project = await api('GET', '/api/system/author/project'); })(),
                    (async () => { state.outline = await loadProjectOutline(); })(),
                    (async () => { await loadSavedChaptersFromServer(); })(),
                    (async () => { state.manuscript = await api('GET', '/api/system/author/project/manuscript'); })(),
                ]);
                renderStep();
                setStatus('Revision restored.', { ok: true });
            } catch (err) {
                setStatus(err.message || 'Restore failed.', { error: true });
            }
            return;
        }
        if (checkEl) return;

        if (idFromCard) {
            try {
                setStatus('Loading preview...');
                await previewRevision(idFromCard);
                setRevisionCountStatus();
            } catch (err) {
                setStatus(err.message || 'Preview failed.', { error: true });
            }
        }
    });

    await fetchRows();
}
