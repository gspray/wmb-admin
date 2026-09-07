'use strict';

/**
 * Admin Desk host — mounts extracted desk-* panels on /admin (Book Platform Admin).
 * Phase 3 of Admin Desk separation.
 */

import { buildAdminPreviewOpenUrl } from '../platform/client/admin-preview-url.js';
import { canonicalAdminHistoryUrl } from './admin-canonical-url.js';
import { buildLoginUrlWithReturn, currentNavReturnHref } from '../platform/client/nav-return.js';
import { detectNavProduct } from '../platform/client/nav-url-normalize.js';

import { adminDeskState as state } from './admin-desk-state.js';
import { adminApi as api, getAdminApiToken as getToken } from './admin-desk-api.js';
import { BASE } from './author/config.js';
import { PET_PROJECT_LS_KEY } from '../platform/client/config.js';
// ── Inlined utilities from static-data.js (pure helpers, no Career SPA state) ─
function chapterQuestionsBucketKeyForAssignment(assignmentNum) {
    const n = Number(assignmentNum);
    return Number.isFinite(n) && n >= 0 ? String(n) : String(assignmentNum);
}
function isUnassignedAssignmentRow(a) {
    if (!a) return false;
    if (String(a.kind || '').toLowerCase() === 'unassigned') return true;
    const lab = String(a.label || '').trim().toLowerCase();
    return lab === 'unassigned' || /^unassigned(\s|$)/.test(lab);
}
function resolveMappedChapterNumber(mappedValue) {
    if (mappedValue === null || mappedValue === undefined || mappedValue === '') return null;
    const s = String(mappedValue || '').trim().toLowerCase();
    if (s === 'no chapter' || s === 'none') return null;
    if (mappedValue === 0 || mappedValue === '0') return 0;
    const asNum = Number(mappedValue);
    if (Number.isFinite(asNum) && asNum >= 0) return asNum;
    return null;
}
function getAssignmentChapterNumber(assignmentNum, chapterMap) {
    const map = chapterMap || state.chapterMap || {};
    const mapped = map[String(assignmentNum)] ?? map[assignmentNum];
    return resolveMappedChapterNumber(mapped);
}
function formatChapterAssignmentQuestionNumber(assignment, questionIndexZeroBased, chapterMap, question = null) {
    const map = chapterMap || state.chapterMap || {};
    const q = Math.max(1, Math.floor(Number(questionIndexZeroBased)) + 1);
    const customLabel = String(question?.displayLabel || '').replace(/\s+/g, ' ').trim();
    if (customLabel) return customLabel;
    if (isUnassignedAssignmentRow(assignment)) return `U.${q}`;
    const assignNum = (() => {
        const label = String(assignment?.label || '').trim();
        const m = label.match(/^Assignment\s+(\d+)\s*$/i);
        if (m) return Number(m[1]);
        const num = Number(assignment?.num);
        return Number.isFinite(num) ? num : 0;
    })();
    const mapped = map[String(assignment.num)] ?? map[assignment.num];
    const s = String(mapped ?? '').trim().toLowerCase();
    if (s === 'no chapter' || s === 'none') return `N.${assignNum}.${q}`;
    const chapterNum = resolveMappedChapterNumber(mapped);
    if (chapterNum === null || chapterNum === undefined) return `${assignNum}.?.${q}`;
    return `${assignNum}.${chapterNum}.${q}`;
}
import { copyAlignQuestionMetaFields } from './author/align-question-meta.js';
import { esc, flashAlert } from './author/ui-helpers.js';
import { launchQuestionAssignmentEditorPanel } from './author/desk-question-assignment-editor.js';
import { launchConfigureAssignmentsPanel } from './author/desk-assignment-pacing.js';
import { launchStartMyBookEditorPanel } from './author/desk-start-my-book-editor.js';
import { launchGhostwriterSettingsPanel } from './author/desk-ghostwriter-settings.js';
import { launchUiFeatureFlagsPanel } from './author/desk-ui-feature-flags.js';
import { launchAllowedBookTypesPanel } from './author/desk-allowed-book-types.js';
import { launchStrategySettingsPanel } from './author/desk-strategy-settings.js';
import { launchAiPromptsPanel } from './author/desk-ai-prompts.js';
import { launchAiUsagePanel } from './author/desk-ai-usage.js';
import { launchAskTurnFeedbackPanel } from './author/desk-ask-turn-feedback.js';
import { launchUsersAdminPanel } from './author/desk-users-admin.js';
import { launchWhosOnlinePanel, openWhosOnline, stopWhosOnlineRefresh } from './author/desk-whos-online.js';
import { launchActivityLogPanel } from './author/desk-activity-log.js';
import { launchBookRevisionManagerPanel } from './author/desk-book-revision-manager.js';
import { launchDeskAnswersBrowser } from './author/desk-answers-browser.js';
import { launchVoiceCloneSettingsPanel } from './author/desk-voice-clone-settings.js';
import { launchPetTalkListenSettingsPanel } from './author/desk-pet-talk-listen-settings.js';
import { launchPetCopyPanel } from './author/desk-pet-copy.js';
import { launchInterviewPreparationInspector } from './author/desk-interview-preparation.js';
import { launchDraftIntegrityPanel } from './author/desk-draft-integrity.js';

