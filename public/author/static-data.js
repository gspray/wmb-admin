'use strict';

import { BASE } from './config.js';
import { adminApi as api } from '../admin-desk-api.js';
import { state } from './state.js';
import { canonicalizeBookTypeOptionValue } from './book-type-option-ids.js';

const AUTHOR_API_PREFIX = '/api/system/author';

/** @type {Map<string, { data?: unknown, at?: number, inflight?: Promise<unknown> }>} */
const _projectCache = new Map();
const SESSION_TTL_MS = 10 * 60 * 1000;

function projectCacheKey(name) {
    const projectId = String(
        state.project?.id
        || state._devProjectId
        || localStorage.getItem('wmb-author-project-id')
        || '',
    ).trim() || '_';
    return `${projectId}:${name}`;
}

function seedProjectCache(name, data) {
    _projectCache.set(projectCacheKey(name), { data, at: Date.now(), inflight: null });
}

function invalidateProjectCache(name) {
    if (!name) {
        const prefix = `${projectCacheKey('').split(':')[0]}:`;
        for (const key of [..._projectCache.keys()]) {
            if (key.startsWith(prefix)) _projectCache.delete(key);
        }
        return;
    }
    _projectCache.delete(projectCacheKey(name));
}

async function fetchProjectCached(name, fetcher, { force = false, ttlMs = SESSION_TTL_MS } = {}) {
    const key = projectCacheKey(name);
    const entry = _projectCache.get(key);
    const now = Date.now();
    if (!force && entry?.data !== undefined && entry.at && (now - entry.at) < ttlMs) {
        return entry.data;
    }
    if (!force && entry?.inflight) {
        return entry.inflight;
    }
    const inflight = Promise.resolve()
        .then(fetcher)
        .then((data) => {
            _projectCache.set(key, { data, at: Date.now(), inflight: null });
            return data;
        })
        .catch((err) => {
            const cur = _projectCache.get(key);
            if (cur?.inflight === inflight) {
                _projectCache.set(key, { ...cur, inflight: null });
            }
            throw err;
        });
    _projectCache.set(key, { ...(entry || {}), inflight });
    return inflight;
}

function bootPerfMeasure(_label, fn) {
    return typeof fn === 'function' ? fn() : fn;
}

function bootPerfSync(_label, fn) {
    return typeof fn === 'function' ? fn() : fn;
}

function applyExperiencePayload() {}

function applySecondarySurfaceLabels() {}

function applyBookWelcomeBootPayload() {}

function defaultBookWelcomeBootPayload() {
    return {};
}

function isPetBookExperience(project) {
    return canonicalizeBookTypeOptionValue(project?.bookType || project?.workType) === 'pets_memoir';
}

function experienceDefaultChapterStrategyId(project) {
    return isPetBookExperience(project) ? PETS_LIFE_STRATEGY_ID : 'chronological';
}

export let CHAPTER_STRATEGIES = [];
export let CHAPTER_QUESTIONS  = {};
export let ASSIGNMENTS        = [];
export let ASSIGNMENT_CHAPTER_MAP = {};
/** Optional book-chapter titles from the content bank (e.g. Pet Memoir). */
export let ASSIGNMENT_CHAPTER_TITLES = [];
export let GHOSTWRITER_ENABLED_BOOK_TYPES = ['memoir'];
export let GHOSTWRITER_ENABLED_BOOK_SITUATIONS = ['started_one_company'];

export const PETS_LIFE_STRATEGY_ID = 'pets_life';

/** Align a_008 options — used when ghostwriter-settings API omits availableBookSituations. */
export async function loadBookSituationOptionsCatalog() {
    try {
        const align = await fetch(`${BASE}/align.json`).then((r) => r.json());
        const q = (align?.questions || []).find((item) => item.id === 'a_008');
        return (q?.options || [])
            .map((o) => ({
                id: String(o.value || '').trim(),
                label: String(o.label || '').trim(),
            }))
            .filter((o) => o.id && o.label);
    } catch (_) {
        return [];
    }
}

export function invalidateUserVoiceSettings() {
    invalidateProjectCache('voice-settings');
}

export async function loadUserVoiceSettings(opts = {}) {
    const empty = { configured: false, wireValue: '', voiceName: '', voiceId: '' };
    if (state._devMode) {
        state.userVoiceClone = { ...empty };
        return null;
    }
    try {
        const data = await fetchProjectCached(
            'voice-settings',
            () => api('GET', '/api/system/author/me/voice-settings'),
            opts,
        );
        const s = data?.settings || {};
        state.userVoiceClone = {
            configured: Boolean(s.configured),
            wireValue: String(s.wireValue || '').trim(),
            voiceName: String(s.voiceName || '').trim(),
            voiceId: String(s.voiceId || '').trim(),
        };
        return data;
    } catch (_) {
        state.userVoiceClone = { ...empty };
        return null;
    }
}

export function invalidateProjectAlign() {
    invalidateProjectCache('align');
}

export async function loadProjectAlign(opts = {}) {
    return fetchProjectCached(
        'align',
        () => api('GET', '/api/system/author/project/align'),
        opts,
    );
}

export function invalidateGlobalAssignmentContent() {
    invalidateProjectCache('global-assignment-content');
}

