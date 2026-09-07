'use strict';

/**
 * Admin Desk — Assignment Pacing Settings.
 * Extracted from author-app.js (Phase 2 Admin Desk separation).
 * UX unchanged: still mounts into #my-desk-empty.
 */

import { state } from './state.js';
import { adminApi as api } from '../admin-desk-api.js';
import { esc, formatUiDateTime } from './ui-helpers.js';
import { isUnassignedAssignmentRow } from './static-data.js';

let _renderMyDeskList = null;
let _setMyDeskWorkspaceMode = null;
let _returnToAdminDeskHome = null;

function renderMyDeskList() { return _renderMyDeskList?.(); }
function setMyDeskWorkspaceMode(enabled) { return _setMyDeskWorkspaceMode?.(enabled); }
function returnToAdminDeskHome() { return _returnToAdminDeskHome?.(); }

function getConfigureAssignmentsPacingDefaults() {
    return [
        {
            id: 'extremely_fast',
            label: 'Extremely fast',
            authorDescription: 'I can dedicate a full workweek to this project.',
            hoursPerWeek: 40,
            durationWeeks: 1,
            assignmentsPerWeek: 12,
            isDefault: false,
        },
        {
            id: 'fast_10hr_4wk',
            label: 'Fast',
            authorDescription: 'About 10 hours per week for 4 weeks.',
            hoursPerWeek: 10,
            durationWeeks: 4,
            assignmentsPerWeek: 3,
            isDefault: true,
        },
        {
            id: 'modest_pace',
            label: 'Modest pace',
            authorDescription: 'About 3–4 hours per week.',
            hoursPerWeek: 4,
            durationWeeks: 12,
            assignmentsPerWeek: 1,
            isDefault: false,
        },
        {
            id: 'not_in_a_hurry',
            label: "I'm not in a hurry",
            authorDescription: '1 hour per week for 10 months.',
            hoursPerWeek: 1,
            durationWeeks: 40,
            assignmentsPerWeek: 1,
            isDefault: false,
        },
    ];
}

function listRegularAssignmentsForPacingPreview(assignments) {
    return (Array.isArray(assignments) ? assignments : [])
        .filter((a) => {
            if (Number(a?.num) === 0) return false;
            if (String(a?.kind || '').toLowerCase() === 'start_my_book') return false;
            if (isUnassignedAssignmentRow(a)) return false;
            return true;
        })
        .sort((a, b) => Number(a.num) - Number(b.num));
}

function assignmentUnlockLabel(a) {
    const num = Number(a?.num);
    const label = String(a?.label || '').trim();
    if (!label || /^assignment$/i.test(label)) {
        return Number.isFinite(num) ? `Assignment ${num}` : 'Assignment';
    }
    return label;
}

function formatAssignmentNumRangeSummary(assignments) {
    const nums = (Array.isArray(assignments) ? assignments : [])
        .map((a) => Number(a?.num))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
    if (!nums.length) return 'regular assignments';
    const parts = [];
    let start = nums[0];
    let prev = nums[0];
    for (let i = 1; i <= nums.length; i += 1) {
        const n = nums[i];
        if (n === prev + 1) {
            prev = n;
            continue;
        }
        parts.push(start === prev ? String(start) : `${start}–${prev}`);
        start = prev = n;
    }
    const range = parts.join(', ');
    return nums.length === 1
        ? `Assignment ${range}`
        : `Assignments ${range} (${nums.length} total)`;
}

