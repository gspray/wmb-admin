'use strict';

/**
 * Admin Desk Activity Log — compact sign-in list rendering and generic search.
 * Pure module (no DOM) so Node tests can import it safely.
 */

import { formatUiDate, formatUiTime } from '../../platform/client/ui/datetime-format.js';

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function activityLabel(event) {
    if (event?.type === 'login') return 'Signed in';
    return 'Signed in';
}

/** Extra date/time fragments so search matches "8/13", "6:06", "AM" even across locales. */
export function activityDateTimeSearchTokens(iso) {
    const raw = String(iso || '').trim();
    if (!raw) return [];
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return [];

    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    const yy = String(year).slice(-2);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const h12 = hours % 12 || 12;
    const mm = String(minutes).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    const h24 = String(hours);

    return [
        `${month}/${day}`,
        `${month}/${day}/${yy}`,
        `${month}/${day}/${year}`,
        `${h12}:${mm}`,
        `${h12}:${mm} ${ampm}`,
        ampm,
        `${h24}:${mm}`,
    ];
}

export function activitySearchHaystack(event) {
    const date = formatUiDate(event?.at) || '';
    const time = formatUiTime(event?.at) || '';
    const parts = [
        event?.userName,
        event?.email,
        activityLabel(event),
        event?.page,
        date,
        time,
        ...activityDateTimeSearchTokens(event?.at),
    ];
    return parts
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

export function normalizeActivitySearchQuery(query) {
    return String(query || '')
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
}

function haystackWordTokens(haystack) {
    return String(haystack || '')
        .split(/[\s·,]+/)
        .map((part) => part.trim())
        .filter(Boolean);
}

export function activityEventMatchesQuery(event, query) {
    const tokens = Array.isArray(query)
        ? query.map((part) => String(part || '').trim().toLowerCase()).filter(Boolean)
        : normalizeActivitySearchQuery(query);
    if (!tokens.length) return true;

    const haystack = activitySearchHaystack(event);
    const words = haystackWordTokens(haystack);
    return tokens.every((token) => {
        if (token.length <= 2) return words.includes(token);
        return haystack.includes(token);
    });
}

export function filterActivityEvents(events, query) {
    const rows = Array.isArray(events) ? events : [];
    const tokens = normalizeActivitySearchQuery(query);
    if (!tokens.length) return rows;
    return rows.filter((event) => activityEventMatchesQuery(event, tokens));
}

export function activityLogStatusText(count) {
    const n = Number(count) || 0;
    const countLabel = n === 1 ? '1 event' : `${n} events`;
    return `${countLabel} · newest first`;
}

export function renderActivityLogListHtml(events, opts = {}) {
    const rows = Array.isArray(events) ? events : [];
    const query = String(opts.query || '').trim();
    if (!rows.length) {
        if (query) {
            return '<p class="desk-activity-log-empty">No matching activity.</p>';
        }
        return '<p class="desk-activity-log-empty">No sign-ins recorded yet.</p>';
    }

    const items = rows.map((event) => {
        const name = esc(event.userName || event.email || 'Unknown');
        const what = esc(activityLabel(event));
        const date = esc(formatUiDate(event.at) || '—');
        const time = esc(formatUiTime(event.at) || '—');
        return `
            <li class="desk-activity-log-item">
                <span class="desk-activity-log-name">${name}</span>
                <span class="desk-activity-log-what">${what}</span>
                <span class="desk-activity-log-when">
                    <span class="desk-activity-log-date">${date}</span>
                    <span class="desk-activity-log-time">${time}</span>
                </span>
            </li>
        `;
    }).join('');

    return `<ul class="desk-activity-log-list">${items}</ul>`;
}