const WMB_TOKEN_KEY = 'wmb-admin-token';
const WMB_ADMIN_HMAC_KEY = 'wmb-admin-hmac-token';
const WMB_AUTHOR_PROJECT_KEY = 'wmb-author-project-id';
const LOCAL_DEV_SESSION = 'dev';

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
    const petStored = String(localStorage.getItem(PET_PROJECT_LS_KEY) || '').trim();
    if (petStored) return petStored;
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

/** @type {Record<string, string>} */
export const DESK_SLUG_MAP = {
    home: 'home',
    'assignment-editor': 'assignment-editor',
    'assignment-pacing': 'assignment-pacing',
    'start-my-book-editor': 'start-my-book-editor',
    'ghostwriter-settings': 'ghostwriter-settings',
    'ui-feature-flags': 'ui-feature-flags',
    'allowed-book-types': 'allowed-book-types',
    'chapter-strategies': 'chapter-strategies',
    'ai-prompts': 'ai-prompts',
    'ai-usage': 'ai-usage',
    'ask-feedback': 'ask-feedback',
    users: 'users',
    'whos-online': 'whos-online',
    'activity-log': 'activity-log',
    'book-audit': 'book-audit',
    revisions: 'revisions',
    'answer-logs': 'answer-logs',
    'interview-preparation': 'interview-preparation',
    'draft-integrity': 'draft-integrity',
    'voice-clone-settings': 'voice-clone-settings',
    'pet-talk-listen': 'pet-talk-listen',
    'pet-copy': 'pet-copy',
    projects: 'projects',
};

const BOOK_SETTING_CARDS = [
    { slug: 'allowed-book-types', label: 'Allowed Book Types', icon: '📚', title: 'Manage the catalog of book types authors may choose' },
    { slug: 'ghostwriter-settings', label: 'Ghostwriter Settings', icon: '⚙️', title: 'Configure Ghostwriter settings' },
    { slug: 'ui-feature-flags', label: 'UI Features', icon: '🎛️', title: 'Turn product chrome and UI elements on or off' },
    { slug: 'chapter-strategies', label: 'Chapter Strategies', icon: '🛠️', title: 'Configure chapter strategy options' },
    { slug: 'start-my-book-editor', label: 'Start My Book Editor', icon: '📖', title: 'Edit global Start My Book onboarding questions' },
    { slug: 'assignment-editor', label: 'Assignment Editor', icon: '📝', title: 'Edit assignments and their questions' },
    { slug: 'assignment-pacing', label: 'Assignment Pacing', icon: '📋', title: 'Assignment pacing settings' },
    { slug: 'pet-copy', label: 'Pet Copy', icon: '✍️', title: 'Edit Pet Book prompts and page explanations' },
];

const USER_MANAGEMENT_CARDS = [
    { slug: 'users', label: 'Manage Users', icon: '👥', title: 'Manage platform users' },
    { slug: 'whos-online', label: "Who's Online", icon: '🟢', title: 'See who is active on Write My Book' },
    { slug: 'activity-log', label: 'Activity Log', icon: '📜', title: 'Sign-ins by user' },
];

const AI_CARDS = [
    { slug: 'ai-prompts', label: 'AI Prompts', icon: '🤖', title: 'Edit AI prompts and choose models per usage' },
    { slug: 'ai-usage', label: 'AI Usage', icon: '📊', title: 'ElevenLabs daily limit and TTS usage ledger' },
    { slug: 'pet-talk-listen', label: 'Pet Talk Listen Timing', icon: '⏱️', title: 'Shorten Pet Talk listen beats for QA' },
    { slug: 'ask-feedback', label: 'Ask Feedback', icon: '👍', title: 'Triage Ask WMB thumbs feedback' },
];

