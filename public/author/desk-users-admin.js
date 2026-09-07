'use strict';

/**
 * Admin Desk — Manage Users.
 * Extracted from author-app.js (Phase 2 Admin Desk separation).
 */

import { state } from './state.js';
import { adminApi as api } from '../admin-desk-api.js';
import { esc } from './ui-helpers.js';

let _renderMyDeskList = null;
let _setMyDeskWorkspaceMode = null;

function renderMyDeskList() { return _renderMyDeskList?.(); }
function setMyDeskWorkspaceMode(enabled) { return _setMyDeskWorkspaceMode?.(enabled); }

// Desk roles. `system` is a superset of `admin` (all admin abilities plus more,
// TBD). Unknown values fall back to `admin` to match the server default.
function normalizeDeskRole(value) {
    const role = String(value || '').trim().toLowerCase();
    return (role === 'author' || role === 'system') ? role : 'admin';
}

function roleOptionsMarkup(selectedRole) {
    const role = normalizeDeskRole(selectedRole);
    return `
        <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
        <option value="system" ${role === 'system' ? 'selected' : ''}>System</option>
        <option value="author" ${role === 'author' ? 'selected' : ''}>Author</option>
    `;
}

export async function launchUsersAdminPanel(deps) {
    const {
        renderMyDeskList: renderMyDeskListDep,
        setMyDeskWorkspaceMode: setMyDeskWorkspaceModeDep,
    } = deps || {};
    if (typeof renderMyDeskListDep !== 'function'
        || typeof setMyDeskWorkspaceModeDep !== 'function') {
        throw new Error('launchUsersAdminPanel requires desk host deps');
    }
    _renderMyDeskList = renderMyDeskListDep;
    _setMyDeskWorkspaceMode = setMyDeskWorkspaceModeDep;
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
                <h3>Manage Users</h3>
                <button id="users-admin-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <p class="desk-workspace-intro">Add, modify, or delete authorized users.</p>
            <div class="desk-workspace-body desk-users-body">
                <div class="desk-users-grid desk-users-grid--add">
                <input id="users-admin-email" class="auth-field desk-users-field-tight users-admin-email" type="email" placeholder="Email (required)" autocomplete="email" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false" />
                <input id="users-admin-first-name" class="auth-field desk-users-field-tight" type="text" placeholder="First name" />
                <input id="users-admin-last-name" class="auth-field desk-users-field-tight" type="text" placeholder="Last name" />
                <input id="users-admin-phone" class="auth-field desk-users-field-tight" type="text" placeholder="Phone" />
                <div class="desk-users-admin-cell">
                    <select id="users-admin-role" class="auth-field desk-users-field-tight desk-users-role users-admin-role" aria-label="Desk role" title="Admin desk access">
                        ${roleOptionsMarkup('admin')}
                    </select>
                </div>
                <div class="desk-users-delete-cell">
                    <button id="users-admin-add" class="btn btn-primary desk-users-add" type="button">Add User</button>
                </div>
                </div>
                <p id="users-admin-status" class="desk-workspace-status desk-users-status"></p>
                <div id="users-admin-list" class="desk-users-list"></div>
            </div>
        </div>
    `;

    const setStatus = (msg, isError = false) => {
        const statusEl = document.getElementById('users-admin-status');
        if (!statusEl) return;
        statusEl.textContent = msg || '';
        statusEl.style.color = isError ? 'var(--c-danger)' : 'var(--c-muted)';
    };

    const collectUserRow = (host, uid) => {
        const emailEl = host.querySelector(`.users-admin-email[data-uid="${uid}"]`);
        const firstNameEl = host.querySelector(`.users-admin-first-name[data-uid="${uid}"]`);
        const lastNameEl = host.querySelector(`.users-admin-last-name[data-uid="${uid}"]`);
        const phoneEl = host.querySelector(`.users-admin-phone[data-uid="${uid}"]`);
        const roleEl = host.querySelector(`.users-admin-role[data-uid="${uid}"]`);
        const role = normalizeDeskRole(roleEl?.value);
        return {
            email: String(emailEl?.value || '').trim(),
            firstName: String(firstNameEl?.value || '').trim(),
            lastName: String(lastNameEl?.value || '').trim(),
            phone: String(phoneEl?.value || '').trim(),
            role,
        };
    };

    const saveUserByUid = async (host, uid, { silent = false } = {}) => {
        const row = collectUserRow(host, uid);
        if (!row.email) {
            if (!silent) setStatus('Email is required.', true);
            return false;
        }
        try {
            await api('PATCH', `/api/auth/users/${encodeURIComponent(uid)}`, row);
            if (!silent) setStatus('User updated.');
            return true;
        } catch (err) {
            if (!silent) setStatus(`Could not update user: ${err.message || 'unknown error'}`, true);
            return false;
        }
    };

    const renderUsers = async () => {
        const host = document.getElementById('users-admin-list');
        if (!host) return;
        host.innerHTML = '<div class="loading-block">Loading users…</div>';
        try {
            const result = await api('GET', '/api/auth/users');
            const users = Array.isArray(result?.users) ? result.users : [];
            if (!users.length) {
                host.innerHTML = '<div class="card" style="padding:.55rem;font-size:.8rem;">No users found.</div>';
                return;
            }
            host.innerHTML = users.map((u) => {
                const uid = esc(u.uid || '');
                const email = esc(u.email || '');
                const firstName = esc(u.firstName || '');
                const lastName = esc(u.lastName || '');
                const phone = esc(u.phone || '');
                const roleVal = normalizeDeskRole(u.role);
                return `
                    <div class="desk-users-list-row">
                        <div class="desk-users-grid">
                            <input class="auth-field desk-users-field-tight users-admin-email" data-uid="${uid}" type="email" value="${email}" autocomplete="email" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false" />
                            <input class="auth-field desk-users-field-tight users-admin-first-name" data-uid="${uid}" type="text" value="${firstName}" placeholder="First name" />
                            <input class="auth-field desk-users-field-tight users-admin-last-name" data-uid="${uid}" type="text" value="${lastName}" placeholder="Last name" />
                            <input class="auth-field desk-users-field-tight users-admin-phone" data-uid="${uid}" type="text" value="${phone}" placeholder="Phone" />
                            <div class="desk-users-admin-cell">
                                <select class="auth-field desk-users-field-tight desk-users-role users-admin-role" data-uid="${uid}" aria-label="Desk role" title="Admin desk access">
                                    ${roleOptionsMarkup(roleVal)}
                                </select>
                            </div>
                            <div class="desk-users-delete-cell">
                                <button class="btn btn-ghost desk-users-delete-btn users-admin-delete" data-uid="${uid}" type="button" title="Delete user" aria-label="Delete user"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            host.querySelectorAll('.users-admin-email, .users-admin-first-name, .users-admin-last-name, .users-admin-phone').forEach((inputEl) => {
                inputEl.addEventListener('blur', async () => {
                    const uid = inputEl.getAttribute('data-uid') || '';
                    if (!uid) return;
                    await saveUserByUid(host, uid, { silent: true });
                });
            });

            host.querySelectorAll('select.users-admin-role[data-uid]').forEach((sel) => {
                sel.addEventListener('change', async () => {
                    const uid = sel.getAttribute('data-uid') || '';
                    if (!uid) return;
                    await saveUserByUid(host, uid, { silent: true });
                });
            });

            host.querySelectorAll('.users-admin-delete').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const uid = btn.getAttribute('data-uid') || '';
                    const ok = window.confirm('Delete this user? This cannot be undone.');
                    if (!ok) return;
                    btn.disabled = true;
                    try {
                        await api('DELETE', `/api/auth/users/${encodeURIComponent(uid)}`);
                        setStatus('User deleted.');
                        await renderUsers();
                    } catch (err) {
                        setStatus(`Could not delete user: ${err.message || 'unknown error'}`, true);
                    } finally {
                        btn.disabled = false;
                    }
                });
            });
        } catch (err) {
            host.innerHTML = '<div class="card" style="padding:.55rem;font-size:.8rem;">Could not load users.</div>';
            setStatus(`Could not load users: ${err.message || 'unknown error'}`, true);
        }
    };

    document.getElementById('users-admin-close')?.addEventListener('click', async () => {
        emptyEl.classList.remove('book-audit-host');
        setMyDeskWorkspaceMode(false);
        emptyEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
    });
    document.getElementById('users-admin-add')?.addEventListener('click', async () => {
        const email = String(document.getElementById('users-admin-email')?.value || '').trim();
        const firstName = String(document.getElementById('users-admin-first-name')?.value || '').trim();
        const lastName = String(document.getElementById('users-admin-last-name')?.value || '').trim();
        const phone = String(document.getElementById('users-admin-phone')?.value || '').trim();
        const role = normalizeDeskRole(document.getElementById('users-admin-role')?.value);
        if (!email) {
            setStatus('Email is required to add a user.', true);
            return;
        }
        try {
            await api('POST', '/api/auth/create-user', { email, firstName, lastName, phone, role });
            setStatus('User created.');
            const emailEl = document.getElementById('users-admin-email');
            const firstNameEl = document.getElementById('users-admin-first-name');
            const lastNameEl = document.getElementById('users-admin-last-name');
            const phoneEl = document.getElementById('users-admin-phone');
            const roleEl = document.getElementById('users-admin-role');
            if (emailEl) emailEl.value = '';
            if (firstNameEl) firstNameEl.value = '';
            if (lastNameEl) lastNameEl.value = '';
            if (phoneEl) phoneEl.value = '';
            if (roleEl) roleEl.value = 'admin';
            await renderUsers();
        } catch (err) {
            setStatus(`Could not create user: ${err.message || 'unknown error'}`, true);
        }
    });

    await renderUsers();
}
