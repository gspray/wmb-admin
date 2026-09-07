'use strict';

/**
 * @param {string} question - Dialog title (header).
 * @param {string} [subtitle] - Optional subtitle under the title.
 * @param {{ initialText?: string, allowEmpty?: boolean, placeholder?: string, doneLabel?: string }} [options]
 */
export function showTextDialog(question, subtitle, options = {}) {
    const {
        initialText = '',
        allowEmpty = false,
        placeholder = 'Type your answer here…',
        doneLabel = 'Done',
    } = options || {};

    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'text-dialog-backdrop';

        const dialog = document.createElement('div');
        dialog.className = 'text-dialog outline-qa-panel';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');

        const header = document.createElement('div');
        header.className = 'text-dialog-header';
        const questionEl = document.createElement('div');
        questionEl.className = 'text-dialog-question qa-question';
        questionEl.textContent = question;
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'text-dialog-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.title = 'Cancel';
        header.appendChild(questionEl);
        header.appendChild(closeBtn);
        dialog.appendChild(header);

        if (subtitle) {
            const sub = document.createElement('div');
            sub.className = 'text-dialog-sub';
            sub.textContent = subtitle;
            dialog.appendChild(sub);
        }

        const ta = document.createElement('textarea');
        ta.className = 'qa-answer-area';
        ta.placeholder = placeholder;
        ta.rows = 6;
        ta.value = String(initialText != null ? initialText : '').replace(/\r\n/g, '\n');

        const footer = document.createElement('div');
        footer.className = 'text-dialog-footer textarea-tools-edge--end';
        const doneBtn = document.createElement('button');
        doneBtn.type = 'button';
        doneBtn.className = 'btn btn-primary text-dialog-done';
        doneBtn.textContent = doneLabel;
        footer.appendChild(doneBtn);

        dialog.appendChild(ta);
        dialog.appendChild(footer);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);
        ta.focus();

        function close(result) {
            backdrop.remove();
            resolve(result);
        }

        doneBtn.addEventListener('click', () => {
            const val = String(ta.value || '').trim();
            if (!allowEmpty && !val) {
                ta.focus();
                return;
            }
            close(val);
        });
        closeBtn.addEventListener('click', () => close(null));
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
        backdrop.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); });
    });
}