const BOOK_CARDS = [
    { slug: 'draft-integrity', label: 'Draft Integrity', icon: '🛡️', title: 'Run Final Draft Integrity audit for duplication, grounding, and missed Material', needsProject: true },
    { slug: 'book-audit', label: 'Book Audit', icon: '🧾', title: 'Run Book Audit Report', needsProject: true },
    { slug: 'revisions', label: 'Revisions', icon: '🕘', title: 'Open Book Revision Manager', needsProject: true },
    { slug: 'answer-logs', label: 'Answer Logs', icon: '💬', title: 'Browse saved answers and save history', needsProject: true },
    { slug: 'interview-preparation', label: 'Interview Preparation', icon: '🔎', title: 'Inspect prepared claims, gaps, provenance, freshness, and job state', needsProject: true },
    { slug: 'voice-clone-settings', label: 'Voice Clone Settings', icon: '🎙️', title: 'Enable voice cloning and edit recording prompts for this book', needsProject: true },
];

function getAdminHmacToken() {
    return sessionStorage.getItem(WMB_ADMIN_HMAC_KEY) || '';
}

function isLegacyAdminHmacToken(token) {
    const raw = String(token || '').trim();
    if (!raw) return false;
    const parts = raw.split('.');
    return parts.length === 2 && /^[a-f0-9]{64}$/i.test(parts[1] || '');
}

