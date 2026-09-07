'use strict';

document.getElementById('year').textContent = new Date().getFullYear();
(function paintAppShellMeta() {
    const wmb = window.__WMB__ || {};
    const verEl = document.getElementById('app-version');
    if (verEl) {
        const ver = String(wmb.version || '').trim();
        const build = String(wmb.buildVersion || '').trim();
        if (ver || build) {
            // Package version alone looks "stuck" across local rebuilds; show build stamp too.
            if (ver && build && build !== ver) {
                verEl.textContent = `v${ver} · ${build}`;
                verEl.title = `App v${ver} · build ${build}`;
            } else {
                verEl.textContent = ver ? `v${ver}` : build;
                if (build) verEl.title = `Build ${build}`;
            }
        }
    }

    const dbEl = document.getElementById('app-database-env');
    if (!dbEl) return;
    const dbEnv = String(wmb.databaseEnv || '').trim().toLowerCase();
    if (dbEnv !== 'stage' && dbEnv !== 'prod') return;
    dbEl.textContent = dbEnv;
    dbEl.classList.remove('hidden');
    dbEl.classList.add(`logo-database-env--${dbEnv}`);
    dbEl.title = dbEnv === 'prod'
        ? 'Connected to production Firebase RTDB'
        : 'Connected to stage Firebase RTDB';
}());

const BASE = (window.__WMB__ && window.__WMB__.basePath) || '';

let _currentProjects = [];
let _recentProjects = [];
/** @type {{ total: number, active: number, hidden: number, inviteNotSent: number }|null} */
let _projectsSummary = null;
let _projectsPage = 1;
let _projectsTotalPages = 0;
let _projectsTotal = 0;
let _projectsPageSize = 50;
let _projectsSearchTimer = null;
/** When true, Results lists all books even with empty filters (View all). */
let _browseAllBooks = false;
let _eligibleAuthors = [];
/** @type {{ id: string, label: string }[]} Office work types enabled in Ghostwriter Settings */
let _officeBookTypes = [];
/** @type {Record<string, string>} */
let _officeBookTypeLabels = {};

// ── Auth (WMB admin token) ───────────────────────────────────────────────────
const WMB_TOKEN_KEY = 'wmb-admin-token';
const WMB_ADMIN_HMAC_KEY = 'wmb-admin-hmac-token';
const WMB_AUTHOR_PROJECT_KEY = 'wmb-author-project-id';
/** Local OTP-free Admin Desk session (mirrors author ?dev_project=). */
let _localDevProjectId = '';

function isLocalDevHost() {
    const host = String(window.location.hostname || '').trim().toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
}

function readDevProjectParam() {
    try {
        return String(new URL(window.location.href).searchParams.get('dev_project') || '').trim();
    } catch (_) {
        return '';
    }
}

function readRouteProjectParam() {
    try {
        return String(new URL(window.location.href).searchParams.get('project') || '').trim();
    } catch (_) {
        return '';
    }
}

async function resolveLocalDevProjectId() {
    const fromQuery = readDevProjectParam();
    if (fromQuery && fromQuery !== 'auto') return fromQuery;
    const fromProject = readRouteProjectParam();
    if (fromProject) return fromProject;
    const stored = String(localStorage.getItem(WMB_AUTHOR_PROJECT_KEY) || '').trim();
    if (stored) return stored;
    if (!isLocalDevHost()) return '';
    try {
        const res = await fetch(`${BASE}/api/auth/dev-entry`, { cache: 'no-store' });
        if (!res.ok) return '';
        const payload = await res.json().catch(() => ({}));
        return String(payload.defaultProjectId || '').trim();
    } catch (_) {
        return '';
    }
}

function getAdminHmacToken() {
    return sessionStorage.getItem(WMB_ADMIN_HMAC_KEY) || '';
}

function isLegacyAdminHmacToken(token) {
    const raw = String(token || '').trim();
    if (!raw) return false;
    const parts = raw.split('.');
    return parts.length === 2 && /^[a-f0-9]{64}$/i.test(parts[1] || '');
}

function authorProductRouteForBookType(bookType) {
    const bt = String(bookType || '').trim().toLowerCase();
    if (bt === 'pets_memoir' || bt === 'pet_memoir' || bt === 'pets') return '/pet';
    return '/book';
}

function customerPublicBaseUrlForBookType(bookType) {
    const route = authorProductRouteForBookType(bookType);
    const productId = route === '/pet' ? 'write_my_pet_book' : 'write_my_book';
    const products = window.__WMB__?.customerProducts;
    if (!Array.isArray(products)) return '';
    const row = products.find((entry) => entry?.id === productId);
    return String(row?.publicBaseUrl || '').trim().replace(/\/+$/, '');
}

function buildProjectPreviewUrl(project) {
    const bookType = project?.bookType || project?.workType;
    const route = authorProductRouteForBookType(bookType);
    const id = String(project?.id || '').trim();
    const publicBase = customerPublicBaseUrlForBookType(bookType);
    const path = `${route}/preview/${encodeURIComponent(id)}`;
    // Open the customer app (Pet/Career), not Admin's own origin.
    if (publicBase) return `${publicBase}${path}`;
    return `${BASE}${path}`;
}

async function getToken() {
    if (_localDevProjectId) return null;
    const user = window.firebase?.auth?.().currentUser;
    if (user) {
        // Firebase token refresh can hang when Auth is unreachable — bound it.
        return Promise.race([
            user.getIdToken(),
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Auth token timed out. Please sign in again.')), 15_000);
            }),
        ]);
    }
    return localStorage.getItem(WMB_TOKEN_KEY);
}
function signOut() {
    localStorage.removeItem(WMB_TOKEN_KEY);
    _localDevProjectId = '';
    if (window.firebase?.auth) firebase.auth().signOut().catch(() => {}).finally(() => redirectToAdminLogin());
    else redirectToAdminLogin();
}

