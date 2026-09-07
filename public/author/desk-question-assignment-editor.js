'use strict';

/**
 * Admin Desk — Assignment Editor (question banks + chapter mapping).
 * Extracted from author-app.js (Phase 1 Admin Desk separation).
 * UX unchanged: still mounts into #my-desk-empty.
 */

import { state } from './state.js';
import { adminApi as api } from '../admin-desk-api.js';
import { esc, formatUiDateTime } from './ui-helpers.js';
import { showTextDialog } from './text-dialog.js';
import {
    applyAssignmentImportToDraft,
    showAssignmentImportDialog,
} from './assignment-import.js';
import {
    chapterQuestionsBucketKeyForAssignment,
    formatChapterAssignmentQuestionNumber,
    formatChapterAssignmentQuestionRange,
    getActiveChapterStrategy,
    isNoChapterMapValue,
    isUnassignedAssignmentRow,
    listStrategyChapterSlots,
    migrateLegacyAssignmentIndexChapterMapInPlace,
    migrateLegacyNoneChapterQuestionsInPlace,
    newOpaqueQuestionId,
    purgeOrphanQuestionBucketsInPlace,
    resolveMappedChapterNumber,
    strategyChapterNumberFromIndex,
    strategyMaxChapterNumber,
    WMB_NO_CHAPTER_MAP_VALUE,
    WMB_NO_CHAPTER_BANK_KEY,
    WMB_UNASSIGNED_SIDEBAR_GROUP,
} from './static-data.js';
import { openContentBankRevisionsPanel } from './desk-content-bank-revisions.js';

/** Section title for assignments with no book chapter (matches author-app copy). */
const WMB_UI_UNASSIGNED_ASSIGNMENTS = 'Unassigned assignments';

const QE_EDITOR_LEFT_WIDTH_LS_KEY = 'wmb-qe-editor-left-width';

function initEditorPanelColumnResize(hostEl, {
    lsKey,
    widthVar,
    bodyClass = 'editor-col-resizing',
    defaultWidth = 280,
    handleSelector = '[data-editor-col-resize]',
} = {}) {
    const handle = hostEl?.querySelector?.(handleSelector);
    if (!hostEl || !handle || !lsKey || !widthVar) return;

    const saved = parseInt(String(localStorage.getItem(lsKey) || ''), 10);
    if (Number.isFinite(saved) && saved >= 180) {
        hostEl.style.setProperty(widthVar, `${saved}px`);
    }

    const clampWidth = (clientX) => {
        const rect = hostEl.getBoundingClientRect();
        const min = 180;
        const max = Math.max(min, Math.floor(rect.width * 0.68));
        return Math.min(Math.max(Math.round(clientX - rect.left), min), max);
    };

    let dragging = false;

    const finishDrag = () => {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove(bodyClass);
        const px = parseInt(String(hostEl.style.getPropertyValue(widthVar) || ''), 10);
        if (Number.isFinite(px)) localStorage.setItem(lsKey, String(px));
    };

    handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        dragging = true;
        handle.setPointerCapture(e.pointerId);
        document.body.classList.add(bodyClass);
    });

    handle.addEventListener('pointermove', (e) => {
        if (!dragging || !handle.hasPointerCapture(e.pointerId)) return;
        hostEl.style.setProperty(widthVar, `${clampWidth(e.clientX)}px`);
    });

    const endPointerDrag = (e) => {
        if (!dragging) return;
        finishDrag();
        if (handle.hasPointerCapture(e.pointerId)) {
            handle.releasePointerCapture(e.pointerId);
        }
    };
    handle.addEventListener('pointerup', endPointerDrag);
    handle.addEventListener('pointercancel', endPointerDrag);

    handle.addEventListener('keydown', (e) => {
        const current = parseInt(String(hostEl.style.getPropertyValue(widthVar) || String(defaultWidth)), 10) || defaultWidth;
        let next = current;
        if (e.key === 'ArrowLeft') next = current - 16;
        if (e.key === 'ArrowRight') next = current + 16;
        if (next === current) return;
        e.preventDefault();
        const rect = hostEl.getBoundingClientRect();
        const min = 180;
        const max = Math.max(min, Math.floor(rect.width * 0.68));
        const clamped = Math.min(Math.max(next, min), max);
        hostEl.style.setProperty(widthVar, `${clamped}px`);
        localStorage.setItem(lsKey, String(clamped));
    });
}

function initQeEditorColumnResize(hostEl) {
    initEditorPanelColumnResize(hostEl, {
        lsKey: QE_EDITOR_LEFT_WIDTH_LS_KEY,
        widthVar: '--qe-editor-left-width',
        bodyClass: 'qe-editor-col-resizing',
        handleSelector: '[data-qe-col-resize]',
    });
}

/**
 * @param {{
 *   renderMyDeskList: () => void,
 *   setMyDeskWorkspaceMode: (enabled: boolean) => void,
 *   refreshAuthorAssignmentUxFromServer: () => Promise<void>,
 * }} deps
 */