function parseRouteParams() {
    const current = new URL(window.location.href);
    const search = current.searchParams;
    const rawHash = String(current.hash || '').replace(/^#/, '');
    const hashParts = rawHash.split('?');
    const hashParams = new URLSearchParams(hashParts[1] || '');

    const deskRaw = search.get('desk') || hashParams.get('desk') || 'home';
    const project = search.get('project') || hashParams.get('project') || '';
    const desk = DESK_SLUG_MAP[String(deskRaw || '').trim()] || 'home';
    return { desk, project: String(project || '').trim() };
}

function updateDeskUrl(desk, projectId, opts = {}) {
    try {
        const url = new URL(window.location.href);
        const slug = DESK_SLUG_MAP[desk] || 'home';
        url.searchParams.set('desk', slug);
        if (projectId) url.searchParams.set('project', projectId);
        else url.searchParams.delete('project');
        const next = canonicalAdminHistoryUrl(url);
        const cur = canonicalAdminHistoryUrl(new URL(window.location.href));
        if (next === cur) return;
        const useReplace = opts.replace === true || slug === 'home' || slug === 'projects';
        const stateObj = { wmbAdminNav: true, desk: slug, project: projectId || '' };
        if (useReplace) window.history.replaceState(stateObj, '', next);
        else window.history.pushState(stateObj, '', next);
    } catch (_) {}
}

function renderMyDeskList() {
    // Admin host has no document library list.
}

function setMyDeskWorkspaceMode(enabled) {
    const workspace = document.getElementById('admin-desk-workspace');
    const home = document.getElementById('admin-desk-home');
    const isEnabled = Boolean(enabled);
    if (workspace) workspace.classList.toggle('my-desk-body--workspace', isEnabled);
    if (workspace) workspace.classList.toggle('admin-desk-workspace--active', isEnabled);
    if (home) home.classList.toggle('hidden', isEnabled);
    document.body.classList.toggle('admin-desk-workspace-open', isEnabled);
    if (!isEnabled) {
        const projectId = state.project?.id || parseRouteParams().project || '';
        updateDeskUrl('home', projectId, { replace: true });
    }
}

function returnToAdminDeskHome(opts = {}) {
    stopWhosOnlineRefresh();
    const emptyEl = document.getElementById('my-desk-empty');
    const editorEl = document.getElementById('my-desk-editor');
    const comingSoon = document.getElementById('my-desk-coming-soon');
    state.librarySelected = null;
    setMyDeskWorkspaceMode(false);
    if (comingSoon) comingSoon.classList.add('hidden');
    if (editorEl) editorEl.classList.add('hidden');
    if (emptyEl) {
        emptyEl.classList.remove('book-audit-host');
        emptyEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
    }
    const projectId = state.project?.id || parseRouteParams().project || '';
    if (!opts.skipUrl) updateDeskUrl('home', projectId, { replace: true });
    renderDeskHome();
}

async function refreshAuthorAssignmentUxFromServer() {}

async function loadDiscoveryConfig() {
    try {
        state.discoveryConfig = await api('GET', '/api/system/author/project/discovery-config');
    } catch (_) {
        state.discoveryConfig = null;
    }
    return state.discoveryConfig;
}

async function refreshStartMyBookAfterQuestionsModeChange() {}

function hydrateAlignQuestionsFromList(all, introCardMeta = null) {
    state.alignIntroQuestions = [];
    for (const q of all) {
        if (q?.type === 'multi_short_text' && Array.isArray(q.subQuestions)) {
            state.alignIntroQuestions.push(...q.subQuestions);
        } else if (String(q?.group || '').trim() === 'intro') {
            state.alignIntroQuestions.push(q);
        }
    }
    const hasComposite = all.some((q) => q?.type === 'multi_short_text');
    if (hasComposite) {
        state.alignQuestions = all;
    } else if (state.alignIntroQuestions.length) {
        state.alignQuestions = [
            copyAlignQuestionMetaFields(introCardMeta || {}, {
                id: 'a_intro_card',
                text: String(introCardMeta?.text || 'Your Name').trim() || 'Your Name',
                type: 'multi_short_text',
                subQuestions: state.alignIntroQuestions,
            }),
            ...all.filter((q) => String(q?.group || '').trim() !== 'intro'),
        ];
    } else {
        state.alignQuestions = all;
    }
}

function buildAlignQuestionOrderMap() {
    const map = new Map();
    let order = 0;
    for (const q of state.alignQuestions || []) {
        if (q?.type === 'multi_short_text' && Array.isArray(q.subQuestions)) {
            for (const sq of q.subQuestions) {
                const sid = String(sq?.id || '').trim();
                if (sid && !map.has(sid)) map.set(sid, order++);
            }
            continue;
        }
        const qid = String(q?.id || '').trim();
        if (qid && !map.has(qid)) map.set(qid, order++);
    }
    for (const sq of state.alignIntroQuestions || []) {
        const sid = String(sq?.id || '').trim();
        if (sid && !map.has(sid)) map.set(sid, order++);
    }
    return map;
}

function resolveAssignmentBankQuestionMeta(qid) {
    const questionId = String(qid || '').trim();
    if (!questionId) return null;
    for (const assignment of state.assignments || []) {
        const kind = String(assignment?.kind || '').trim().toLowerCase();
        if (kind === 'start_my_book' || Number(assignment?.num) === 0) continue;
        if (kind === 'unassigned' || isUnassignedAssignmentRow(assignment)) continue;
        const bucketKey = chapterQuestionsBucketKeyForAssignment(assignment.num);
        const questions = Array.isArray(state.chapterQuestions[bucketKey]) ? state.chapterQuestions[bucketKey] : [];
        const questionIndex = questions.findIndex((q) => String(q?.id || '').trim() === questionId);
        if (questionIndex >= 0) {
            return {
                assignment,
                questionIndex,
                question: questions[questionIndex],
                bookChapter: getAssignmentChapterNumber(assignment.num),
            };
        }
    }
    return null;
}

function revisionChapterSectionTitle(chapterNum) {
    const n = Number(chapterNum);
    if (Number.isFinite(n) && n === 0) return 'Introduction';
    return `Chapter ${chapterNum}`;
}

function formatRevisionQuestionLabel(qid, answerRef = {}) {
    const questionId = String(qid || '').trim();
    if (!questionId) return 'Q';
    const meta = resolveAssignmentBankQuestionMeta(questionId);
    if (meta) {
        return formatChapterAssignmentQuestionNumber(meta.assignment, meta.questionIndex, null, meta.question);
    }
    const alignOrder = buildAlignQuestionOrderMap();
    if (alignOrder.has(questionId)) {
        return `Q${alignOrder.get(questionId) + 1}`;
    }
    if (answerRef?.referenceLabel) return String(answerRef.referenceLabel).trim();
    return questionId;
}

function parseSavedChaptersResponse(data) {
    if (Array.isArray(data)) {
        return { chapters: data, staleDraftsPruned: [] };
    }
    return {
        chapters: Array.isArray(data?.chapters) ? data.chapters : [],
        staleDraftsPruned: Array.isArray(data?.staleDraftsPruned) ? data.staleDraftsPruned : [],
    };
}

async function loadSavedChaptersFromServer() {
    const data = await api('GET', '/api/system/author/project/chapters');
    const { chapters, staleDraftsPruned } = parseSavedChaptersResponse(data);
    state.savedChapters = chapters;
    return { chapters, staleDraftsPruned };
}

async function renderStep() {}

function formatBookAuditAnswerReference(answerRef) {
    const questionId = String(answerRef?.questionId || '').trim();
    if (!questionId) return String(answerRef?.referenceLabel || '').trim();
    const meta = resolveAssignmentBankQuestionMeta(questionId);
    if (meta) {
        const qLabel = formatChapterAssignmentQuestionNumber(meta.assignment, meta.questionIndex, null, meta.question);
        return `Assignment ${meta.assignment?.num} (${qLabel})`;
    }
    if (answerRef?.referenceLabel) return String(answerRef.referenceLabel).trim();
    return `Question ${questionId}`;
}

function formatBookAuditQuestionReference(questionRef) {
    return formatBookAuditAnswerReference({
        questionId: questionRef?.id || questionRef?.questionId || '',
        referenceLabel: questionRef?.referenceLabel || '',
    });
}

function hostDeps() {
    return {
        renderMyDeskList,
        setMyDeskWorkspaceMode,
        returnToAdminDeskHome,
        launchDeskBySlug,
        refreshAuthorAssignmentUxFromServer,
        loadDiscoveryConfig,
        refreshStartMyBookAfterQuestionsModeChange,
        hydrateAlignQuestionsFromList,
        loadSavedChaptersFromServer,
        renderStep,
        buildAlignQuestionOrderMap,
        resolveAssignmentBankQuestionMeta,
        formatRevisionQuestionLabel,
        revisionChapterSectionTitle,
        openMyDesk,
    };
}

async function openMyDesk(opts = {}) {
    if (typeof window.WmbAdminShell?.showDesk === 'function') {
        window.WmbAdminShell.showDesk({ skipUrl: true });
    }
    setMyDeskWorkspaceMode(false);
    renderDeskHome();
    if (opts.launchWhosOnline) {
        await openWhosOnline(hostDeps());
        updateDeskUrl('whos-online', state.project?.id || '');
    }
}

function buildOpenAsAuthorUrl(projectId, projectHint = null) {
    const id = String(projectId || '').trim();
    const project = projectHint
        || (state.project?.id === id ? state.project : { id });
    const hmac = getAdminHmacToken();
    return buildAdminPreviewOpenUrl(project, {
        basePath: BASE,
        adminToken: isLegacyAdminHmacToken(hmac) ? hmac : '',
    });
}

function goReturnToBook() {
    const projectId = state.project?.id || parseRouteParams().project || localStorage.getItem(WMB_AUTHOR_PROJECT_KEY) || '';
    if (!projectId) {
        flashAlert('No book selected to return to.', 'error', 3500);
        return;
    }
    window.location.href = buildOpenAsAuthorUrl(projectId);
}

function syncReturnToBookChrome() {
    const hasBook = Boolean(state.project?.id);
    const menuItem = document.getElementById('a-menu-item-return-book');
    if (menuItem) {
        menuItem.classList.toggle('hidden', !hasBook);
        menuItem.disabled = !hasBook;
    }
}

function wireReturnToBookChrome() {
    const menuItem = document.getElementById('a-menu-item-return-book');
    if (menuItem && !menuItem.dataset.wired) {
        menuItem.dataset.wired = '1';
        menuItem.addEventListener('click', () => {
            document.getElementById('a-menu-list')?.classList.add('hidden');
            document.getElementById('a-menu-toggle')?.setAttribute('aria-expanded', 'false');
            goReturnToBook();
        });
    }
    syncReturnToBookChrome();
}

function renderDeskHome() {
    const home = document.getElementById('admin-desk-home');
    if (!home) return;

    const project = state.project;
    const projectLabel = project
        ? (project.workingTitle || project.authorName || project.id)
        : '';

    const cardHtml = (card, disabled) => `
        <button type="button" class="admin-desk-card${disabled ? ' admin-desk-card--disabled' : ''}"
            data-desk-slug="${esc(card.slug)}"
            title="${esc(card.title)}"
            ${disabled ? 'disabled aria-disabled="true"' : ''}>
            <span class="admin-desk-card-icon" aria-hidden="true">${card.icon}</span>
            <span class="admin-desk-card-label">${esc(card.label)}</span>
        </button>`;

    home.innerHTML = `
        <div class="admin-desk-home-head">
            <div>
                <h2 class="admin-desk-title">Admin Desk</h2>
                <p class="admin-desk-lead">Global catalog tools and diagnostics for the current book.</p>
            </div>
            <div class="admin-desk-project-bar">
                ${project
        ? `<span class="admin-desk-project-label">Current book: <strong>${esc(projectLabel)}</strong></span>`
        : `<span class="admin-desk-project-label admin-desk-project-label--muted">No book selected — Current Book tools need a project (open from Author or Book Projects).</span>`}
            </div>
        </div>
        <section class="admin-desk-group" aria-labelledby="admin-desk-book-settings-label">
            <h3 id="admin-desk-book-settings-label" class="admin-desk-group-label">Book Settings</h3>
            <div class="admin-desk-cards">
                ${BOOK_SETTING_CARDS.map((c) => cardHtml(c, false)).join('')}
            </div>
        </section>
        <section class="admin-desk-group" aria-labelledby="admin-desk-user-management-label">
            <h3 id="admin-desk-user-management-label" class="admin-desk-group-label">User Management</h3>
            <div class="admin-desk-cards">
                ${USER_MANAGEMENT_CARDS.map((c) => cardHtml(c, false)).join('')}
            </div>
        </section>
        <section class="admin-desk-group" aria-labelledby="admin-desk-ai-label">
            <h3 id="admin-desk-ai-label" class="admin-desk-group-label">AI</h3>
            <div class="admin-desk-cards">
                ${AI_CARDS.map((c) => cardHtml(c, false)).join('')}
            </div>
        </section>
        <section class="admin-desk-group" aria-labelledby="admin-desk-book-label">
            <h3 id="admin-desk-book-label" class="admin-desk-group-label">Current Book</h3>
            ${project ? '' : '<p class="admin-desk-book-hint">Select a project to enable book diagnostics and settings.</p>'}
            <div class="admin-desk-cards">
                ${BOOK_CARDS.map((c) => cardHtml(c, !project)).join('')}
            </div>
        </section>
    `;

    home.querySelectorAll('[data-desk-slug]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const slug = btn.getAttribute('data-desk-slug');
            launchDeskBySlug(slug).catch((err) => {
                flashAlert(err?.message || 'Could not open desk tool.', 'error', 4000);
            });
        });
    });

    syncReturnToBookChrome();
}

