'use strict';

export function ensureFlashAlertArea(documentRef) {
    const doc = documentRef;
    if (!doc?.getElementById || !doc?.createElement) return null;
    const existing = doc.getElementById('alert-area') || doc.getElementById('alert-area-s4');
    if (existing) return existing;
    const area = doc.createElement('div');
    area.id = 'alert-area';
    area.className = 'alert-area-host';
    area.setAttribute('aria-live', 'polite');
    area.setAttribute('role', 'status');
    doc.body?.appendChild(area);
    return area;
}

export function flashAlert(documentRef, msg, type = 'info', durationMs = 4000) {
    const area = ensureFlashAlertArea(documentRef);
    if (!area) return null;
    const div = documentRef.createElement('div');
    div.className = `alert alert-${type}`;
    div.textContent = msg;
    area.innerHTML = '';
    area.appendChild(div);
    if (durationMs && typeof setTimeout === 'function') {
        setTimeout(() => {
            if (div.parentNode) div.remove();
        }, durationMs);
    }
    return div;
}