function buildAssignmentUnlockSchedule(profile, regularAssignments) {
    const list = listRegularAssignmentsForPacingPreview(regularAssignments);
    const perWeek = Math.max(1, Math.floor(Number(profile?.assignmentsPerWeek)) || 1);
    const maxWeeks = Math.max(1, Math.floor(Number(profile?.durationWeeks)) || 1);
    const weeks = [];
    let nextIdx = 0;
    let week = 1;
    const total = list.length;

    if (!total) return weeks;

    while (nextIdx < total && week <= maxWeeks) {
        const batch = [];
        for (let i = 0; i < perWeek && nextIdx < total; i += 1) {
            const row = list[nextIdx];
            batch.push({
                num: Number(row?.num ?? nextIdx + 1),
                label: assignmentUnlockLabel(row || { num: nextIdx + 1 }),
            });
            nextIdx += 1;
        }
        if (batch.length) weeks.push({ week, assignments: batch });
        week += 1;
    }
    while (nextIdx < total) {
        const batch = [];
        for (let i = 0; i < perWeek && nextIdx < total; i += 1) {
            const row = list[nextIdx];
            batch.push({
                num: Number(row?.num ?? nextIdx + 1),
                label: assignmentUnlockLabel(row || { num: nextIdx + 1 }),
            });
            nextIdx += 1;
        }
        if (batch.length) weeks.push({ week, assignments: batch });
        week += 1;
    }
    return weeks;
}

function renderAssignmentUnlockScheduleRows(schedule) {
    if (!schedule.length) {
        return '<tr><td colspan="2">No unlock rows (check duration and assignments per week).</td></tr>';
    }
    return schedule.map((row) => `
        <tr>
            <td>Week ${row.week}</td>
            <td>${row.assignments.map((a) => esc(assignmentUnlockLabel(a))).join(', ')}</td>
        </tr>
    `).join('');
}