async function launchBookAuditPanel() {
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
    emptyEl.innerHTML = '<div class="desk-workspace-shell desk-workspace-shell--audit"><div id="book-audit-report-host" class="book-audit-report-host"></div></div>';

    if (window.WmbBookAuditReport && typeof window.WmbBookAuditReport.init === 'function') {
        window.WmbBookAuditReport.init({
            api,
            flash: flashAlert,
            isAdmin: true,
            projectId: state.project?.id || '',
            onOpenReference: null,
            onCloseDesk: returnToAdminDeskHome,
            formatAnswerReference: formatBookAuditAnswerReference,
            formatQuestionReference: formatBookAuditQuestionReference,
        });
    }
    if (window.WmbBookAuditReport && typeof window.WmbBookAuditReport.launch === 'function') {
        await window.WmbBookAuditReport.launch(document.getElementById('book-audit-report-host'));
    } else {
        emptyEl.innerHTML = `
            <div class="card" style="padding:.9rem;">
                <h3 style="margin:.1rem 0 .45rem;">Book Audit unavailable</h3>
                <p style="color:var(--color-muted);margin:0;">The Book Audit module did not load. Refresh the page and try again.</p>
            </div>`;
    }
}

async function launchAnswersBrowserPanel() {
    state.librarySelected = null;
    renderMyDeskList();
    setMyDeskWorkspaceMode(true);
    await launchDeskAnswersBrowser({
        api,
        esc,
        onClose: returnToAdminDeskHome,
        projectTitle: state.project?.workingTitle || state.project?.authorName || '',
    });
}