function applyGhostwriterSettingsPayload(data) {
    const enabled = Array.isArray(data?.enabledBookTypes) && data.enabledBookTypes.length
        ? data.enabledBookTypes.map((id) => String(id || '').trim()).filter(Boolean)
        : ['memoir'];
    const byTypeRaw = data?.enabledBookSituationsByType
        && typeof data.enabledBookSituationsByType === 'object'
        ? data.enabledBookSituationsByType
        : null;
    const enabledByType = {};
    if (byTypeRaw) {
        for (const [typeId, list] of Object.entries(byTypeRaw)) {
            enabledByType[typeId] = Array.isArray(list)
                ? list.map((id) => String(id || '').trim()).filter(Boolean)
                : [];
        }
    }
    const enabledSituations = Array.isArray(data?.enabledBookSituations) && data.enabledBookSituations.length
        ? data.enabledBookSituations.map((id) => String(id || '').trim()).filter(Boolean)
        : (enabledByType.memoir?.length ? [...enabledByType.memoir] : ['started_one_company']);
    if (!Object.keys(enabledByType).length) {
        enabledByType.memoir = [...enabledSituations];
    }
    const availableByType = data?.availableBookSituationsByType
        && typeof data.availableBookSituationsByType === 'object'
        ? data.availableBookSituationsByType
        : {};
    const availableBookTypes = Array.isArray(data?.availableBookTypes) && data.availableBookTypes.length
        ? data.availableBookTypes.map((o) => ({
            id: String(o?.id || '').trim(),
            label: String(o?.label || o?.id || '').trim(),
        })).filter((o) => o.id)
        : (Array.isArray(data?.allowedBookTypes) && data.allowedBookTypes.length
            ? data.allowedBookTypes.map((o) => ({
                id: String(o?.id || '').trim(),
                label: String(o?.label || o?.id || '').trim(),
            })).filter((o) => o.id)
            : []);
    GHOSTWRITER_ENABLED_BOOK_TYPES = enabled;
    GHOSTWRITER_ENABLED_BOOK_SITUATIONS = enabledSituations;
    state.ghostwriterEnabledBookTypes = [...enabled];
    state.ghostwriterEnabledBookSituations = [...enabledSituations];
    state.ghostwriterEnabledBookSituationsByType = enabledByType;
    state.ghostwriterAvailableBookTypes = availableBookTypes;
    state.ghostwriterAvailableBookSituationsByType = availableByType;
    state.ghostwriterPointOfView = String(data?.pointOfView || 'first_person').trim() || 'first_person';
    state.ghostwriterNarratorAccess = String(data?.narratorAccess || 'personal').trim() || 'personal';
    state.ghostwriterQuestionsModeEnabled = data?.questionsModeEnabled !== false;
    return data;
}

/**
 * Choice options for Start My Book a_003 from Ghostwriter-enabled types.
 * Merges labels from the question + availableBookTypes catalog so Discover
 * shows every enabled type even when the SMB gate only listed one option.
 * @param {object} [question]
 * @returns {{ value: string, label: string }[]}
 */
export function getEnabledBookTypeChoiceOptions(question) {
    const enabled = Array.isArray(state.ghostwriterEnabledBookTypes) && state.ghostwriterEnabledBookTypes.length
        ? state.ghostwriterEnabledBookTypes.map((id) => String(id || '').trim()).filter(Boolean)
        : [...GHOSTWRITER_ENABLED_BOOK_TYPES];
    const labelById = new Map();
    const catalog = Array.isArray(state.ghostwriterAvailableBookTypes)
        ? state.ghostwriterAvailableBookTypes
        : [];
    for (const opt of catalog) {
        const id = String(opt?.id || '').trim();
        if (!id) continue;
        labelById.set(id, String(opt.label || id).trim() || id);
    }
    for (const opt of Array.isArray(question?.options) ? question.options : []) {
        const canonical = canonicalizeBookTypeOptionValue(opt?.value || opt?.label, opt?.label);
        const label = String(opt?.label || opt?.value || '').trim();
        if (canonical && label) labelById.set(canonical, label);
    }
    return enabled.map((id) => {
        const value = String(id || '').trim();
        return {
            value,
            label: labelById.get(value)
                || value.replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase()),
        };
    }).filter((o) => o.value);
}

/** Enabled situation ids for a book type (falls back to memoir / flat list). */
export function getEnabledBookSituationsForType(bookType) {
    const typeId = String(bookType || '').trim();
    const byType = state.ghostwriterEnabledBookSituationsByType || {};
    if (typeId && Array.isArray(byType[typeId]) && byType[typeId].length) {
        return byType[typeId];
    }
    const flat = Array.isArray(state.ghostwriterEnabledBookSituations)
        ? state.ghostwriterEnabledBookSituations
        : [];
    return flat.length ? flat : ['started_one_company'];
}

export async function loadGhostwriterSettings() {
    const data = await api('GET', '/api/system/author/ghostwriter-settings').catch(() => null);
    return applyGhostwriterSettingsPayload(data);
}

let _chapterStrategiesPrefetch = null;

/**
 * Chapter strategy catalogs are RTDB/Admin-owned.
 * Do not fall back to public/chapter-strategies.json.
 */
export function prefetchChapterStrategies() {
    if (!_chapterStrategiesPrefetch) {
        _chapterStrategiesPrefetch = Promise.resolve([]);
    }
    return _chapterStrategiesPrefetch;
}

