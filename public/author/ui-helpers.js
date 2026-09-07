'use strict';

import { state } from './state.js';
import { ensureFlashAlertArea, flashAlert as renderFlashAlert } from '../../platform/client/ui/flash-alert.js';
import {
    esc,
    escapeHtml,
    renderBodyToHtml,
} from '../../platform/client/ui/text-format.js';

export {
    formatUiDateTime,
    formatUiDate,
    formatUiTime,
    formatAuthorLocalDateTime,
    formatAuthorFacingTimestamps,
} from '../../platform/client/ui/datetime-format.js';

export { esc, escapeHtml, renderBodyToHtml };

/** Book chapter numbers include 0 (Introduction). Do not use truthiness on chapter nums. */
export function isValidBookChapterNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0;
}

export function shortenQuestionLabel(text, maxLen = 46) {
    const cleaned = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!cleaned || cleaned.length <= maxLen) return cleaned;
    const cut = cleaned.slice(0, maxLen + 1);
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace >= Math.floor(maxLen * 0.6)) {
        return `${cut.slice(0, lastSpace)}…`;
    }
    return `${cleaned.slice(0, maxLen)}…`;
}


export function buildQuestionHelpFallback(questionText) {
    const clean = String(questionText || '').replace(/\s+/g, ' ').trim().replace(/[?.!]+$/, '');
    if (!clean) return 'Answer this in your own words. A short, specific response is enough.';
    const lead = clean.charAt(0).toLowerCase() + clean.slice(1);
    return `In plain English: talk about ${lead}. A few specific details are enough.`;
}

export function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const BINARY = /\.(pdf|epub|doc|docx|ppt|pptx|xls|xlsx|pages|key|numbers|zip|gz|tar|png|jpg|jpeg|gif|webp|svg|mp3|mp4|mov|avi|wmv)$/i;
        if (BINARY.test(file.name)) {
            reject(new Error('Binary format — export as .txt first'));
            return;
        }
        const reader = new FileReader();
        reader.onload  = (e) => resolve(e.target.result || '');
        reader.onerror = ()  => reject(new Error('Could not read file'));
        reader.readAsText(file, 'utf-8');
    });
}

export function show(id) {
    document.getElementById(id).style.display = '';
}

export function hide(id) {
    document.getElementById(id).style.display = 'none';
}

export function setRunStatus(kind, stateLabel, message) {
    if (!state.runStatus) state.runStatus = {};
    state.runStatus[kind] = { state: stateLabel, message: message || '' };

    const card = document.getElementById(`${kind}-run-card`);
    const badge = document.getElementById(`${kind}-run-badge`);
    const msg = document.getElementById(`${kind}-run-msg`);
    if (card) {
        card.classList.remove('step-run-card--idle', 'step-run-card--running', 'step-run-card--success', 'step-run-card--error', 'step-run-card--stopped');
        card.classList.add(`step-run-card--${stateLabel}`);
    }
    if (badge) {
        const labels = { idle: 'Ready', running: 'Running', success: 'Done', error: 'Failed', stopped: 'Stopped' };
        badge.textContent = labels[stateLabel] || stateLabel;
    }
    if (msg) msg.textContent = message || '';
}

export function getRunStatus(kind) {
    return state.runStatus?.[kind] || { state: 'idle', message: '' };
}

export function inferDraftRewriteNeedFromData() {
    const drafted = (state.savedChapters || []).filter(c => c.hasDraft && c.draft?.createdAt);
    if (!drafted.length) return false;
    const latestDraftTs = Math.max(...drafted.map(c => Date.parse(c.draft.createdAt) || 0));
    const outlineTs = Date.parse(state.outline?.updatedAt || '') || 0;
    return outlineTs > latestDraftTs;
}

// ── Custom question select dropdown ──────────────────────────────────────────
// Replaces a native <select class="qa-progress"> with a div-based widget that
// supports text-overflow:ellipsis on options and constrains popup width to container.
function customSelectDisplayLabel(sel, options) {
    const placeholderOpt = options.find((o) => o.disabled);
    const placeholder = placeholderOpt?.text || options[0]?.text || '';
    const selectedOpt = options.find((o) => o.selected && !o.disabled)
        || options.find((o) => !o.disabled && String(o.value) === String(sel.value))
        || null;
    return selectedOpt?.text || placeholder;
}

