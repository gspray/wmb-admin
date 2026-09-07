'use strict';

/**
 * Admin Desk — Activity Log (sign-ins).
 */

import { state } from './state.js';
import { adminApi as api } from '../admin-desk-api.js';
import {
    activityLogStatusText,
    filterActivityEvents,
    renderActivityLogListHtml,
} from './desk-activity-log-helpers.js';

export {
    activityEventMatchesQuery,
    activityLabel,
    activityLogStatusText,
    filterActivityEvents,
    renderActivityLogListHtml,
} from './desk-activity-log-helpers.js';

let _renderMyDeskList = null;
let _setMyDeskWorkspaceMode = null;
let _returnToAdminDeskHome = null;
let _loadedEvents = [];

function renderMyDeskList() { return _renderMyDeskList?.(); }
function setMyDeskWorkspaceMode(enabled) { return _setMyDeskWorkspaceMode?.(enabled); }
function returnToAdminDeskHome() { return _returnToAdminDeskHome?.(); }

function currentSearchQuery() {
    return String(document.getElementById('activity-log-search')?.value || '').trim();
}

function paintActivityLog(events) {
    const listEl = document.getElementById('activity-log-list');
    const statusEl = document.getElementById('activity-log-status');
    if (!listEl) return;

    const query = currentSearchQuery();
    const filtered = filterActivityEvents(events, query);
    listEl.innerHTML = renderActivityLogListHtml(filtered, { query });
    if (statusEl) statusEl.textContent = activityLogStatusText(filtered.length);
}

async function fetchActivityEvents(type = '') {
    const params = new URLSearchParams({ limit: '200' });
    if (type === 'login') params.set('type', type);
    const data = await api('GET', `/api/auth/activity?${params.toString()}`);
    return Array.isArray(data?.events) ? data.events : [];
}

async function refreshActivityLogPanel() {
    const listEl = document.getElementById('activity-log-list');
    const statusEl = document.getElementById('activity-log-status');
    const filterEl = document.getElementById('activity-log-filter');
    if (!listEl) return;

    const type = String(filterEl?.value || '').trim();
    try {
        _loadedEvents = await fetchActivityEvents(type);
        paintActivityLog(_loadedEvents);
    } catch (err) {
        _loadedEvents = [];
        listEl.innerHTML = '<p class="desk-activity-log-empty">Could not load activity.</p>';
        if (statusEl) statusEl.textContent = err.message || 'Load failed';
    }
}

export async function launchActivityLogPanel(deps) {
    const {
        renderMyDeskList: renderMyDeskListDep,
        setMyDeskWorkspaceMode: setMyDeskWorkspaceModeDep,
        returnToAdminDeskHome: returnToAdminDeskHomeDep,
    } = deps || {};
    if (typeof renderMyDeskListDep !== 'function'
        || typeof setMyDeskWorkspaceModeDep !== 'function'
        || typeof returnToAdminDeskHomeDep !== 'function') {
        throw new Error('launchActivityLogPanel requires desk host deps');
    }
    _renderMyDeskList = renderMyDeskListDep;
    _setMyDeskWorkspaceMode = setMyDeskWorkspaceModeDep;
    _returnToAdminDeskHome = returnToAdminDeskHomeDep;
    _loadedEvents = [];

    const emptyEl = document.getElementById('my-desk-empty');
    const editorEl = document.getElementById('my-desk-editor');
    const comingSoon = document.getElementById('my-desk-coming-soon');
    if (!emptyEl) return;

    state.librarySelected = null;
    renderMyDeskList();
    if (comingSoon) comingSoon.classList.add('hidden');
    if (editorEl) editorEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    emptyEl.classList.add('book-audit-host');
    setMyDeskWorkspaceMode(true);
    emptyEl.innerHTML = `
        <div class="desk-workspace-shell">
            <header class="desk-workspace-head">
                <h3>Activity Log</h3>
                <button id="activity-log-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <p class="desk-workspace-intro">Sign-ins across Write My Book, Write My Pet Book, and Admin Desk.</p>
            <div class="desk-workspace-body desk-activity-log-body">
                <div class="desk-activity-log-toolbar">
                    <input id="activity-log-search" class="auth-field desk-activity-log-search" type="search"
                        placeholder="Search name, page, date, or time…" aria-label="Search activity" autocomplete="off" />
                    <label class="desk-activity-log-filter">
                        <select id="activity-log-filter" class="auth-field" aria-label="Filter activity">
                            <option value="">All sign-ins</option>
                            <option value="login">Sign-ins</option>
                        </select>
                    </label>
                    <p id="activity-log-status" class="desk-workspace-status">Loading…</p>
                    <button id="activity-log-refresh" class="btn btn-ghost" type="button">Refresh</button>
                </div>
                <div id="activity-log-list" class="desk-activity-log-scroll">
                    <div class="loading-block">Loading activity…</div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('activity-log-close')?.addEventListener('click', () => {
        returnToAdminDeskHome();
    });
    document.getElementById('activity-log-refresh')?.addEventListener('click', () => {
        refreshActivityLogPanel().catch(() => {});
    });
    document.getElementById('activity-log-filter')?.addEventListener('change', () => {
        refreshActivityLogPanel().catch(() => {});
    });
    document.getElementById('activity-log-search')?.addEventListener('input', () => {
        paintActivityLog(_loadedEvents);
    });

    await refreshActivityLogPanel();
}
