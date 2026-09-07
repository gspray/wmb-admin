'use strict';

import { adminApi as api } from '../admin-desk-api.js';
import { esc, formatUiDateTime } from './ui-helpers.js';

export function formatLocalActivityTime(iso) {
    return formatUiDateTime(iso) || '—';
}

export async function fetchOnlineUsers() {
    const data = await api('GET', '/api/auth/online');
    return Array.isArray(data?.users) ? data.users : [];
}

export function renderWhosOnlineListHtml(users) {
    const rows = Array.isArray(users) ? users : [];
    if (!rows.length) {
        return '<p class="desk-whos-online-empty">No one online in the last 5 minutes.</p>';
    }

    const items = rows.map((user) => {
        const name = esc(user.displayName || user.name || user.email || 'Unknown');
        const activity = esc(formatLocalActivityTime(user.lastSeenAt));
        return `
            <li class="desk-whos-online-item">
                <span class="desk-whos-online-name">${name}</span>
                <span class="desk-whos-online-activity">last activity: ${activity}</span>
            </li>
        `;
    }).join('');

    return `<ul class="desk-whos-online-list">${items}</ul>`;
}