function renderConfigureAssignmentsPanelMarkup(draft) {
    const previewId = String(draft.previewPaceId || draft.profiles.find((p) => p.isDefault)?.id || draft.profiles[0]?.id || '');
    const previewProfile = draft.profiles.find((p) => p.id === previewId) || draft.profiles[0];
    const regularAssignments = listRegularAssignmentsForPacingPreview(draft.assignments);
    const schedule = previewProfile ? buildAssignmentUnlockSchedule(previewProfile, regularAssignments) : [];
    const assignmentRangeLabel = formatAssignmentNumRangeSummary(regularAssignments);
    const situationOptions = (draft.availableBookSituations || []).map((o) => {
        const id = String(o.id || '').trim();
        const label = String(o.label || id).trim();
        const shortLabel = label.length > 48 ? `${label.slice(0, 45)}…` : label;
        return `<option value="${esc(id)}" ${id === draft.bookSituation ? 'selected' : ''}>${esc(shortLabel)}</option>`;
    }).join('');

    const profileRows = draft.profiles.map((p) => `
        <tr data-pace-id="${esc(p.id)}">
            <td>
                <label class="desk-config-assign-default">
                    <input type="radio" name="desk-config-default-pace" value="${esc(p.id)}" ${p.isDefault ? 'checked' : ''} />
                    <span>${esc(p.isDefault ? 'Default' : '')}</span>
                </label>
            </td>
            <td><strong>${esc(p.label)}</strong><div class="desk-config-assign-muted">${esc(p.authorDescription)}</div></td>
            <td><input class="auth-field desk-config-assign-num" type="number" min="1" step="1" data-field="hoursPerWeek" value="${esc(String(p.hoursPerWeek))}" /></td>
            <td><input class="auth-field desk-config-assign-num" type="number" min="1" step="1" data-field="durationWeeks" value="${esc(String(p.durationWeeks))}" /></td>
            <td><input class="auth-field desk-config-assign-num" type="number" min="1" step="1" data-field="assignmentsPerWeek" value="${esc(String(p.assignmentsPerWeek))}" /></td>
        </tr>
    `).join('');

    const scheduleRows = renderAssignmentUnlockScheduleRows(schedule);

    const previewOptions = draft.profiles.map((p) =>
        `<option value="${esc(p.id)}" ${p.id === previewId ? 'selected' : ''}>${esc(p.label)}</option>`
    ).join('');

    const refListItems = draft.profiles.map((p, idx) => {
        const letter = String.fromCharCode(97 + idx);
        return `<li><strong>${letter}. ${esc(p.label)}</strong> — ${esc(p.authorDescription)}</li>`;
    }).join('');

    const statusText = draft.loadError
        ? draft.loadError
        : (draft.updatedAt ? `Last saved ${formatUiDateTime(draft.updatedAt)}` : '');

    return `
        <div class="desk-workspace-shell desk-workspace-shell--configure-assignments">
            <header class="desk-workspace-head desk-workspace-head--with-situation">
                <div class="desk-workspace-head-main">
                    <h3>Assignment Pacing Settings</h3>
                    <div class="qe-situation-toolbar">
                        <label class="qe-situation-label" for="desk-config-assign-situation">Book situation</label>
                        <select id="desk-config-assign-situation" class="auth-field qe-situation-select" aria-label="Book situation">${situationOptions}</select>
                    </div>
                </div>
                <button id="my-desk-configure-assignments-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <p class="desk-workspace-intro">
                Map the author&apos;s Start My Book pace answer to how ${esc(assignmentRangeLabel)} unlock in My Assignments for the selected book situation.
            </p>
            <div class="desk-workspace-body desk-workspace-body--scroll desk-config-assign-body">
                <section class="desk-config-assign-section">
                    <h4>Pacing profiles (defaults)</h4>
                    <p class="desk-config-assign-lead">These match the Start My Book pace question &ldquo;How quickly would you like to complete your book?&rdquo; (a_009). Tune hours, duration, and how many assignments open per week.</p>
                    <div class="desk-config-assign-table-wrap">
                        <table class="desk-config-assign-table">
                            <thead>
                                <tr>
                                    <th scope="col">Default</th>
                                    <th scope="col">Author choice</th>
                                    <th scope="col">Hrs / week</th>
                                    <th scope="col">Duration (wk)</th>
                                    <th scope="col">Assignments / wk</th>
                                </tr>
                            </thead>
                            <tbody>${profileRows}</tbody>
                        </table>
                    </div>
                </section>
                <section class="desk-config-assign-section">
                    <div class="desk-config-assign-section-head">
                        <h4>Assignment release preview</h4>
                        <label class="desk-config-assign-preview-label">
                            <span>Show pace</span>
                            <select id="desk-config-assign-preview-pace" class="auth-field desk-config-assign-preview-select">${previewOptions}</select>
                        </label>
                    </div>
                    <p class="desk-config-assign-lead">The Start My Book step is always available first. Rows below show when ${esc(assignmentRangeLabel)} become available for the selected pace.</p>
                    <div class="desk-config-assign-table-wrap">
                        <table class="desk-config-assign-table desk-config-assign-table--compact">
                            <thead>
                                <tr>
                                    <th scope="col">Week</th>
                                    <th scope="col">Unlocks</th>
                                </tr>
                            </thead>
                            <tbody id="desk-config-assign-schedule-body">${scheduleRows}</tbody>
                        </table>
                    </div>
                </section>
                <section class="desk-config-assign-section">
                    <h4>Author-facing options (reference)</h4>
                    <ul class="desk-config-assign-ref-list">${refListItems}</ul>
                </section>
            </div>
            <footer class="desk-workspace-foot desk-workspace-foot--spread">
                <span id="desk-config-assign-status" class="desk-workspace-status" style="${draft.loadError ? 'color:var(--c-danger);' : ''}">${esc(statusText)}</span>
                <button class="btn btn-primary" id="desk-config-assign-save" type="button"${draft.loadError ? ' disabled' : ''}>Save defaults</button>
            </footer>
        </div>
    `;
}