// ── API helper ──────────────────────────────────────────────────────────────
async function api(method, path, body, _retried) {
    const headers = { 'Content-Type': 'application/json' };
    if (_localDevProjectId) {
        headers['X-Dev-Project-Id'] = _localDevProjectId;
        headers['X-Author-Project-Id'] = _localDevProjectId;
    } else {
        headers.Authorization = `Bearer ${await getToken()}`;
    }
    const upper = String(method || 'GET').toUpperCase();
    const timeoutMs = upper === 'DELETE' ? 45_000 : 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
        res = await fetch(`${BASE}/api${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
    } catch (err) {
        if (err?.name === 'AbortError') {
            throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s. Please try again.`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
    // Local OTP-free Admin Desk must not bounce to login when a secondary
    // endpoint rejects — keep the desk session and surface the error.
    if ((res.status === 401 || res.status === 403) && !_localDevProjectId) {
        signOut();
        throw new Error(res.status === 401
            ? 'Session expired. Please sign in again.'
            : 'You do not have permission for this action.');
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
    }
    // Some proxies return empty bodies on DELETE; treat empty success as {}.
    const text = await res.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (_) {
        return { raw: text };
    }
}

function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadEligibleAuthors() {
    const payload = await api('GET', '/auth/users');
    _eligibleAuthors = (payload?.users || []).filter((user) => (
        user?.uid && (user.role === 'author' || user.role === 'admin' || user.role === 'system')
    ));
}

async function refreshEligibleAuthors() {
    await loadEligibleAuthors();
    populateAuthorSelect(
        document.getElementById('inp-author-uid'),
        document.getElementById('inp-author-uid')?.value || '',
    );
    const editSelect = document.getElementById('edit-author-uid');
    if (editSelect) {
        populateAuthorSelect(editSelect, editSelect.value);
    }
}

function populateAuthorSelect(select, selectedUid = '') {
    if (!select) return;
    const selected = String(selectedUid || '');
    select.innerHTML = '<option value="">Select an explicit author account</option>';
    _eligibleAuthors.forEach((user) => {
        const option = document.createElement('option');
        option.value = user.uid;
        option.textContent = `${user.displayName || user.email || user.uid} (${user.role})`;
        option.selected = user.uid === selected;
        select.appendChild(option);
    });
}

function relativeTime(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(diff) || diff < 0) return '—';
    const m = Math.floor(diff / 60000);
    if (m < 2) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

let _relativeTimeTimer = null;
let _projectPollTimer = null;

function refreshRelativeTimeElements() {
    document.querySelectorAll('[data-relative-time]').forEach(el => {
        const iso = el.getAttribute('data-relative-time');
        if (iso) el.textContent = relativeTime(iso);
    });
}

async function pollProjectUpdates() {
    if (document.visibilityState !== 'visible') return;
    try {
        if (findFiltersActive()) await loadProjectResults({ silent: true });
        else await loadRecentProjects({ silent: true });
    } catch (_) {
        // Best-effort background refresh.
    }
}

function startProjectListRefreshTimers() {
    if (_relativeTimeTimer) clearInterval(_relativeTimeTimer);
    if (_projectPollTimer) clearInterval(_projectPollTimer);
    _relativeTimeTimer = setInterval(refreshRelativeTimeElements, 60 * 1000);
    _projectPollTimer = setInterval(pollProjectUpdates, 2 * 60 * 1000);
}

/** Legacy labels for older projects whose type is no longer in office settings. */
const LEGACY_WORK_TYPE_LABELS = {
    memoir: 'Career Memoir',
    pets_memoir: "Pet's Memoir",
    life_story: 'Life Story',
    novel_fiction: 'Novel Fiction',
    novel: 'Novel Fiction',
    leadership: 'Leadership',
    how_to: 'How-To',
    narrative_nonfiction: 'Narrative Nonfiction',
    golf_lesson_notes: 'Golf Lesson Notes',
    piano_lesson_notes: 'Piano Lesson Notes',
    webpage: 'Web Page',
    school_assignment: 'School Assignment',
};

function workTypeLabel(t) {
    const key = String(t || '').trim();
    if (!key) return 'Book';
    return _officeBookTypeLabels[key] || LEGACY_WORK_TYPE_LABELS[key] || key;
}

/** @deprecated Use workTypeLabel — bookType alias for API compat */
function bookTypeLabel(t) {
    return workTypeLabel(t);
}

/**
 * Load book types from Admin Desk Ghostwriter Settings (office work types).
 * Create form offers enabled types only; labels come from the office catalog.
 */
async function loadOfficeBookTypes() {
    const data = await api('GET', '/system/ghostwriter-settings').catch(() => null);
    const available = Array.isArray(data?.availableBookTypes) ? data.availableBookTypes : [];
    const enabledIds = Array.isArray(data?.enabledBookTypes) && data.enabledBookTypes.length
        ? data.enabledBookTypes.map((id) => String(id || '').trim()).filter(Boolean)
        : ['memoir'];

    _officeBookTypeLabels = {};
    available.forEach((opt) => {
        const id = String(opt?.id || '').trim();
        if (!id) return;
        _officeBookTypeLabels[id] = String(opt.label || id).trim() || id;
    });
    // Ensure enabled ids have a label even if catalog was empty.
    enabledIds.forEach((id) => {
        if (!_officeBookTypeLabels[id]) {
            _officeBookTypeLabels[id] = LEGACY_WORK_TYPE_LABELS[id] || id;
        }
    });

    _officeBookTypes = enabledIds.map((id) => ({
        id,
        label: _officeBookTypeLabels[id] || id,
    }));
    if (!_officeBookTypes.length) {
        _officeBookTypes = [{ id: 'memoir', label: _officeBookTypeLabels.memoir || 'Career Memoir' }];
    }
    populateBookTypeSelect();
}

function populateBookTypeSelect() {
    const sel = document.getElementById('inp-booktype');
    if (!sel) return;
    const prev = String(sel.value || '').trim();
    const opts = _officeBookTypes.length
        ? _officeBookTypes
        : [{ id: 'memoir', label: 'Career Memoir' }];
    sel.innerHTML = opts.map((o) => (
        `<option value="${esc(o.id)}">${esc(o.label)}</option>`
    )).join('');
    sel.removeAttribute('aria-busy');
    const keep = opts.some((o) => o.id === prev) ? prev : opts[0].id;
    sel.value = keep;
}

const STORY_SITUATION_SHORT_LABELS = {
    started_one_company: 'Started one company',
    started_multiple_companies: 'Multiple startups',
    joined_turnaround: 'Join / turnaround',
    key_contributor_success: 'Key contributor',
    professional_non_business: 'Non-business career',
};

function storySituationLabel(id) {
    const key = String(id || '').trim();
    if (!key) return '—';
    return STORY_SITUATION_SHORT_LABELS[key] || key;
}

/** @deprecated Use storySituationLabel */
function bookSituationLabel(id) {
    return storySituationLabel(id);
}

// ── Project list (Recent + Find / paginated search) ───────────────────────────

function findCachedProject(id) {
    return _currentProjects.find((p) => p.id === id)
        || _recentProjects.find((p) => p.id === id)
        || null;
}

function projectsQueryPath(params) {
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
        if (v === undefined || v === null || v === '') return;
        qs.set(k, String(v));
    });
    const s = qs.toString();
    return s ? `/projects?${s}` : '/projects';
}

