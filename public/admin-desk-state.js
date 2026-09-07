'use strict';

/**
 * Minimal Admin-local state — does not import Career Author SPA modules.
 * Owns only the fields that admin-desk-host.js actually needs.
 */
export const adminDeskState = {
    /** Currently active project in the Admin Desk context. */
    project: null,
    /** Admin role marker. */
    role: null,
    /** Firebase user object when signed in via browser auth. */
    user: null,
    /** True on localhost OTP-free entry. */
    _devMode: false,
    /** Dev-mode project id from query param or stored session. */
    _devProjectId: '',
    /** True when opened via admin HMAC token (Open as Author flow). */
    _adminPreviewMode: false,
    /** Admin HMAC or Firebase token used for API calls in preview mode. */
    _adminToken: null,
    /** Library selected state (always null in admin host; kept for panel compat). */
    librarySelected: null,
    /** Cached discovery config for the current project. */
    discoveryConfig: null,
    /** Start My Book intro questions (populated from boot data). */
    alignIntroQuestions: [],
    /** All Start My Book questions (populated from boot data). */
    alignQuestions: [],
    /** Chapter drafts cache for the current project. */
    savedChapters: [],
    /** Assignment rows from content bank (populated from boot data). */
    assignments: [],
    /** Chapter questions map from content bank (populated from boot data). */
    chapterQuestions: {},
    /** Assignment → chapter number map (populated from boot data). */
    chapterMap: {},
};