async function launchDraftIntegrityPanelHost() {
    state.librarySelected = null;
    renderMyDeskList();
    setMyDeskWorkspaceMode(true);
    await launchDraftIntegrityPanel({
        api,
        esc,
        onClose: returnToAdminDeskHome,
        projectTitle: state.project?.workingTitle || state.project?.authorName || '',
    });
}

async function launchInterviewPreparationPanel() {
    state.librarySelected = null;
    renderMyDeskList();
    setMyDeskWorkspaceMode(true);
    await launchInterviewPreparationInspector({
        api,
        esc,
        onClose: returnToAdminDeskHome,
        projectTitle: state.project?.workingTitle || state.project?.authorName || '',
    });
}

async function launchDeskBySlug(slug, opts = {}) {
    const normalized = DESK_SLUG_MAP[slug] || 'home';
    const projectId = state.project?.id || parseRouteParams().project || '';

    if (normalized === 'projects') {
        if (typeof window.WmbAdminShell?.showProjects === 'function') {
            window.WmbAdminShell.showProjects({ skipUrl: opts.skipUrl === true });
        }
        if (!opts.skipUrl) updateDeskUrl('projects', projectId, { replace: true });
        return;
    }

    if (typeof window.WmbAdminShell?.showDesk === 'function') {
        window.WmbAdminShell.showDesk({ skipUrl: true });
    }

    if (normalized === 'home') {
        returnToAdminDeskHome({ skipUrl: opts.skipUrl === true });
        return;
    }

    const needsProject = BOOK_CARDS.some((c) => c.slug === normalized);
    if (needsProject && !state.project?.id) {
        flashAlert('Select a book project first (open Admin Desk from Author, or use Book Projects).', 'error', 5000);
        returnToAdminDeskHome({ skipUrl: opts.skipUrl === true });
        return;
    }

    if (!opts.skipUrl) updateDeskUrl(normalized, projectId);
    const deps = hostDeps();

    switch (normalized) {
        case 'assignment-editor':
            await launchQuestionAssignmentEditorPanel(deps);
            break;
        case 'assignment-pacing':
            await launchConfigureAssignmentsPanel(deps);
            break;
        case 'start-my-book-editor':
            await launchStartMyBookEditorPanel(deps);
            break;
        case 'ghostwriter-settings':
            await launchGhostwriterSettingsPanel(deps);
            break;
        case 'ui-feature-flags':
            await launchUiFeatureFlagsPanel(deps);
            break;
        case 'allowed-book-types':
            await launchAllowedBookTypesPanel(deps);
            break;
        case 'chapter-strategies':
            await launchStrategySettingsPanel(deps);
            break;
        case 'ai-prompts':
            await launchAiPromptsPanel(deps);
            break;
        case 'ai-usage':
            await launchAiUsagePanel(deps);
            break;
        case 'ask-feedback':
            await launchAskTurnFeedbackPanel(deps);
            break;
        case 'users':
            await launchUsersAdminPanel(deps);
            break;
        case 'whos-online':
            await launchWhosOnlinePanel(deps);
            break;
        case 'activity-log':
            await launchActivityLogPanel(deps);
            break;
        case 'book-audit':
            await launchBookAuditPanel();
            break;
        case 'draft-integrity':
            await launchDraftIntegrityPanelHost();
            break;
        case 'revisions':
            await launchBookRevisionManagerPanel(deps);
            break;
        case 'answer-logs':
            await launchAnswersBrowserPanel();
            break;
        case 'interview-preparation':
            await launchInterviewPreparationPanel();
            break;
        case 'voice-clone-settings':
            await launchVoiceCloneSettingsPanel(deps);
            break;
        case 'pet-talk-listen':
            await launchPetTalkListenSettingsPanel(deps);
            break;
        case 'pet-copy':
            await launchPetCopyPanel(deps);
            break;
        default:
            returnToAdminDeskHome();
    }
}

