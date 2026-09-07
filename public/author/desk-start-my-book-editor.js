'use strict';

/**
 * Admin Desk — Start My Book Editor.
 * Extracted from author-app.js (Phase 2 Admin Desk separation).
 * Includes shared initEditorPanelColumnResize (SMB-only after QE extraction).
 */

import { state } from './state.js';
import { adminApi as api } from '../admin-desk-api.js';
import { esc, formatUiDateTime } from './ui-helpers.js';
import {
    canonicalizeBookTypeOptionValue,
    slugifyBookTypeLabel,
} from './book-type-option-ids.js';
import { openContentBankRevisionsPanel } from './desk-content-bank-revisions.js';

const SMB_BOOK_TYPE_Q_ID = 'a_003';

let _renderMyDeskList = null;
let _setMyDeskWorkspaceMode = null;
let _launchDeskBySlug = null;

function renderMyDeskList() { return _renderMyDeskList?.(); }
function setMyDeskWorkspaceMode(enabled) { return _setMyDeskWorkspaceMode?.(enabled); }

const SMB_EDITOR_LEFT_WIDTH_LS_KEY = 'wmb-smb-editor-left-width';

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

function initSmbEditorColumnResize(hostEl) {
    initEditorPanelColumnResize(hostEl, {
        lsKey: SMB_EDITOR_LEFT_WIDTH_LS_KEY,
        widthVar: '--smb-editor-left-width',
        bodyClass: 'smb-editor-col-resizing',
        handleSelector: '[data-smb-col-resize]',
    });
}