export function invalidateChapterStrategiesPrefetch() {
    _chapterStrategiesPrefetch = null;
}

/**
 * Apply per-book-type strategy catalog from author API / boot.
 * Prefer strategySettings.strategies (enabled) or availableStrategies + enabledStrategyIds.
 */
function applyChapterStrategiesPayload(strategies, strategySettings) {
    const settings = strategySettings && typeof strategySettings === 'object' ? strategySettings : {};
    const fromSettings = Array.isArray(settings.strategies) && settings.strategies.length
        ? settings.strategies
        : (Array.isArray(settings.availableStrategies) ? settings.availableStrategies : null);
    const source = Array.isArray(fromSettings) && fromSettings.length
        ? fromSettings
        : (Array.isArray(strategies) ? strategies : []);
    const enabledIds = new Set(
        Array.isArray(settings.enabledStrategyIds) && settings.enabledStrategyIds.length
            ? settings.enabledStrategyIds
            : source.filter((s) => s && s.enabled !== false).map((s) => String(s.id || '').trim()),
    );
    const defaultId = String(
        settings.defaultStrategyId
        || defaultChapterStrategyIdForBookType()
        || 'chronological',
    ).trim();
    if (defaultId) enabledIds.add(defaultId);

    CHAPTER_STRATEGIES = source
        .filter((s) => s && enabledIds.has(String(s.id || '').trim()))
        .map((s) => ({
            id: String(s.id || '').trim(),
            name: String(s.name || s.id || '').trim(),
            description: String(s.description || '').trim(),
            chapters: Array.isArray(s.chapters) ? s.chapters.map((t) => String(t || '').trim()).filter(Boolean) : [],
            chapterPlan: Array.isArray(s.chapterPlan) ? s.chapterPlan.map((t) => String(t || '').trim()).filter(Boolean) : [],
        }))
        .filter((s) => s.id && s.chapters.length);

    // Ensure default strategy is present when available in the full source list.
    if (defaultId && !CHAPTER_STRATEGIES.some((s) => s.id === defaultId)) {
        const def = source.find((s) => String(s.id || '') === defaultId);
        if (def?.chapters?.length) {
            CHAPTER_STRATEGIES.unshift({
                id: defaultId,
                name: String(def.name || defaultId).trim(),
                description: String(def.description || '').trim(),
                chapters: def.chapters.map((t) => String(t || '').trim()).filter(Boolean),
                chapterPlan: Array.isArray(def.chapterPlan)
                    ? def.chapterPlan.map((t) => String(t || '').trim()).filter(Boolean)
                    : [],
            });
        }
    }
}

function applyGlobalAssignmentContent(payload = {}, canonicalChapterMap = null) {
    CHAPTER_QUESTIONS = payload.chapterQuestions && typeof payload.chapterQuestions === 'object'
        ? { ...payload.chapterQuestions }
        : {};
    ASSIGNMENTS = Array.isArray(payload.assignments) ? payload.assignments : [];
    ASSIGNMENT_CHAPTER_MAP = payload.chapterMap && typeof payload.chapterMap === 'object'
        ? { ...payload.chapterMap }
        : {};
    ASSIGNMENT_CHAPTER_TITLES = Array.isArray(payload.chapterTitles)
        ? payload.chapterTitles.map((t) => String(t || '').trim()).filter(Boolean)
        : [];
    migrateLegacyNoneChapterQuestionsInPlace(ASSIGNMENTS, ASSIGNMENT_CHAPTER_MAP, CHAPTER_QUESTIONS);
    const strategy = getActiveChapterStrategy();
    const chapterCount = strategyMaxChapterNumber(strategy);
    migrateLegacyAssignmentIndexChapterMapInPlace(
        ASSIGNMENTS,
        ASSIGNMENT_CHAPTER_MAP,
        chapterCount,
        canonicalChapterMap,
    );
    purgeOrphanQuestionBucketsInPlace(ASSIGNMENTS, CHAPTER_QUESTIONS);
}

export async function reloadGlobalAssignmentContent(opts = {}) {
    const globalContent = await fetchProjectCached(
        'global-assignment-content',
        () => api('GET', '/api/system/author/global-assignment-content').catch(() => ({})),
        opts,
    );
    // No assignments.json soft-fill — chapterMap stays as returned from RTDB/API.
    applyGlobalAssignmentContent(globalContent, null);
    return globalContent;
}

/** Apply boot payload from GET /api/system/author/boot. */
export async function applyBootStaticData(bootPayload = {}) {
    return bootPerfMeasure('applyBootStaticData', async () => {
        applyExperiencePayload(bootPayload.experience || null);
        applyBookWelcomeBootPayload(
            bootPayload.bookWelcome && typeof bootPayload.bookWelcome === 'object'
                ? bootPayload.bookWelcome
                : defaultBookWelcomeBootPayload(BASE),
        );
        applyGhostwriterSettingsPayload(bootPayload.ghostwriterSettings);
        const strategySettings = bootPayload.chapterStrategySettings || {};
        const hasCatalog = Array.isArray(strategySettings.strategies)
            || Array.isArray(strategySettings.availableStrategies);
        const fallbackStrategies = hasCatalog ? [] : await prefetchChapterStrategies();
        bootPerfSync('apply chapter strategies', () => {
            applyChapterStrategiesPayload(fallbackStrategies, strategySettings);
        }, 'static');
        bootPerfSync('apply global assignment content', () => {
            const globalContent = bootPayload.globalAssignmentContent || {};
            seedProjectCache('global-assignment-content', globalContent);
            applyGlobalAssignmentContent(globalContent, null);
        }, 'static');
        applySecondarySurfaceLabels();
        loadUserVoiceSettings().catch(() => {});
    }, 'static');
}

