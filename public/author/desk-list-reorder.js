'use strict';

/**
 * Reorder one item in a list (in place). Returns true when the list changed.
 * Shared by Admin Desk list editors (chapter strategies, etc.).
 */
export function reorderListItem(list, from, to) {
    if (!Array.isArray(list)) return false;
    if (!Number.isInteger(from) || !Number.isInteger(to)) return false;
    if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return false;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    return true;
}