export async function launchStartMyBookEditorPanel(deps) {
    const {
        renderMyDeskList: renderMyDeskListDep,
        setMyDeskWorkspaceMode: setMyDeskWorkspaceModeDep,
        launchDeskBySlug: launchDeskBySlugDep,
    } = deps || {};
    if (typeof renderMyDeskListDep !== 'function'
        || typeof setMyDeskWorkspaceModeDep !== 'function') {
        throw new Error('launchStartMyBookEditorPanel requires desk host deps');
    }
    _renderMyDeskList = renderMyDeskListDep;
    _setMyDeskWorkspaceMode = setMyDeskWorkspaceModeDep;
    _launchDeskBySlug = typeof launchDeskBySlugDep === 'function' ? launchDeskBySlugDep : null;
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
        <div class="qe-panel-root qe-panel-root--compact desk-smb-editor-root">
            <header class="qe-panel-head qe-panel-head--with-situation">
                <div class="qe-panel-head-main">
                    <h3>Start My Book Editor</h3>
                    <div class="qe-situation-toolbar">
                        <label class="qe-situation-label" for="smb-scope-select">Scope</label>
                        <select id="smb-scope-select" class="auth-field qe-situation-select" aria-label="Editor scope">
                            <option value="gate">Shared gate</option>
                            <option value="body">Body (by type)</option>
                        </select>
                        <label class="qe-situation-label" for="smb-booktype-select">Book type</label>
                        <select id="smb-booktype-select" class="auth-field qe-situation-select" aria-label="Book type" disabled></select>
                        <label class="qe-situation-label" for="smb-situation-select">Situation</label>
                        <select id="smb-situation-select" class="auth-field qe-situation-select" aria-label="Book situation" disabled></select>
                    </div>
                </div>
                <button id="smb-editor-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <p class="qe-panel-intro" id="smb-editor-intro">Shared gate: name and book type only (same for every author). Body questions load after you actively choose a book type — Career Memoir is not assumed. Question text, options, and metadata save automatically.</p>
            <div id="smb-editor-host" class="qe-panel-grid qe-panel-grid--compact qe-panel-grid--resizable">
                <div class="card qe-panel-column" id="smb-editor-left"></div>
                <div class="qe-panel-resize-handle" data-smb-col-resize role="separator" aria-orientation="vertical" aria-label="Resize question list and editor columns" tabindex="0"></div>
                <div class="card qe-panel-column qe-editor-right qe-editor-right-col" id="smb-editor-right">
                    <div id="smb-editor-form" class="qe-chapter-form"></div>
                </div>
            </div>
            <div id="smb-editor-footer-stats" class="qe-footer-stats" role="status" aria-live="polite"></div>
            <footer class="qe-panel-actions smb-editor-foot">
                <button type="button" class="btn btn-ghost" id="smb-editor-history">History</button>
                <span id="smb-editor-status" class="qe-panel-status"></span>
            </footer>
        </div>
    `;

    document.getElementById('smb-editor-close')?.addEventListener('click', () => {
        emptyEl.classList.remove('book-audit-host');
        emptyEl.innerHTML = '';
        setMyDeskWorkspaceMode(false);
    });

    initSmbEditorColumnResize(document.getElementById('smb-editor-host'));

    const leftEl = document.getElementById('smb-editor-left');
    const formEl = document.getElementById('smb-editor-form');
    const statusEl = document.getElementById('smb-editor-status');
    const footerStatsEl = document.getElementById('smb-editor-footer-stats');
    if (!leftEl || !formEl) return;

    let draft = {
        version: '1.0',
        title: '',
        description: '',
        questions: [],
        scope: 'gate',
        bookType: '',
        bookSituation: '',
    };
    let selectedScope = 'gate';
    /** Empty until admin actively chooses a book type for body scope (no Career Memoir default). */
    let selectedBookType = '';
    let selectedSituation = 'default';
    let availableBookTypes = [];
    let availableBookSituations = [];
    let enabledBookTypes = [];
    let bookTypeOptionsDerived = false;
    let selectedIndex = 0;
    let dragIndex = null;
    let metaUpdatedAt = null;
    let smbPersistQueue = Promise.resolve();
    let smbAutoSaveTimer = null;

    function smbHasActiveBodyBank() {
        return selectedScope !== 'body' || Boolean(String(selectedBookType || '').trim());
    }

    /** Debounced persist — mirrors Assignment Editor auto-save (no Save click required). */
    function smbQueueAutoSave(statusMessage = 'Saved.') {
        clearTimeout(smbAutoSaveTimer);
        smbAutoSaveTimer = setTimeout(() => {
            smbAutoSaveTimer = null;
            if (!smbHasActiveBodyBank()) return;
            if (!draft.questions.length && selectedScope === 'gate') return;
            void smbPersistDraft(statusMessage);
        }, 600);
    }

    function smbFlushAutoSaveTimer() {
        if (smbAutoSaveTimer != null) {
            clearTimeout(smbAutoSaveTimer);
            smbAutoSaveTimer = null;
        }
    }

    function smbEditorQuery() {
        if (selectedScope === 'body') {
            const type = String(selectedBookType || '').trim();
            if (!type) {
                return '/api/system/start-my-book-editor-data?scope=body';
            }
            const sit = String(selectedSituation || 'default').trim() || 'default';
            return `/api/system/start-my-book-editor-data?scope=body&bookType=${encodeURIComponent(type)}&situation=${encodeURIComponent(sit)}`;
        }
        return '/api/system/start-my-book-editor-data?scope=gate';
    }

    function smbSyncBankControls() {
        const scopeSel = document.getElementById('smb-scope-select');
        const typeSel = document.getElementById('smb-booktype-select');
        const sitSel = document.getElementById('smb-situation-select');
        const intro = document.getElementById('smb-editor-intro');
        if (scopeSel) scopeSel.value = selectedScope;
        const bodyMode = selectedScope === 'body';
        const typeChosen = Boolean(String(selectedBookType || '').trim());
        if (typeSel) {
            typeSel.disabled = !bodyMode;
            const opts = availableBookTypes.length
                ? availableBookTypes
                : (selectedBookType ? [{ id: selectedBookType, label: selectedBookType }] : []);
            const placeholder = '<option value="">Select a book type…</option>';
            typeSel.innerHTML = placeholder + opts.map((o) => {
                const id = String(o.id || '').trim();
                if (!id) return '';
                return `<option value="${esc(id)}">${esc(o.label || id)}</option>`;
            }).join('');
            typeSel.value = selectedBookType || '';
            typeSel.required = bodyMode;
        }
        if (sitSel) {
            sitSel.disabled = !bodyMode || !typeChosen;
            if (!bodyMode || !typeChosen) {
                sitSel.innerHTML = '<option value="">Select a book type first…</option>';
                sitSel.value = '';
            } else {
                const opts = availableBookSituations.length
                    ? availableBookSituations
                    : [{ id: selectedSituation || 'default', label: selectedSituation || 'Type default (no situation override)' }];
                sitSel.innerHTML = opts.map((o) => (
                    `<option value="${esc(o.id)}">${esc(o.label || o.id)}</option>`
                )).join('');
                sitSel.value = selectedSituation || 'default';
            }
        }
        if (intro) {
            const autoSaveHint = ' Question text, options, and metadata save automatically.';
            intro.textContent = bodyMode
                ? (typeChosen
                    ? `Body questions for this book type (and optional situation override). Includes story situation and the rest of Start My Book after the author picks a type.${autoSaveHint}`
                    : 'Choose a book type before editing body questions — Career Memoir is not assumed.')
                : `Shared gate: name and book type only (same for every author). Body questions — including story situation — load after you pick a type.${autoSaveHint}`;
        }
    }

    function smbShowAwaitingBookType() {
        draft = {
            version: '1.0',
            title: '',
            description: '',
            questions: [],
            scope: 'body',
            bookType: '',
            bookSituation: '',
        };
        selectedIndex = 0;
        metaUpdatedAt = null;
        availableBookSituations = [];
        smbSyncBankControls();
        smbSyncFooter();
        leftEl.innerHTML = '<p class="qe-right-empty" style="margin:0;padding:.75rem;">Choose a book type to edit body questions.</p>';
        formEl.innerHTML = '<p class="qe-right-empty">Choose a book type before editing.</p>';
    }

    async function smbLoadEditorData() {
        if (selectedScope === 'body' && !String(selectedBookType || '').trim()) {
            // Still refresh catalog labels for the type select.
            const catalog = await api('GET', '/api/system/start-my-book-editor-data?scope=body');
            if (Array.isArray(catalog?.availableBookTypes) && catalog.availableBookTypes.length) {
                availableBookTypes = catalog.availableBookTypes;
            }
            smbShowAwaitingBookType();
            return;
        }
        const data = await api('GET', smbEditorQuery());
        if (Array.isArray(data?.availableBookTypes) && data.availableBookTypes.length) {
            availableBookTypes = data.availableBookTypes;
        }
        if (Array.isArray(data?.availableBookSituations) && data.availableBookSituations.length) {
            availableBookSituations = data.availableBookSituations;
        }
        enabledBookTypes = Array.isArray(data?.enabledBookTypes)
            ? data.enabledBookTypes.map((id) => String(id || '').trim()).filter(Boolean)
            : [];
        bookTypeOptionsDerived = data?.bookTypeOptionsDerived === true || selectedScope === 'gate';
        if (data?.requiresBookTypeSelection === true || (selectedScope === 'body' && !String(data?.bookType || '').trim())) {
            smbShowAwaitingBookType();
            return;
        }
        draft = {
            version: data?.version || '1.0',
            title: data?.title || '',
            description: data?.description || '',
            questions: Array.isArray(data?.questions) ? JSON.parse(JSON.stringify(data.questions)) : [],
            scope: data?.scope || selectedScope,
            bookType: data?.bookType || selectedBookType || '',
            bookSituation: data?.bookSituation || data?.situationKey || selectedSituation || 'default',
        };
        selectedScope = draft.scope === 'body' ? 'body' : 'gate';
        if (draft.bookType) selectedBookType = String(draft.bookType);
        if (draft.bookSituation) selectedSituation = String(draft.bookSituation);
        metaUpdatedAt = data?.updatedAt || null;
        selectedIndex = 0;
        smbSyncBankControls();
        smbSyncFooter();
        smbRenderLeft();
        smbRenderForm();
    }

    async function smbPatchDraftToServer() {
        if (!smbHasActiveBodyBank()) {
            throw new Error('Choose a book type before saving.');
        }
        smbSyncFormToDraft();
        if (!draft.questions.length && selectedScope === 'gate') {
            throw new Error('Add at least one question.');
        }
        const result = await api('PATCH', '/api/system/start-my-book-editor-data', {
            ...draft,
            scope: selectedScope,
            bookType: selectedBookType,
            bookSituation: selectedSituation || 'default',
        });
        draft = {
            version: result.version || draft.version,
            title: result.title || draft.title,
            description: result.description || draft.description,
            questions: Array.isArray(result.questions) ? result.questions : draft.questions,
            scope: result.scope || selectedScope,
            bookType: result.bookType || selectedBookType,
            bookSituation: result.bookSituation || selectedSituation,
        };
        metaUpdatedAt = result.updatedAt || new Date().toISOString();
        return result;
    }

    function smbPersistDraft(statusMessage = 'Saved.') {
        smbFlushAutoSaveTimer();
        smbPersistQueue = smbPersistQueue
            .then(async () => {
                if (statusEl) {
                    statusEl.style.color = 'var(--c-muted)';
                    statusEl.textContent = 'Saving…';
                }
                await smbPatchDraftToServer();
                if (statusEl) {
                    statusEl.style.color = 'var(--c-success)';
                    statusEl.textContent = statusMessage;
                }
                smbSyncFooter();
            })
            .catch((err) => {
                if (statusEl) {
                    statusEl.style.color = 'var(--c-danger)';
                    statusEl.textContent = err.message || 'Save failed';
                }
            });
        return smbPersistQueue;
    }

    const SMB_TYPES = [
        { id: 'multi_short_text', label: 'Multiple short fields (Your Name)' },
        { id: 'short_text', label: 'Short text' },
        { id: 'text', label: 'Long text' },
        { id: 'choice', label: 'Single choice' },
        { id: 'multi_choice', label: 'Multiple choice' },
        { id: 'working_title', label: 'Working title' },
        { id: 'photo', label: 'Photo upload' },
    ];

    function smbNewQuestionId() {
        try {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID().replace(/-/g, '');
            }
        } catch (_) {}
        return `smb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function smbSlugifyOptionValue(label, fallback = 'option') {
        // Strip apostrophes first so "Pet's Memoir" → pets_memoir (not pet_s_memoir).
        const base = slugifyBookTypeLabel(label) || String(label || '')
            .toLowerCase()
            .replace(/['’]/g, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 48);
        return base || fallback;
    }

    /**
     * Preserve stable ids (e.g. life_goal); derive from label for new options only.
     * Book-type (a_003) values are canonicalized to memoir / pets_memoir / ….
     */
    function smbResolveOptionValue(label, prevValue, usedValues, { bookTypeQuestion = false } = {}) {
        let prev = String(prevValue || '').trim();
        if (bookTypeQuestion) {
            prev = canonicalizeBookTypeOptionValue(prev || label, label);
        }
        if (prev && !/^opt_\d+$/.test(prev)) {
            if (!usedValues.has(prev)) {
                usedValues.add(prev);
                return prev;
            }
        }
        let base = bookTypeQuestion
            ? canonicalizeBookTypeOptionValue('', label)
            : smbSlugifyOptionValue(label, 'option');
        if (!base) base = smbSlugifyOptionValue(label, 'option');
        if (!usedValues.has(base)) {
            usedValues.add(base);
            return base;
        }
        let n = 2;
        while (usedValues.has(`${base}_${n}`)) n += 1;
        const val = `${base}_${n}`;
        usedValues.add(val);
        return val;
    }

    function smbCollectOptionsFromForm(rootEl, { bookTypeQuestion = false } = {}) {
        const used = new Set();
        return Array.from(rootEl.querySelectorAll('.smb-editor-option-row')).map((row) => {
            const label = String(row.querySelector('.smb-editor-opt-label')?.value || '').trim();
            if (!label) return null;
            const typedId = String(row.querySelector('.smb-editor-opt-value')?.value || '').trim();
            const prevAttr = String(row.getAttribute('data-smb-opt-value') || '').trim();
            const value = smbResolveOptionValue(label, typedId || prevAttr, used, { bookTypeQuestion });
            row.setAttribute('data-smb-opt-value', value);
            const valueInput = row.querySelector('.smb-editor-opt-value');
            if (valueInput && valueInput.value.trim() !== value) valueInput.value = value;
            return { value, label };
        }).filter(Boolean);
    }

    function smbQuestionLabel(q, idx) {
        const t = String(q?.text || '').trim();
        return t || `Question ${idx + 1}`;
    }

    function smbSyncFooter() {
        if (!footerStatsEl) return;
        const n = (draft.questions || []).length;
        const updated = metaUpdatedAt ? (formatUiDateTime(metaUpdatedAt) || '—') : '—';
        footerStatsEl.textContent = `${n} question${n === 1 ? '' : 's'} · Last saved ${updated}`;
    }

    function smbRenderLeft() {
        const list = draft.questions || [];
        const rows = list.map((q, i) => {
            const active = i === selectedIndex ? ' smb-editor-row--active' : '';
            const typeLabel = SMB_TYPES.find((t) => t.id === q.type)?.label || q.type;
            return `
                <div class="qe-question-row smb-editor-row${active}" data-smb-index="${i}">
                    <span class="qe-drag-handle" draggable="true" title="Drag to reorder" aria-label="Drag to reorder"><i class="fa-solid fa-arrows-up-down-left-right" aria-hidden="true"></i></span>
                    <button type="button" class="smb-editor-row-btn" data-smb-select="${i}">
                        <span class="smb-editor-row-num">${i + 1}.</span>
                        <span class="smb-editor-row-text">${esc(smbQuestionLabel(q, i))}</span>
                        <span class="smb-editor-row-type">${esc(typeLabel)}</span>
                    </button>
                    <button type="button" class="smb-editor-icon-btn smb-editor-delete" data-smb-delete="${i}" title="Delete question" aria-label="Delete question"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
                </div>`;
        }).join('');
        leftEl.innerHTML = `
            <div class="qe-assignment-toolbar">
                <button type="button" class="btn btn-primary" id="smb-add-question">+ Add Question</button>
            </div>
            <div class="smb-editor-list" id="smb-editor-list">${rows || '<p style="color:var(--c-muted);font-size:.72rem;margin:0;">No questions yet.</p>'}</div>
        `;

        document.getElementById('smb-add-question')?.addEventListener('click', () => {
            draft.questions.push({
                id: smbNewQuestionId(),
                text: 'New question',
                type: 'text',
                placeholder: '',
            });
            selectedIndex = draft.questions.length - 1;
            smbRenderLeft();
            smbRenderForm();
            void smbPersistDraft('Added. Saved.');
        });

        leftEl.querySelectorAll('[data-smb-select]').forEach((btn) => {
            btn.addEventListener('click', () => {
                // Capture in-progress edits before the form re-renders for another question.
                smbSyncFormToDraft();
                selectedIndex = Number(btn.getAttribute('data-smb-select'));
                smbRenderLeft();
                smbRenderForm();
            });
        });

        leftEl.querySelectorAll('[data-smb-delete]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = Number(btn.getAttribute('data-smb-delete'));
                if (!Number.isFinite(idx) || idx < 0) return;
                draft.questions.splice(idx, 1);
                selectedIndex = Math.min(selectedIndex, Math.max(0, draft.questions.length - 1));
                smbRenderLeft();
                smbRenderForm();
                // Persist immediately — optimistic UI alone left deleted questions after refresh.
                void smbPersistDraft('Deleted. Saved.');
            });
        });

        const listEl = document.getElementById('smb-editor-list');
        listEl?.querySelectorAll('.qe-drag-handle').forEach((handle) => {
            handle.addEventListener('dragstart', (e) => {
                const row = handle.closest('.smb-editor-row');
                if (!row) return;
                dragIndex = Number(row.getAttribute('data-smb-index'));
                row.classList.add('qe-question-row--dragging');
                e.dataTransfer?.setData('text/plain', String(dragIndex));
            });
            handle.addEventListener('dragend', () => {
                dragIndex = null;
                listEl.querySelectorAll('.smb-editor-row').forEach((r) => {
                    r.classList.remove('qe-question-row--dragging');
                    r.querySelector('.smb-editor-row-btn')?.classList.remove('qe-assignment-btn--drop-target');
                });
            });
        });
        listEl?.querySelectorAll('.smb-editor-row').forEach((row) => {
            const rowBtn = row.querySelector('.smb-editor-row-btn');
            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                rowBtn?.classList.add('qe-assignment-btn--drop-target');
            });
            row.addEventListener('dragleave', () => rowBtn?.classList.remove('qe-assignment-btn--drop-target'));
            row.addEventListener('drop', (e) => {
                e.preventDefault();
                rowBtn?.classList.remove('qe-assignment-btn--drop-target');
                const from = dragIndex;
                const to = Number(row.getAttribute('data-smb-index'));
                if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return;
                const [item] = draft.questions.splice(from, 1);
                draft.questions.splice(to, 0, item);
                selectedIndex = to;
                smbRenderLeft();
                smbRenderForm();
                void smbPersistDraft('Reordered. Saved.');
            });
        });
    }

    function smbOptionRowsHtml(options, { bookTypeQuestion = false } = {}) {
        return (options || []).map((opt, i) => {
            const label = String(opt?.label || '');
            const value = bookTypeQuestion
                ? canonicalizeBookTypeOptionValue(opt?.value || label, label)
                : String(opt?.value || '');
            return `
            <div class="smb-editor-option-row" data-smb-opt-index="${i}" data-smb-opt-value="${esc(value)}">
                <div class="smb-editor-option-fields">
                    <input type="text" class="auth-field smb-editor-opt-label" placeholder="Option text" value="${esc(label)}" />
                    <label class="smb-editor-opt-id-wrap">
                        <span class="smb-editor-opt-id-label">id</span>
                        <input type="text" class="auth-field smb-editor-opt-value" placeholder="e.g. pets_memoir" value="${esc(value)}" spellcheck="false" />
                    </label>
                </div>
                <button type="button" class="smb-editor-icon-btn smb-editor-opt-remove" data-smb-opt-remove="${i}" title="Remove option" aria-label="Remove option"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
            </div>`;
        }).join('');
    }

    function smbSubFieldRowsHtml(subQuestions) {
        return (subQuestions || []).map((sq, i) => `
            <div class="smb-editor-sub-field" data-smb-sub-index="${i}">
                <div class="smb-editor-sub-fields">
                    <input type="text" class="auth-field smb-editor-sub-text" placeholder="Field label" value="${esc(String(sq?.text || ''))}" />
                    <input type="text" class="auth-field smb-editor-sub-ph" placeholder="Placeholder (optional)" value="${esc(String(sq?.placeholder || ''))}" />
                    <input type="text" class="auth-field smb-editor-sub-why" placeholder="Why we ask (optional)" value="${esc(String(sq?.whyWeAsk || ''))}" />
                    <span class="smb-editor-sub-id">id: ${esc(String(sq?.id || ''))}</span>
                </div>
                <button type="button" class="smb-editor-icon-btn smb-editor-sub-remove" data-smb-sub-remove="${i}" title="Remove sub-field" aria-label="Remove sub-field"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
            </div>
        `).join('');
    }

    function smbRenderForm() {
        const q = draft.questions[selectedIndex];
        if (!q) {
            formEl.innerHTML = '<p style="color:var(--c-muted);font-size:.85rem;margin:0;">Select a question to edit.</p>';
            return;
        }
        const type = String(q.type || 'text');
        const showsPlaceholder = ['text', 'short_text', 'working_title', 'photo'].includes(type);
        const placeholderBlock = showsPlaceholder
            ? `
            <div class="smb-editor-field">
                <label class="qe-right-label" for="smb-q-placeholder">Placeholder (optional)</label>
                <input id="smb-q-placeholder" class="auth-field qe-right-input" type="text" value="${esc(String(q.placeholder || ''))}" />
            </div>`
            : '';
        const bookTypeQuestion = String(q.id || '') === SMB_BOOK_TYPE_Q_ID;
        const derivedBookTypeOptions = bookTypeQuestion && bookTypeOptionsDerived;
        const optionsBlock = (type === 'choice' || type === 'multi_choice')
            ? (derivedBookTypeOptions
                ? `
                <div class="smb-editor-field">
                    <label class="qe-right-label">Options (from Allowed Book Types)</label>
                    <p class="smb-editor-opt-hint">
                        Discover chips follow types enabled in Ghostwriter Settings / Allowed Book Types.
                        Edit the catalog or enablement there — not as freeform options here.
                    </p>
                    <ul class="smb-editor-derived-options" id="smb-editor-options">
                        ${(Array.isArray(q.options) ? q.options : []).map((opt) => {
                    const id = String(opt?.value || '').trim();
                    const label = String(opt?.label || id).trim() || id;
                    const on = !enabledBookTypes.length || enabledBookTypes.includes(id);
                    return `<li class="smb-editor-derived-option">
                            <code class="smb-editor-derived-id">${esc(id)}</code>
                            <span class="smb-editor-derived-label">${esc(label)}</span>
                            <span class="smb-editor-derived-badge">${on ? 'Enabled' : 'Off'}</span>
                        </li>`;
                }).join('') || '<li class="smb-editor-derived-option smb-editor-derived-option--empty">No enabled book types. Enable at least one in Ghostwriter Settings.</li>'}
                    </ul>
                    <div class="smb-editor-derived-actions">
                        <button type="button" class="btn btn-ghost btn-sm" id="smb-open-allowed-book-types">Allowed Book Types</button>
                        <button type="button" class="btn btn-ghost btn-sm" id="smb-open-ghostwriter-settings">Ghostwriter Settings</button>
                    </div>
                </div>`
                : `
                <div class="smb-editor-field">
                    <label class="qe-right-label">Options</label>
                    <div id="smb-editor-options">${smbOptionRowsHtml(q.options, { bookTypeQuestion })}</div>
                    <button type="button" class="smb-editor-add-option" id="smb-add-option">+ Add option</button>
                </div>`)
            : '';
        const subBlock = type === 'multi_short_text'
            ? `
                <div class="smb-editor-field">
                    <label class="qe-right-label">Sub-fields</label>
                    <div id="smb-editor-sub-fields">${smbSubFieldRowsHtml(q.subQuestions)}</div>
                    <button type="button" class="smb-editor-add-option" id="smb-add-sub-field">+ Add sub-field</button>
                </div>`
            : '';

        formEl.innerHTML = `
            <div class="smb-editor-field">
                <label class="qe-right-label" for="smb-q-text">Question text</label>
                <input id="smb-q-text" class="auth-field qe-right-input" type="text" value="${esc(String(q.text || ''))}" />
            </div>
            <div class="smb-editor-field">
                <label class="qe-right-label" for="smb-q-why">Why we ask (optional)</label>
                <textarea id="smb-q-why" class="auth-field qe-right-textarea smb-editor-why" rows="1" placeholder="Brief context the ghostwriter can share before asking">${esc(String(q.whyWeAsk || ''))}</textarea>
            </div>
            <div class="smb-editor-field">
                <label class="qe-right-label" for="smb-q-decision-label">Decision label (sidebar)</label>
                <input id="smb-q-decision-label" class="auth-field qe-right-input" type="text" placeholder="e.g. Book type" value="${esc(String(q.decisionLabel || ''))}" />
            </div>
            <div class="smb-editor-field">
                <label class="qe-right-label" for="smb-q-progress-keyword">Progress keyword</label>
                <input id="smb-q-progress-keyword" class="auth-field qe-right-input" type="text" placeholder="e.g. type" value="${esc(String(q.progressKeyword || ''))}" />
            </div>
            <div class="smb-editor-field">
                <label class="qe-right-label" for="smb-q-aliases">Aliases (comma-separated)</label>
                <input id="smb-q-aliases" class="auth-field qe-right-input" type="text" placeholder="book type, kind of book" value="${esc((q.aliases || []).join(', '))}" />
            </div>
            <div class="smb-editor-field">
                <label class="qe-right-label" for="smb-q-type">Type</label>
                <select id="smb-q-type" class="auth-field qe-right-select">
                    ${SMB_TYPES.map((t) => `<option value="${esc(t.id)}" ${t.id === type ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
                </select>
            </div>
            ${placeholderBlock}
            <p class="smb-editor-id">Question id: <code>${esc(String(q.id || ''))}</code></p>
            ${subBlock}
            ${optionsBlock}
        `;

        const syncFromForm = () => {
            q.text = String(document.getElementById('smb-q-text')?.value || '').trim() || q.text;
            q.whyWeAsk = String(document.getElementById('smb-q-why')?.value || '').trim();
            q.decisionLabel = String(document.getElementById('smb-q-decision-label')?.value || '').trim();
            q.progressKeyword = String(document.getElementById('smb-q-progress-keyword')?.value || '').trim();
            q.aliases = String(document.getElementById('smb-q-aliases')?.value || '')
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean);
            const phEl = document.getElementById('smb-q-placeholder');
            if (phEl) q.placeholder = String(phEl.value || '').trim();
            const newType = String(document.getElementById('smb-q-type')?.value || type);
            if (newType !== q.type) {
                q.type = newType;
                if (newType === 'choice' || newType === 'multi_choice') q.options = q.options || [];
                if (newType === 'multi_short_text' && !Array.isArray(q.subQuestions)) {
                    q.subQuestions = [
                        { id: 'a_i01', text: 'What is your full name?', type: 'short_text', placeholder: '' },
                        { id: 'a_i02', text: 'Do you go by any other name or nickname?', type: 'short_text', placeholder: '' },
                    ];
                }
                smbRenderForm();
                return;
            }
            if (newType === 'choice' || newType === 'multi_choice') {
                // a_003 options are server-derived from Ghostwriter Settings — do not overwrite from form.
                if (String(q.id || '') !== SMB_BOOK_TYPE_Q_ID || !bookTypeOptionsDerived) {
                    q.options = smbCollectOptionsFromForm(formEl, {
                        bookTypeQuestion: String(q.id || '') === SMB_BOOK_TYPE_Q_ID,
                    });
                }
            }
            if (newType === 'multi_short_text') {
                q.subQuestions = Array.from(formEl.querySelectorAll('.smb-editor-sub-field')).map((row, si) => {
                    const prev = (q.subQuestions || [])[si] || {};
                    return {
                        id: String(prev.id || smbNewQuestionId()),
                        text: String(row.querySelector('.smb-editor-sub-text')?.value || '').trim(),
                        type: 'short_text',
                        placeholder: String(row.querySelector('.smb-editor-sub-ph')?.value || '').trim(),
                        whyWeAsk: String(row.querySelector('.smb-editor-sub-why')?.value || '').trim(),
                    };
                }).filter((sq) => sq.text);
            }
        };

        const persistFromForm = () => {
            syncFromForm();
            smbQueueAutoSave('Saved.');
        };
        formEl.querySelectorAll('input, select, textarea').forEach((el) => {
            el.addEventListener('change', persistFromForm);
            el.addEventListener('blur', persistFromForm);
        });

        document.getElementById('smb-add-option')?.addEventListener('click', () => {
            syncFromForm();
            if (!Array.isArray(q.options)) q.options = [];
            q.options.push({ value: '', label: 'New option' });
            smbRenderForm();
            void smbPersistDraft('Saved.');
        });
        document.getElementById('smb-add-sub-field')?.addEventListener('click', () => {
            syncFromForm();
            if (!Array.isArray(q.subQuestions)) q.subQuestions = [];
            q.subQuestions.push({
                id: smbNewQuestionId(),
                text: 'New field',
                type: 'short_text',
                placeholder: '',
            });
            smbRenderForm();
            void smbPersistDraft('Saved.');
        });
        formEl.querySelectorAll('[data-smb-opt-remove]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncFromForm();
                const idx = Number(btn.getAttribute('data-smb-opt-remove'));
                q.options.splice(idx, 1);
                smbRenderForm();
                void smbPersistDraft('Deleted. Saved.');
            });
        });
        formEl.querySelectorAll('[data-smb-sub-remove]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncFromForm();
                const idx = Number(btn.getAttribute('data-smb-sub-remove'));
                if ((q.subQuestions || []).length <= 1) return;
                q.subQuestions.splice(idx, 1);
                smbRenderForm();
                void smbPersistDraft('Deleted. Saved.');
            });
        });
        document.getElementById('smb-open-allowed-book-types')?.addEventListener('click', () => {
            if (_launchDeskBySlug) void _launchDeskBySlug('allowed-book-types');
        });
        document.getElementById('smb-open-ghostwriter-settings')?.addEventListener('click', () => {
            if (_launchDeskBySlug) void _launchDeskBySlug('ghostwriter-settings');
        });
    }

    function smbSyncFormToDraft() {
        const q = draft.questions[selectedIndex];
        if (!q || !formEl.querySelector('#smb-q-text')) return;
        q.text = String(document.getElementById('smb-q-text')?.value || '').trim() || q.text;
        q.whyWeAsk = String(document.getElementById('smb-q-why')?.value || '').trim();
        q.decisionLabel = String(document.getElementById('smb-q-decision-label')?.value || '').trim();
        q.progressKeyword = String(document.getElementById('smb-q-progress-keyword')?.value || '').trim();
        q.aliases = String(document.getElementById('smb-q-aliases')?.value || '')
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean);
        const phEl = document.getElementById('smb-q-placeholder');
        if (phEl) q.placeholder = String(phEl.value || '').trim();
        const newType = String(document.getElementById('smb-q-type')?.value || q.type);
        q.type = newType;
        if (newType === 'choice' || newType === 'multi_choice') {
            if (String(q.id || '') !== SMB_BOOK_TYPE_Q_ID || !bookTypeOptionsDerived) {
                q.options = smbCollectOptionsFromForm(formEl, {
                    bookTypeQuestion: String(q.id || '') === SMB_BOOK_TYPE_Q_ID,
                });
            }
        }
        if (newType === 'multi_short_text') {
            q.subQuestions = Array.from(formEl.querySelectorAll('.smb-editor-sub-field')).map((row, si) => {
                const prev = (q.subQuestions || [])[si] || {};
                return {
                    id: String(prev.id || smbNewQuestionId()),
                    text: String(row.querySelector('.smb-editor-sub-text')?.value || '').trim(),
                    type: 'short_text',
                    placeholder: String(row.querySelector('.smb-editor-sub-ph')?.value || '').trim(),
                    whyWeAsk: String(row.querySelector('.smb-editor-sub-why')?.value || '').trim(),
                };
            }).filter((sq) => sq.text);
        }
    }

    document.getElementById('smb-editor-history')?.addEventListener('click', () => {
        if (selectedScope === 'body' && !String(selectedBookType || '').trim()) {
            if (statusEl) {
                statusEl.textContent = 'Choose a book type before viewing history.';
                statusEl.style.color = 'var(--c-danger)';
            }
            return;
        }
        const sel = selectedScope === 'body'
            ? {
                kind: 'smb',
                scope: 'body',
                bookType: selectedBookType,
                situationKey: selectedSituation || 'default',
            }
            : { kind: 'smb', scope: 'gate' };
        openContentBankRevisionsPanel(sel, {
            title: selectedScope === 'body'
                ? 'Start My Book body history'
                : 'Start My Book gate history',
            onRestored: async () => {
                await smbLoadEditorData();
                statusEl.textContent = 'Restored from history.';
                statusEl.style.color = 'var(--c-success)';
            },
        });
    });

    document.getElementById('smb-scope-select')?.addEventListener('change', async (e) => {
        const next = String(e.target.value || 'gate').trim();
        if (next === selectedScope) return;
        selectedScope = next === 'body' ? 'body' : 'gate';
        if (selectedScope === 'body') {
            // Do not carry a silent Career Memoir default into body mode.
            selectedBookType = '';
            selectedSituation = 'default';
        }
        leftEl.innerHTML = '<p style="color:var(--c-muted);font-size:.82rem;margin:0;">Loading…</p>';
        try {
            await smbLoadEditorData();
        } catch (err) {
            leftEl.innerHTML = `<p style="color:var(--c-danger);font-size:.82rem;margin:0;">${esc(err.message || 'Could not load')}</p>`;
        }
    });

    document.getElementById('smb-booktype-select')?.addEventListener('change', async (e) => {
        const next = String(e.target.value || '').trim();
        if (next === selectedBookType) return;
        selectedBookType = next;
        selectedSituation = next ? 'default' : '';
        leftEl.innerHTML = '<p style="color:var(--c-muted);font-size:.82rem;margin:0;">Loading…</p>';
        try {
            await smbLoadEditorData();
        } catch (err) {
            leftEl.innerHTML = `<p style="color:var(--c-danger);font-size:.82rem;margin:0;">${esc(err.message || 'Could not load')}</p>`;
        }
    });

    document.getElementById('smb-situation-select')?.addEventListener('change', async (e) => {
        const next = String(e.target.value || '').trim();
        if (!next || next === selectedSituation) return;
        selectedSituation = next;
        leftEl.innerHTML = '<p style="color:var(--c-muted);font-size:.82rem;margin:0;">Loading…</p>';
        try {
            await smbLoadEditorData();
        } catch (err) {
            leftEl.innerHTML = `<p style="color:var(--c-danger);font-size:.82rem;margin:0;">${esc(err.message || 'Could not load')}</p>`;
        }
    });

    leftEl.innerHTML = '<p style="color:var(--c-muted);font-size:.82rem;margin:0;">Loading…</p>';
    try {
        await smbLoadEditorData();
    } catch (err) {
        leftEl.innerHTML = `<p style="color:var(--c-danger);font-size:.82rem;margin:0;">${esc(err.message || 'Could not load Start My Book questions')}</p>`;
        formEl.innerHTML = '';
    }
}