export async function loadStaticData() {
    const [globalContent, strategySettings] = await Promise.all([
        api('GET', '/api/system/author/global-assignment-content').catch(() => ({})),
        api('GET', '/api/system/author/chapter-strategy-settings').catch(() => ({ enabledStrategyIds: ['chronological'] })),
        loadGhostwriterSettings(),
    ]);
    const hasCatalog = Array.isArray(strategySettings?.strategies)
        || Array.isArray(strategySettings?.availableStrategies);
    const fallbackStrategies = hasCatalog ? [] : await prefetchChapterStrategies();
    seedProjectCache('global-assignment-content', globalContent);
    applyChapterStrategiesPayload(fallbackStrategies, strategySettings);
    applyGlobalAssignmentContent(globalContent, null);
    loadUserVoiceSettings().catch(() => {});
}

/** @deprecated Prefer isPetBookExperience from experience.js */
export function isPetsMemoirBookType(bookType = state.project?.bookType) {
    if (bookType != null && bookType !== state.project?.bookType) {
        return canonicalizeBookTypeOptionValue(bookType) === 'pets_memoir';
    }
    return isPetBookExperience(state.project);
}

/** @deprecated Prefer experienceDefaultChapterStrategyId from experience.js */
export function defaultChapterStrategyIdForBookType(bookType = state.project?.bookType) {
    if (bookType != null && bookType !== state.project?.bookType) {
        return isPetsMemoirBookType(bookType) ? PETS_LIFE_STRATEGY_ID : 'chronological';
    }
    return experienceDefaultChapterStrategyId(state.project);
}

export function getActiveChapterStrategy() {
    if (!Array.isArray(CHAPTER_STRATEGIES) || !CHAPTER_STRATEGIES.length) return null;
    const selectedId = String(state.project?.chapterStrategy || '').trim();
    const selected = CHAPTER_STRATEGIES.find((s) => s.id === selectedId);
    if (selected) return selected;
    const preferredId = defaultChapterStrategyIdForBookType();
    return CHAPTER_STRATEGIES.find((s) => s.id === preferredId) || CHAPTER_STRATEGIES[0] || null;
}

/** Chapter number for strategy.chapters[index] (0 = Introduction when present). */
export function strategyChapterNumberFromIndex(indexZeroBased) {
    return Math.max(0, Math.floor(Number(indexZeroBased)) || 0);
}

/** User-facing chapter title; legacy saved outlines may still say Preface. */
export function normalizeChapterDisplayTitle(title) {
    const t = String(title || '').trim();
    if (t.toLowerCase() === 'preface') return 'Introduction';
    return t;
}

/** Step 3 chapter picker label (e.g. Introduction, 1. Origins). */
export function formatStep3ChapterSelectLabel(chapterNum, title) {
    const n = Number(chapterNum);
    const t = normalizeChapterDisplayTitle(title);
    if (Number.isFinite(n) && n === 0) {
        return t && t !== 'Introduction' ? `Introduction — ${t}` : 'Introduction';
    }
    return `${n}. ${t}`;
}

/** Book chapter slots from a strategy ({ number, title }[], numbers start at 0). */
export function listStrategyChapterSlots(strategy = getActiveChapterStrategy()) {
    const chapters = Array.isArray(strategy?.chapters) ? strategy.chapters : [];
    // Fallback: assignmentConfig.chapterTitles when strategy chapters are missing (legacy banks).
    const bankTitles = Array.isArray(ASSIGNMENT_CHAPTER_TITLES) ? ASSIGNMENT_CHAPTER_TITLES : [];
    const titles = chapters.length ? chapters : bankTitles;
    return titles.map((title, idx) => ({
        number: strategyChapterNumberFromIndex(idx),
        title: normalizeChapterDisplayTitle(title),
    }));
}

/** Highest chapter number in the active strategy (e.g. 7 when chapters 0–7 exist). */
export function strategyMaxChapterNumber(strategy = getActiveChapterStrategy()) {
    const slots = listStrategyChapterSlots(strategy);
    return slots.length ? slots[slots.length - 1].number : 7;
}

/**
 * Assignment instructions for author UI (Gather chrome, Now, focus hints).
 * When an assignment row exists, its description wins — including intentional blanks.
 * Only use `fallback` when there is no assignment row.
 */
export function getAssignmentDescription(assignment, fallback = '') {
    if (assignment != null && typeof assignment === 'object') {
        return String(assignment.description ?? '').trim();
    }
    return String(fallback || '').trim();
}