function findFiltersActive(filters) {
    const f = filters || readFindFilters();
    return Boolean(_browseAllBooks || f.q);
}

function setProjectsBrowseMode(searching) {
    const recent = document.getElementById('projects-recent-section');
    const results = document.getElementById('projects-results-section');
    if (recent) recent.hidden = !!searching;
    if (results) results.hidden = !searching;
}

function renderProjectCards(projects) {
    const cards = projects.map((p) => {
        const authorTitle = [p.authorName, p.authorEmail].filter(Boolean).join(' · ');
        const typeLabel = workTypeLabel(p.workType || p.bookType);
        const statusLabel = p.status || 'active';
        const invitePending = !p.authorLinkSentAt;
        const titleHtml = p.workingTitle
            ? esc(p.workingTitle)
            : '<span class="bp-card-title-empty">Untitled</span>';
        const metaParts = [
            esc(typeLabel),
            esc(statusLabel),
            `<span data-project-updated-at="${esc(p.id)}" data-relative-time="${esc(p.updatedAt || '')}">${relativeTime(p.updatedAt)}</span>`,
        ];
        if (invitePending) metaParts.push('<span class="bp-card-flag">no invite</span>');
        return `
            <article class="bp-card" data-project-id="${esc(p.id)}">
                <div class="bp-card-main">
                    <div class="bp-card-line1" title="${esc(authorTitle)}">
                        <span class="bp-card-author">${esc(p.authorName || '—')}</span>
                        <span class="bp-card-sep" aria-hidden="true">·</span>
                        <span class="bp-card-title">${titleHtml}</span>
                    </div>
                    <div class="bp-card-line2">
                        <span class="bp-card-meta">${metaParts.join(' · ')}</span>
                    </div>
                </div>
                <div class="bp-card-actions">
                    <button class="btn-tbl btn-tbl-primary" type="button" data-action="preview" data-id="${esc(p.id)}">Open</button>
                    <button class="btn-tbl" type="button" data-action="send-link" data-id="${esc(p.id)}" data-email="${esc(p.authorEmail || '')}" title="Send Invite">Invite</button>
                    <button class="btn-tbl" type="button" data-action="edit" data-id="${esc(p.id)}">Edit</button>
                </div>
            </article>`;
    }).join('');
    return `<div class="bp-card-list">${cards}</div>`;
}

function updateProjectsSummary(summary) {
    _projectsSummary = summary || null;
    const el = document.getElementById('projects-summary');
    if (!el) return;
    if (!summary) {
        el.innerHTML = '';
        return;
    }
    el.innerHTML = `
        <span class="projects-stat"><b>${esc(String(summary.total ?? 0))}</b> books</span>
        <span class="projects-stat"><b>${esc(String(summary.active ?? 0))}</b> active</span>
        <span class="projects-stat"><b>${esc(String(summary.inviteNotSent ?? 0))}</b> no invite</span>
        ${summary.hidden ? `<span class="projects-stat"><b>${esc(String(summary.hidden))}</b> hidden</span>` : ''}`;

    const unhideBtn = document.getElementById('btn-unhide-all');
    if (!unhideBtn) return;
    if (summary.hidden > 0) {
        unhideBtn.textContent = `Unhide (${summary.hidden})`;
        unhideBtn.style.display = '';
        unhideBtn.onclick = async () => {
            unhideBtn.disabled = true;
            unhideBtn.textContent = 'Unhiding…';
            try {
                let page = 1;
                let totalPages = 1;
                const hiddenIds = [];
                while (page <= totalPages) {
                    const data = await api('GET', projectsQueryPath({
                        hidden: 'only',
                        page,
                        limit: 100,
                    }));
                    const items = Array.isArray(data?.items) ? data.items : [];
                    items.forEach((p) => { if (p?.id) hiddenIds.push(p.id); });
                    totalPages = Number(data?.totalPages) || 1;
                    page += 1;
                    if (!items.length) break;
                }
                await Promise.all(hiddenIds.map((id) => api('PUT', `/projects/${id}`, { hidden: false })));
            } catch (_) { /* best-effort */ }
            unhideBtn.disabled = false;
            loadProjects();
        };
    } else {
        unhideBtn.style.display = 'none';
    }
}

function updateProjectsPagination() {
    const el = document.getElementById('projects-pagination');
    if (!el) return;
    if (_projectsTotalPages <= 1) {
        el.hidden = true;
        el.innerHTML = '';
        return;
    }
    el.hidden = false;
    el.innerHTML = `
        <button type="button" class="btn btn-ghost btn-sm" id="projects-page-prev" ${_projectsPage <= 1 ? 'disabled' : ''}>Previous</button>
        <span class="projects-page-indicator">Page ${_projectsPage} of ${_projectsTotalPages}</span>
        <button type="button" class="btn btn-ghost btn-sm" id="projects-page-next" ${_projectsPage >= _projectsTotalPages ? 'disabled' : ''}>Next</button>`;
    document.getElementById('projects-page-prev')?.addEventListener('click', () => {
        if (_projectsPage > 1) {
            _projectsPage -= 1;
            loadProjectResults();
        }
    });
    document.getElementById('projects-page-next')?.addEventListener('click', () => {
        if (_projectsPage < _projectsTotalPages) {
            _projectsPage += 1;
            loadProjectResults();
        }
    });
}

function updateProjectsResultMeta() {
    const el = document.getElementById('projects-result-meta');
    if (!el) return;
    if (_projectsTotal === 0) {
        el.textContent = 'No matches';
        return;
    }
    const start = ((_projectsPage - 1) * _projectsPageSize) + 1;
    const end = Math.min(_projectsPage * _projectsPageSize, _projectsTotal);
    const filters = readFindFilters();
    const browsingAll = _browseAllBooks && !filters.q;
    el.textContent = browsingAll
        ? `${_projectsTotal} books`
        : `${start}–${end} of ${_projectsTotal}`;
}

