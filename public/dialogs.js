'use strict';

(function initWmbDialogs(global) {
    if (global.WmbDialogs) return;

    const STYLE_ID = 'wmb-dialogs-style';

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .wmb-dialog-backdrop {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, .45);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                padding: 1rem;
            }
            .wmb-dialog {
                width: min(560px, 100%);
                background: #fff;
                color: #111827;
                border-radius: 12px;
                border: 1px solid rgba(17, 24, 39, .12);
                box-shadow: 0 20px 60px rgba(0, 0, 0, .35);
                padding: 1rem 1rem .9rem;
                font-family: inherit;
            }
            .wmb-dialog.wmb-dialog--large {
                width: min(860px, 100%);
            }
            .wmb-dialog-title {
                margin: 0;
                font-size: 1.02rem;
                font-weight: 800;
                color: #111827;
            }
            .wmb-dialog-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: .5rem;
                margin: 0 0 .45rem;
            }
            .wmb-dialog-header .wmb-dialog-title {
                flex: 1;
                min-width: 0;
            }
            .wmb-dialog-close {
                flex: 0 0 auto;
                width: 2.75rem;
                height: 2.75rem;
                margin: -.45rem -.45rem 0 0;
                border: none;
                border-radius: 10px;
                background: transparent;
                color: #6b7280;
                font-size: 2rem;
                line-height: 1;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .wmb-dialog-close:hover {
                background: #f3f4f6;
                color: #111827;
            }
            .wmb-dialog-close:focus-visible {
                outline: 2px solid #4f46e5;
                outline-offset: 1px;
            }
            .wmb-dialog-message {
                margin: 0;
                color: #374151;
                line-height: 1.55;
                white-space: pre-wrap;
            }
            .wmb-dialog-body {
                margin: 0 0 .5rem;
                max-height: min(70vh, 32rem);
                overflow: auto;
                -webkit-overflow-scrolling: touch;
            }
            .wmb-dialog-input {
                margin-top: .8rem;
                width: 100%;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                padding: .55rem .7rem;
                font-size: .93rem;
                color: #111827;
                background: #fff;
                outline: none;
            }
            .wmb-dialog-input:focus {
                border-color: #4f46e5;
                box-shadow: 0 0 0 2px rgba(79, 70, 229, .16);
            }
            .wmb-dialog-actions {
                margin-top: .9rem;
                display: flex;
                justify-content: flex-end;
                gap: .5rem;
                flex-wrap: wrap;
            }
            .wmb-dialog-btn {
                border: 1px solid #d1d5db;
                background: #fff;
                color: #111827;
                border-radius: 8px;
                padding: .42rem .9rem;
                font-size: .86rem;
                font-weight: 600;
                cursor: pointer;
            }
            .wmb-dialog-btn:hover { background: #f9fafb; }
            .wmb-dialog-btn--primary {
                border-color: #4f46e5;
                background: #4f46e5;
                color: #fff;
            }
            .wmb-dialog-btn--primary:hover {
                background: #4338ca;
                border-color: #4338ca;
            }
            .wmb-dialog--tips {
                width: min(620px, 100%);
                padding: .75rem .95rem .7rem;
            }
            .wmb-dialog--tips .wmb-dialog-title {
                margin: 0;
                font-size: .98rem;
            }
            .wmb-dialog--tips .wmb-dialog-header {
                margin: 0 0 .5rem;
            }
            .wmb-dialog--tips .wmb-dialog-actions {
                margin-top: .65rem;
            }
            .wmb-dialog-tips-list {
                margin: 0;
                padding: 0 0 0 1.05rem;
                color: #374151;
                font-size: .86rem;
                line-height: 1.38;
                column-gap: 1.1rem;
            }
            @media (min-width: 520px) {
                .wmb-dialog-tips-list {
                    columns: 2;
                }
            }
            .wmb-dialog-tips-list li {
                margin: 0 0 .32rem;
                break-inside: avoid;
                padding-right: .15rem;
            }
            .wmb-dialog-tips-list li::marker {
                color: #6b7280;
            }
            .wmb-dialog--talk-help {
                width: min(460px, 100%);
            }
            .wmb-dialog--talk-help .wmb-dialog-body {
                max-height: min(72vh, 36rem);
                overflow: auto;
            }
            .wmb-talk-help-lead {
                margin: 0 0 .75rem;
                color: #374151;
                font-size: .92rem;
                line-height: 1.45;
            }
            .wmb-talk-help-demo {
                display: grid;
                gap: .55rem;
            }
            .wmb-talk-help-kicker {
                margin: 0;
                font-size: .78rem;
                font-weight: 700;
                letter-spacing: .04em;
                text-transform: uppercase;
                color: #4f46e5;
                min-height: 1.1em;
                transition: opacity .2s ease;
            }
            .wmb-talk-help-mock {
                pointer-events: none;
                user-select: none;
            }
            .wmb-talk-help-mock-box {
                position: relative;
                display: flex;
                align-items: center;
                min-height: 2.85rem;
                padding: .45rem 3.1rem .45rem .75rem;
                border: 1px solid #d1d5db;
                border-radius: 10px;
                background: #fff;
                overflow: visible;
                isolation: isolate;
                transition: border-color .25s ease, background .25s ease, box-shadow .25s ease;
            }
            .wmb-talk-help-mock-box::before,
            .wmb-talk-help-mock-box::after {
                content: none;
                position: absolute;
                border-radius: inherit;
                pointer-events: none;
                z-index: 0;
            }
            .wmb-talk-help-mock-text {
                position: relative;
                z-index: 1;
                flex: 1 1 auto;
                min-width: 0;
                color: #9ca3af;
                font-size: .9rem;
                line-height: 1.4;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                transition: color .25s ease;
            }
            .wmb-talk-help-mock-actions {
                position: absolute;
                top: .32rem;
                right: .32rem;
                bottom: .32rem;
                z-index: 2;
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: .28rem;
            }
            .wmb-talk-help-ctrl {
                display: none;
                align-items: center;
                justify-content: center;
                flex: 0 0 auto;
                width: 1.85rem;
                height: 1.85rem;
                border-radius: 999px;
                transition: transform .2s ease, box-shadow .2s ease, background .2s ease, border-color .2s ease, color .2s ease;
            }
            .wmb-talk-help-ctrl .voice-icon {
                display: block;
                width: .95rem;
                height: .95rem;
            }
            .wmb-talk-help-ctrl--start {
                background: #3A312C;
                color: #fff;
            }
            .wmb-talk-help-ctrl--hear {
                background: #fff;
                color: #3A312C;
                border: 1px solid rgba(58, 49, 44, .18);
            }
            .wmb-talk-help-ctrl--done {
                background: #111;
                color: #fff;
            }
            /* Start Voice — idle ask bar + Start Voice */
            .wmb-talk-help-demo[data-step="start"] .wmb-talk-help-ctrl--start {
                display: inline-flex;
                transform: scale(1.06);
                box-shadow: 0 0 0 3px rgba(58, 49, 44, .14);
            }
            /* Just talk — green listening bar + End */
            .wmb-talk-help-demo[data-step="bar"] .wmb-talk-help-mock-box {
                background: radial-gradient(circle at 38% 32%, #fff 0%, #6ee7b7 55%, #ecfdf5 100%);
                border-color: #059669;
                box-shadow: 0 0 0 2px rgba(5, 150, 105, .22), 0 0 8px rgba(52, 211, 153, .28);
            }
            .wmb-talk-help-demo[data-step="bar"] .wmb-talk-help-mock-box::before,
            .wmb-talk-help-demo[data-step="bar"] .wmb-talk-help-mock-box::after {
                content: "";
                border: 2px solid rgba(5, 150, 105, .42);
            }
            .wmb-talk-help-demo[data-step="bar"] .wmb-talk-help-mock-box::before {
                inset: -4px;
                opacity: .45;
            }
            .wmb-talk-help-demo[data-step="bar"] .wmb-talk-help-mock-box::after {
                inset: -8px;
                opacity: .22;
                animation: wmb-talk-help-listen-ring .95s ease-out infinite;
            }
            .wmb-talk-help-demo[data-step="bar"] .wmb-talk-help-mock-text {
                color: #064e3b;
            }
            .wmb-talk-help-demo[data-step="bar"] .wmb-talk-help-ctrl--done {
                display: inline-flex;
                box-shadow: 0 0 0 2px rgba(5, 150, 105, .35);
            }
            /* Hear — session chrome, Hear emphasized */
            .wmb-talk-help-demo[data-step="hear"] .wmb-talk-help-mock-box {
                border-color: #c4b5fd;
                box-shadow: 0 0 0 2px rgba(124, 58, 237, .12);
            }
            .wmb-talk-help-demo[data-step="hear"] .wmb-talk-help-ctrl--hear,
            .wmb-talk-help-demo[data-step="hear"] .wmb-talk-help-ctrl--done {
                display: inline-flex;
            }
            .wmb-talk-help-demo[data-step="hear"] .wmb-talk-help-ctrl--hear {
                transform: scale(1.08);
                box-shadow: 0 0 0 3px rgba(79, 70, 229, .2);
            }
            /* Jump in — purple speaking bar */
            .wmb-talk-help-demo[data-step="jump"] .wmb-talk-help-mock-box {
                background: linear-gradient(180deg, #f5f3ff 0%, #ddd6fe 100%);
                border-color: #7c3aed;
                box-shadow: 0 0 0 2px rgba(124, 58, 237, .22);
            }
            .wmb-talk-help-demo[data-step="jump"] .wmb-talk-help-mock-text {
                color: #5b21b6;
            }
            .wmb-talk-help-demo[data-step="jump"] .wmb-talk-help-ctrl--hear,
            .wmb-talk-help-demo[data-step="jump"] .wmb-talk-help-ctrl--done {
                display: inline-flex;
            }
            .wmb-talk-help-demo[data-step="jump"] .wmb-talk-help-mock-box {
                animation: wmb-talk-help-jump-pulse 1.1s ease-in-out infinite;
            }
            /* Done — End / X emphasized */
            .wmb-talk-help-demo[data-step="done"] .wmb-talk-help-ctrl--hear,
            .wmb-talk-help-demo[data-step="done"] .wmb-talk-help-ctrl--done {
                display: inline-flex;
            }
            .wmb-talk-help-demo[data-step="done"] .wmb-talk-help-ctrl--done {
                transform: scale(1.1);
                box-shadow: 0 0 0 3px rgba(17, 17, 17, .18);
                animation: wmb-talk-help-done-pulse .9s ease-in-out infinite;
            }
            .wmb-talk-help-prompt {
                margin: .85rem 0 0;
                padding-top: .75rem;
                border-top: 1px solid #e5e7eb;
                color: #374151;
                font-size: .88rem;
                line-height: 1.45;
            }
            @keyframes wmb-talk-help-listen-ring {
                0% { transform: scale(1); opacity: .35; }
                100% { transform: scale(1.06); opacity: 0; }
            }
            @keyframes wmb-talk-help-jump-pulse {
                0%, 100% { box-shadow: 0 0 0 2px rgba(124, 58, 237, .22); }
                50% { box-shadow: 0 0 0 5px rgba(124, 58, 237, .12); }
            }
            @keyframes wmb-talk-help-done-pulse {
                0%, 100% { box-shadow: 0 0 0 3px rgba(17, 17, 17, .16); }
                50% { box-shadow: 0 0 0 6px rgba(17, 17, 17, .06); }
            }
            @media (prefers-reduced-motion: reduce) {
                .wmb-talk-help-demo[data-step="bar"] .wmb-talk-help-mock-box::after,
                .wmb-talk-help-demo[data-step="jump"] .wmb-talk-help-mock-box,
                .wmb-talk-help-demo[data-step="done"] .wmb-talk-help-ctrl--done {
                    animation: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function createDialog(opts) {
        ensureStyles();

        const {
            title = 'Notice',
            message = '',
            items = null,
            panelClass = '',
            mode = 'alert',
            okText = 'OK',
            cancelText = 'Cancel',
            defaultValue = '',
            placeholder = '',
            size = 'normal',
        } = opts || {};

        return new Promise((resolve) => {
            const previouslyFocused = document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;

            const backdrop = document.createElement('div');
            backdrop.className = 'wmb-dialog-backdrop';

            const panel = document.createElement('div');
            panel.className = 'wmb-dialog';
            if (size === 'large') panel.classList.add('wmb-dialog--large');
            if (panelClass) {
                String(panelClass).trim().split(/\s+/).filter(Boolean).forEach((c) => {
                    panel.classList.add(c);
                });
            }
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
            panel.setAttribute('tabindex', '-1');

            const titleId = `wmb-dialog-title-${Math.random().toString(36).slice(2, 8)}`;
            panel.setAttribute('aria-labelledby', titleId);

            const titleEl = document.createElement('h3');
            titleEl.className = 'wmb-dialog-title';
            titleEl.id = titleId;
            titleEl.textContent = String(title || 'Notice');

            const headerEl = document.createElement('div');
            headerEl.className = 'wmb-dialog-header';
            headerEl.appendChild(titleEl);

            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'wmb-dialog-close';
            closeBtn.setAttribute('aria-label', 'Close');
            closeBtn.setAttribute('title', 'Close');
            closeBtn.innerHTML = '&times;';
            headerEl.appendChild(closeBtn);

            const tipItems = Array.isArray(items)
                ? items
                : (Array.isArray(message) ? message : null);
            const msgText = tipItems ? '' : String(message || '');

            panel.appendChild(headerEl);
            if (tipItems?.length) {
                const listEl = document.createElement('ul');
                listEl.className = 'wmb-dialog-tips-list';
                tipItems.forEach((tip) => {
                    const li = document.createElement('li');
                    li.textContent = String(tip || '').trim();
                    if (li.textContent) listEl.appendChild(li);
                });
                panel.appendChild(listEl);
            } else if (msgText) {
                const msgEl = document.createElement('p');
                msgEl.className = 'wmb-dialog-message';
                msgEl.textContent = msgText;
                panel.appendChild(msgEl);
            }

            let inputEl = null;
            if (mode === 'prompt') {
                inputEl = document.createElement('input');
                inputEl.type = 'text';
                inputEl.className = 'wmb-dialog-input';
                inputEl.value = String(defaultValue || '');
                inputEl.placeholder = String(placeholder || '');
                panel.appendChild(inputEl);
            }

            const actions = document.createElement('div');
            actions.className = 'wmb-dialog-actions';

            const okBtn = document.createElement('button');
            okBtn.type = 'button';
            okBtn.className = 'wmb-dialog-btn wmb-dialog-btn--primary';
            okBtn.textContent = String(okText || 'OK');

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'wmb-dialog-btn';
            cancelBtn.textContent = String(cancelText || 'Cancel');

            function close(result) {
                document.removeEventListener('keydown', onKeyDown, true);
                backdrop.remove();
                if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                    previouslyFocused.focus();
                }
                resolve(result);
            }

            function getFocusableElements() {
                return Array.from(panel.querySelectorAll(
                    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )).filter(el => el instanceof HTMLElement);
            }

            function onKeyDown(e) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    // Keep Esc on confirm/alert from also closing Discover Research (same document listener stack).
                    e.stopImmediatePropagation();
                    if (mode === 'alert') close(undefined);
                    else if (mode === 'confirm') close(false);
                    else close(null);
                }

                if (e.key === 'Tab') {
                    const focusables = getFocusableElements();
                    if (!focusables.length) {
                        e.preventDefault();
                        panel.focus();
                        return;
                    }

                    const first = focusables[0];
                    const last = focusables[focusables.length - 1];
                    const active = document.activeElement;

                    if (e.shiftKey) {
                        if (active === first || active === panel) {
                            e.preventDefault();
                            last.focus();
                        }
                    } else if (active === last) {
                        e.preventDefault();
                        first.focus();
                    }
                }

                if (e.key === 'Enter') {
                    if (mode === 'prompt' && document.activeElement === inputEl) {
                        e.preventDefault();
                        close(inputEl.value);
                        return;
                    }
                    if (mode === 'confirm') {
                        const active = document.activeElement;
                        if (active !== cancelBtn) {
                            e.preventDefault();
                            close(true);
                        }
                        return;
                    }
                    if (mode === 'alert') {
                        e.preventDefault();
                        close(undefined);
                    }
                }
            }

            if (mode === 'alert') {
                actions.appendChild(okBtn);
                okBtn.addEventListener('click', () => close(undefined));
                closeBtn.addEventListener('click', () => close(undefined));
                backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(undefined); });
            } else if (mode === 'confirm') {
                actions.appendChild(cancelBtn);
                actions.appendChild(okBtn);
                cancelBtn.addEventListener('click', () => close(false));
                okBtn.addEventListener('click', () => close(true));
                closeBtn.addEventListener('click', () => close(false));
                backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });
            } else {
                actions.appendChild(cancelBtn);
                actions.appendChild(okBtn);
                cancelBtn.addEventListener('click', () => close(null));
                okBtn.addEventListener('click', () => close(inputEl.value));
                closeBtn.addEventListener('click', () => close(null));
                backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
            }

            panel.appendChild(actions);
            backdrop.appendChild(panel);
            document.body.appendChild(backdrop);
            // Capture so Esc cancels confirm before Discover Research shell closes on the same key.
            document.addEventListener('keydown', onKeyDown, true);

            setTimeout(() => {
                if (mode === 'prompt' && inputEl) {
                    inputEl.focus();
                    inputEl.select();
                } else {
                    okBtn.focus();
                }
            }, 0);
        });
    }

    /**
     * Custom content dialog (form / details). Does not close on Enter.
     * @param {{
     *   title?: string,
     *   bodyHtml?: string,
     *   bodyElement?: Node | null,
     *   panelClass?: string,
     *   size?: string,
     *   doneText?: string,
     *   onClose?: (result: boolean | undefined) => void,
     * }} [opts]
     * @returns {{ close: Function, panel: HTMLElement, backdrop: HTMLElement, body: HTMLElement, doneBtn: HTMLElement }}
     */
    function openCustomDialog(opts) {
        ensureStyles();

        const {
            title = 'Details',
            bodyHtml = '',
            bodyElement = null,
            panelClass = '',
            size = 'normal',
            doneText = 'Done',
            onClose = null,
        } = opts || {};

        const previouslyFocused = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

        const backdrop = document.createElement('div');
        backdrop.className = 'wmb-dialog-backdrop';

        const panel = document.createElement('div');
        panel.className = 'wmb-dialog';
        if (size === 'large') panel.classList.add('wmb-dialog--large');
        if (panelClass) {
            String(panelClass).trim().split(/\s+/).filter(Boolean).forEach((c) => {
                panel.classList.add(c);
            });
        }
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('tabindex', '-1');

        const titleId = `wmb-dialog-title-${Math.random().toString(36).slice(2, 8)}`;
        panel.setAttribute('aria-labelledby', titleId);

        const titleEl = document.createElement('h3');
        titleEl.className = 'wmb-dialog-title';
        titleEl.id = titleId;
        titleEl.textContent = String(title || 'Details');

        const headerEl = document.createElement('div');
        headerEl.className = 'wmb-dialog-header';
        headerEl.appendChild(titleEl);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'wmb-dialog-close';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.setAttribute('title', 'Close');
        closeBtn.innerHTML = '&times;';
        headerEl.appendChild(closeBtn);
        panel.appendChild(headerEl);

        const body = document.createElement('div');
        body.className = 'wmb-dialog-body';
        if (bodyElement instanceof Node) {
            body.appendChild(bodyElement);
        } else if (bodyHtml) {
            body.innerHTML = String(bodyHtml);
        }
        panel.appendChild(body);

        const actions = document.createElement('div');
        actions.className = 'wmb-dialog-actions';
        const doneBtn = document.createElement('button');
        doneBtn.type = 'button';
        doneBtn.className = 'wmb-dialog-btn wmb-dialog-btn--primary';
        doneBtn.textContent = String(doneText || 'Done');
        actions.appendChild(doneBtn);
        panel.appendChild(actions);

        backdrop.appendChild(panel);
        document.body.appendChild(backdrop);

        let closed = false;
        function close(result) {
            if (closed) return;
            closed = true;
            document.removeEventListener('keydown', onKeyDown, true);
            backdrop.remove();
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                previouslyFocused.focus();
            }
            if (typeof onClose === 'function') onClose(result);
        }

        function getFocusableElements() {
            return Array.from(panel.querySelectorAll(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )).filter((el) => el instanceof HTMLElement);
        }

        function onKeyDown(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopImmediatePropagation();
                close(undefined);
                return;
            }
            if (e.key !== 'Tab') return;
            const focusables = getFocusableElements();
            if (!focusables.length) {
                e.preventDefault();
                panel.focus();
                return;
            }
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement;
            if (e.shiftKey) {
                if (active === first || active === panel) {
                    e.preventDefault();
                    last.focus();
                }
            } else if (active === last) {
                e.preventDefault();
                first.focus();
            }
        }

        doneBtn.addEventListener('click', () => close(true));
        closeBtn.addEventListener('click', () => close(undefined));
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) close(undefined);
        });
        document.addEventListener('keydown', onKeyDown, true);

        setTimeout(() => {
            closeBtn.focus();
        }, 0);

        return { close, panel, backdrop, body, doneBtn };
    }

    global.WmbDialogs = {
        alert(message, options = {}) {
            return createDialog({
                mode: 'alert',
                title: options.title || 'Notice',
                message,
                items: options.items,
                panelClass: options.panelClass || '',
                okText: options.okText || 'OK',
                size: options.size || 'normal',
            });
        },
        confirm(message, options = {}) {
            return createDialog({
                mode: 'confirm',
                title: options.title || 'Please Confirm',
                message,
                okText: options.okText || 'OK',
                cancelText: options.cancelText || 'Cancel',
            });
        },
        prompt(message, defaultValue = '', options = {}) {
            return createDialog({
                mode: 'prompt',
                title: options.title || 'Input Required',
                message,
                defaultValue,
                placeholder: options.placeholder || '',
                okText: options.okText || 'OK',
                cancelText: options.cancelText || 'Cancel',
            });
        },
        open(options = {}) {
            return openCustomDialog(options);
        },
    };
})(window);
