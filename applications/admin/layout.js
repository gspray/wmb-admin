'use strict';

/** Admin application shell identity — Book Platform Admin (not a customer product). */

export function applyAdminShellIdentity() {
    const label = String(window.__WMB__?.productLabel || 'Book Platform Admin').trim()
        || 'Book Platform Admin';
    document.title = label;
    const logo = document.querySelector('.admin-desk-topbar .a-logo');
    if (logo) logo.textContent = label;
    const sub = document.querySelector('.admin-desk-topbar .logo-sub');
    if (sub) sub.textContent = 'Admin';
    const footer = document.querySelector('.site-footer p');
    if (footer && /Write My Book/i.test(footer.textContent || '')) {
        footer.innerHTML = footer.innerHTML.replace(/Write My Book/g, label);
    }
}
