'use strict';

/**
 * Canonical short-local date/time formatters for author + admin UI.
 * Pure module (no DOM) so Node tests can import it safely.
 */

const ISO_TIMESTAMP_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z?/g;

function parseUiDate(iso) {
    const raw = String(iso || '').trim();
    if (!raw) return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return date;
}

/** Canonical short local datetime (e.g. "7/16/26, 4:24 PM"). */
export function formatUiDateTime(iso) {
    const date = parseUiDate(iso);
    if (!date) return '';
    return date.toLocaleString(undefined, {
        dateStyle: 'short',
        timeStyle: 'short',
    });
}

/** Canonical short local date (e.g. "7/16/26"). */
export function formatUiDate(iso) {
    const date = parseUiDate(iso);
    if (!date) return '';
    return date.toLocaleDateString(undefined, { dateStyle: 'short' });
}

/** Short local time of day (e.g. "4:24 PM"). */
export function formatUiTime(iso) {
    const date = parseUiDate(iso);
    if (!date) return '';
    return date.toLocaleTimeString(undefined, { timeStyle: 'short' });
}

/**
 * Author-facing local datetime (keeps raw ISO for APIs / data attributes).
 * Alias of formatUiDateTime; invalid/non-empty input returns the original string.
 */
export function formatAuthorLocalDateTime(iso) {
    const raw = String(iso || '').trim();
    if (!raw) return '';
    return formatUiDateTime(raw) || raw;
}

/** Replace ISO timestamps in author-visible copy with local datetimes. */
export function formatAuthorFacingTimestamps(text) {
    return String(text ?? '').replace(ISO_TIMESTAMP_RE, (match) => (
        formatAuthorLocalDateTime(match) || match
    ));
}