async function verifyAdminSession() {
    const token = localStorage.getItem(WMB_TOKEN_KEY);
    if (token) {
        try {
            const res = await fetch(`${BASE}/api/auth/me`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) return token;
            localStorage.removeItem(WMB_TOKEN_KEY);
        } catch (_) {
            /* fall through to local-dev or login */
        }
    }

    // Local OTP-free Admin Desk (same X-Dev-Project-Id path as author).
    if (isLocalDevHost()) {
        const devProjectId = await resolveLocalDevProjectId();
        if (devProjectId) {
            try {
                const res = await fetch(`${BASE}/api/auth/me`, {
                    headers: { 'X-Dev-Project-Id': devProjectId },
                    cache: 'no-store',
                });
                if (res.ok) {
                    state._devMode = true;
                    state._devProjectId = devProjectId;
                    localStorage.setItem(WMB_AUTHOR_PROJECT_KEY, devProjectId);
                    return LOCAL_DEV_SESSION;
                }
            } catch (_) {
                /* fall through */
            }
        }
    }

    window.location.replace(buildLoginUrlWithReturn(`${BASE}/admin/login`, currentNavReturnHref()));
    return null;
}

async function ensureAuthorApiAuth(token) {
    state.role = 'admin';
    if (token === LOCAL_DEV_SESSION) {
        state._devMode = true;
        state._adminPreviewMode = false;
        state._adminToken = null;
        return;
    }
    state._adminPreviewMode = true;
    state._adminToken = token;
    try {
        const user = window.firebase?.auth?.().currentUser;
        if (user) state.user = user;
    } catch (_) {}
}