export function upgradeSelectToCustom(sel, onChange) {
    if (!sel) return null;
    const options = Array.from(sel.options).map((o) => ({
        value: o.value,
        text: o.text,
        disabled: o.disabled,
        selected: o.selected,
    }));
    const placeholderOpt = options.find((o) => o.disabled);
    const placeholder = placeholderOpt?.text || options[0]?.text || '';

    const wrap = document.createElement('div');
    wrap.className = 'cust-select qa-progress';
    if (sel.id) wrap.id = sel.id;
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('role', 'combobox');
    wrap.setAttribute('aria-haspopup', 'listbox');
    wrap.setAttribute('aria-expanded', 'false');

    const labelEl = document.createElement('span');
    labelEl.className = 'cust-select-label';
    labelEl.textContent = customSelectDisplayLabel(sel, options);

    const arrowEl = document.createElement('span');
    arrowEl.className = 'cust-select-arrow';
    arrowEl.setAttribute('aria-hidden', 'true');

    const list = document.createElement('ul');
    list.className = 'cust-select-list';
    list.setAttribute('role', 'listbox');
    list.style.display = 'none';

    const setLabelForValue = (value) => {
        const match = options.find((o) => String(o.value) === String(value));
        labelEl.textContent = match?.text || placeholder;
    };

    const isPlaceholderOption = (opt, index) => opt.disabled && index === 0 && opt.selected;

    options.forEach((opt, index) => {
        if (isPlaceholderOption(opt, index)) return;
        const li = document.createElement('li');
        li.className = 'cust-select-option';
        li.setAttribute('role', 'option');
        li.textContent = opt.text;
        li.dataset.value = opt.value;
        if (opt.selected) li.setAttribute('aria-selected', 'true');
        if (opt.disabled) {
            li.classList.add('cust-select-option--disabled');
            li.setAttribute('aria-disabled', 'true');
            list.appendChild(li);
            return;
        }
        li.addEventListener('mousedown', (e) => e.preventDefault());
        li.addEventListener('click', (e) => {
            e.stopPropagation();
            list.querySelectorAll('.cust-select-option').forEach((el) => {
                el.removeAttribute('aria-selected');
            });
            li.setAttribute('aria-selected', 'true');
            setLabelForValue(opt.value);
            closeList();
            onChange(opt.value);
        });
        list.appendChild(li);
    });

    function openList() {
        list.style.display = '';
        wrap.setAttribute('aria-expanded', 'true');
    }
    function closeList() {
        list.style.display = 'none';
        wrap.setAttribute('aria-expanded', 'false');
    }
    function toggleList() {
        list.style.display === 'none' ? openList() : closeList();
    }

    const closeOnOutside = e => { if (!wrap.contains(e.target)) closeList(); };
    document.addEventListener('click', closeOnOutside);

    wrap.addEventListener('click', e => { e.stopPropagation(); toggleList(); });
    wrap.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleList(); }
        if (e.key === 'Escape') closeList();
        if (e.key === 'ArrowDown') { e.preventDefault(); openList(); list.querySelector('li')?.focus(); }
    });
    list.addEventListener('keydown', e => {
        if (e.key === 'Escape') { closeList(); wrap.focus(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); e.target.nextElementSibling?.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); e.target.previousElementSibling?.focus() || wrap.focus(); }
        if (e.key === 'Enter') e.target.click();
    });

    wrap.appendChild(labelEl);
    wrap.appendChild(arrowEl);
    wrap.appendChild(list);
    sel.replaceWith(wrap);

    wrap._destroyCustomSelect = () => document.removeEventListener('click', closeOnOutside);
    wrap._setCustomSelectValue = (value) => setLabelForValue(value);
    return wrap;
}

export function setContent(id, html) {
    document.getElementById(id).innerHTML = html;
}

export function srcTypeIcon(t) {
    const m = {
        voice_transcript: '🎙️', bio: '👤', resume: '📋', notes: '📝',
        article: '📰', email: '✉️', letter: '📄', interview: '🎤',
        chapter_adjustment: '🛠️',
        podcast: '🎧', presentation: '🖥️', other: '📁',
    };
    return m[t] || '📁';
}

export function countWords(text) {
    return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

export function hashText(input = '') {
    let h = 5381;
    const s = String(input);
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h) + s.charCodeAt(i);
        h |= 0;
    }
    return (h >>> 0).toString(36);
}