function readFindFilters() {
    const q = String(document.getElementById('projects-search-q')?.value || '').trim();
    return { q };
}

async function loadRecentProjects({ silent = false } = {}) {
    const el = document.getElementById('projects-recent-list');
    if (!el) return;
    if (!silent) el.innerHTML = `<div class="loading-block">Loading…</div>`;
    try {
        const data = await api('GET', projectsQueryPath({ limit: 5, page: 1 }));
        const items = Array.isArray(data?.items) ? data.items : [];
        _recentProjects = items;
        if (data?.summary) updateProjectsSummary(data.summary);
        if (items.length === 0) {
            const hiddenCount = Number(data?.summary?.hidden) || 0;
            el.innerHTML = `<div class="empty-state projects-empty-compact">
                <p>${hiddenCount > 0
                    ? 'All books are hidden. Unhide them, or tap <strong>+ New</strong>.'
                    : 'No books yet — tap <strong>+ New</strong>.'}</p>
            </div>`;
            return;
        }
        el.innerHTML = renderProjectCards(items);
        startProjectListRefreshTimers();
    } catch (err) {
        if (!silent) {
            el.innerHTML = `<div class="empty-state projects-empty-compact"><p style="color:var(--color-danger)">${esc(err.message)}</p></div>`;
        }
    }
}

async function loadProjectResults({ silent = false } = {}) {
    const list = document.getElementById('project-list');
    if (!list) return;
    const filters = readFindFilters();
    const searching = findFiltersActive(filters);
    setProjectsBrowseMode(searching);

    if (!searching) {
        _browseAllBooks = false;
        _currentProjects = [];
        _projectsTotal = 0;
        _projectsTotalPages = 0;
        list.innerHTML = '';
        updateProjectsResultMeta();
        updateProjectsPagination();
        // Keep Recent + summary warm when clearing search.
        if (!silent) await loadRecentProjects({ silent: true });
        return;
    }

    if (!silent) list.innerHTML = `<div class="loading-block">Loading…</div>`;
    try {
        const data = await api('GET', projectsQueryPath({
            q: filters.q,
            page: _projectsPage,
            limit: _projectsPageSize,
        }));
        const items = Array.isArray(data?.items) ? data.items : [];
        _currentProjects = items;
        _projectsTotal = Number(data?.total) || 0;
        _projectsPage = Number(data?.page) || 1;
        _projectsPageSize = Number(data?.pageSize) || _projectsPageSize;
        _projectsTotalPages = Number(data?.totalPages) || 0;
        if (data?.summary) updateProjectsSummary(data.summary);
        updateProjectsResultMeta();
        updateProjectsPagination();

        if (items.length === 0) {
            list.innerHTML = `<div class="empty-state projects-empty-compact">
                <p>No matching books.</p>
            </div>`;
            return;
        }
        list.innerHTML = renderProjectCards(items);
        startProjectListRefreshTimers();
    } catch (err) {
        if (!silent) {
            list.innerHTML = `<div class="empty-state projects-empty-compact"><p style="color:var(--color-danger)">${esc(err.message)}</p></div>`;
        }
    }
}

async function loadProjects() {
    _projectsPage = 1;
    const searching = findFiltersActive();
    setProjectsBrowseMode(searching);
    if (searching) {
        await loadProjectResults();
    } else {
        await loadRecentProjects();
    }
}

function bindProjectsFindControls() {
    const search = document.getElementById('projects-search-q');
    const onFilterChange = () => {
        const f = readFindFilters();
        if (f.q) _browseAllBooks = false;
        _projectsPage = 1;
        loadProjectResults();
    };
    search?.addEventListener('input', () => {
        if (_projectsSearchTimer) clearTimeout(_projectsSearchTimer);
        _projectsSearchTimer = setTimeout(onFilterChange, 250);
    });

    document.getElementById('btn-view-all-books')?.addEventListener('click', () => {
        _browseAllBooks = true;
        _projectsPage = 1;
        loadProjectResults();
    });
    document.getElementById('btn-show-recent-books')?.addEventListener('click', () => {
        _browseAllBooks = false;
        const q = document.getElementById('projects-search-q');
        if (q) q.value = '';
        _projectsPage = 1;
        loadProjectResults();
    });
}

// ── New project form ──────────────────────────────────────────────────────────
const btnNew = document.getElementById('btn-new-project');
const formEl = document.getElementById('new-project-form');
const btnCancel = document.getElementById('btn-cancel-new');
const btnSubmit = document.getElementById('btn-create-submit');
const errEl = document.getElementById('create-error');
const btnSignout = document.getElementById('btn-signout');

btnSignout?.addEventListener('click', () => signOut());

btnNew.addEventListener('click', async () => {
    try {
        await Promise.all([
            refreshEligibleAuthors(),
            loadOfficeBookTypes(),
        ]);
    } catch (err) {
        showError(err.message || 'Could not load authorized authors.');
        return;
    }
    formEl.style.display = 'block';
    btnNew.style.display = 'none';
    document.getElementById('inp-name').focus();
});

btnCancel.addEventListener('click', () => {
    formEl.style.display = 'none';
    btnNew.style.display = '';
    errEl.style.display = 'none';
});

btnSubmit.addEventListener('click', async () => {
    const authorName = document.getElementById('inp-name').value.trim();
    const workingTitle = document.getElementById('inp-title').value.trim();
    const bookType = document.getElementById('inp-booktype').value;
    const targetAudience = document.getElementById('inp-audience').value.trim();
    const authorUid = document.getElementById('inp-author-uid').value;

    errEl.style.display = 'none';
    if (!authorName) { showError('Author name is required.'); return; }
    if (!authorUid) { showError('Select an authorized author account.'); return; }
    if (!bookType) { showError('Select a book type.'); return; }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Creating…';
    try {
        const project = await api('POST', '/projects', { authorName, workingTitle, bookType, targetAudience, authorUid });
        // Reset form immediately before navigation so back-button restore finds it clean
        resetNewProjectForm();
        window.location.href = buildProjectPreviewUrl(project);
    } catch (err) {
        showError(err.message);
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Create Project';
    }
});

