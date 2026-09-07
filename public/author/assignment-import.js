'use strict';

import { newOpaqueQuestionId } from './static-data.js';

const ASSIGNMENT_HEADER_RE = /(?:^|\n)\s*ASSIGNMENT\s+(\d+)\.(\d+)\s*(?=\n|$)/gi;
const QUESTION_LINE_RE = /^\s*Q(\d+)\.\s*(.*)$/i;

/**
 * Normalize pasted text so ASSIGNMENT headers always start on their own line.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeAssignmentImportText(raw) {
    return String(raw || '')
        .replace(/\r\n/g, '\n')
        .replace(/([^\n])([ \t]*ASSIGNMENT\s+\d+\.\d+\b)/gi, '$1\n$2')
        .trim();
}

/**
 * Parse assignment body into description + ordered question texts.
 * @param {string} body
 * @returns {{ description: string, questions: string[], warnings: string[] }}
 */
export function parseAssignmentImportBody(body) {
    const warnings = [];
    const text = String(body || '').trim();
    if (!text) {
        return { description: '', questions: [], warnings: ['Empty assignment body'] };
    }

    const lines = text.split('\n');
    let firstQuestionLine = -1;
    for (let i = 0; i < lines.length; i += 1) {
        if (QUESTION_LINE_RE.test(lines[i])) {
            firstQuestionLine = i;
            break;
        }
    }

    const description = firstQuestionLine >= 0
        ? lines.slice(0, firstQuestionLine).join('\n').trim()
        : text;

    const questions = [];
    let current = null;
    for (let i = Math.max(0, firstQuestionLine); i < lines.length; i += 1) {
        const line = lines[i];
        const qMatch = line.match(QUESTION_LINE_RE);
        if (qMatch) {
            if (current) questions.push(current);
            current = {
                num: Number(qMatch[1]),
                text: String(qMatch[2] || '').trim(),
            };
        } else if (current && String(line || '').trim()) {
            current.text = `${current.text} ${String(line).trim()}`.trim();
        }
    }
    if (current) questions.push(current);

    if (!questions.length && description) {
        warnings.push('No Q1., Q2., … lines found');
    }

    questions.sort((a, b) => a.num - b.num);
    for (let i = 0; i < questions.length; i += 1) {
        const expected = i + 1;
        if (questions[i].num !== expected) {
            warnings.push(`Question numbering jumps (expected Q${expected}, found Q${questions[i].num})`);
            break;
        }
    }

    return {
        description,
        questions: questions.map((q) => q.text),
        warnings,
    };
}

/**
 * Parse standard assignment import text (ASSIGNMENT X.Y blocks with Q1. … lines).
 * @param {string} raw
 * @returns {{ assignments: Array<{ chapter: number, slot: number, slotLabel: string, description: string, questions: string[], warnings: string[] }>, errors: string[] }}
 */
export function parseAssignmentImportText(raw) {
    const text = normalizeAssignmentImportText(raw);
    if (!text) {
        return { assignments: [], errors: ['Paste assignment text to import.'] };
    }

    const matches = [...text.matchAll(ASSIGNMENT_HEADER_RE)];
    if (!matches.length) {
        return {
            assignments: [],
            errors: ['No ASSIGNMENT headers found. Each block should start with a line like "ASSIGNMENT 1.1".'],
        };
    }

    const assignments = [];
    const errors = [];
    const seenSlots = new Set();

    for (let i = 0; i < matches.length; i += 1) {
        const m = matches[i];
        const chapter = Number(m[1]);
        const slot = Number(m[2]);
        if (!Number.isFinite(chapter) || chapter < 0 || !Number.isFinite(slot) || slot < 1) {
            errors.push(`Invalid ASSIGNMENT header: ${m[0].trim()}`);
            continue;
        }

        const slotLabel = `${chapter}.${slot}`;
        if (seenSlots.has(slotLabel)) {
            errors.push(`Duplicate ${slotLabel} in import text`);
            continue;
        }
        seenSlots.add(slotLabel);

        const start = m.index + m[0].length;
        const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
        const body = text.slice(start, end).trim();
        const parsed = parseAssignmentImportBody(body);
        if (!parsed.questions.length) {
            errors.push(`${slotLabel}: no questions found (use Q1., Q2., …)`);
        }

        assignments.push({
            chapter,
            slot,
            slotLabel,
            description: parsed.description,
            questions: parsed.questions,
            warnings: parsed.warnings,
        });
    }

    assignments.sort((a, b) => (a.chapter - b.chapter) || (a.slot - b.slot));
    return { assignments, errors };
}