export function renderMarkdown(md) {
    if (!md) return '';
    const lines = md.split('\n');
    const out = [];
    let inPara = false;
    let paraIndex = 0;

    const flush = () => { if (inPara) { out.push('</p>'); inPara = false; } };

    const inline = (s) => {
        const escaped = String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        return escaped
            .replace(/\[(?:NEEDS|SUGGESTION):\s*([^\]]+)\]/g, (_, needText) => {
                const cleanNeed = String(needText || '').trim();
                const encodedNeed = encodeURIComponent(cleanNeed);
                return `<span class="md-needs" data-needs-text="${encodedNeed}">[SUGGESTION: ${cleanNeed}]<span class="md-needs-actions"><button type="button" class="md-needs-btn md-needs-btn--fix" data-needs-action="fix" title="Fix this suggestion">Fix</button><button type="button" class="md-needs-btn md-needs-btn--dismiss" data-needs-action="dismiss" title="Dismiss this suggestion">Dismiss</button></span></span>`;
            })
            .replace(/\[DISMISSED_NEED:\s*([^\]]+)\]/g, (_, needText) => {
                const cleanNeed = String(needText || '').trim();
                const encodedNeed = encodeURIComponent(cleanNeed);
                return `<span class="md-needs-dismissed" data-needs-dismissed="${encodedNeed}"><span class="md-needs-dismissed-label">Suggestion Dismissed</span><button type="button" class="md-needs-btn md-needs-btn--undo" data-needs-action="undo-dismiss" title="Undo dismiss">Undo</button></span>`;
            })
            .replace(/\[FIXED\]/g, '<span class="md-needs-fixed-flag">Fixed</span>')
            .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/_(.+?)_/g, '<em>$1</em>');
    };

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.trimEnd();

        // Blank line → end paragraph
        if (!line.trim()) { flush(); continue; }

        // ### h3
        if (/^### (.+)/.test(line)) { flush(); out.push(`<h3>${inline(line.replace(/^### /, ''))}</h3>`); continue; }
        // ## h2
        if (/^## (.+)/.test(line)) { flush(); out.push(`<h2>${inline(line.replace(/^## /, ''))}</h2>`); continue; }
        // # h1
        if (/^# (.+)/.test(line)) { flush(); out.push(`<h1>${inline(line.replace(/^# /, ''))}</h1>`); continue; }
        // > blockquote
        if (/^> (.+)/.test(line)) { flush(); out.push(`<blockquote>${inline(line.replace(/^> /, ''))}</blockquote>`); continue; }
        // --- hr
        if (/^---+$/.test(line.trim())) { flush(); out.push('<hr>'); continue; }

        // Regular text
        if (!inPara) { paraIndex += 1; out.push(`<p data-para="${paraIndex}">`); inPara = true; }
        else out.push('<br>');
        out.push(inline(line));
    }
    flush();
    return out.join('');
}

export function openChapterReader(title, markdown, opts = {}) {
    const readerTitle = document.getElementById('reader-title');
    const readerBody = document.getElementById('reader-body');
    if (!readerTitle || !readerBody) return;

    readerTitle.textContent = title;
    readerBody.innerHTML = renderMarkdown(markdown);

    const highlightParagraph = Number(opts.highlightParagraph || 0);
    if (highlightParagraph > 0) {
        const target = readerBody.querySelector(`p[data-para="${highlightParagraph}"]`) || null;
        if (target) {
            readerBody.querySelectorAll('.reader-paragraph-highlight').forEach((el) => {
                el.classList.remove('reader-paragraph-highlight');
            });
            target.classList.add('reader-paragraph-highlight');
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    document.getElementById('chapter-reader').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

export function closeChapterReader() {
    document.getElementById('chapter-reader').classList.add('hidden');
    document.body.style.overflow = (state.authorSettingsOpen || state.appFeedbackOpen)
        ? 'hidden'
        : '';
}

document.getElementById('reader-close')?.addEventListener('click', closeChapterReader);
document.getElementById('chapter-reader')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('chapter-reader')) closeChapterReader();
});

export function flashAlert(msg, type = 'info', durationMs = 4000) {
    return renderFlashAlert(document, msg, type, durationMs);
}

export { ensureFlashAlertArea } from '../../platform/client/ui/flash-alert.js';

export function stripDuplicateChapterHeading(text, chapterTitle = '') {
    const src = String(text || '');
    if (!src.trim()) return src;

    const lines = src.split('\n');
    let i = 0;
    while (i < lines.length && !String(lines[i] || '').trim()) i += 1;
    if (i >= lines.length) return src;

    const first = String(lines[i] || '').trim();
    const normalizedTitle = String(chapterTitle || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalizedTitle) return src;

    const cleanLine = (line) => String(line || '')
        .replace(/^#+\s*/, '')
        .replace(/^📖\s*/, '')
        .replace(/^chapter\s*:\s*/i, '')
        .replace(/^chapter\s*\d+\s*:\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    if (cleanLine(first) !== normalizedTitle) return src;

    i += 1;
    while (i < lines.length && !String(lines[i] || '').trim()) i += 1;
    return lines.slice(i).join('\n');
}
