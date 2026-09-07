'use strict';

import { adminApi as api } from '../admin-desk-api.js';
import { esc } from '../../platform/client/ui/text-format.js';

const CATEGORY = [
    ['Page Explain', 'explain.'],
    ['Composer prompts', 'placeholder.'],
    ['Talk openings', 'talk.'],
    ['Guided Ask', 'guided.'],
    ['Personality form', 'personality.'],
];
const RICH_PREFIXES = ['explain.', 'guided.', 'personality.'];

function isRichKey(key) {
    return RICH_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function labelForKey(key) {
    return key.replace(/^(explain|placeholder|talk|guided|personality)\./, '')
        .replace(/[.-]/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function plainText(html) {
    return String(html || '').replace(/<[^>]*>/g, '').replace(/\[\[([^\]]+)\]\]/g, '$1');
}

function fieldHtml(key, value) {
    const rich = isRichKey(key);
    const body = rich
        ? `<div class="desk-pet-copy-editor" contenteditable="true" data-copy-editor="${esc(key)}">${value}</div>`
        : `<textarea class="auth-field desk-pet-copy-input" rows="2" data-copy-editor="${esc(key)}">${esc(plainText(value))}</textarea>`;
    return `<section class="desk-pet-copy-field">
        <div class="desk-pet-copy-field-head">
            <label>${esc(labelForKey(key))}</label>
            ${rich ? `<span class="desk-pet-copy-toolbar" aria-label="Text formatting">
                <button type="button" data-copy-format="bold" data-copy-key="${esc(key)}"><strong>B</strong></button>
                <button type="button" data-copy-format="italic" data-copy-key="${esc(key)}"><em>I</em></button>
                <button type="button" data-copy-format="underline" data-copy-key="${esc(key)}"><u>U</u></button>
            </span>` : '<span class="desk-pet-copy-plain">Plain text for input or speech</span>'}
        </div>
        ${body}
    </section>`;
}

export async function launchPetCopyPanel(deps) {
    const { renderMyDeskList, setMyDeskWorkspaceMode, returnToAdminDeskHome } = deps || {};
    if (![renderMyDeskList, setMyDeskWorkspaceMode, returnToAdminDeskHome].every((fn) => typeof fn === 'function')) {
        throw new Error('launchPetCopyPanel requires desk host deps');
    }
    const host = document.getElementById('my-desk-empty');
    if (!host) return;
    renderMyDeskList();
    setMyDeskWorkspaceMode(true);
    host.classList.remove('hidden');
    host.classList.add('book-audit-host');
    host.innerHTML = `<div class="desk-workspace-shell">
        <header class="desk-workspace-head"><h3>Pet Copy</h3><button id="desk-pet-copy-close" class="reader-close" type="button" aria-label="Close">✕</button></header>
        <div class="desk-workspace-body desk-settings-body-wrap"><div class="desk-workspace-panel-card">
            <p class="desk-workspace-intro">Edit the author-facing Pet Book prompts and page explanations. Bold, italic, and underline are available where authors can see formatting; input and spoken copy stay plain text.</p>
            <div id="desk-pet-copy-fields">Loading…</div>
        </div></div>
        <footer class="desk-workspace-foot desk-workspace-foot--spread"><div>
            <button class="btn btn-ghost" id="desk-pet-copy-reset" type="button">Reset all defaults</button>
            <button class="btn btn-primary" id="desk-pet-copy-save" type="button">Save</button>
        </div><span id="desk-pet-copy-status" class="desk-workspace-status"></span></footer>
    </div>`;
    document.getElementById('desk-pet-copy-close')?.addEventListener('click', returnToAdminDeskHome);
    const fields = document.getElementById('desk-pet-copy-fields');
    const status = document.getElementById('desk-pet-copy-status');
    const save = document.getElementById('desk-pet-copy-save');
    const reset = document.getElementById('desk-pet-copy-reset');
    const paint = (data) => {
        const values = data?.values || {};
        fields.innerHTML = CATEGORY.map(([title, prefix]) => {
            const rows = Object.keys(values).filter((key) => key.startsWith(prefix))
                .map((key) => fieldHtml(key, values[key])).join('');
            return rows ? `<h4 class="desk-pet-copy-group">${esc(title)}</h4>${rows}` : '';
        }).join('');
        fields.querySelectorAll('[data-copy-format]').forEach((button) => button.addEventListener('click', () => {
            const editor = fields.querySelector(`[data-copy-editor="${CSS.escape(button.dataset.copyKey)}"]`);
            editor?.focus();
            document.execCommand(button.dataset.copyFormat, false);
        }));
    };
    const setStatus = (text, error = false) => {
        status.textContent = text;
        status.style.color = error ? 'var(--c-danger)' : 'var(--c-success)';
    };
    try {
        paint(await api('GET', '/api/system/pet-author-copy'));
    } catch (err) {
        fields.textContent = err.message || 'Could not load Pet copy.';
        return;
    }
    save.addEventListener('click', async () => {
        save.disabled = true;
        try {
            const values = {};
            fields.querySelectorAll('[data-copy-editor]').forEach((editor) => {
                values[editor.dataset.copyEditor] = editor.classList.contains('desk-pet-copy-editor')
                    ? editor.innerHTML : editor.value;
            });
            paint(await api('PUT', '/api/system/pet-author-copy', { values }));
            setStatus('Saved — reload Pet Book to apply.');
        } catch (err) {
            setStatus(err.message || 'Could not save Pet copy.', true);
        } finally {
            save.disabled = false;
        }
    });
    reset.addEventListener('click', async () => {
        if (!window.confirm('Reset all Pet copy to its built-in defaults?')) return;
        try {
            paint(await api('POST', '/api/system/pet-author-copy/reset'));
            setStatus('Defaults restored.');
        } catch (err) {
            setStatus(err.message || 'Could not reset Pet copy.', true);
        }
    });
}