function bindConfigureAssignmentsPanel(draft) {
    const host = document.getElementById('my-desk-empty');
    if (!host) return;

    const rerender = () => {
        host.innerHTML = renderConfigureAssignmentsPanelMarkup(draft);
        bindConfigureAssignmentsPanel(draft);
    };

    host.querySelector('#my-desk-configure-assignments-close')?.addEventListener('click', () => {
        returnToAdminDeskHome();
    });

    host.querySelectorAll('tbody tr[data-pace-id]').forEach((row) => {
        const paceId = row.getAttribute('data-pace-id');
        const profile = draft.profiles.find((p) => p.id === paceId);
        if (!profile) return;
        row.querySelectorAll('.desk-config-assign-num').forEach((input) => {
            input.addEventListener('input', () => {
                const field = input.getAttribute('data-field');
                const n = Math.max(1, Math.floor(Number(input.value)) || 1);
                input.value = String(n);
                if (field === 'hoursPerWeek') profile.hoursPerWeek = n;
                else if (field === 'durationWeeks') profile.durationWeeks = n;
                else if (field === 'assignmentsPerWeek') profile.assignmentsPerWeek = n;
                if (draft.previewPaceId === paceId || !draft.previewPaceId) {
                    const previewProfile = draft.profiles.find((p) => p.id === (draft.previewPaceId || draft.profiles.find((x) => x.isDefault)?.id || draft.profiles[0]?.id)) || draft.profiles[0];
                    const scheduleBody = host.querySelector('#desk-config-assign-schedule-body');
                    if (scheduleBody && previewProfile) {
                        const schedule = buildAssignmentUnlockSchedule(previewProfile, draft.assignments);
                        scheduleBody.innerHTML = renderAssignmentUnlockScheduleRows(schedule);
                    } else {
                        rerender();
                    }
                }
            });
        });
    });

    host.querySelectorAll('input[name="desk-config-default-pace"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            const id = String(radio.value || '');
            draft.profiles.forEach((p) => { p.isDefault = p.id === id; });
            rerender();
        });
    });

    const previewSelect = host.querySelector('#desk-config-assign-preview-pace');
    previewSelect?.addEventListener('change', () => {
        draft.previewPaceId = String(previewSelect.value || '');
        rerender();
    });

    host.querySelector('#desk-config-assign-situation')?.addEventListener('change', async (e) => {
        const next = String(e.target.value || '').trim();
        if (!next || next === draft.bookSituation) return;
        const prev = draft.bookSituation;
        const statusEl = host.querySelector('#desk-config-assign-status');
        try {
            if (statusEl) {
                statusEl.textContent = 'Loading situation…';
                statusEl.style.color = 'var(--c-muted)';
            }
            const loaded = await api('GET', `/api/system/assignment-pacing?situation=${encodeURIComponent(next)}`);
            draft.bookSituation = String(loaded?.bookSituation || next);
            draft.profiles = Array.isArray(loaded?.profiles) && loaded.profiles.length
                ? loaded.profiles
                : getConfigureAssignmentsPacingDefaults();
            draft.assignments = Array.isArray(loaded?.assignments) ? loaded.assignments : [];
            draft.updatedAt = loaded?.updatedAt || null;
            draft.updatedBy = loaded?.updatedBy || null;
            if (Array.isArray(loaded?.availableBookSituations) && loaded.availableBookSituations.length) {
                draft.availableBookSituations = loaded.availableBookSituations;
            }
            draft.previewPaceId = draft.profiles.find((p) => p.isDefault)?.id || draft.profiles[0]?.id || 'fast_10hr_4wk';
            draft.loadError = '';
            rerender();
        } catch (err) {
            draft.bookSituation = prev;
            e.target.value = prev;
            if (statusEl) {
                statusEl.textContent = err.message || 'Could not load situation';
                statusEl.style.color = 'var(--c-danger)';
            }
        }
    });

    host.querySelector('#desk-config-assign-save')?.addEventListener('click', async () => {
        const statusEl = host.querySelector('#desk-config-assign-status');
        const saveBtn = host.querySelector('#desk-config-assign-save');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving…';
        }
        if (statusEl) {
            statusEl.style.color = 'var(--c-muted)';
            statusEl.textContent = '';
        }
        try {
            const saved = await api('PATCH', '/api/system/assignment-pacing', {
                profiles: draft.profiles,
                bookSituation: draft.bookSituation,
            });
            draft.profiles = Array.isArray(saved?.profiles) ? saved.profiles : draft.profiles;
            draft.assignments = Array.isArray(saved?.assignments) ? saved.assignments : draft.assignments;
            draft.updatedAt = saved?.updatedAt || new Date().toISOString();
            draft.updatedBy = saved?.updatedBy || null;
            draft.loadError = '';
            if (statusEl) {
                statusEl.style.color = 'var(--c-success)';
                statusEl.textContent = draft.updatedAt
                    ? `Saved ${formatUiDateTime(draft.updatedAt)}`
                    : 'Saved.';
            }
        } catch (err) {
            if (statusEl) {
                statusEl.style.color = 'var(--c-danger)';
                statusEl.textContent = err.message || 'Save failed';
            }
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save defaults';
            }
        }
    });
}