/** First regular assignment in book-chapter order (Introduction / chapter 0 first when present). */
export function sortAssignmentsByChapterOrder(
    assignments = ASSIGNMENTS,
    chapterMap = ASSIGNMENT_CHAPTER_MAP,
    strategy = getActiveChapterStrategy(),
) {
    const list = (assignments || []).filter((a) => {
        if (Number(a.num) === 0) return false;
        if (String(a.kind || '').toLowerCase() === 'start_my_book') return false;
        if (isUnassignedAssignmentRow(a)) return false;
        return true;
    });
    const ordered = [];
    const seen = new Set();
    for (const slot of listStrategyChapterSlots(strategy)) {
        const inChapter = list
            .filter((a) => getAssignmentChapterNumber(a.num, chapterMap) === slot.number)
            .sort((a, b) => {
                const la = assignmentChapterSlotLabel(a, chapterMap, assignments) || '';
                const lb = assignmentChapterSlotLabel(b, chapterMap, assignments) || '';
                return la.localeCompare(lb, undefined, { numeric: true });
            });
        for (const a of inChapter) {
            const n = Number(a.num);
            if (seen.has(n)) continue;
            seen.add(n);
            ordered.push(a);
        }
    }
    for (const a of list.sort((x, y) => Number(x.num) - Number(y.num))) {
        const n = Number(a.num);
        if (!seen.has(n)) ordered.push(a);
    }
    return ordered;
}

export function firstAssignmentNumByChapterOrder(
    assignments = ASSIGNMENTS,
    chapterMap = ASSIGNMENT_CHAPTER_MAP,
    strategy = getActiveChapterStrategy(),
) {
    const sorted = sortAssignmentsByChapterOrder(assignments, chapterMap, strategy);
    return sorted.length ? Number(sorted[0].num) : 1;
}

/** Stored in chapterMap when an Assignment is not tied to a numbered chapter. */
export const WMB_NO_CHAPTER_MAP_VALUE = '__no_chapter__';
export const WMB_NO_CHAPTER_BANK_KEY = 'none';
/** My Assignments sidebar bucket for the protected Unassigned group (not a numbered chapter). */
export const WMB_UNASSIGNED_SIDEBAR_GROUP = '__unassigned_questions__';

export function isNoChapterMapValue(mappedValue) {
    const s = String(mappedValue ?? '').trim().toLowerCase();
    return s === WMB_NO_CHAPTER_MAP_VALUE || s === 'no chapter';
}

/** Key in CHAPTER_QUESTIONS / chapterQuestions RTDB for this assignment (always per assignment, never shared `none`). */
export function chapterQuestionsBucketKeyForAssignment(assignmentNum, _chapterMapOverride) {
    const n = Number(assignmentNum);
    return Number.isFinite(n) && n >= 0 ? String(n) : String(assignmentNum);
}

/**
 * Sidebar grouping key (Step 2): multiple no-chapter assignments share one visual bucket.
 * Do not use for question storage — use chapterQuestionsBucketKeyForAssignment.
 */
export function assignmentStep2SidebarGroupKey(assignment, chapterMap = ASSIGNMENT_CHAPTER_MAP) {
    if (isUnassignedAssignmentRow(assignment)) return WMB_UNASSIGNED_SIDEBAR_GROUP;
    const mapped = chapterMap?.[String(assignment.num)] ?? chapterMap?.[assignment.num];
    if (isNoChapterMapValue(mapped)) return WMB_NO_CHAPTER_BANK_KEY;
    const chapterNum = resolveMappedChapterNumber(mapped, assignment.num);
    if (chapterNum === null || chapterNum === undefined) return String(assignment.num);
    return String(chapterNum);
}

export function resolveMappedChapterNumber(mappedValue, _assignmentNum) {
    if (isNoChapterMapValue(mappedValue)) return null;
    if (mappedValue === 0 || mappedValue === '0') return 0;
    const asNum = Number(mappedValue);
    if (Number.isFinite(asNum) && asNum >= 0) return asNum;

    const mappedTitle = String(mappedValue || '').trim();
    if (!mappedTitle) return null;
    const mappedLower = mappedTitle.toLowerCase();
    if (mappedLower === 'preface' || mappedLower === 'introduction') return 0;

    const strategy = getActiveChapterStrategy();
    const chapters = Array.isArray(strategy?.chapters) ? strategy.chapters : [];
    const idx = chapters.findIndex((title) => String(title || '').trim().toLowerCase() === mappedLower);
    if (idx >= 0) return strategyChapterNumberFromIndex(idx);
    return null;
}

/**
 * Legacy chapterMap used assignment num as “chapter” (1→1 … 12→12). Remap using bundled chapterMap
 * from assignments.json (passed as canonicalChapterMap).
 * Returns true when any entry was updated.
 */