/**
 * @param {object} draft
 * @param {number} chapterNum
 * @param {function} isRegularAssignment
 * @param {function} resolveChapterNum
 */
function assignmentsInBookChapter(draft, chapterNum, isRegularAssignment, resolveChapterNum) {
    return (draft.assignments || [])
        .filter((a) => {
            if (!isRegularAssignment(a)) return false;
            return resolveChapterNum(a) === chapterNum;
        })
        .sort((a, b) => Number(a.num) - Number(b.num));
}

function nextAssignmentNum(draft) {
    const nums = (draft.assignments || []).map((a) => Number(a.num)).filter(Number.isFinite);
    return nums.length ? Math.max(...nums) + 1 : 1;
}

function applyQuestionTexts(existing, texts) {
    const prev = Array.isArray(existing) ? existing : [];
    return texts.map((text, i) => {
        const row = prev[i];
        if (row && row.id) {
            return {
                ...row,
                text: String(text || ''),
            };
        }
        return {
            id: newOpaqueQuestionId(),
            text: String(text || ''),
            example_templates: row?.example_templates || '',
        };
    });
}

/**
 * Apply parsed import rows to an assignment editor draft.
 * @param {object} draft — { assignments, chapterMap, chapterQuestions }
 * @param {ReturnType<parseAssignmentImportText>['assignments']} rows
 * @param {{ removeUnlisted?: boolean, resolveChapterNum: function, isRegularAssignment: function, chapterQuestionsBucketKeyForAssignment: function }} helpers
 * @returns {{ updated: number, created: number, removed: number }}
 */
export function applyAssignmentImportToDraft(draft, rows, helpers) {
    const {
        removeUnlisted = true,
        resolveChapterNum,
        isRegularAssignment,
        chapterQuestionsBucketKeyForAssignment,
    } = helpers;

    if (!draft.assignments) draft.assignments = [];
    if (!draft.chapterMap) draft.chapterMap = {};
    if (!draft.chapterQuestions) draft.chapterQuestions = {};

    const importedSlotKeys = new Set(rows.map((r) => r.slotLabel));
    let updated = 0;
    let created = 0;
    let removed = 0;

    for (const row of rows) {
        let list = assignmentsInBookChapter(draft, row.chapter, isRegularAssignment, resolveChapterNum);
        while (list.length < row.slot) {
            const num = nextAssignmentNum(draft);
            const label = `Assignment ${row.chapter}.${list.length + 1}`;
            draft.assignments.push({
                num,
                label,
                description: '',
            });
            draft.chapterMap[String(num)] = row.chapter;
            list = assignmentsInBookChapter(draft, row.chapter, isRegularAssignment, resolveChapterNum);
            created += 1;
        }

        const assignment = list[row.slot - 1];
        assignment.label = `Assignment ${row.slotLabel}`;
        assignment.description = row.description;
        draft.chapterMap[String(assignment.num)] = row.chapter;

        const bucketKey = chapterQuestionsBucketKeyForAssignment(assignment.num, draft.chapterMap);
        const existing = draft.chapterQuestions[bucketKey];
        draft.chapterQuestions[bucketKey] = applyQuestionTexts(existing, row.questions);
        updated += 1;
    }

    if (removeUnlisted) {
        const keepNums = new Set();
        for (const row of rows) {
            const list = assignmentsInBookChapter(draft, row.chapter, isRegularAssignment, resolveChapterNum);
            const a = list[row.slot - 1];
            if (a) keepNums.add(Number(a.num));
        }
        const victims = (draft.assignments || []).filter((a) => {
            if (!isRegularAssignment(a)) return false;
            return !keepNums.has(Number(a.num));
        });
        for (const a of victims) {
            const key = chapterQuestionsBucketKeyForAssignment(a.num, draft.chapterMap);
            delete draft.chapterQuestions[key];
            delete draft.chapterMap[String(a.num)];
            delete draft.chapterMap[a.num];
        }
        draft.assignments = (draft.assignments || []).filter((a) => !victims.includes(a));
        removed = victims.length;
    }

    return { updated, created, removed, importedSlotKeys };
}

/**
 * Modal for pasting standard assignment import text.
 * @returns {Promise<{ text: string, keepUnlisted: boolean, parsed: ReturnType<parseAssignmentImportText> } | null>}
 */