export async function launchQuestionAssignmentEditorPanel(deps) {
    const {
        renderMyDeskList,
        setMyDeskWorkspaceMode,
        refreshAuthorAssignmentUxFromServer,
    } = deps || {};
    if (typeof renderMyDeskList !== 'function'
        || typeof setMyDeskWorkspaceMode !== 'function'
        || typeof refreshAuthorAssignmentUxFromServer !== 'function') {
        throw new Error('launchQuestionAssignmentEditorPanel requires desk host deps');
    }

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
        <div class="qe-panel-root qe-panel-root--compact qe-panel-root--resizable">
            <header class="qe-panel-head qe-panel-head--with-situation">
                <div class="qe-panel-head-main">
                    <h3>Assignment Editor</h3>
                    <div class="qe-situation-toolbar">
                        <label class="qe-situation-label" for="qe-booktype-select">Book type</label>
                        <select id="qe-booktype-select" class="auth-field qe-situation-select" aria-label="Book type"></select>
                        <label class="qe-situation-label" for="qe-situation-select">Situation</label>
                        <select id="qe-situation-select" class="auth-field qe-situation-select" aria-label="Book situation"></select>
                    </div>
                </div>
                <button id="question-editor-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <p class="qe-panel-intro">
                Choose a book type before editing — nothing loads until you pick one (Career Memoir is not assumed).
                Assignments are grouped by book chapter. Use the drag handle beside an assignment to drop it on another chapter or on Unassigned assignments to clear its chapter map.
                Click a question to edit it (voice, refine). Questions, labels, and instructions save automatically (including when instructions are cleared). Use Save under Chapter mapping to force a metadata save.
            </p>
            <div id="question-editor-host" class="qe-panel-grid qe-panel-grid--compact qe-panel-grid--resizable">
                <div class="card qe-panel-column" id="question-editor-left">
                    <p style="color:var(--c-muted);font-size:.8rem;margin:0;">Loading...</p>
                </div>
                <div class="qe-panel-resize-handle" data-qe-col-resize role="separator" aria-orientation="vertical" aria-label="Resize assignment list and editor columns" tabindex="0"></div>
                <div class="card qe-panel-column qe-editor-right qe-editor-right-col" id="question-editor-right">
                    <div id="question-editor-form" class="qe-chapter-form"></div>
                </div>
            </div>
            <div id="question-editor-footer-stats" class="qe-footer-stats" role="status" aria-live="polite"></div>
            <footer class="qe-panel-actions">
                <button type="button" class="btn btn-ghost" id="qe-editor-history">History</button>
                <span id="question-editor-status" class="qe-panel-status"></span>
            </footer>
        </div>
    `;

    document.getElementById('question-editor-close')?.addEventListener('click', async () => {
        const closeBtn = document.getElementById('question-editor-close');
        if (closeBtn) closeBtn.disabled = true;
        try {
            await qePersistQueue;
        } catch (_) {}
        emptyEl.classList.remove('book-audit-host');
        emptyEl.innerHTML = '';
        setMyDeskWorkspaceMode(false);
        emptyEl.classList.remove('hidden');
        try {
            await refreshAuthorAssignmentUxFromServer();
        } catch (_) {}
        if (closeBtn) closeBtn.disabled = false;
    });

    const leftEl = document.getElementById('question-editor-left');
    const rightHostEl = document.getElementById('question-editor-right');
    const formEl = document.getElementById('question-editor-form');
    const statusEl = document.getElementById('question-editor-status');
    const footerStatsEl = document.getElementById('question-editor-footer-stats');
    if (!leftEl || !rightHostEl || !formEl) return;

    initQeEditorColumnResize(document.getElementById('question-editor-host'));

    let draft = {
        assignments: [],
        chapterMap: {},
        chapterQuestions: {},
        bookType: '',
        bookSituation: '',
    };
    /** Empty until the admin actively chooses a book type (no Career Memoir default). */
    let selectedBookType = '';
    let selectedSituation = '';
    let availableBookTypes = [];
    let availableBookSituations = [];
    /** True after a bank has been loaded for the current selection. */
    let bankLoaded = false;
    /** Chapter slots for the bank book type (from per-type strategy catalog). */
    let bankStrategySlots = [];
    let bankDefaultStrategy = null;
    let selectedNum = null;
    let qeMetaUpdatedAt = null;
    let qeMetaUpdatedBy = null;
    /** Set while dragging a question by its handle: source chapter-mapping storage key + index in that array. */
    let qeDragQuestion = null;
    /** Set while dragging an assignment row to a different book chapter (updates draft.chapterMap). */
    let qeDragAssignmentNum = null;

    function qeHasActiveBank() {
        return Boolean(String(selectedBookType || '').trim()) && bankLoaded;
    }

    /** Serialize PATCH so rapid drags stay in order. */
    let qePersistQueue = Promise.resolve();
    async function qePatchQuestionEditorDraftToServer() {
        if (!qeHasActiveBank()) {
            throw new Error('Choose a book type before saving.');
        }
        qeDedupeAssignmentsInDraft();
        purgeOrphanQuestionBucketsInPlace(draft.assignments, draft.chapterQuestions);
        const res = await api('PATCH', '/api/system/question-assignment-editor-data', {
            ...draft,
            bookType: selectedBookType,
            bookSituation: selectedSituation || 'default',
        });
        if (res && res.updatedAt) qeMetaUpdatedAt = String(res.updatedAt);
        if (res && res.updatedBy != null) qeMetaUpdatedBy = String(res.updatedBy);
        return res;
    }

    /** Persists assignment labels, descriptions, and chapter map only (not question banks). */
    async function qePatchAssignmentMetadataToServer() {
        if (!qeHasActiveBank()) {
            throw new Error('Choose a book type before saving.');
        }
        qeDedupeAssignmentsInDraft();
        // Always send explicit description strings (including '') so blanking persists.
        const payload = {
            assignments: (draft.assignments || []).map((a) => ({
                num: Number(a.num),
                label: String(a.label || ''),
                description: String(a.description ?? ''),
            })),
            chapterMap: draft.chapterMap && typeof draft.chapterMap === 'object'
                ? { ...draft.chapterMap }
                : {},
            bookType: selectedBookType,
            bookSituation: selectedSituation || 'default',
        };
        const res = await api('PATCH', '/api/system/question-assignment-editor-data', payload);
        if (res && res.updatedAt) qeMetaUpdatedAt = String(res.updatedAt);
        if (res && res.updatedBy != null) qeMetaUpdatedBy = String(res.updatedBy);
        return res;
    }

    function qePersistAssignmentMetadata(statusMessage = 'Saved assignment details.') {
        qePersistQueue = qePersistQueue
            .then(async () => {
                if (statusEl) {
                    statusEl.style.color = 'var(--c-muted)';
                    statusEl.textContent = 'Saving…';
                }
                qeSyncOpenAssignmentMetadataFromDom();
                await qePatchAssignmentMetadataToServer();
                if (statusEl) {
                    statusEl.style.color = 'var(--c-success)';
                    statusEl.textContent = statusMessage;
                }
                renderLeft();
                qeRenderFooterStats();
            })
            .catch((err) => {
                if (statusEl) {
                    statusEl.style.color = 'var(--c-danger)';
                    statusEl.textContent = err.message || 'Save failed';
                }
            });
        return qePersistQueue;
    }
    function qePersistDraftAfterDrag() {
        qePersistQueue = qePersistQueue
            .then(async () => {
                if (statusEl) {
                    statusEl.style.color = 'var(--c-muted)';
                    statusEl.textContent = 'Saving…';
                }
                await qePatchQuestionEditorDraftToServer();
                if (statusEl) {
                    statusEl.style.color = 'var(--c-success)';
                    statusEl.textContent = 'Saved.';
                }
                qeRenderFooterStats();
            })
            .catch((err) => {
                if (statusEl) {
                    statusEl.style.color = 'var(--c-danger)';
                    statusEl.textContent = err.message || 'Save failed';
                }
            });
    }

    function qeSyncOpenAssignmentMetadataFromDom() {
        const assignment = (draft.assignments || []).find((a) => Number(a.num) === Number(selectedNum));
        if (!assignment) return;
        const labelEl = document.getElementById('qe-assignment-label');
        const descEl = document.getElementById('qe-assignment-description');
        const chapterEl = document.getElementById('qe-question-group-chapter-mapping');
        if (labelEl && !qeIsLabelLocked(assignment)) {
            assignment.label = String(labelEl.value || '');
        }
        if (descEl) {
            assignment.description = String(descEl.value || '');
        }
        if (chapterEl && !qeIsProtectedStartMyBook(assignment)) {
            qeApplyChapterMappingSelectValue(assignment.num, chapterEl.value);
        }
    }

    if (!rightHostEl.dataset.qeMetadataSaveBound) {
        rightHostEl.dataset.qeMetadataSaveBound = '1';
        rightHostEl.addEventListener('click', async (e) => {
            const btn = e.target.closest('#qe-save-assignment-metadata');
            if (!btn || !rightHostEl.contains(btn)) return;
            e.preventDefault();
            btn.disabled = true;
            const prevText = btn.textContent;
            btn.textContent = 'Saving…';
            try {
                await qePersistAssignmentMetadata('Saved assignment details.');
            } finally {
                btn.disabled = false;
                btn.textContent = prevText || 'Save';
            }
        });
    }

    const QE_DRAG_HINT_LS_KEY = 'dragHintSeen';
    function qeMarkDragHintSeen() {
        try {
            localStorage.setItem(QE_DRAG_HINT_LS_KEY, 'true');
        } catch (_) { /* ignore */ }
    }
    function qeIsDragHintDismissed() {
        try {
            return localStorage.getItem(QE_DRAG_HINT_LS_KEY) === 'true';
        } catch (_) {
            return true;
        }
    }

    /** Question labels: assign#.chapter#.question# (e.g. 2.1.1). */
    function qeFormatQuestionNumber(assignment, idx) {
        return formatChapterAssignmentQuestionNumber(
            assignment, idx, draft.chapterMap, draft.assignments, draft.chapterQuestions,
        );
    }

    function qeFormatQuestionNumberRange(assignment, count) {
        return formatChapterAssignmentQuestionRange(
            assignment, count, draft.chapterMap, draft.assignments, draft.chapterQuestions,
        );
    }

    /** Count non-empty example blocks separated by blank lines (matches Ghostwriter / editor save). */
    function qeCountSavedExamples(raw) {
        const s = String(raw != null ? raw : '').replace(/\r\n/g, '\n').trim();
        if (!s) return 0;
        return s.split(/\n\s*\n/g).map((t) => String(t || '').trim()).filter(Boolean).length;
    }

    function qeExamplesToggleButtonText(count) {
        const n = Math.max(0, Math.floor(Number(count)) || 0);
        return n === 1 ? '1 Example' : `${n} Examples`;
    }

    function qeSyncExampleToggleLabel(toggleBtn, exampleTemplatesField) {
        if (!toggleBtn) return;
        const labelEl = toggleBtn.querySelector('.qe-example-toggle-label');
        if (!labelEl) return;
        const n = qeCountSavedExamples(exampleTemplatesField);
        labelEl.textContent = qeExamplesToggleButtonText(n);
        const noun = n === 1 ? 'example' : 'examples';
        toggleBtn.setAttribute('aria-label', `${n} saved ${noun}. Show or hide the examples editor`);
    }

    /** Strategy beat titles shown as Chapter mapping options (numbered lists in the app). */
    function strategySlotOptions() {
        if (Array.isArray(bankStrategySlots) && bankStrategySlots.length) {
            return bankStrategySlots;
        }
        return listStrategyChapterSlots(bankDefaultStrategy || getActiveChapterStrategy());
    }

    function qeApplyChapterMappingSelectValue(assignmentNum, selectValue) {
        const raw = String(selectValue ?? '').trim();
        const k = String(assignmentNum);
        if (raw === WMB_NO_CHAPTER_MAP_VALUE) {
            draft.chapterMap[k] = WMB_NO_CHAPTER_MAP_VALUE;
            return;
        }
        const match = strategySlotOptions().find((o) => o.title === raw);
        draft.chapterMap[k] = match ? match.number : raw;
    }

    function qeBuildChapterMappingSelectHtml(assignment, mapped, isNoChapter, chapterNum) {
        const options = strategySlotOptions();
        let selectedTitle = '';
        if (!isNoChapterMapValue(mapped)) {
            if (typeof mapped === 'number' || (typeof mapped === 'string' && /^\d+$/.test(String(mapped).trim()))) {
                selectedTitle = options.find((o) => o.number === Number(mapped))?.title || '';
            } else {
                selectedTitle = String(mapped || '').trim();
            }
        }
        if (!selectedTitle && Number.isFinite(chapterNum)) {
            selectedTitle = options.find((o) => o.number === chapterNum)?.title || '';
        }
        return `<select id="qe-question-group-chapter-mapping" class="auth-field qe-right-select" aria-label="Chapter Mapping">
                    <option value="${esc(WMB_NO_CHAPTER_MAP_VALUE)}" ${isNoChapterMapValue(mapped) ? 'selected' : ''}>No Chapter</option>
                    ${options.map((o) => `<option value="${esc(o.title)}" ${o.title === selectedTitle ? 'selected' : ''}>${o.number}. ${esc(o.title)}</option>`).join('')}
               </select>`;
    }

    function chapterQuestionsForAssignment(num) {
        const mapped = draft.chapterMap?.[String(num)] ?? draft.chapterMap?.[num];
        const key = chapterQuestionsBucketKeyForAssignment(num, draft.chapterMap);
        if (isNoChapterMapValue(mapped)) {
            if (!Array.isArray(draft.chapterQuestions[key])) draft.chapterQuestions[key] = [];
            return { chapterNum: null, key, questions: draft.chapterQuestions[key], mapped, isNoChapter: true };
        }
        const chapterNum = resolveMappedChapterNumber(mapped, num);
        if (!Array.isArray(draft.chapterQuestions[key])) draft.chapterQuestions[key] = [];
        return { chapterNum, key, questions: draft.chapterQuestions[key], mapped, isNoChapter: false };
    }

    function qeIsProtectedUnassigned(a) {
        return isUnassignedAssignmentRow(a);
    }

    function qeIsProtectedStartMyBook(a) {
        if (!a) return false;
        if (String(a.kind || '').toLowerCase() === 'start_my_book') return true;
        return Number(a.num) === 0;
    }

    function qeStripStartMyBookFromDraft() {
        draft.assignments = (draft.assignments || []).filter((a) => !qeIsProtectedStartMyBook(a));
        if (draft.chapterMap && typeof draft.chapterMap === 'object') {
            delete draft.chapterMap['0'];
            delete draft.chapterMap[0];
        }
        if (draft.chapterQuestions && typeof draft.chapterQuestions === 'object') {
            delete draft.chapterQuestions['0'];
        }
    }

    function qeIsLabelLocked(a) {
        return qeIsProtectedUnassigned(a);
    }

    /** RTDB can return assignment lists as { "0": row, "1": row } instead of arrays. */
    function qeCoerceAssignmentsArray(raw) {
        if (Array.isArray(raw)) return raw;
        if (raw && typeof raw === 'object') {
            const keys = Object.keys(raw).filter((k) => /^\d+$/.test(k));
            if (keys.length) return keys.sort((a, b) => Number(a) - Number(b)).map((k) => raw[k]);
        }
        return [];
    }

    /** Collapse duplicate Assignment nums (e.g. bad RTDB rows or racey saves). */
    function qeDedupeAssignmentsInDraft() {
        const list = draft.assignments || [];
        const m = new Map();
        for (const a of list) {
            if (!a || !Number.isFinite(Number(a.num))) continue;
            m.set(Number(a.num), a);
        }
        draft.assignments = Array.from(m.keys()).sort((x, y) => x - y).map((n) => m.get(n));
    }

    function qeStripUnassignedFromDraft() {
        const removed = (draft.assignments || []).filter(qeIsProtectedUnassigned);
        draft.assignments = (draft.assignments || []).filter((a) => !qeIsProtectedUnassigned(a));
        for (const a of removed) {
            const { key } = chapterQuestionsForAssignment(a.num);
            delete draft.chapterQuestions[key];
            delete draft.chapterMap[String(a.num)];
            delete draft.chapterMap[a.num];
        }
    }

    function qeNormalizeQuestionEditorDraft() {
        qeStripStartMyBookFromDraft();
        const hadUnassigned = (draft.assignments || []).some(qeIsProtectedUnassigned);
        qeStripUnassignedFromDraft();
        const list = draft.assignments || [];
        list.sort((a, b) => a.num - b.num);
        qeDedupeAssignmentsInDraft();
        const chapterCount = strategyMaxChapterNumber(bankDefaultStrategy || getActiveChapterStrategy());
        const mapChanged = migrateLegacyAssignmentIndexChapterMapInPlace(
            draft.assignments,
            draft.chapterMap,
            chapterCount,
        );
        purgeOrphanQuestionBucketsInPlace(draft.assignments, draft.chapterQuestions);
        return hadUnassigned || mapChanged;
    }

    function qeSidebarGroupKeyForAssignment(a) {
        if (qeIsProtectedUnassigned(a)) return WMB_UNASSIGNED_SIDEBAR_GROUP;
        const mapped = draft.chapterMap?.[String(a.num)] ?? draft.chapterMap?.[a.num];
        if (isNoChapterMapValue(mapped)) return WMB_NO_CHAPTER_BANK_KEY;
        const chapterNum = resolveMappedChapterNumber(mapped, a.num);
        if (chapterNum === null || chapterNum === undefined) return String(a.num);
        return String(chapterNum);
    }

    function qeBuildChapterTreeModel() {
        const stepList = draft.assignments || [];
        const assignmentsByChapter = {};
        for (const assignment of stepList) {
            const groupKey = qeSidebarGroupKeyForAssignment(assignment);
            if (!assignmentsByChapter[groupKey]) assignmentsByChapter[groupKey] = [];
            assignmentsByChapter[groupKey].push(assignment);
        }
        const opts = strategySlotOptions();
        const bookChapterTitles = opts.map((o) => o.title);
        const usedNumericKeys = new Set();
        const sections = [];

        if (bookChapterTitles.length > 0) {
            for (let i = 0; i < bookChapterTitles.length; i++) {
                const chapterNum = strategyChapterNumberFromIndex(i);
                const key = String(chapterNum);
                usedNumericKeys.add(key);
                sections.push({
                    chapterNum,
                    title: bookChapterTitles[i],
                    list: assignmentsByChapter[key] || [],
                    dropAttr: String(chapterNum),
                });
            }
        } else {
            const numericKeysFallback = Object.keys(assignmentsByChapter)
                .filter((k) => /^\d+$/.test(String(k)))
                .sort((a, b) => Number(a) - Number(b));
            for (const key of numericKeysFallback) {
                usedNumericKeys.add(key);
                sections.push({
                    chapterNum: Number(key),
                    title: `Chapter ${key}`,
                    list: assignmentsByChapter[key] || [],
                    dropAttr: key,
                });
            }
        }

        const extraNumericKeys = Object.keys(assignmentsByChapter)
            .filter((k) => /^\d+$/.test(String(k)) && !usedNumericKeys.has(k))
            .sort((a, b) => Number(a) - Number(b));
        for (const key of extraNumericKeys) {
            sections.push({
                chapterNum: Number(key),
                title: `Chapter ${key}`,
                list: assignmentsByChapter[key] || [],
                dropAttr: key,
            });
        }

        const noneList = assignmentsByChapter[WMB_NO_CHAPTER_BANK_KEY] || [];
        const unassignedList = assignmentsByChapter[WMB_UNASSIGNED_SIDEBAR_GROUP] || [];
        return { assignmentsByChapter, sections, noneList, unassignedList };
    }

    /** Apply chapter-map target from a sidebar drop zone (`none`, `0`, or `1`..N). Returns false if invalid. */
    function qeSetAssignmentChapterMapping(assignmentNum, dropAttr) {
        const k = String(assignmentNum);
        if (dropAttr === 'none') {
            draft.chapterMap[k] = WMB_NO_CHAPTER_MAP_VALUE;
            return true;
        }
        const n = Number(dropAttr);
        const opts = strategySlotOptions();
        const maxChapter = opts.length ? opts[opts.length - 1].number : -1;
        if (!Number.isFinite(n) || n < 0 || n > maxChapter) return false;
        draft.chapterMap[k] = n;
        return true;
    }

    /** Updates draft.chapterMap; returns true if the mapping actually changed (persist + re-render). */
    function qeApplyDraftMapForChapterDrop(assignmentNum, dropAttr) {
        const k = String(assignmentNum);
        const prevMapped = draft.chapterMap?.[k] ?? draft.chapterMap?.[assignmentNum];
        if (!qeSetAssignmentChapterMapping(assignmentNum, dropAttr)) return false;
        const nextMapped = draft.chapterMap[k];
        return String(prevMapped ?? '') !== String(nextMapped ?? '');
    }

    function qeAddAssignment(dropAttr) {
        const nums = (draft.assignments || []).map((a) => a.num);
        const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
        draft.assignments.push({
            num: nextNum,
            label: 'New Assignment',
            description: '',
        });
        const mapTarget = dropAttr != null && String(dropAttr) !== '' ? String(dropAttr) : 'none';
        qeSetAssignmentChapterMapping(nextNum, mapTarget);
        const { key } = chapterQuestionsForAssignment(nextNum);
        if (!Array.isArray(draft.chapterQuestions[key])) draft.chapterQuestions[key] = [];
        selectedNum = nextNum;
        renderLeft();
        renderRight();
        void qePatchQuestionEditorDraftToServer()
            .then(() => {
                qeRenderFooterStats();
                if (statusEl) {
                    statusEl.style.color = 'var(--c-success)';
                    statusEl.textContent = 'Saved.';
                }
            })
            .catch((err) => {
                if (statusEl) {
                    statusEl.style.color = 'var(--c-danger)';
                    statusEl.textContent = err.message || 'Could not save new assignment';
                }
            });
    }

    function qeIsRegularAssignmentRow(a) {
        if (!a) return false;
        if (qeIsProtectedStartMyBook(a) || qeIsProtectedUnassigned(a)) return false;
        return true;
    }

    function qeResolveAssignmentChapterNum(a) {
        const mapped = draft.chapterMap?.[String(a.num)] ?? draft.chapterMap?.[a.num];
        if (isNoChapterMapValue(mapped)) return null;
        return resolveMappedChapterNumber(mapped, a.num);
    }

    async function qeRunAssignmentImport() {
        const result = await showAssignmentImportDialog();
        if (!result || !result.parsed) return;

        if (statusEl) {
            statusEl.style.color = 'var(--c-muted)';
            statusEl.textContent = 'Applying import…';
        }

        try {
            const stats = applyAssignmentImportToDraft(draft, result.parsed.assignments, {
                removeUnlisted: !result.keepUnlisted,
                resolveChapterNum: qeResolveAssignmentChapterNum,
                isRegularAssignment: qeIsRegularAssignmentRow,
                chapterQuestionsBucketKeyForAssignment,
            });
            qeNormalizeQuestionEditorDraft();
            if (!draft.assignments.some((a) => Number(a.num) === Number(selectedNum))) {
                const fallback = (draft.assignments || []).find((a) => qeIsRegularAssignmentRow(a));
                selectedNum = fallback ? Number(fallback.num) : (draft.assignments?.[0]?.num ?? null);
            }
            renderLeft();
            renderRight();
            await qePatchQuestionEditorDraftToServer();
            qeRenderFooterStats();
            if (statusEl) {
                statusEl.style.color = 'var(--c-success)';
                const parts = [`Imported ${stats.updated} assignment${stats.updated === 1 ? '' : 's'}`];
                if (stats.created) parts.push(`${stats.created} created`);
                if (stats.removed) parts.push(`${stats.removed} removed`);
                statusEl.textContent = `${parts.join(', ')}. Saved.`;
            }
        } catch (err) {
            if (statusEl) {
                statusEl.style.color = 'var(--c-danger)';
                statusEl.textContent = err.message || 'Import failed';
            }
        }
    }

    function qeDeleteAssignment(num) {
        const victim = draft.assignments.find((a) => Number(a.num) === Number(num));
        if (!victim || qeIsProtectedUnassigned(victim) || qeIsProtectedStartMyBook(victim)) return;
        if (!window.confirm('Delete this Assignment? Its prompts will be removed.')) return;

        const fromKey = chapterQuestionsForAssignment(num).key;
        draft.chapterQuestions[fromKey] = [];

        draft.assignments = draft.assignments.filter((a) => Number(a.num) !== Number(num));
        delete draft.chapterMap[String(num)];

        if (Number(selectedNum) === Number(num)) {
            const fallback = (draft.assignments || []).find((a) => !qeIsProtectedStartMyBook(a));
            selectedNum = fallback ? Number(fallback.num) : (draft.assignments?.[0]?.num ?? 1);
        }
        renderLeft();
        renderRight();
        void qePatchQuestionEditorDraftToServer()
            .then(() => { qeRenderFooterStats(); })
            .catch((err) => {
                if (statusEl) {
                    statusEl.style.color = 'var(--c-danger)';
                    statusEl.textContent = err.message || 'Save failed';
                }
            });
    }

    function qeFormatQuestionEditorUpdatedAt(iso) {
        return formatUiDateTime(iso) || '—';
    }

    function qeComputeQuestionEditorFooterStats() {
        const chapterSlots = strategySlotOptions().length;
        const list = draft.assignments || [];
        const cq = draft.chapterQuestions && typeof draft.chapterQuestions === 'object' ? draft.chapterQuestions : {};

        const assignmentBucketKeys = new Set(
            (list || []).map((a) => chapterQuestionsBucketKeyForAssignment(a.num, draft.chapterMap))
        );

        /** Assignment maps to a positive book-chapter index (not “No chapter”). */
        function assignmentMappedToBookChapter(a) {
            if (!a || qeIsProtectedStartMyBook(a)) return false;
            if (qeIsProtectedUnassigned(a) || isUnassignedAssignmentRow(a)) return false;
            const mapped = draft.chapterMap?.[String(a.num)] ?? draft.chapterMap?.[a.num];
            if (isNoChapterMapValue(mapped)) return false;
            const ch = resolveMappedChapterNumber(mapped, a.num);
            return Number.isFinite(ch) && ch >= 0;
        }

        let totalQuestionRows = 0;
        for (const v of Object.values(cq)) {
            if (Array.isArray(v)) totalQuestionRows += v.length;
        }

        let questionRowsUnderAssignmentBuckets = 0;
        let questionRowsOnMappedAssignments = 0;
        /** Regular assignments (not Start My Book) mapped to “No chapter”. */
        let questionRowsOnNoChapterAssignments = 0;
        let assignmentsMappedToBookChapters = 0;
        let totalTemplates = 0;

        for (const a of list) {
            if (assignmentMappedToBookChapter(a)) assignmentsMappedToBookChapters += 1;
            const key = chapterQuestionsBucketKeyForAssignment(a.num, draft.chapterMap);
            const qs = Array.isArray(cq[key]) ? cq[key] : [];
            const len = qs.length;
            questionRowsUnderAssignmentBuckets += len;
            if (assignmentMappedToBookChapter(a)) questionRowsOnMappedAssignments += len;
            const mapped = draft.chapterMap?.[String(a.num)] ?? draft.chapterMap?.[a.num];
            if (!qeIsProtectedStartMyBook(a) && !qeIsProtectedUnassigned(a) && !isUnassignedAssignmentRow(a)
                && isNoChapterMapValue(mapped)) {
                questionRowsOnNoChapterAssignments += len;
            }
        }

        let orphanQuestionRows = 0;
        for (const [k, v] of Object.entries(cq)) {
            if (!Array.isArray(v) || !v.length) continue;
            if (assignmentBucketKeys.has(String(k))) continue;
            orphanQuestionRows += v.length;
        }

        for (const v of Object.values(cq)) {
            if (!Array.isArray(v)) continue;
            for (const q of v) {
                totalTemplates += qeCountSavedExamples(q?.example_templates);
            }
        }

        return {
            chapterSlots,
            totalAssignments: list.length,
            assignmentsMappedToBookChapters,
            totalQuestionRows,
            questionRowsUnderAssignmentBuckets,
            questionRowsOnMappedAssignments,
            questionRowsOnNoChapterAssignments,
            orphanQuestionRows,
            totalTemplates,
        };
    }

    function qeRenderFooterStats() {
        if (!footerStatsEl) return;
        if (!qeHasActiveBank()) {
            footerStatsEl.innerHTML = '';
            return;
        }
        const s = qeComputeQuestionEditorFooterStats();
        const updatedLabel = qeFormatQuestionEditorUpdatedAt(qeMetaUpdatedAt);
        const byRaw = qeMetaUpdatedBy ? String(qeMetaUpdatedBy).trim() : '';
        const byPart = byRaw
            ? ` <span class="qe-footer-stats-meta">(${esc(byRaw)})</span>`
            : '';
        const assignTitle = 'How many assignment rows are mapped to a numbered book chapter (not “No chapter”) versus total assignment rows in the list.';
        const qBankTitle = 'Every interview-question row stored under any key in the shared bank (including buckets not tied to a listed assignment).';
        const qLinkedTitle = 'Questions that belong to an assignment row mapped to a numbered book chapter (≥1). Drag assignments from “Unassigned assignments” onto a chapter to increase this.';
        const qNoChTitle = 'Questions on regular assignments (not Start My Book) whose chapter map is “No chapter”. You can still edit them here; map the assignment to a chapter when ready.';
        const qOrphanTitle = 'Question rows stored under RTDB keys that do not match any assignment’s bucket (e.g. legacy keys after a bad save). Re-seed chapter questions or move rows in Firebase to recover.';
        const templatesTitle = 'Saved answer-example blocks (blank-line separated) summed across every question row.';
        const orphanPart = s.orphanQuestionRows > 0
            ? ` <span class="qe-footer-stats-meta" title="${esc(qOrphanTitle)}">(${esc(String(s.orphanQuestionRows))} orphan)</span>`
            : '';
        footerStatsEl.innerHTML = `
            <span class="qe-footer-stats-item"><span class="qe-footer-stats-label">Chapters:</span> ${esc(String(s.chapterSlots))}</span>
            <span class="qe-footer-stats-sep" aria-hidden="true">·</span>
            <span class="qe-footer-stats-item" title="${esc(assignTitle)}"><span class="qe-footer-stats-label">Mapped:</span> ${esc(`${s.assignmentsMappedToBookChapters}/${s.totalAssignments}`)} <span class="qe-footer-stats-meta">assignments</span></span>
            <span class="qe-footer-stats-sep" aria-hidden="true">·</span>
            <span class="qe-footer-stats-item" title="${esc([qBankTitle, qLinkedTitle, qNoChTitle].join(' '))}"><span class="qe-footer-stats-label">Questions:</span> ${esc(String(s.totalQuestionRows))} bank · ${esc(String(s.questionRowsOnMappedAssignments))} linked · ${esc(String(s.questionRowsOnNoChapterAssignments))} no-chapter${orphanPart}</span>
            <span class="qe-footer-stats-sep" aria-hidden="true">·</span>
            <span class="qe-footer-stats-item" title="${esc(templatesTitle)}"><span class="qe-footer-stats-label">Templates:</span> ${esc(String(s.totalTemplates))}</span>
            <span class="qe-footer-stats-sep" aria-hidden="true">·</span>
            <span class="qe-footer-stats-item"><span class="qe-footer-stats-label">Under assignments:</span> ${esc(String(s.questionRowsUnderAssignmentBuckets))} <span class="qe-footer-stats-meta" title="Sum of question rows in each listed assignment’s bucket (should match sidebar if buckets align).">rows</span></span>
            <span class="qe-footer-stats-sep" aria-hidden="true">·</span>
            <span class="qe-footer-stats-item"><span class="qe-footer-stats-label">Last updated:</span> ${esc(updatedLabel)}${byPart}</span>
        `;
    }

    function renderLeft() {
        if (!qeHasActiveBank()) {
            leftEl.innerHTML = `
                <p class="qe-bank-select-prompt" style="color:var(--c-muted);font-size:.82rem;margin:0;line-height:1.45;">
                    Select a <strong>book type</strong> above to open that assignment bank.
                    No bank is loaded until you choose one.
                </p>`;
            return;
        }
        const model = qeBuildChapterTreeModel();
        const { sections, noneList } = model;

        function rowHtml(a, sectionCtx) {
            const protU = qeIsProtectedUnassigned(a);
            const protS = qeIsProtectedStartMyBook(a);
            const labelText = String(a.label || '').trim() || 'Assignment';
            const trash = protU || protS
                ? ''
                : `<span class="qe-delete-assignment" role="button" tabindex="0" data-num="${a.num}" title="Delete Assignment (prompts are removed)" aria-label="Delete Assignment"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></span>`;
            const bucketInfo = chapterQuestionsForAssignment(a.num);
            const qs = bucketInfo.questions || [];
            const qCount = qs.length;
            const numberRange = qCount > 0 ? qeFormatQuestionNumberRange(a, qCount) : '';
            const countText = qCount === 1 ? '1 question' : `${qCount} questions`;
            const numberRangeHtml = numberRange
                ? `<span class="qe-assignment-numbers">${esc(numberRange)}</span> · `
                : '';
            const canDragChapter = !protU && !protS;
            const handleCell = canDragChapter
                ? `<span class="qe-drag-handle qe-assignment-drag-handle" draggable="true" data-assignment-num="${a.num}" title="Drag onto a chapter or Unassigned assignments" aria-label="Drag assignment onto another chapter or Unassigned assignments"><i class="fa-solid fa-arrows-up-down-left-right" aria-hidden="true"></i></span>`
                : '<span class="qe-assignment-drag-placeholder" aria-hidden="true"></span>';
            return `
            <div class="qe-assignment-row">
            ${handleCell}
            <button type="button" class="btn btn-ghost qe-assignment-btn ${Number(selectedNum) === Number(a.num) ? 'assignment-card--active' : ''}" data-num="${a.num}">
                <span class="qe-assignment-btn-main">
                <span class="qe-assignment-label-wrap">
                <span class="qe-assignment-label">${esc(labelText)}</span>
                </span>
                ${trash}
                </span>
                <span class="qe-assignment-count">${numberRangeHtml}${esc(countText)}</span>
            </button>
            </div>`;
        }

        const chapterBlocks = sections.map((s) => {
            const sortedList = (s.list || []).slice().sort((a, b) => Number(a.num) - Number(b.num));
            const inner = sortedList.map((a, idx) => rowHtml(a, {
                sectionChapterNum: s.chapterNum,
                slotIndex: idx,
            })).join('');
            const innerBody = inner || '<p style="color:var(--c-muted);font-size:.72rem;margin:.15rem 0 0;">No assignments</p>';
            const title = String(s.title || '').trim() || `Chapter ${s.chapterNum}`;
            return `
            <div class="qe-book-chapter" data-qe-drop-chapter="${esc(s.dropAttr)}">
                <div class="qe-book-chapter-head">
                    <span class="qe-book-chapter-head-title">Chapter ${s.chapterNum} — ${esc(title)}</span>
                </div>
                <div class="qe-book-chapter-assignments-nested">${innerBody}</div>
            </div>`;
        }).join('');

        const unassignedAssignmentsInner = noneList.length
            ? noneList.map(rowHtml).join('')
            : '<p style="color:var(--c-muted);font-size:.72rem;margin:.15rem 0 0;">Drag assignments here to remove them from a book chapter.</p>';
        let tail = `
            <div class="qe-book-chapter qe-book-chapter--special" data-qe-drop-chapter="none">
                <div class="sidelist-chapter-heading" style="margin:.2rem 0 .15rem;font-size:.65rem;">${esc(WMB_UI_UNASSIGNED_ASSIGNMENTS)}</div>
                <div class="qe-book-chapter-assignments-nested">${unassignedAssignmentsInner}</div>
            </div>`;

        const treeBody = (chapterBlocks + tail) || '<p style="color:var(--c-muted);font-size:.82rem;margin:0;">No Assignments yet.</p>';
        leftEl.innerHTML = `
            <div class="qe-assignment-toolbar">
                <button type="button" class="btn btn-primary" id="qe-add-assignment">+ Add Assignment</button>
                <button type="button" class="btn btn-ghost" id="qe-import-assignments">Import…</button>
            </div>
            <div class="qe-book-chapter-tree">${treeBody}</div>`;

        leftEl.querySelectorAll('.qe-assignment-btn').forEach((btn) => {
            btn.addEventListener('click', (ev) => {
                if (ev.target.closest('.qe-delete-assignment')) return;
                selectedNum = Number(btn.dataset.num);
                renderLeft();
                renderRight();
            });
            btn.addEventListener('dragover', (e) => {
                if (!qeDragQuestion && !Number.isFinite(qeDragAssignmentNum)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });
            btn.addEventListener('dragenter', () => {
                if (!qeDragQuestion && !Number.isFinite(qeDragAssignmentNum)) return;
                btn.classList.add('qe-assignment-btn--drop-target');
            });
            btn.addEventListener('dragleave', (e) => {
                if (!btn.contains(e.relatedTarget)) btn.classList.remove('qe-assignment-btn--drop-target');
            });
            btn.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                leftEl.querySelectorAll('.qe-assignment-btn--drop-target').forEach((b) => b.classList.remove('qe-assignment-btn--drop-target'));
                const targetNum = Number(btn.dataset.num);
                if (Number.isNaN(targetNum)) return;

                let assignPayload = '';
                try {
                    assignPayload = e.dataTransfer.getData('application/x-wmb-assignment-num');
                } catch (_) {
                    assignPayload = '';
                }
                let draggedAssignmentNum = qeDragAssignmentNum;
                if (!Number.isFinite(draggedAssignmentNum) && assignPayload) {
                    draggedAssignmentNum = Number(assignPayload);
                }
                if (Number.isFinite(draggedAssignmentNum) && draggedAssignmentNum !== targetNum) {
                    const targetMapped = draft.chapterMap?.[String(targetNum)] ?? draft.chapterMap?.[targetNum];
                    const targetChapterNum = resolveMappedChapterNumber(targetMapped, targetNum);
                    if (isNoChapterMapValue(targetMapped)) {
                        qeApplyChapterMappingSelectValue(draggedAssignmentNum, WMB_NO_CHAPTER_MAP_VALUE);
                    } else if (Number.isFinite(targetChapterNum) && targetChapterNum >= 0) {
                        qeSetAssignmentChapterMapping(draggedAssignmentNum, String(targetChapterNum));
                    }
                    qeDragAssignmentNum = null;
                    renderLeft();
                    renderRight();
                    qePersistDraftAfterDrag();
                    return;
                }

                if (!qeDragQuestion) return;

                const { chapterKey: sourceKey, index: sourceIdx } = qeDragQuestion;
                const { key: targetKey, chapterNum: targetChapterNum, isNoChapter } = chapterQuestionsForAssignment(targetNum);
                if (!isNoChapter && (!Number.isFinite(targetChapterNum) || targetChapterNum < 0)) return;

                const sourceArr = draft.chapterQuestions[sourceKey];
                if (!Array.isArray(sourceArr) || sourceIdx < 0 || sourceIdx >= sourceArr.length) return;

                if (sourceKey === targetKey) {
                    qeDragQuestion = null;
                    return;
                }

                const [item] = sourceArr.splice(sourceIdx, 1);
                if (!Array.isArray(draft.chapterQuestions[targetKey])) draft.chapterQuestions[targetKey] = [];
                draft.chapterQuestions[targetKey].push(item);
                qeMarkDragHintSeen();
                qeDragQuestion = null;
                renderLeft();
                renderRight();
                qePersistDraftAfterDrag();
            });
        });
        qeRenderFooterStats();
    }

    let qeLeftCountsRefreshTimer = null;
    /** Avoid stacking question-edit dialogs if render or double-click races. */
    let qeQuestionTextDialogBusy = false;
    function scheduleLeftCountsRefresh() {
        if (qeLeftCountsRefreshTimer) clearTimeout(qeLeftCountsRefreshTimer);
        qeLeftCountsRefreshTimer = setTimeout(() => {
            qeLeftCountsRefreshTimer = null;
            renderLeft();
        }, 120);
    }

    function qeQuestionRowTooltip(qNumber) {
        const parts = String(qNumber || '').split('.');
        if (parts.length >= 3) {
            return `Chapter ${parts[0]}, assignment ${parts[1]}, question ${parts[2]}`;
        }
        if (parts.length >= 2) {
            return `Chapter ${parts[0]}, assignment ${parts[1]}`;
        }
        return `Question ${qNumber}`;
    }

    function renderRight() {
        // Rebuilding the right panel invalidates any in-flight question drag (row nodes / indices gone).
        // Stale qeDragQuestion would otherwise block assignment→chapter drops on the left (guarded on drop).
        qeDragQuestion = null;
        if (!qeHasActiveBank()) {
            formEl.innerHTML = '<p class="qe-right-empty">Choose a book type to edit assignments.</p>';
            qeRenderFooterStats();
            return;
        }
        const assignment = (draft.assignments || []).find((a) => Number(a.num) === Number(selectedNum));
        if (!assignment) {
            formEl.innerHTML = '<p class="qe-right-empty">Select an Assignment.</p>';
            qeRenderFooterStats();
            return;
        }
        const { chapterNum, questions, mapped, isNoChapter } = chapterQuestionsForAssignment(assignment.num);
        const labelLocked = qeIsLabelLocked(assignment);
        const mappingSelectHtml = qeBuildChapterMappingSelectHtml(assignment, mapped, isNoChapter, chapterNum);
        const dragHintDismissed = qeIsDragHintDismissed();
        const dragClusterClass = `qe-drag-handle-cluster${dragHintDismissed ? ' qe-drag-handle-cluster--hint-dismissed' : ''}`;
        const dragHintLabelHtml = dragHintDismissed
            ? ''
            : '<span class="qe-drag-hint-label" aria-hidden="true">Drag to reorder or place in group</span>';
        const questionsSectionTitle = `Questions for the ${String(assignment.label || '').trim() || `Assignment ${assignment.num}`}`;
        const petQuestionGating = selectedBookType === 'pets_memoir';
        const setAllRequiredButton = petQuestionGating && questions.length
            ? '<button type="button" class="btn btn-ghost qe-right-btn-sm" id="qe-set-all-questions-required" title="Set all Pet questions Required" aria-label="Set all Pet questions Required">All required</button>'
            : '';
        formEl.innerHTML = `
            <div class="qe-right-stack">
                <label class="qe-right-label">Assignment label</label>
                <input id="qe-assignment-label" class="auth-field qe-right-input" type="text" value="${esc(assignment.label || '')}" ${labelLocked ? 'readonly' : ''} />
                <label class="qe-right-label">Assignment Instructions</label>
                <textarea id="qe-assignment-description" class="qa-answer-area qe-right-textarea" rows="2">${esc(assignment.description || '')}</textarea>
                <label class="qe-right-label">Chapter Mapping</label>
                ${mappingSelectHtml}
                <div class="qe-metadata-save-row">
                    <button type="button" class="btn btn-primary" id="qe-save-assignment-metadata">Save</button>
                </div>
            </div>
            <hr class="qe-right-divider" />
            <section class="qe-right-questions-panel" aria-labelledby="qe-questions-section-title">
            <div class="qe-right-section-head">
                <h4 class="qe-right-section-title" id="qe-questions-section-title">${esc(questionsSectionTitle)}</h4>
                ${setAllRequiredButton}
                <button type="button" class="btn btn-primary" id="qe-add-question">+ Add Question</button>
            </div>
            <div id="qe-question-list" class="qe-question-list">
                ${questions.map((q, i) => {
                    const qNumber = qeFormatQuestionNumber(assignment, i);
                    const qTooltip = qeQuestionRowTooltip(qNumber);
                    const exampleCount = qeCountSavedExamples(q.example_templates);
                    const exampleToggleText = qeExamplesToggleButtonText(exampleCount);
                    const exampleToggleAria = `${exampleCount} saved ${exampleCount === 1 ? 'example' : 'examples'}. Show or hide the examples editor`;
                    return `
                    <div class="qe-question-row" data-index="${i}">
                    <div class="card qe-question-card">
                        <div class="qe-question-main-row">
                            <div class="${dragClusterClass} qe-drag-cluster-inline">
                                <span class="qe-drag-handle" draggable="true" aria-label="Drag to reorder or place in group"><i class="fa-solid fa-arrows-up-down-left-right" aria-hidden="true"></i></span>
                                ${dragHintLabelHtml}
                                <span class="qe-drag-tooltip-pop" aria-hidden="true">Drag to reorder or place in group</span>
                            </div>
                            <span class="qe-question-number" data-index="${i}" aria-label="Question ${esc(qNumber)}" title="${esc(qTooltip)}">${esc(qNumber)}</span>
                            <textarea class="qa-answer-area qe-question-text qe-question-text--readonly qe-right-textarea" data-index="${i}" rows="2" readonly title="Click to edit (voice, refine, then save)">${esc(q.text || '')}</textarea>
                            <button type="button" class="btn btn-ghost qe-example-toggle qe-example-toggle--beside-text" data-index="${i}" aria-expanded="false" aria-controls="qe-example-drawer-${i}" id="qe-example-toggle-${i}" aria-label="${esc(exampleToggleAria)}">
                                <i class="fa-solid fa-chevron-right qe-example-chevron" aria-hidden="true"></i>
                                <span class="qe-example-toggle-label">${esc(exampleToggleText)}</span>
                            </button>
                            <button class="btn btn-ghost qe-remove-question qe-remove-question--in-row" data-index="${i}" type="button" title="Remove question" aria-label="Remove question"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
                        </div>
                        <label class="qe-question-display-label-row">
                            <span>Display label</span>
                            <input class="auth-field qe-question-display-label" data-index="${i}" type="text" value="${esc(q.displayLabel || '')}" placeholder="Automatic: ${esc(qNumber)}" aria-label="Display label for question ${esc(qNumber)}" />
                        </label>
                        ${petQuestionGating ? `<label class="qe-question-display-label-row">
                            <span>Draft importance</span>
                            <select class="auth-field qe-question-required" data-index="${i}" aria-label="Draft importance for question ${esc(qNumber)}">
                                <option value="" ${typeof q.required === 'boolean' ? '' : 'selected'} disabled>Choose Required or Optional</option>
                                <option value="required" ${q.required === true ? 'selected' : ''}>Required — answer before drafting</option>
                                <option value="optional" ${q.required === false ? 'selected' : ''}>Optional — could improve the chapter</option>
                            </select>
                        </label>` : ''}
                        <div id="qe-example-drawer-${i}" class="qe-example-drawer hidden" data-index="${i}" role="region" aria-labelledby="qe-example-toggle-${i}">
                            <p class="qe-example-drawer-hint">Separate with blank lines; use [brackets] for placeholders.</p>
                            <textarea class="qa-answer-area qe-question-examples qe-right-textarea" data-index="${i}" rows="3" placeholder="Use AI to generate starter examples, or type your own with [brackets] for placeholders.">${esc(q.example_templates || '')}</textarea>
                            <div class="qe-example-tools">
                            <button class="btn btn-ghost qe-generate-examples qe-right-btn-sm" data-index="${i}" type="button">AI example</button>
                            <label class="qe-example-append-label">
                                <input class="qe-example-append" data-index="${i}" type="checkbox" />
                                Append
                            </label>
                            <span class="qe-example-status" data-index="${i}"></span>
                            </div>
                        </div>
                    </div>
                    </div>
                `;
                }).join('') || '<p class="qe-right-empty">No questions for this group</p>'}
            </div>
            </section>
        `;

        const labelEl = document.getElementById('qe-assignment-label');
        const descEl = document.getElementById('qe-assignment-description');
        const chapterEl = document.getElementById('qe-question-group-chapter-mapping');
        if (!labelLocked) {
            labelEl?.addEventListener('input', () => {
                assignment.label = String(labelEl.value || '');
                renderLeft();
            });
            labelEl?.addEventListener('change', () => {
                assignment.label = String(labelEl.value || '');
                void qePersistAssignmentMetadata('Saved assignment label.');
            });
        }
        descEl?.addEventListener('input', () => {
            assignment.description = String(descEl.value || '');
        });
        // Persist blank or edited instructions on blur/change — don't require Save click alone.
        descEl?.addEventListener('change', () => {
            assignment.description = String(descEl.value || '');
            void qePersistAssignmentMetadata(
                assignment.description.trim()
                    ? 'Saved assignment instructions.'
                    : 'Cleared assignment instructions.',
            );
        });
        if (!qeIsProtectedStartMyBook(assignment)) {
            chapterEl?.addEventListener('change', () => {
                qeApplyChapterMappingSelectValue(assignment.num, chapterEl.value);
                renderRight();
                renderLeft();
                qePersistDraftAfterDrag();
            });
        }

        formEl.querySelectorAll('.qe-example-toggle').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = btn.getAttribute('data-index');
                const drawer = formEl.querySelector(`#qe-example-drawer-${idx}`);
                if (!drawer) return;
                const expanded = btn.getAttribute('aria-expanded') === 'true';
                const nextOpen = !expanded;
                btn.setAttribute('aria-expanded', String(nextOpen));
                drawer.classList.toggle('hidden', !nextOpen);
                btn.classList.toggle('qe-example-toggle--open', nextOpen);
            });
        });

        formEl.querySelectorAll('.qe-question-text').forEach((ta) => {
            ta.addEventListener('click', async () => {
                if (qeQuestionTextDialogBusy) return;
                const idx = Number(ta.dataset.index);
                if (Number.isNaN(idx)) return;
                const bucket = chapterQuestionsForAssignment(assignment.num).questions;
                const target = bucket[idx];
                if (!target) return;
                qeQuestionTextDialogBusy = true;
                try {
                    const next = await showTextDialog(
                        'Edit question',
                        'Use Talk to dictate, Refine to tidy wording, then Done to save to the server.',
                        {
                            initialText: String(target.text || ''),
                            allowEmpty: true,
                            placeholder: 'Enter the interview question…',
                        }
                    );
                    if (next === null) return;
                    target.text = String(next);
                    ta.value = target.text;
                    scheduleLeftCountsRefresh();
                    if (statusEl) {
                        statusEl.style.color = 'var(--c-muted)';
                        statusEl.textContent = 'Saving…';
                    }
                    try {
                        await qePatchQuestionEditorDraftToServer();
                        if (statusEl) {
                            statusEl.style.color = 'var(--c-success)';
                            statusEl.textContent = 'Saved.';
                        }
                        qeRenderFooterStats();
                    } catch (saveErr) {
                        if (statusEl) {
                            statusEl.style.color = 'var(--c-danger)';
                            statusEl.textContent = `${saveErr.message || 'Save failed'}. Text updated here only — use Save under Chapter mapping for assignment fields.`;
                        }
                        renderLeft();
                    }
                } finally {
                    qeQuestionTextDialogBusy = false;
                }
            });
            ta.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || e.shiftKey) return;
                e.preventDefault();
                ta.click();
            });
        });
        formEl.querySelectorAll('.qe-question-display-label').forEach((input) => {
            input.addEventListener('change', () => {
                const idx = Number(input.dataset.index);
                if (Number.isNaN(idx)) return;
                const bucket = chapterQuestionsForAssignment(assignment.num).questions;
                if (!bucket[idx]) return;
                const label = String(input.value || '').replace(/\s+/g, ' ').trim();
                if (label) bucket[idx].displayLabel = label;
                else delete bucket[idx].displayLabel;
                renderRight();
                renderLeft();
                qePersistDraftAfterDrag();
            });
        });
        formEl.querySelectorAll('.qe-question-required').forEach((select) => {
            select.addEventListener('change', () => {
                const idx = Number(select.dataset.index);
                const bucket = chapterQuestionsForAssignment(assignment.num).questions;
                if (Number.isNaN(idx) || !bucket[idx]) return;
                bucket[idx].required = select.value === 'required';
                qePersistDraftAfterDrag();
            });
        });
        formEl.querySelectorAll('.qe-question-examples').forEach((ta) => {
            ta.addEventListener('input', () => {
                const idx = Number(ta.dataset.index);
                if (Number.isNaN(idx)) return;
                const bucket = chapterQuestionsForAssignment(assignment.num).questions;
                if (!bucket[idx]) return;
                bucket[idx].example_templates = String(ta.value || '');
                const toggleBtn = formEl.querySelector(`.qe-example-toggle[data-index="${idx}"]`);
                qeSyncExampleToggleLabel(toggleBtn, bucket[idx].example_templates);
            });
        });
        formEl.querySelectorAll('.qe-generate-examples').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const idx = Number(btn.dataset.index);
                if (Number.isNaN(idx)) return;
                const bucket = chapterQuestionsForAssignment(assignment.num).questions;
                const target = bucket[idx];
                if (!target) return;
                const statusElLocal = formEl.querySelector(`.qe-example-status[data-index="${idx}"]`);
                const questionText = String(target.text || '').trim();
                if (!questionText) {
                    if (statusElLocal) {
                        statusElLocal.style.color = 'var(--c-danger)';
                        statusElLocal.textContent = 'Add question text first.';
                    }
                    return;
                }
                btn.disabled = true;
                const prevBtnText = btn.textContent;
                btn.textContent = 'Working…';
                if (statusElLocal) {
                    statusElLocal.style.color = 'var(--c-muted)';
                    statusElLocal.textContent = 'Generating example…';
                }
                try {
                    const siblingQuestions = bucket
                        .filter((_, qIdx) => qIdx !== idx)
                        .map((q) => ({
                            text: String(q?.text || ''),
                            example_templates: String(q?.example_templates || ''),
                        }));
                    const generated = await api('POST', '/api/system/question-assignment-editor-data/generate-examples', {
                        questionText,
                        existingExamples: String(target.example_templates || ''),
                        assignment: {
                            num: Number(assignment.num),
                            label: String(assignment.label || ''),
                            description: String(assignment.description || ''),
                        },
                        siblingQuestions,
                    });
                    const appendToggle = formEl.querySelector(`.qe-example-append[data-index="${idx}"]`);
                    const shouldAppend = Boolean(appendToggle?.checked);
                    const generatedText = String(generated?.example_templates || '').trim();
                    if (shouldAppend) {
                        const existingParts = String(target.example_templates || '')
                            .replace(/\r\n/g, '\n')
                            .split(/\n\s*\n/g)
                            .map(t => String(t || '').trim())
                            .filter(Boolean);
                        const generatedParts = generatedText
                            .replace(/\r\n/g, '\n')
                            .split(/\n\s*\n/g)
                            .map(t => String(t || '').trim())
                            .filter(Boolean);
                        const seen = new Set();
                        const merged = [];
                        for (const part of [...existingParts, ...generatedParts]) {
                            const key = part.toLowerCase();
                            if (!part || seen.has(key)) continue;
                            seen.add(key);
                            merged.push(part);
                        }
                        target.example_templates = merged.join('\n\n');
                    } else {
                        target.example_templates = generatedText;
                    }
                    const exampleInput = formEl.querySelector(`.qe-question-examples[data-index="${idx}"]`);
                    if (exampleInput) exampleInput.value = target.example_templates;
                    const exampleToggle = formEl.querySelector(`.qe-example-toggle[data-index="${idx}"]`);
                    qeSyncExampleToggleLabel(exampleToggle, target.example_templates);
                    const exampleDrawer = formEl.querySelector(`#qe-example-drawer-${idx}`);
                    if (exampleToggle && exampleDrawer) {
                        exampleToggle.setAttribute('aria-expanded', 'true');
                        exampleDrawer.classList.remove('hidden');
                        exampleToggle.classList.add('qe-example-toggle--open');
                    }
                    if (statusElLocal) {
                        statusElLocal.style.color = 'var(--c-muted)';
                        statusElLocal.textContent = 'Saving…';
                    }
                    if (statusEl) {
                        statusEl.style.color = 'var(--c-muted)';
                        statusEl.textContent = 'Saving…';
                    }
                    try {
                        await qePatchQuestionEditorDraftToServer();
                    } catch (saveErr) {
                        if (statusElLocal) {
                            statusElLocal.style.color = 'var(--c-danger)';
                            statusElLocal.textContent = `${saveErr.message || 'Save failed'}. Examples updated here only — use Save under Chapter mapping if you changed assignment fields.`;
                        }
                        if (statusEl) {
                            statusEl.style.color = 'var(--c-danger)';
                            statusEl.textContent = saveErr.message || 'Save failed';
                        }
                        renderLeft();
                        return;
                    }
                    if (statusElLocal) {
                        statusElLocal.style.color = 'var(--c-success)';
                        statusElLocal.textContent = shouldAppend ? 'Examples appended and saved.' : 'Examples replaced and saved.';
                    }
                    if (statusEl) {
                        statusEl.style.color = 'var(--c-success)';
                        statusEl.textContent = 'Saved.';
                    }
                    renderLeft();
                } catch (err) {
                    if (statusElLocal) {
                        statusElLocal.style.color = 'var(--c-danger)';
                        statusElLocal.textContent = err.message || 'Generation failed.';
                    }
                } finally {
                    btn.disabled = false;
                    btn.textContent = prevBtnText;
                }
            });
        });
        formEl.querySelectorAll('.qe-remove-question').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.index);
                const bucket = chapterQuestionsForAssignment(assignment.num).questions;
                if (Number.isNaN(idx)) return;
                bucket.splice(idx, 1);
                renderRight();
                renderLeft();
                // Persist immediately — optimistic UI alone left deleted prompts after refresh.
                qePersistDraftAfterDrag();
            });
        });
        document.getElementById('qe-add-question')?.addEventListener('click', () => {
            const { questions: bucket } = chapterQuestionsForAssignment(assignment.num);
            bucket.push({
                id: newOpaqueQuestionId(),
                text: '',
                example_templates: '',
                ...(selectedBookType === 'pets_memoir' ? { required: true } : {}),
            });
            renderRight();
            renderLeft();
            qePersistDraftAfterDrag();
        });
        document.getElementById('qe-set-all-questions-required')?.addEventListener('click', () => {
            for (const bucket of Object.values(draft.chapterQuestions || {})) {
                for (const question of bucket || []) question.required = true;
            }
            renderRight();
            qePersistDraftAfterDrag();
        });

        const qeList = formEl.querySelector('#qe-question-list');
        if (qeList) {
            const { key: currentChapterKey } = chapterQuestionsForAssignment(assignment.num);
            qeList.querySelectorAll('.qe-drag-handle').forEach((handle) => {
                handle.addEventListener('dragstart', (e) => {
                    const row = handle.closest('.qe-question-row');
                    if (!row) return;
                    const idx = Number(row.dataset.index);
                    if (Number.isNaN(idx)) return;
                    qeDragQuestion = { chapterKey: currentChapterKey, index: idx };
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(idx));
                    row.classList.add('qe-question-row--dragging');
                });
                handle.addEventListener('dragend', () => {
                    qeList.querySelectorAll('.qe-question-row').forEach((r) => {
                        r.classList.remove('qe-question-row--dragging', 'qe-question-row--drop-target');
                    });
                    leftEl.querySelectorAll('.qe-assignment-btn--drop-target').forEach((b) => b.classList.remove('qe-assignment-btn--drop-target'));
                    qeDragQuestion = null;
                });
            });
            qeList.addEventListener('dragover', (e) => {
                if (!qeDragQuestion) return;
                const row = e.target.closest && e.target.closest('.qe-question-row');
                if (!row || !qeList.contains(row)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                qeList.querySelectorAll('.qe-question-row').forEach((r) => {
                    r.classList.toggle('qe-question-row--drop-target', r === row);
                });
            });
            qeList.addEventListener('dragleave', (e) => {
                if (!qeList.contains(e.relatedTarget)) {
                    qeList.querySelectorAll('.qe-question-row').forEach((r) => r.classList.remove('qe-question-row--drop-target'));
                }
            });
            qeList.addEventListener('drop', (e) => {
                const row = e.target.closest && e.target.closest('.qe-question-row');
                if (!row || !qeList.contains(row)) return;
                e.preventDefault();
                qeList.querySelectorAll('.qe-question-row').forEach((r) => r.classList.remove('qe-question-row--drop-target'));
                if (!qeDragQuestion) return;
                if (qeDragQuestion.chapterKey !== currentChapterKey) return;
                const from = qeDragQuestion.index;
                const to = Number(row.dataset.index);
                if (Number.isNaN(from) || Number.isNaN(to) || from === to) return;
                const bucket = chapterQuestionsForAssignment(assignment.num).questions;
                if (from < 0 || from >= bucket.length || to < 0 || to >= bucket.length) return;
                const [item] = bucket.splice(from, 1);
                bucket.splice(to, 0, item);
                qeMarkDragHintSeen();
                qeDragQuestion = null;
                renderRight();
                renderLeft();
                qePersistDraftAfterDrag();
            });
        }

        formEl.querySelectorAll('.qe-drag-handle-cluster').forEach((cluster) => {
            let longPressTimer = null;
            const clearLongPress = () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            };
            cluster.addEventListener('touchstart', () => {
                clearLongPress();
                longPressTimer = setTimeout(() => {
                    longPressTimer = null;
                    cluster.classList.add('qe-drag-tooltip--press');
                    setTimeout(() => {
                        cluster.classList.remove('qe-drag-tooltip--press');
                    }, 1400);
                }, 300);
            }, { passive: true });
            cluster.addEventListener('touchend', clearLongPress);
            cluster.addEventListener('touchcancel', () => {
                clearLongPress();
                cluster.classList.remove('qe-drag-tooltip--press');
            });
            cluster.addEventListener('touchmove', () => {
                clearLongPress();
                cluster.classList.remove('qe-drag-tooltip--press');
            }, { passive: true });
        });
        qeRenderFooterStats();
    }

    if (!leftEl.dataset.qeChapterDndBound) {
        leftEl.dataset.qeChapterDndBound = '1';
        leftEl.addEventListener('dragstart', (e) => {
            const handle = e.target.closest('.qe-assignment-drag-handle');
            if (!handle || !leftEl.contains(handle)) return;
            qeDragAssignmentNum = Number(handle.dataset.assignmentNum);
            if (!Number.isFinite(qeDragAssignmentNum)) return;
            qeDragQuestion = null;
            try {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(qeDragAssignmentNum));
                e.dataTransfer.setData('application/x-wmb-assignment-num', String(qeDragAssignmentNum));
            } catch (_) {}
            handle.classList.add('qe-assignment-drag-handle--dragging');
        });
        leftEl.addEventListener('dragend', (e) => {
            const handle = e.target.closest('.qe-assignment-drag-handle');
            if (handle && leftEl.contains(handle)) handle.classList.remove('qe-assignment-drag-handle--dragging');
            qeDragAssignmentNum = null;
            leftEl.querySelectorAll('.qe-drop-target--active').forEach((z) => z.classList.remove('qe-drop-target--active'));
        });
        leftEl.addEventListener('dragover', (e) => {
            if (!Number.isFinite(qeDragAssignmentNum)) return;
            const zone = e.target.closest('[data-qe-drop-chapter]');
            if (!zone || !leftEl.contains(zone)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            zone.classList.add('qe-drop-target--active');
        });
        leftEl.addEventListener('dragleave', (e) => {
            const zone = e.target.closest('[data-qe-drop-chapter]');
            if (!zone || !leftEl.contains(zone)) return;
            const rel = e.relatedTarget;
            if (rel && zone.contains(rel)) return;
            zone.classList.remove('qe-drop-target--active');
        });
        leftEl.addEventListener('drop', (e) => {
            const zone = e.target.closest('[data-qe-drop-chapter]');
            if (!zone || !leftEl.contains(zone)) return;
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('qe-drop-target--active');
            let assignPayload = '';
            try {
                assignPayload = e.dataTransfer.getData('application/x-wmb-assignment-num');
            } catch (_) {
                assignPayload = '';
            }
            const isAssignmentChapterDrag = Number.isFinite(qeDragAssignmentNum) || Boolean(String(assignPayload || '').trim());
            if (qeDragQuestion && !isAssignmentChapterDrag) return;
            let num = qeDragAssignmentNum;
            if (!Number.isFinite(num) && assignPayload) num = Number(assignPayload);
            if (!Number.isFinite(num)) {
                const raw = e.dataTransfer.getData('text/plain');
                num = Number(raw);
            }
            if (!Number.isFinite(num)) return;
            const dropAttr = zone.getAttribute('data-qe-drop-chapter');
            if (dropAttr == null || dropAttr === '') return;
            if (!qeApplyDraftMapForChapterDrop(num, dropAttr)) {
                if (statusEl) {
                    statusEl.style.color = 'var(--c-danger)';
                    statusEl.textContent = 'Could not move assignment to that chapter (invalid target or mapping unchanged).';
                }
                return;
            }
            renderLeft();
            renderRight();
            qePersistDraftAfterDrag();
        });
    }

    leftEl.addEventListener('click', (e) => {
        const addInChapterBtn = e.target.closest('[data-qe-add-assignment-chapter]');
        if (addInChapterBtn) {
            e.preventDefault();
            e.stopPropagation();
            qeAddAssignment(addInChapterBtn.getAttribute('data-qe-add-assignment-chapter'));
            return;
        }
        if (e.target.closest('#qe-add-assignment')) {
            e.preventDefault();
            qeAddAssignment();
            return;
        }
        if (e.target.closest('#qe-import-assignments')) {
            e.preventDefault();
            void qeRunAssignmentImport();
            return;
        }
        const delBtn = e.target.closest('.qe-delete-assignment');
        if (delBtn) {
            e.preventDefault();
            e.stopPropagation();
            const n = Number(delBtn.dataset.num);
            if (!Number.isNaN(n)) qeDeleteAssignment(n);
        }
    });
    leftEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const delBtn = e.target.closest('.qe-delete-assignment');
        if (!delBtn) return;
        e.preventDefault();
        e.stopPropagation();
        const n = Number(delBtn.dataset.num);
        if (!Number.isNaN(n)) qeDeleteAssignment(n);
    });

    function qeApplyEditorData(data) {
        const type = String(data?.bookType || selectedBookType || '').trim();
        const sit = String(data?.bookSituation || data?.situationKey || selectedSituation || 'default').trim() || 'default';
        draft = {
            assignments: qeCoerceAssignmentsArray(data?.assignments).map((a) => ({
                num: Number(a.num),
                label: String(a.label || ''),
                description: String(a.description || ''),
            })),
            chapterMap: data?.chapterMap && typeof data.chapterMap === 'object' ? { ...data.chapterMap } : {},
            chapterQuestions: data?.chapterQuestions && typeof data.chapterQuestions === 'object' ? JSON.parse(JSON.stringify(data.chapterQuestions)) : {},
            bookType: type,
            bookSituation: sit,
        };
        selectedBookType = type;
        selectedSituation = sit;
        migrateLegacyNoneChapterQuestionsInPlace(draft.assignments, draft.chapterMap, draft.chapterQuestions);
        qeNormalizeQuestionEditorDraft();
        qeMetaUpdatedAt = data?.updatedAt ? String(data.updatedAt) : null;
        qeMetaUpdatedBy = data?.updatedBy != null ? String(data.updatedBy) : null;
        const preferFirst = (draft.assignments || []).find((a) => Number(a.num) > 0);
        selectedNum = Number(preferFirst ? preferFirst.num : (draft.assignments?.[0]?.num ?? 1));
        bankLoaded = Boolean(type);
    }

    function qeRenderBankSelects() {
        const typeSel = document.getElementById('qe-booktype-select');
        if (typeSel) {
            const typeOpts = availableBookTypes.length
                ? availableBookTypes
                : (selectedBookType ? [{ id: selectedBookType, label: selectedBookType }] : []);
            const placeholder = '<option value="">Select a book type…</option>';
            typeSel.innerHTML = placeholder + typeOpts.map((o) => {
                const id = String(o.id || '').trim();
                const label = String(o.label || id).trim();
                if (!id) return '';
                return `<option value="${esc(id)}">${esc(label)}</option>`;
            }).join('');
            typeSel.value = selectedBookType || '';
            typeSel.required = true;
        }
        const sel = document.getElementById('qe-situation-select');
        if (!sel) return;
        const typeChosen = Boolean(String(selectedBookType || '').trim());
        sel.disabled = !typeChosen;
        if (!typeChosen) {
            sel.innerHTML = '<option value="">Select a book type first…</option>';
            sel.value = '';
            return;
        }
        const opts = availableBookSituations.length
            ? availableBookSituations
            : [{ id: selectedSituation || 'default', label: selectedSituation || 'Type default (no situation override)' }];
        sel.innerHTML = opts.map((o) => {
            const id = String(o.id || '').trim();
            const label = String(o.label || id).trim();
            return `<option value="${esc(id)}">${esc(label)}</option>`;
        }).join('');
        sel.value = selectedSituation || 'default';
    }

    function qeShowAwaitingBookType() {
        bankLoaded = false;
        draft = {
            assignments: [],
            chapterMap: {},
            chapterQuestions: {},
            bookType: '',
            bookSituation: '',
        };
        selectedNum = null;
        bankStrategySlots = [];
        bankDefaultStrategy = null;
        qeMetaUpdatedAt = null;
        qeMetaUpdatedBy = null;
        availableBookSituations = [];
        qeRenderBankSelects();
        renderLeft();
        renderRight();
    }

    async function qeLoadBankCatalog() {
        const data = await api('GET', '/api/system/question-assignment-editor-data');
        if (Array.isArray(data?.availableBookTypes) && data.availableBookTypes.length) {
            availableBookTypes = data.availableBookTypes;
        }
        qeShowAwaitingBookType();
    }

    async function qeLoadBankDraft(bookType, situationId) {
        const type = String(bookType || '').trim();
        if (!type) {
            qeShowAwaitingBookType();
            return;
        }
        const sid = String(situationId || selectedSituation || 'default').trim() || 'default';
        const [data, strategyCatalog] = await Promise.all([
            api(
                'GET',
                `/api/system/question-assignment-editor-data?bookType=${encodeURIComponent(type)}&situation=${encodeURIComponent(sid)}`,
            ),
            api(
                'GET',
                `/api/system/chapter-strategy-settings?bookType=${encodeURIComponent(type)}`,
            ).catch(() => null),
        ]);
        if (Array.isArray(data?.availableBookTypes) && data.availableBookTypes.length) {
            availableBookTypes = data.availableBookTypes;
        }
        if (Array.isArray(data?.availableBookSituations) && data.availableBookSituations.length) {
            availableBookSituations = data.availableBookSituations;
        }
        const defaultId = String(strategyCatalog?.defaultStrategyId || '').trim();
        const strategies = Array.isArray(strategyCatalog?.strategies)
            ? strategyCatalog.strategies
            : (Array.isArray(strategyCatalog?.availableStrategies) ? strategyCatalog.availableStrategies : []);
        bankDefaultStrategy = strategies.find((s) => s.id === defaultId)
            || strategies.find((s) => s.enabled !== false)
            || strategies[0]
            || null;
        bankStrategySlots = listStrategyChapterSlots(bankDefaultStrategy);
        qeApplyEditorData(data);
        qeRenderBankSelects();
        renderLeft();
        renderRight();
    }

    async function qeSwitchBank(nextType, nextSituation) {
        const prevType = selectedBookType;
        const prevSit = selectedSituation;
        const prevLoaded = bankLoaded;
        try {
            const type = String(nextType || '').trim();
            if (!type) {
                selectedBookType = '';
                selectedSituation = '';
                qeShowAwaitingBookType();
                if (statusEl) statusEl.textContent = '';
                return;
            }
            if (prevLoaded && String(prevType || '').trim()) {
                if (statusEl) {
                    statusEl.textContent = 'Saving current bank…';
                    statusEl.style.color = 'var(--c-muted)';
                }
                await qePatchQuestionEditorDraftToServer();
            }
            selectedBookType = type;
            selectedSituation = String(nextSituation || 'default').trim() || 'default';
            await qeLoadBankDraft(type, selectedSituation);
            if (statusEl) statusEl.textContent = '';
        } catch (err) {
            selectedBookType = prevType;
            selectedSituation = prevSit;
            bankLoaded = prevLoaded;
            qeRenderBankSelects();
            if (statusEl) {
                statusEl.textContent = err.message || 'Could not switch bank';
                statusEl.style.color = 'var(--c-danger)';
            }
        }
    }

    document.getElementById('qe-booktype-select')?.addEventListener('change', async (e) => {
        const next = String(e.target.value || '').trim();
        if (next === selectedBookType) return;
        // Fresh type selection always starts on type-default situation (not a previous type's situation).
        await qeSwitchBank(next, next ? 'default' : '');
    });

    document.getElementById('qe-situation-select')?.addEventListener('change', async (e) => {
        const next = String(e.target.value || '').trim();
        if (!selectedBookType || !next || next === selectedSituation) return;
        await qeSwitchBank(selectedBookType, next);
    });

    document.getElementById('qe-editor-history')?.addEventListener('click', () => {
        if (!selectedBookType) {
            if (statusEl) {
                statusEl.textContent = 'Choose a book type before viewing history.';
                statusEl.style.color = 'var(--c-danger)';
            }
            return;
        }
        openContentBankRevisionsPanel({
            kind: 'assignment',
            bookType: selectedBookType,
            situationKey: selectedSituation || 'default',
        }, {
            title: 'Assignment Editor history',
            onRestored: async () => {
                await qeLoadBankDraft(selectedBookType, selectedSituation || 'default');
                if (statusEl) {
                    statusEl.textContent = 'Restored from history.';
                    statusEl.style.color = 'var(--c-success)';
                }
            },
        });
    });

    try {
        await qeLoadBankCatalog();
    } catch (err) {
        leftEl.innerHTML = `<p style="color:var(--c-danger);font-size:.82rem;margin:0;">${esc(err.message || 'Could not load editor data')}</p>`;
        formEl.innerHTML = '';
    }
}