export function migrateLegacyAssignmentIndexChapterMapInPlace(assignments, chapterMap, bookChapterCount = 7, canonicalChapterMap = null) {
    const canonMap = canonicalChapterMap && typeof canonicalChapterMap === 'object' ? canonicalChapterMap : {};
    if (!chapterMap || typeof chapterMap !== 'object') return false;
    const list = Array.isArray(assignments) ? assignments : [];
    if (!list.length) return false;
    const maxCh = Math.max(1, Math.floor(Number(bookChapterCount)) || 0);
    let selfRefCount = 0;
    for (const a of list) {
        const k = String(a.num);
        const raw = chapterMap[k] ?? chapterMap[a.num];
        if (isNoChapterMapValue(raw)) continue;
        const n = Number(a.num);
        const asNum = Number(raw);
        if (Number.isFinite(asNum) && asNum === n) selfRefCount += 1;
    }
    const mostlySelfRef = selfRefCount >= Math.max(3, Math.floor(list.length * 0.6));
    let changed = false;
    for (const a of list) {
        const k = String(a.num);
        const n = Number(a.num);
        if (!Number.isFinite(n) || n < 1) continue;
        const raw = chapterMap[k] ?? chapterMap[n];
        if (isNoChapterMapValue(raw)) continue;
        const asNum = Number(raw);
        const canonRaw = canonMap[k] ?? canonMap[n];
        const canon = Number(canonRaw);
        const needsFix = Number.isFinite(canon) && Number.isFinite(asNum) && asNum === n && (mostlySelfRef || n > maxCh);
        if (!needsFix) continue;
        if (chapterMap[k] !== canon) {
            chapterMap[k] = canon;
            changed = true;
        }
    }
    return changed;
}

export function getAssignmentChapterNumber(assignmentNum, chapterMap = ASSIGNMENT_CHAPTER_MAP) {
    const mapped = chapterMap?.[String(assignmentNum)] ?? chapterMap?.[assignmentNum];
    return resolveMappedChapterNumber(mapped, assignmentNum);
}

function isRegularAssignmentRow(a) {
    if (!a) return false;
    if (Number(a.num) === 0) return false;
    if (String(a.kind || '').toLowerCase() === 'start_my_book') return false;
    if (isUnassignedAssignmentRow(a)) return false;
    return true;
}

/**
 * Book-chapter prefix for question labels (first segment of chapter#.question#).
 * Unassigned → U; no chapter map → N.
 */
export function assignmentQuestionNumberPrefix(assignment, chapterMap = ASSIGNMENT_CHAPTER_MAP) {
    if (isUnassignedAssignmentRow(assignment)) return 'U';
    const mapped = chapterMap?.[String(assignment.num)] ?? chapterMap?.[assignment.num];
    if (isNoChapterMapValue(mapped)) return 'N';
    const chapterNum = resolveMappedChapterNumber(mapped, assignment.num);
    if (chapterNum === null || chapterNum === undefined) return 'N';
    return String(chapterNum);
}

/** Display assignment index from label (e.g. "Assignment 2" → 2), else storage num. */
export function assignmentDisplayNumberFromLabel(assignment) {
    const label = String(assignment?.label || '').trim();
    const m = label.match(/^Assignment\s+(\d+)\s*$/i);
    if (m) return Number(m[1]);
    const num = Number(assignment?.num);
    return Number.isFinite(num) ? num : 0;
}

/**
 * Display label for one assignment question. A catalog `displayLabel` wins;
 * otherwise derive `{assignment}.{chapter}.{question}` (e.g. 2.1.1).
 */
export function formatChapterAssignmentQuestionNumber(
    assignment,
    questionIndexZeroBased,
    chapterMap = ASSIGNMENT_CHAPTER_MAP,
    assignments = ASSIGNMENTS,
    chapterQuestions = CHAPTER_QUESTIONS,
) {
    void assignments;
    const q = Math.max(1, Math.floor(Number(questionIndexZeroBased)) + 1);
    const bankKey = chapterQuestionsBucketKeyForAssignment(assignment?.num);
    const question = Array.isArray(chapterQuestions?.[bankKey])
        ? chapterQuestions[bankKey][q - 1]
        : null;
    const customLabel = String(question?.displayLabel || '').replace(/\s+/g, ' ').trim();
    if (customLabel) return customLabel;
    if (isUnassignedAssignmentRow(assignment)) {
        return `U.${q}`;
    }
    const assignNum = assignmentDisplayNumberFromLabel(assignment);
    const mapped = chapterMap?.[String(assignment.num)] ?? chapterMap?.[assignment.num];
    if (isNoChapterMapValue(mapped)) {
        return `N.${assignNum}.${q}`;
    }
    const chapterNum = resolveMappedChapterNumber(mapped, assignment.num);
    if (chapterNum === null || chapterNum === undefined) {
        return `${assignNum}.?.${q}`;
    }
    return `${assignNum}.${chapterNum}.${q}`;
}

/** Assignment slot label when rendering inside a known book-chapter section. */
export function assignmentSlotLabelInSection(sectionChapterNum, slotIndexZeroBased) {
    const ch = Math.max(0, Math.floor(Number(sectionChapterNum)) || 0);
    const idx = Math.max(0, Math.floor(Number(slotIndexZeroBased)) || 0);
    const slotPart = ch === 0 ? idx : idx + 1;
    return `${ch}.${slotPart}`;
}

/** Question number range for one assignment slot, e.g. 3.2.1–3.2.5 (Introduction: 0.0.1–0.0.2). */
export function formatQuestionRangeForSectionSlot(sectionChapterNum, slotIndexZeroBased, questionCount) {
    const ch = Math.max(0, Math.floor(Number(sectionChapterNum)) || 0);
    const slot = ch === 0
        ? Math.max(0, Math.floor(Number(slotIndexZeroBased)) || 0)
        : Math.max(1, Math.floor(Number(slotIndexZeroBased)) + 1);
    const n = Math.floor(Number(questionCount)) || 0;
    if (n <= 0) return '';
    if (n === 1) return `${ch}.${slot}.1`;
    return `${ch}.${slot}.1\u2013${ch}.${slot}.${n}`;
}