async function loadProjectContext(projectId) {
    if (!projectId) {
        state.project = null;
        return;
    }
    localStorage.setItem(WMB_AUTHOR_PROJECT_KEY, projectId);
    try {
        const bootData = await api('GET', '/api/system/author/boot');
        state.project = bootData?.project || null;
        if (bootData) {
            // Apply boot data locally — no Career SPA static-data module needed.
            const globalContent = bootData.globalAssignmentContent || {};
            state.assignments = Array.isArray(globalContent.assignments) ? globalContent.assignments : [];
            state.chapterQuestions = globalContent.chapterQuestions || {};
            state.chapterMap = globalContent.chapterMap || {};
        }
        if (!state.project) {
            const res = await fetch(`${BASE}/api/projects/${encodeURIComponent(projectId)}`, {
                headers: { Authorization: `Bearer ${state._adminToken || localStorage.getItem(WMB_TOKEN_KEY) || ''}` },
            });
            if (res.ok) state.project = await res.json();
        }
    } catch (err) {
        console.warn('[admin-desk] project load failed', err?.message || err);
        try {
            const res = await fetch(`${BASE}/api/projects/${encodeURIComponent(projectId)}`, {
                headers: { Authorization: `Bearer ${state._adminToken || localStorage.getItem(WMB_TOKEN_KEY) || ''}` },
            });
            if (res.ok) state.project = await res.json();
        } catch (_) {
            state.project = null;
        }
    }
}

function installAdminDeskPopstate() {
    if (installAdminDeskPopstate._done) return;
    installAdminDeskPopstate._done = true;
    window.addEventListener('popstate', () => {
        const { desk, project } = parseRouteParams();
        if (project && project !== (state.project?.id || '')) {
            void loadProjectContext(project).then(() => {
                void launchDeskBySlug(desk, { skipUrl: true });
            });
            return;
        }
        void launchDeskBySlug(desk, { skipUrl: true });
    });
}

export async function bootAdminDeskHost() {
    const token = await verifyAdminSession();
    if (!token) return;

    await ensureAuthorApiAuth(token);

    const { desk, project } = parseRouteParams();
    const projectId = project || (token === LOCAL_DEV_SESSION
        ? String(
            state._devProjectId
            || localStorage.getItem(PET_PROJECT_LS_KEY)
            || localStorage.getItem(WMB_AUTHOR_PROJECT_KEY)
            || '',
        ).trim()
        : '');
    if (projectId) {
        await loadProjectContext(projectId);
    } else {
        const stored = localStorage.getItem(WMB_AUTHOR_PROJECT_KEY) || '';
        if (stored && desk !== 'projects') {
            // Keep stored id for author APIs but do not auto-bind unless URL carries project.
        }
    }

    state.librarySelected = null;

    if (window.WmbBookAuditReport && typeof window.WmbBookAuditReport.init === 'function') {
        window.WmbBookAuditReport.init({
            api,
            flash: flashAlert,
            isAdmin: true,
            projectId: state.project?.id || '',
            onOpenReference: null,
            onCloseDesk: returnToAdminDeskHome,
            formatAnswerReference: formatBookAuditAnswerReference,
            formatQuestionReference: formatBookAuditQuestionReference,
        });
    }

    wireReturnToBookChrome();
    renderDeskHome();
    installAdminDeskPopstate();

    if (desk === 'projects') {
        if (typeof window.WmbAdminShell?.showProjects === 'function') {
            window.WmbAdminShell.showProjects();
        }
        return;
    }

    if (typeof window.WmbAdminShell?.showDesk === 'function') {
        window.WmbAdminShell.showDesk({ skipUrl: true });
    }

    if (desk && desk !== 'home') {
        await launchDeskBySlug(desk, { skipUrl: true });
    }
}

window.WmbAdminDeskHost = {
    boot: bootAdminDeskHost,
    launchDeskBySlug,
    returnToAdminDeskHome,
    DESK_SLUG_MAP,
};
