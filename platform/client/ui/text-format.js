'use strict';

/** Product-neutral HTML and lightweight rich-text presentation helpers. */
export function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const escapeHtml = esc;

export function renderBodyToHtml(text) {
    if (!text) return '<em style="color:#aaa">Empty</em>';
    const lines = text.split('\n');
    const out = [];
    for (const raw of lines) {
        let line = raw
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>');
        if (/^### /.test(raw)) { out.push(`<h3>${line.slice(4)}</h3>`); continue; }
        if (/^## /.test(raw)) { out.push(`<h2>${line.slice(3)}</h2>`); continue; }
        if (/^# /.test(raw)) { out.push(`<h1>${line.slice(2)}</h1>`); continue; }
        if (/^[-*] /.test(raw)) { out.push(`<li>${line.slice(2)}</li>`); continue; }
        if (line.trim() === '') { out.push('<br>'); continue; }
        out.push(`<p>${line}</p>`);
    }
    return out.join('\n');
}