/** Assignment slot within its book chapter: `{chapter}.{assignIndex}` e.g. 1.2 = ch.1, 2nd assignment. Introduction uses 0-based slots: 0.0, 0.1, 0.2. */
export function assignmentChapterSlotLabel(assignment, chapterMap = ASSIGNMENT_CHAPTER_MAP, assignments = ASSIGNMENTS) {
    if (!isRegularAssignmentRow(assignment)) return '';
    const mapped = chapterMap?.[String(assignment.num)] ?? chapterMap?.[assignment.num];
    if (isNoChapterMapValue(mapped)) return '';
    const chapterNum = resolveMappedChapterNumber(mapped, assignment.num);
    if (chapterNum === null || chapterNum === undefined) return '';
    const groupKey = String(chapterNum);
    const inChapter = (assignments || []).filter((a) => {
        if (!isRegularAssignmentRow(a)) return false;
        return assignmentStep2SidebarGroupKey(a, chapterMap) === groupKey;
    }).sort((a, b) => Number(a.num) - Number(b.num));
    const idx = inChapter.findIndex((a) => Number(a.num) === Number(assignment.num));
    if (idx < 0) return `${chapterNum}.${chapterNum === 0 ? 0 : 1}`;
    const slotPart = chapterNum === 0 ? idx : idx + 1;
    return `${chapterNum}.${slotPart}`;
}

/** Human chapter name for Step 2 assignment dropdown suffix (e.g. Introduction, Chapter 2 — Origins). */
export function bookChapterSuffixForAssignment(chapterNum, strategy, outlineChapters) {
    if (chapterNum === null || chapterNum === undefined) return '';
    const n = Number(chapterNum);
    if (!Number.isFinite(n) || n < 0) return '';
    const slots = listStrategyChapterSlots(strategy);
    const slot = slots.find((s) => s.number === n);
    const outlineCh = (Array.isArray(outlineChapters) ? outlineChapters : [])
        .find((c) => Number(c.number) === n);
    const title = normalizeChapterDisplayTitle(outlineCh?.title || slot?.title || '');
    if (n === 0) {
        return title && title !== 'Introduction' ? `Introduction — ${title}` : 'Introduction';
    }
    const base = `Chapter ${n}`;
    return title ? `${base} — ${title}` : base;
}

/**
 * Shorten common words so more fits in narrow select dropdowns.
 * Author UI shows Interview N (domain catalog may still say Assignment N).
 * @param {string} text
 * @param {{ omitAssignmentWord?: boolean }} [opts]
 *   When true (phone picker under an "Interview" field label), drop leading
 *   Interview/Assignment/Asgn instead of rewriting to Interview.
 */
export function compactDropdownLabel(text, { omitAssignmentWord = false } = {}) {
    let out = String(text || '');
    if (omitAssignmentWord) {
        out = out.replace(/^\s*(Interview|Assignment|Asgn)\b\s*/i, '');
    } else {
        out = out.replace(/\bAssignment\b/gi, 'Interview');
        out = out.replace(/\bAsgn\b/gi, 'Interview');
    }
    return out
        .replace(/\bChapter\b/gi, 'Ch')
        .replace(/\bQuestions?\b/gi, 'Q');
}

/**
 * Gather "Ideas to explore" chip — Assignment Editor label only.
 * No Interview N synthesis, no Assignment→Interview rewrite, no chapter suffix.
 * @param {{ label?: string } | null | undefined} assignment
 * @returns {string}
 */
export function formatGatherSuggestionLabel(assignment) {
    return String(assignment?.label || '').trim();
}

/** Step 2 picker label: `Interview 3 - Ch 2 — Origins` (or `3 - …` when omitAssignmentWord). */
export function formatStep2AssignmentSelectLabel(assignment, {
    chapterMap = ASSIGNMENT_CHAPTER_MAP,
    assignments = ASSIGNMENTS,
    strategy = getActiveChapterStrategy(),
    outlineChapters = [],
    omitAssignmentWord = false,
} = {}) {
    const compactOpts = { omitAssignmentWord };
    const base = String(assignment?.label || '').trim()
        || `Interview ${assignmentChapterSlotLabel(assignment, chapterMap, assignments) || assignment?.num}`;

    if (isUnassignedAssignmentRow(assignment)) return compactDropdownLabel(base, compactOpts);

    const mapped = chapterMap?.[String(assignment.num)] ?? chapterMap?.[assignment.num];
    if (isNoChapterMapValue(mapped)) return compactDropdownLabel(`${base} - No chapter`, compactOpts);

    const chapterNum = getAssignmentChapterNumber(assignment.num, chapterMap);
    const chapterPart = bookChapterSuffixForAssignment(chapterNum, strategy, outlineChapters);
    if (!chapterPart) return compactDropdownLabel(base, compactOpts);
    return compactDropdownLabel(`${base} - ${chapterPart}`, compactOpts);
}