// Reset form to clean state (hides it, clears fields, re-enables button)
function resetNewProjectForm() {
    formEl.style.display = 'none';
    btnNew.style.display = '';
    errEl.style.display = 'none';
    document.getElementById('inp-name').value = '';
    document.getElementById('inp-title').value = '';
    document.getElementById('inp-audience').value = '';
    document.getElementById('inp-author-uid').value = '';
    populateBookTypeSelect();
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Create Project';
}

// On back-button restore the browser replays cached page state — reset the form
// so a stale visible form with a filled name can't be accidentally re-submitted.
window.addEventListener('pageshow', (e) => {
    if (e.persisted) resetNewProjectForm();
});

function showError(msg) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
}
// ── Edit / Delete modal ───────────────────────────────────────────────────────
function resetEditModalButtons() {
    const buttons = [
        ['edit-modal-delete', 'Delete Project'],
        ['edit-modal-save', 'Save'],
        ['edit-modal-duplicate', 'Duplicate'],
        ['edit-send-link', '✉ Send Invite'],
    ];
    for (const [id, label] of buttons) {
        const btn = document.getElementById(id);
        if (!btn) continue;
        btn.disabled = false;
        btn.textContent = label;
    }
    const delBtn = document.getElementById('edit-modal-delete');
    if (delBtn) delete delBtn.dataset.confirm;
}

function openEditModal(project) {
    let modal = document.getElementById('edit-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'edit-modal';
        modal.className = 'edit-modal-overlay';
        modal.innerHTML = `
            <div class="edit-modal-box" role="dialog" aria-modal="true" aria-labelledby="edit-modal-title">
                <h3 id="edit-modal-title" style="margin-bottom:1.25rem;font-size:1.1rem">Book details</h3>
                <dl id="edit-modal-meta" class="edit-modal-meta"></dl>
                <div class="field" style="margin-bottom:.85rem">
                    <label for="edit-author">Author Name</label>
                    <input type="text" id="edit-author" />
                </div>
                <div class="field" style="margin-bottom:.85rem">
                    <label for="edit-title">Working Title</label>
                    <input type="text" id="edit-title" />
                </div>
                <div class="field" style="margin-bottom:.85rem">
                    <label for="edit-author-uid" style="display:flex;align-items:center;gap:.5rem">
                        Authorized Author
                    </label>
                    <div class="hstack" style="gap:.5rem">
                        <select id="edit-author-uid" style="flex:1"></select>
                        <button class="btn btn-ghost" id="edit-send-link" style="font-size:.8rem;padding:.4rem .85rem;white-space:nowrap" title="Send the author their sign-in invite">✉ Send Invite</button>
                    </div>
                    <p id="edit-send-link-status" style="font-size:.78rem;margin-top:.3rem;min-height:1.1em"></p>
                </div>
                <div class="field" style="margin-bottom:1.25rem">
                    <label class="hstack" style="gap:.55rem;cursor:pointer;width:fit-content">
                        <input type="checkbox" id="edit-hidden" style="width:1rem;height:1rem;accent-color:var(--color-primary)" />
                        <span style="font-size:.9rem">Hide this project from the list</span>
                    </label>
                </div>
                <div class="hstack" style="gap:.65rem">
                    <button class="btn btn-danger" id="edit-modal-delete">Delete Project</button>
                    <div style="flex:1"></div>
                    <button class="btn btn-ghost" id="edit-modal-duplicate">Duplicate</button>
                    <button class="btn btn-ghost" id="edit-modal-cancel">Cancel</button>
                    <button class="btn btn-primary" id="edit-modal-save">Save</button>
                </div>
                <p id="edit-modal-error" class="error-text" style="display:none;margin-top:.75rem"></p>
            </div>`;
        document.body.appendChild(modal);
    }

    const titleEl = document.getElementById('edit-modal-title');
    if (titleEl) titleEl.textContent = 'Book details';
    document.getElementById('edit-author').value = project.authorName || '';
    document.getElementById('edit-title').value = project.workingTitle || '';
    populateAuthorSelect(document.getElementById('edit-author-uid'), project.authorUid);
    document.getElementById('edit-send-link-status').textContent = '';
    document.getElementById('edit-hidden').checked = !!project.hidden;
    document.getElementById('edit-modal-error').style.display = 'none';
    let metaEl = document.getElementById('edit-modal-meta');
    if (!metaEl) {
        metaEl = document.createElement('dl');
        metaEl.id = 'edit-modal-meta';
        metaEl.className = 'edit-modal-meta';
        titleEl?.insertAdjacentElement('afterend', metaEl);
    }
    if (metaEl) {
        const inviteLabel = project.authorLinkSentAt
            ? `Sent ${relativeTime(project.authorLinkSentAt)}`
            : 'Not sent';
        metaEl.innerHTML = `
            <div><dt>Email</dt><dd>${project.authorEmail ? esc(project.authorEmail) : '<em>none</em>'}</dd></div>
            <div><dt>Type</dt><dd>${esc(workTypeLabel(project.workType || project.bookType))}</dd></div>
            <div><dt>Situation</dt><dd>${esc(storySituationLabel(project.storySituation || project.bookSituation))}</dd></div>
            <div><dt>Audience</dt><dd>${project.targetAudience ? esc(project.targetAudience) : '—'}</dd></div>
            <div><dt>Invite</dt><dd id="link-sent-${esc(project.id)}"${project.authorLinkSentAt ? ` data-relative-time="${esc(project.authorLinkSentAt)}"` : ''}>${esc(inviteLabel)}</dd></div>
            <div><dt>Updated</dt><dd data-relative-time="${esc(project.updatedAt || '')}">${esc(relativeTime(project.updatedAt))}</dd></div>
            <div><dt>Id</dt><dd style="font-family:monospace;font-size:.75rem">${esc(project.id)}</dd></div>`;
    }
    resetEditModalButtons();
    modal.style.display = 'flex';
    document.getElementById('edit-author').focus();

    // close on overlay click
    modal.onclick = e => { if (e.target === modal) closeEditModal(); };

    document.getElementById('edit-modal-cancel').onclick = closeEditModal;

    document.getElementById('edit-modal-duplicate').onclick = async () => {
        const dupBtn = document.getElementById('edit-modal-duplicate');
        dupBtn.disabled = true; dupBtn.textContent = 'Duplicating…';
        try {
            await api('POST', `/projects/${project.id}/duplicate`);
            closeEditModal();
            loadProjects();
        } catch (err) {
            const errP = document.getElementById('edit-modal-error');
            errP.textContent = err.message; errP.style.display = 'block';
            dupBtn.disabled = false; dupBtn.textContent = 'Duplicate';
        }
    };

    // Send login invite email to the author (same email flow as /book/login)
    document.getElementById('edit-send-link').onclick = async () => {
        const selectedUid = document.getElementById('edit-author-uid').value;
        const selectedAuthor = _eligibleAuthors.find((author) => author.uid === selectedUid);
        const email = selectedAuthor?.email || '';
        const statusEl = document.getElementById('edit-send-link-status');
        const btn = document.getElementById('edit-send-link');
        if (!email) { statusEl.style.color = 'var(--color-danger)'; statusEl.textContent = 'Select an authorized author first.'; return; }
        btn.disabled = true; btn.textContent = 'Sending…';
        statusEl.style.color = 'var(--color-muted)'; statusEl.textContent = '';
        try {
            await api('PUT', `/projects/${project.id}`, { authorUid: selectedUid });
            project.authorUid = selectedUid;
            project.authorEmail = email;
            // Then send the same verification email used by the login screen
            const res = await fetch(`${BASE}/api/auth/email/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await getToken()}` },
                body: JSON.stringify({ email, returnPath: '/book/join' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            statusEl.style.color = 'var(--color-success)'; statusEl.textContent = `✓ Invite sent to ${email}`;
        } catch (err) {
            statusEl.style.color = 'var(--color-danger)'; statusEl.textContent = err.message;
        } finally {
            btn.disabled = false; btn.textContent = '✉ Send Invite';
        }
    };

    document.getElementById('edit-modal-save').onclick = async () => {
        const authorName = document.getElementById('edit-author').value.trim();
        const workingTitle = document.getElementById('edit-title').value.trim();
        const authorUid = document.getElementById('edit-author-uid').value;
        const hidden = document.getElementById('edit-hidden').checked;
        const errP = document.getElementById('edit-modal-error');
        errP.style.display = 'none';
        if (!authorName) { errP.textContent = 'Author name is required.'; errP.style.display = 'block'; return; }
        const saveBtn = document.getElementById('edit-modal-save');
        saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
        try {
            if (!authorUid) throw new Error('Select an authorized author account.');
            await api('PUT', `/projects/${project.id}`, { authorName, workingTitle, authorUid, hidden });
            closeEditModal();
            loadProjects();
        } catch (err) {
            errP.textContent = err.message; errP.style.display = 'block';
            saveBtn.disabled = false; saveBtn.textContent = 'Save';
        }
    };

    document.getElementById('edit-modal-delete').onclick = async () => {
        const delBtn = document.getElementById('edit-modal-delete');
        if (delBtn.dataset.confirm !== '1') {
            delBtn.textContent = 'Confirm delete?';
            delBtn.dataset.confirm = '1';
            return;
        }
        delBtn.disabled = true; delBtn.textContent = 'Deleting…';
        const errP = document.getElementById('edit-modal-error');
        if (errP) errP.style.display = 'none';
        try {
            await api('DELETE', `/projects/${project.id}`);
            closeEditModal();
            loadProjects();
        } catch (err) {
            if (errP) {
                errP.textContent = err.message || 'Failed to delete project.';
                errP.style.display = 'block';
            }
        } finally {
            const modal = document.getElementById('edit-modal');
            if (modal && modal.style.display !== 'none' && delBtn.isConnected) {
                delBtn.disabled = false;
                delBtn.textContent = 'Confirm delete?';
                delBtn.dataset.confirm = '1';
            }
        }
    };
}

function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.style.display = 'none';
        resetEditModalButtons();
    }
}