export async function launchConfigureAssignmentsPanel(deps) {
    const {
        renderMyDeskList: renderMyDeskListDep,
        setMyDeskWorkspaceMode: setMyDeskWorkspaceModeDep,
        returnToAdminDeskHome: returnToAdminDeskHomeDep,
    } = deps || {};
    if (typeof renderMyDeskListDep !== 'function'
        || typeof setMyDeskWorkspaceModeDep !== 'function'
        || typeof returnToAdminDeskHomeDep !== 'function') {
        throw new Error('launchConfigureAssignmentsPanel requires desk host deps');
    }
    _renderMyDeskList = renderMyDeskListDep;
    _setMyDeskWorkspaceMode = setMyDeskWorkspaceModeDep;
    _returnToAdminDeskHome = returnToAdminDeskHomeDep;
    const emptyEl = document.getElementById('my-desk-empty');
    const editorEl = document.getElementById('my-desk-editor');
    const comingSoon = document.getElementById('my-desk-coming-soon');
    if (!emptyEl) return;

    const draft = {
        profiles: getConfigureAssignmentsPacingDefaults(),
        assignments: [],
        bookSituation: 'started_one_company',
        availableBookSituations: [],
        previewPaceId: 'fast_10hr_4wk',
        updatedAt: null,
        updatedBy: null,
        loadError: '',
    };

    state.librarySelected = null;
    renderMyDeskList();
    if (comingSoon) comingSoon.classList.add('hidden');
    if (editorEl) editorEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    emptyEl.classList.add('book-audit-host');
    setMyDeskWorkspaceMode(true);
    emptyEl.innerHTML = `
        <div class="desk-workspace-shell desk-workspace-shell--configure-assignments">
            <header class="desk-workspace-head">
                <h3>Assignment Pacing Settings</h3>
                <button id="my-desk-configure-assignments-close" class="reader-close" type="button" aria-label="Close">✕</button>
            </header>
            <p class="desk-workspace-intro">Loading pacing settings…</p>
        </div>
    `;
    emptyEl.querySelector('#my-desk-configure-assignments-close')?.addEventListener('click', () => {
        returnToAdminDeskHome();
    });

    try {
        const gw = await api('GET', '/api/system/ghostwriter-settings').catch(() => null);
        if (Array.isArray(gw?.availableBookSituations) && gw.availableBookSituations.length) {
            draft.availableBookSituations = gw.availableBookSituations;
        }
        const loaded = await api('GET', `/api/system/assignment-pacing?situation=${encodeURIComponent(draft.bookSituation)}`);
        if (Array.isArray(loaded?.availableBookSituations) && loaded.availableBookSituations.length) {
            draft.availableBookSituations = loaded.availableBookSituations;
        }
        draft.profiles = Array.isArray(loaded?.profiles) && loaded.profiles.length
            ? loaded.profiles
            : getConfigureAssignmentsPacingDefaults();
        draft.assignments = Array.isArray(loaded?.assignments) ? loaded.assignments : [];
        draft.bookSituation = String(loaded?.bookSituation || draft.bookSituation);
        draft.updatedAt = loaded?.updatedAt || null;
        draft.updatedBy = loaded?.updatedBy || null;
        draft.previewPaceId = draft.profiles.find((p) => p.isDefault)?.id || draft.profiles[0]?.id || 'fast_10hr_4wk';
    } catch (err) {
        draft.loadError = err.message || 'Could not load pacing settings';
    }

    emptyEl.innerHTML = renderConfigureAssignmentsPanelMarkup(draft);
    bindConfigureAssignmentsPanel(draft);
}
