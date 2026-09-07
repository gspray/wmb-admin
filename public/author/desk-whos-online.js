'use strict';

/**
 * Admin Desk — Who's Online panel.
 * Extracted from author-app.js (Phase 2 Admin Desk separation).
 */

import { state } from './state.js';
import { fetchOnlineUsers, formatLocalActivityTime, renderWhosOnlineListHtml } from './whos-online.js';

let _renderMyDeskList = null;
let _setMyDeskWorkspaceMode = null;
let _returnToAdminDeskHome = null;
let _openMyDesk = null;

function renderMyDeskList() { return _renderMyDeskList?.(); }
function setMyDeskWorkspaceMode(enabled) { return _setMyDeskWorkspaceMode?.(enabled); }
function returnToAdminDeskHome() { return _returnToAdminDeskHome?.(); }
async function openMyDesk() { return _openMyDesk?.(); }

let whosOnlineRefreshTimer = null;

export function stopWhosOnlineRefresh() {
    if (!whosOnlineRefreshTimer) return;
    clearInterval(whosOnlineRefreshTimer);
    whosOnlineRefreshTimer = null;
}

async function refreshWhosOnlinePanel() {
    const listEl = document.getElementById('whos-online-list');
    const statusEl = document.getElementById('whos-online-status');
    if (!listEl) return;

    try {
        const users = await fetchOnlineUsers();
        listEl.innerHTML = renderWhosOnlineListHtml(users);
        if (statusEl) {
            const countLabel = users.length === 1 ? '1 user online' : `${users.length} users online`;
            statusEl.textContent = `${countLabel} · updated ${formatLocalActivityTime(new Date().toISOString())}`;
        }
    } catch (err) {
        listEl.innerHTML = '<p class="desk-whos-online-empty">Could not load online users.</p>';
        if (statusEl) statusEl.textContent = err.message || 'Load failed';
    }
}

export async function launchWhosOnlinePanel(deps) {
    const {
        renderMyDeskList: renderMyDeskListDep,
        setMyDeskWorkspaceMode: setMyDeskWorkspaceModeDep,
        returnToAdminDeskHome: returnToAdminDeskHomeDep,
        openMyDesk: openMyDeskDep,
    } = deps || {};
    if (typeof renderMyDeskListDep !== 'function'
        || typeof setMyDeskWorkspaceModeDep !== 'function'
        || typeof returnToAdminDeskHomeDep !== 'function'
        || typeof openMyDeskDep !== 'function') {
        throw new Error('launchWhosOnlinePanel requires desk host deps');
    }
    _renderMyDeskList = renderMyDeskListDep;
    _setMyDeskWorkspaceMode = setMyDeskWorkspaceModeDep;
    _returnToAdminDeskHome = returnToAdminDeskHomeDep;
    _openMyDesk = openMyDeskDep;
    stopWhosOnlineRefresh();
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
                <h3>Who&apos;s Online</h3>
                <button id="whos-online-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <p class="desk-workspace-intro">Users active on Write My Book in the last 5 minutes.</p>
            <div class="desk-workspace-body">
                <div class="desk-whos-online-toolbar">
                    <p id="whos-online-status" class="desk-workspace-status">Loading…</p>
                    <button id="whos-online-refresh" class="btn btn-ghost" type="button">Refresh</button>
                </div>
                <div id="whos-online-list">
                    <div class="loading-block">Loading online users…</div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('whos-online-close')?.addEventListener('click', () => {
        returnToAdminDeskHome();
    });
    document.getElementById('whos-online-refresh')?.addEventListener('click', () => {
        refreshWhosOnlinePanel().catch(() => {});
    });

    await refreshWhosOnlinePanel();
    whosOnlineRefreshTimer = setInterval(() => {
        refreshWhosOnlinePanel().catch(() => {});
    }, 60 * 1000);
}

export async function openWhosOnline(deps) {
    if (deps) {
        const {
            renderMyDeskList: renderMyDeskListDep,
            setMyDeskWorkspaceMode: setMyDeskWorkspaceModeDep,
            returnToAdminDeskHome: returnToAdminDeskHomeDep,
            openMyDesk: openMyDeskDep,
        } = deps;
        if (typeof renderMyDeskListDep === 'function') _renderMyDeskList = renderMyDeskListDep;
        if (typeof setMyDeskWorkspaceModeDep === 'function') _setMyDeskWorkspaceMode = setMyDeskWorkspaceModeDep;
        if (typeof returnToAdminDeskHomeDep === 'function') _returnToAdminDeskHome = returnToAdminDeskHomeDep;
        if (typeof openMyDeskDep === 'function') _openMyDesk = openMyDeskDep;
    }
    await openMyDesk();
    await launchWhosOnlinePanel({
        renderMyDeskList: _renderMyDeskList,
        setMyDeskWorkspaceMode: _setMyDeskWorkspaceMode,
        returnToAdminDeskHome: _returnToAdminDeskHome,
        openMyDesk: _openMyDesk,
    });
}