// ── Project list event delegation (Recent + Find results) ────────────────────
document.getElementById('projects-workspace')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    const id = btn.dataset.id;
    const project = findCachedProject(id);
    if (!project) return;
    if (btn.dataset.action === 'preview') {
        window.location.href = buildProjectPreviewUrl(project);
    } else if (btn.dataset.action === 'send-link') {
        const email = project.authorEmail;
        if (!email) {
            await window.WmbDialogs.alert('Add the author email first in Book details.', { title: 'Author Email Required' });
            openEditModal(project);
            return;
        }
        btn.disabled = true;
        btn.textContent = 'Sending…';
        try {
            const res = await fetch(`${BASE}/api/auth/email/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await getToken()}` },
                body: JSON.stringify({ email, returnPath: '/book/join' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            const now = new Date().toISOString();
            await api('PUT', `/projects/${id}`, { authorLinkSentAt: now });
            project.authorLinkSentAt = now;
            const other = findCachedProject(id);
            if (other) other.authorLinkSentAt = now;
            btn.textContent = 'Sent ✓';
            document.querySelectorAll(`#link-sent-${CSS.escape(id)}`).forEach((sentEl) => {
                sentEl.setAttribute('data-relative-time', now);
                sentEl.textContent = 'Sent just now';
            });
        } catch (err) {
            btn.textContent = 'Invite';
            await window.WmbDialogs.alert('Failed to send invite: ' + err.message, { title: 'Send Invite Failed' });
        } finally {
            btn.disabled = false;
        }
    } else if (btn.dataset.action === 'edit') {
        openEditModal(project);
    }
});

// ── Admin topbar menu (matches author book chrome) ───────────────────────
(function () {
    const btn = document.getElementById('a-menu-toggle') || document.getElementById('hamburger-btn');
    const menu = document.getElementById('a-menu-list') || document.getElementById('hamburger-menu');
    const signOutItem = document.getElementById('a-menu-item-signout') || document.getElementById('hmenu-signout');
    if (!btn || !menu) return;

    const usesAuthorMenu = menu.id === 'a-menu-list';

    function openMenu() {
        if (usesAuthorMenu) menu.classList.remove('hidden');
        else menu.classList.add('open');
        menu.setAttribute('aria-hidden', 'false');
        btn.setAttribute('aria-expanded', 'true');
    }
    function closeMenu() {
        if (usesAuthorMenu) menu.classList.add('hidden');
        else menu.classList.remove('open');
        menu.setAttribute('aria-hidden', 'true');
        btn.setAttribute('aria-expanded', 'false');
    }
    function toggle() {
        const isOpen = usesAuthorMenu ? !menu.classList.contains('hidden') : menu.classList.contains('open');
        isOpen ? closeMenu() : openMenu();
    }

    btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

    signOutItem?.addEventListener('click', () => {
        closeMenu();
        window.WmbBuildVersionWatch?.checkOnNavigation?.();
        signOut();
    });

    closeMenu();
})();