/** Compact range for question labels under one assignment, e.g. "3.2.1–3.2.5". */
export function formatChapterAssignmentQuestionRange(
    assignment,
    questionCount,
    chapterMap = ASSIGNMENT_CHAPTER_MAP,
    assignments = ASSIGNMENTS,
    chapterQuestions = CHAPTER_QUESTIONS,
) {
    const n = Math.floor(Number(questionCount)) || 0;
    if (n <= 0) return '';
    const first = formatChapterAssignmentQuestionNumber(assignment, 0, chapterMap, assignments, chapterQuestions);
    if (n === 1) return first;
    const last = formatChapterAssignmentQuestionNumber(assignment, n - 1, chapterMap, assignments, chapterQuestions);
    return `${first}\u2013${last}`;
}

/** Question groups not mapped to a book chapter (admin “Unassigned” bucket). */
export function isUnassignedAssignmentRow(a) {
    if (!a) return false;
    if (String(a.kind || '').toLowerCase() === 'unassigned') return true;
    const lab = String(a.label || '').trim().toLowerCase();
    return lab === 'unassigned' || /^unassigned(\s|$)/.test(lab);
}

function coerceChapterQuestionItemsToArray(items) {
    if (Array.isArray(items)) return items;
    if (items && typeof items === 'object') {
        const keys = Object.keys(items).filter((k) => /^\d+$/.test(k));
        if (keys.length) return keys.sort((a, b) => Number(a) - Number(b)).map((k) => items[k]);
    }
    return [];
}

function coerceChapterQuestionsBankInPlace(bank) {
    if (!bank || typeof bank !== 'object') return;
    for (const k of Object.keys(bank)) {
        bank[k] = coerceChapterQuestionItemsToArray(bank[k]);
    }
}

/** Move legacy pooled `none` bank into the first empty per-assignment bucket for no-chapter rows. */
export function migrateLegacyNoneChapterQuestionsInPlace(assignments, chapterMap, chapterQuestions) {
    if (!chapterQuestions || typeof chapterQuestions !== 'object') return;
    coerceChapterQuestionsBankInPlace(chapterQuestions);
    const legacy = chapterQuestions[WMB_NO_CHAPTER_BANK_KEY];
    if (!Array.isArray(legacy) || !legacy.length) return;
    const targets = (Array.isArray(assignments) ? assignments : []).filter((a) => {
        if (!a || isUnassignedAssignmentRow(a)) return false;
        if (String(a.kind || '').toLowerCase() === 'start_my_book' || Number(a.num) === 0) return false;
        const m = chapterMap?.[String(a.num)] ?? chapterMap?.[a.num];
        return isNoChapterMapValue(m);
    }).sort((x, y) => Number(x.num) - Number(y.num));
    for (const t of targets) {
        const k = String(t.num);
        if (!Array.isArray(chapterQuestions[k])) chapterQuestions[k] = [];
        if (chapterQuestions[k].length === 0) {
            chapterQuestions[k] = legacy.slice();
            chapterQuestions[WMB_NO_CHAPTER_BANK_KEY] = [];
            return;
        }
    }
    const leftover = chapterQuestions[WMB_NO_CHAPTER_BANK_KEY];
    if (Array.isArray(leftover) && leftover.length) {
        chapterQuestions[WMB_NO_CHAPTER_BANK_KEY] = [];
    }
}

/** RTDB keys that are not any assignment’s bucket → removed (no Unassigned catch-all). */
export function purgeOrphanQuestionBucketsInPlace(assignments, chapterQuestions) {
    if (!chapterQuestions || typeof chapterQuestions !== 'object') return;
    coerceChapterQuestionsBankInPlace(chapterQuestions);
    const list = Array.isArray(assignments) ? assignments : [];
    const valid = new Set(list.map((a) => chapterQuestionsBucketKeyForAssignment(a.num)));
    for (const k of Object.keys(chapterQuestions)) {
        if (valid.has(k)) continue;
        delete chapterQuestions[k];
    }
}

/** Resolve chapter bucket number for a global assignment-question id (legacy `chN_qNN` or current bank). */
export function chapterNumberForChapterBankQuestionId(qid) {
    const id = String(qid || '').trim();
    if (!id) return null;
    const legacy = id.match(/^ch(\d+)_q/i);
    if (legacy) {
        const n = Number(legacy[1] || 0);
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    const bank = CHAPTER_QUESTIONS || {};
    for (const [numKey, items] of Object.entries(bank)) {
        if (String(numKey).toLowerCase() === WMB_NO_CHAPTER_BANK_KEY) {
            if ((Array.isArray(items) ? items : []).some((q) => String(q?.id || '') === id)) return null;
            continue;
        }
        const chNum = Number(numKey);
        if (!Number.isFinite(chNum) || chNum < 0) continue;
        if ((Array.isArray(items) ? items : []).some((q) => String(q?.id || '') === id)) return chNum;
    }
    return null;
}

/** Compact UUID (32 hex, no dashes) for new assignment-bank questions — no semantic meaning. */
export function newOpaqueQuestionId() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID().replace(/-/g, '');
        }
    } catch (_) {}
    try {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {
        return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }
}

export function findAssignmentNumberForChapter(chapterNum) {
    const target = Number(chapterNum);
    if (!Number.isFinite(target) || target < 0) return null;
    const assignment = (ASSIGNMENTS || []).find((a) => Number(getAssignmentChapterNumber(a.num)) === target);
    return assignment ? Number(assignment.num) : null;
}

export function getAssignmentQuestionText(item) {
    return String(item?.text || item?.question || '').trim();
}