export function showAssignmentImportDialog() {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'text-dialog-backdrop qe-import-backdrop';

        const dialog = document.createElement('div');
        dialog.className = 'text-dialog outline-qa-panel qe-import-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');

        dialog.innerHTML = `
            <div class="text-dialog-header">
                <div class="text-dialog-question qa-question">Import assignments</div>
                <button type="button" class="text-dialog-close" title="Cancel" aria-label="Cancel">&times;</button>
            </div>
            <div class="text-dialog-sub qe-import-sub">
                Paste text with <strong>ASSIGNMENT 1.1</strong> headers, optional instructions, and <strong>Q1.</strong> … question lines.
            </div>
            <textarea class="qa-answer-area qe-import-textarea" rows="14" spellcheck="false" placeholder="ASSIGNMENT 1.1&#10;Instructions for this assignment…&#10;Q1. First question?&#10;Q2. Second question?&#10;&#10;ASSIGNMENT 1.2&#10;…"></textarea>
            <fieldset class="qe-import-mode">
                <legend class="qe-import-mode-legend">Existing assignments</legend>
                <label class="qe-import-mode-option">
                    <input type="radio" name="qe-import-mode" value="replace" checked />
                    <span class="qe-import-mode-label">
                        <strong>Replace</strong>
                        <span class="qe-import-mode-hint">Only assignments in your paste remain. Others are removed.</span>
                    </span>
                </label>
                <label class="qe-import-mode-option">
                    <input type="radio" name="qe-import-mode" value="merge" />
                    <span class="qe-import-mode-label">
                        <strong>Merge</strong>
                        <span class="qe-import-mode-hint">Update matching slots (e.g. 1.2). Leave other assignments unchanged.</span>
                    </span>
                </label>
            </fieldset>
            <div class="qe-import-preview" role="status" aria-live="polite"></div>
            <div class="qe-import-actions">
                <button type="button" class="btn btn-ghost qe-import-cancel">Cancel</button>
                <button type="button" class="btn btn-primary qe-import-confirm" disabled>Import</button>
            </div>`;

        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        const textarea = dialog.querySelector('.qe-import-textarea');
        const previewEl = dialog.querySelector('.qe-import-preview');
        const confirmBtn = dialog.querySelector('.qe-import-confirm');

        function importKeepUnlisted() {
            const selected = dialog.querySelector('input[name="qe-import-mode"]:checked');
            return selected?.value === 'merge';
        }

        function refreshPreview() {
            const parsed = parseAssignmentImportText(textarea.value);
            const summary = summarizeAssignmentImport(parsed);
            if (!String(textarea.value || '').trim()) {
                previewEl.textContent = '';
                previewEl.className = 'qe-import-preview';
                confirmBtn.disabled = true;
                return;
            }
            if (!summary.ok) {
                previewEl.textContent = summary.summary;
                previewEl.className = 'qe-import-preview qe-import-preview--error';
                confirmBtn.disabled = true;
                return;
            }
            previewEl.textContent = `${summary.assignmentCount} assignment${summary.assignmentCount === 1 ? '' : 's'}, ${summary.questionCount} questions\n${summary.summary}`;
            previewEl.className = 'qe-import-preview qe-import-preview--ok';
            confirmBtn.disabled = false;
        }

        function close(result) {
            backdrop.remove();
            resolve(result);
        }

        textarea.addEventListener('input', refreshPreview);
        dialog.querySelector('.text-dialog-close')?.addEventListener('click', () => close(null));
        dialog.querySelector('.qe-import-cancel')?.addEventListener('click', () => close(null));
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
        backdrop.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); });

        confirmBtn.addEventListener('click', () => {
            const parsed = parseAssignmentImportText(textarea.value);
            const summary = summarizeAssignmentImport(parsed);
            if (!summary.ok) {
                refreshPreview();
                return;
            }
            close({
                text: textarea.value,
                keepUnlisted: importKeepUnlisted(),
                parsed,
            });
        });

        textarea.focus();
    });
}

/**
 * Build a short human-readable preview for the import dialog.
 * @param {ReturnType<parseAssignmentImportText>} parsed
 */
export function summarizeAssignmentImport(parsed) {
    const { assignments, errors } = parsed;
    if (errors.length) {
        return { ok: false, summary: errors.join('\n'), assignmentCount: 0, questionCount: 0 };
    }
    const questionCount = assignments.reduce((n, a) => n + a.questions.length, 0);
    const lines = assignments.map((a) => {
        const warn = a.warnings.length ? ` (${a.warnings.join('; ')})` : '';
        return `${a.slotLabel}: ${a.questions.length} question${a.questions.length === 1 ? '' : 's'}${warn}`;
    });
    return {
        ok: true,
        summary: lines.join('\n'),
        assignmentCount: assignments.length,
        questionCount: assignments.reduce((n, a) => n + a.questions.length, 0),
    };
}