// ── Users management modal ────────────────────────────────────────────────────
function openUsersModal() {
    let overlay = document.getElementById('users-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id        = 'users-modal';
        overlay.className = 'edit-modal-overlay';
        overlay.innerHTML = `
            <div class="edit-modal-box" role="dialog" aria-modal="true" style="max-width:560px;width:95%">
                <h3 style="margin-bottom:1.5rem;font-size:1.1rem"><i class="fa fa-users" style="margin-right:.5rem"></i>Manage Users</h3>

                <!-- User list -->
                <div id="um-list" style="margin-bottom:1.5rem;max-height:220px;overflow-y:auto"></div>

                <!-- Actions -->
                <div style="border-top:1px solid var(--color-border);padding-top:1.25rem">
                    <p style="font-size:.85rem;color:var(--color-muted);margin-bottom:1rem">Add a new user:</p>
                    <div style="display:flex;gap:.5rem;margin-bottom:.5rem;flex-wrap:wrap">
                        <input type="email" id="um-email" placeholder="Email address" autocomplete="email" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false" style="flex:1;min-width:160px;padding:.55rem .8rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface2);color:var(--color-text);font-size:.9rem" />
                        <input type="text" id="um-name" placeholder="Name (optional)" style="flex:1;min-width:140px;padding:.55rem .8rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface2);color:var(--color-text);font-size:.9rem" />
                    </div>
                    <div style="display:flex;gap:.5rem;margin-bottom:.75rem;flex-wrap:wrap">
                        <button class="btn btn-primary" id="um-btn-invite" style="flex:1">Send Invite Email</button>
                        <button class="btn btn-ghost" id="um-btn-create" style="flex:1">Create (No Email)</button>
                    </div>
                    <p id="um-msg" style="font-size:.85rem;min-height:1.2em;margin:0"></p>
                </div>

                <div style="margin-top:1rem;text-align:right">
                    <button class="btn btn-ghost" id="um-close">Close</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
        document.getElementById('um-close').addEventListener('click', () => { overlay.style.display = 'none'; });
    }

    overlay.style.display = 'flex';
    loadUsersList();

    async function loadUsersList() {
        const listEl = document.getElementById('um-list');
        listEl.innerHTML = '<p style="color:var(--color-muted);font-size:.85rem">Loading…</p>';
        try {
            const data = await api('GET', '/auth/users');
            if (!data || !data.users) { listEl.innerHTML = '<p style="color:#ff6b6b;font-size:.85rem">Failed to load users.</p>'; return; }
            if (!data.users.length) { listEl.innerHTML = '<p style="color:var(--color-muted);font-size:.85rem">No users yet.</p>'; return; }
            listEl.innerHTML = data.users.map(u => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--color-border);gap:.5rem">
                    <div style="min-width:0">
                        <div style="font-size:.9rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.displayName || u.email)}</div>
                        ${u.displayName ? `<div style="font-size:.78rem;color:var(--color-muted)">${esc(u.email)}</div>` : ''}
                        <div style="font-size:.75rem;color:var(--color-muted)">${u.emailVerified ? '<span style="color:#4caf50">✓ Verified</span>' : '<span style="color:#f5a623">⚠ Unverified</span>'} · Joined ${new Date(u.createdAt).toLocaleDateString()}</div>
                    </div>
                    <button class="btn btn-ghost" data-uid="${esc(u.uid)}" data-email="${esc(u.email || '')}" style="font-size:.78rem;padding:.3rem .7rem;white-space:nowrap;flex-shrink:0">Remove</button>
                </div>`).join('');
            listEl.querySelectorAll('[data-uid]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const { uid, email } = btn.dataset;
                    const ok = await window.WmbDialogs.confirm(
                        `Remove ${email || uid}? This cannot be undone.`,
                        { title: 'Remove User?' }
                    );
                    if (!ok) return;
                    btn.disabled = true;
                    try {
                        await api('DELETE', `/auth/users/${uid}`);
                        await loadUsersList();
                        await refreshEligibleAuthors();
                    } catch (err) {
                        setMsg('Failed to remove user: ' + (err.message || ''), true);
                        btn.disabled = false;
                    }
                });
            });
        } catch (err) {
            listEl.innerHTML = `<p style="color:#ff6b6b;font-size:.85rem">Error: ${esc(err.message)}</p>`;
        }
    }

    function setMsg(text, isError) {
        const el = document.getElementById('um-msg');
        el.textContent = text;
        el.style.color = isError ? '#ff6b6b' : '#4caf50';
    }

    async function userAction(endpoint) {
        const email = document.getElementById('um-email').value.trim();
        const name  = document.getElementById('um-name').value.trim();
        if (!email) { setMsg('Please enter an email address.', true); return; }
        setMsg('');
        document.getElementById('um-btn-invite').disabled = true;
        document.getElementById('um-btn-create').disabled = true;
        try {
            await api('POST', `/auth/${endpoint}`, { email, displayName: name || undefined });
            document.getElementById('um-email').value = '';
            document.getElementById('um-name').value  = '';
            setMsg(endpoint === 'invite' ? `Invite sent to ${email}` : `User ${email} created`, false);
            await loadUsersList();
            await refreshEligibleAuthors();
        } catch (err) {
            setMsg(err.message || 'Request failed', true);
        }
        document.getElementById('um-btn-invite').disabled = false;
        document.getElementById('um-btn-create').disabled = false;
    }

    document.getElementById('um-btn-invite').onclick = () => userAction('invite');
    document.getElementById('um-btn-create').onclick = () => userAction('create-user');
}

/** Keep in sync with platform/client/nav-return.js */
function resolveAdminLoginReturnPath(raw) {
    const decoded = decodeURIComponent(String(raw || '').trim());
    if (!decoded) return null;
    try {
        const url = new URL(decoded, window.location.origin);
        if (url.origin !== window.location.origin) return null;
        const path = url.pathname || '/';
        const allowed = path === '/book' || path.startsWith('/book/')
            || path === '/pet' || path.startsWith('/pet/')
            || path === '/admin' || path.startsWith('/admin/')
            || path === '/' || path.startsWith('/author');
        if (!allowed) return null;
        if (/\/login(?:\/|$|\?)/i.test(`${path}${url.search}`)) return null;
        return `${path}${url.search}${url.hash}`;
    } catch (_) {
        return null;
    }
}

function currentAdminReturnHref() {
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete('admin_token');
        url.searchParams.delete('return');
        url.hash = '';
        return `${url.pathname}${url.search}`;
    } catch (_) {
        return '';
    }
}

function buildAdminLoginUrl(returnHref) {
    const login = `${BASE}/admin/login`;
    const resolved = resolveAdminLoginReturnPath(returnHref) || resolveAdminLoginReturnPath(currentAdminReturnHref());
    if (!resolved) return login;
    try {
        const url = new URL(login, window.location.origin);
        url.searchParams.set('return', resolved);
        return `${url.pathname}${url.search}`;
    } catch (_) {
        return login;
    }
}

function redirectToAdminLogin() {
    window.location.replace(buildAdminLoginUrl());
}

function canonicalAdminHistoryUrlFromUrl(url) {
    try {
        const base = String(window.__WMB__?.basePath || '').replace(/\/+$/, '');
        const path = String(url.pathname || '/');
        const adminPaths = [`${base}/admin`, '/admin'];
        if (adminPaths.some((route) => path === route || path === `${route}/`)) {
            url.hash = '';
            return `${url.pathname}${url.search}`;
        }
    } catch (_) {}
    const hashView = (url.hash || '#admin').replace(/\?.*$/, '') || '#admin';
    url.hash = hashView;
    return `${url.pathname}${url.search}${url.hash}`;
}

function parseAdminShellRoute() {
    try {
        const current = new URL(window.location.href);
        const search = current.searchParams;
        const rawHash = String(current.hash || '').replace(/^#/, '');
        const hashParts = rawHash.split('?');
        const hashParams = new URLSearchParams(hashParts[1] || '');
        const desk = search.get('desk') || hashParams.get('desk') || 'home';
        const project = search.get('project') || hashParams.get('project') || '';
        return { desk: String(desk || 'home').trim() || 'home', project: String(project || '').trim() };
    } catch (_) {
        return { desk: 'home', project: '' };
    }
}

function setAdminShellTab(active) {
    const deskTab = document.getElementById('admin-tab-desk');
    const projectsTab = document.getElementById('admin-tab-projects');
    deskTab?.classList.toggle('is-active', active === 'desk');
    projectsTab?.classList.toggle('is-active', active === 'projects');
}

function showAdminDeskView(opts = {}) {
    const deskView = document.getElementById('admin-desk-view');
    const projectsView = document.getElementById('admin-projects-view');
    if (deskView) deskView.classList.remove('hidden');
    if (projectsView) projectsView.classList.add('hidden');
    setAdminShellTab('desk');
    if (!opts.skipUrl) {
        try {
            const url = new URL(window.location.href);
            const project = url.searchParams.get('project') || parseAdminShellRoute().project || '';
            // Explicit desk=home so Admin Desk is not confused with default Book Projects.
            url.searchParams.set('desk', 'home');
            if (project) url.searchParams.set('project', project);
            else url.searchParams.delete('project');
            window.history.replaceState(null, '', canonicalAdminHistoryUrlFromUrl(url));
        } catch (_) {}
    }
}

function showAdminProjectsView(opts = {}) {
    const deskView = document.getElementById('admin-desk-view');
    const projectsView = document.getElementById('admin-projects-view');
    if (projectsView) projectsView.classList.remove('hidden');
    if (deskView) deskView.classList.add('hidden');
    setAdminShellTab('projects');
    if (!opts.skipUrl) {
        try {
            const url = new URL(window.location.href);
            const project = url.searchParams.get('project') || parseAdminShellRoute().project || '';
            url.searchParams.set('desk', 'projects');
            if (project) url.searchParams.set('project', project);
            else url.searchParams.delete('project');
            window.history.replaceState(null, '', canonicalAdminHistoryUrlFromUrl(url));
        } catch (_) {}
    }
}

window.WmbAdminShell = {
    showDesk: showAdminDeskView,
    showProjects: showAdminProjectsView,
    parseRoute: parseAdminShellRoute,
};

document.getElementById('admin-tab-desk')?.addEventListener('click', () => {
    showAdminDeskView();
    if (typeof window.WmbAdminDeskHost?.returnToAdminDeskHome === 'function') {
        window.WmbAdminDeskHost.returnToAdminDeskHome();
    }
});
document.getElementById('admin-tab-projects')?.addEventListener('click', () => {
    showAdminProjectsView();
});

async function startApp() {
    const token = localStorage.getItem(WMB_TOKEN_KEY);
    if (token) {
        try {
            const res = await fetch(`${BASE}/api/auth/me`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                localStorage.removeItem(WMB_TOKEN_KEY);
            }
        } catch (_) {
            localStorage.removeItem(WMB_TOKEN_KEY);
        }
    }

    if (!localStorage.getItem(WMB_TOKEN_KEY)) {
        if (!isLocalDevHost()) {
            redirectToAdminLogin();
            return;
        }
        const devProjectId = await resolveLocalDevProjectId();
        if (!devProjectId) {
            redirectToAdminLogin();
            return;
        }
        try {
            const res = await fetch(`${BASE}/api/auth/me`, {
                headers: { 'X-Dev-Project-Id': devProjectId },
                cache: 'no-store',
            });
            if (!res.ok) {
                redirectToAdminLogin();
                return;
            }
            _localDevProjectId = devProjectId;
            localStorage.setItem(WMB_AUTHOR_PROJECT_KEY, devProjectId);
        } catch (_) {
            redirectToAdminLogin();
            return;
        }
    }

    const route = parseAdminShellRoute();
    if (route.desk === 'projects') {
        showAdminProjectsView({ skipUrl: true });
    } else {
        showAdminDeskView({ skipUrl: true });
    }

    bindProjectsFindControls();

    // Always warm project, office book types, and explicit-author data; do not steal focus from an open desk tool.
    await Promise.all([loadProjects(), loadEligibleAuthors(), loadOfficeBookTypes()]);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            refreshRelativeTimeElements();
            pollProjectUpdates();
        }
    });

    if (window.WmbPresence && !_localDevProjectId) {
        window.WmbPresence.start({
            surface: 'admin',
            getAuthHeaders: async () => ({
                Authorization: `Bearer ${await getToken()}`,
            }),
        });
    }
}

startApp();
