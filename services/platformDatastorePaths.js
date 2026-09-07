'use strict';

/**
 * RTDB paths the standalone Admin app may touch directly.
 * Product project records mutate only through product provider HTTP APIs.
 */

const ADMIN_PLATFORM_ROOT = '_wmbServer';

const ADMIN_PLATFORM_USERS_PATH = `${ADMIN_PLATFORM_ROOT}/users`;
const ADMIN_PLATFORM_LEGACY_EMAILS_PATH = `${ADMIN_PLATFORM_ROOT}/emails`;
const ADMIN_PLATFORM_LEGACY_PHONES_PATH = `${ADMIN_PLATFORM_ROOT}/phones`;
const ADMIN_PLATFORM_PRESENCE_PATH = `${ADMIN_PLATFORM_ROOT}/presence`;

const ADMIN_PLATFORM_READ_PREFIXES = [
    ADMIN_PLATFORM_USERS_PATH,
    ADMIN_PLATFORM_LEGACY_EMAILS_PATH,
    ADMIN_PLATFORM_LEGACY_PHONES_PATH,
    ADMIN_PLATFORM_PRESENCE_PATH,
];

const ADMIN_PLATFORM_WRITE_PREFIXES = [
    ADMIN_PLATFORM_PRESENCE_PATH,
];

const FORBIDDEN_ADMIN_DIRECT_PREFIXES = [
    'projects',
    'project_index',
    `${ADMIN_PLATFORM_ROOT}/content`,
    `${ADMIN_PLATFORM_ROOT}/content_revisions`,
    `${ADMIN_PLATFORM_ROOT}/settings`,
    `${ADMIN_PLATFORM_ROOT}/jobs`,
    `${ADMIN_PLATFORM_ROOT}/securityAudit`,
];

function normalizeRefPath(refPath) {
    return String(refPath || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

function pathMatchesPrefix(refPath, prefix) {
    const normalized = normalizeRefPath(refPath);
    const base = normalizeRefPath(prefix);
    return normalized === base || normalized.startsWith(`${base}/`);
}

function hitsForbiddenPrefix(refPath) {
    return FORBIDDEN_ADMIN_DIRECT_PREFIXES.some((prefix) => pathMatchesPrefix(refPath, prefix));
}

function isAllowedReadPath(refPath) {
    return ADMIN_PLATFORM_READ_PREFIXES.some((prefix) => pathMatchesPrefix(refPath, prefix));
}

function isAllowedWritePath(refPath) {
    return ADMIN_PLATFORM_WRITE_PREFIXES.some((prefix) => pathMatchesPrefix(refPath, prefix));
}

function assertAdminPlatformReadPath(refPath) {
    const normalized = normalizeRefPath(refPath);
    if (!normalized) {
        throw new Error('[platform-datastore] Admin read path is required');
    }
    if (hitsForbiddenPrefix(normalized)) {
        throw new Error(`[platform-datastore] Admin must not read forbidden path: ${normalized}`);
    }
    if (!isAllowedReadPath(normalized)) {
        throw new Error(`[platform-datastore] Admin read outside platform allowlist: ${normalized}`);
    }
}

function assertAdminPlatformWritePath(refPath) {
    const normalized = normalizeRefPath(refPath);
    if (!normalized) {
        throw new Error('[platform-datastore] Admin write path is required');
    }
    if (hitsForbiddenPrefix(normalized)) {
        throw new Error(`[platform-datastore] Admin must not write forbidden path: ${normalized}`);
    }
    if (!isAllowedWritePath(normalized)) {
        throw new Error(`[platform-datastore] Admin write outside platform allowlist: ${normalized}`);
    }
}

module.exports = {
    ADMIN_PLATFORM_ROOT,
    ADMIN_PLATFORM_USERS_PATH,
    ADMIN_PLATFORM_LEGACY_EMAILS_PATH,
    ADMIN_PLATFORM_LEGACY_PHONES_PATH,
    ADMIN_PLATFORM_PRESENCE_PATH,
    ADMIN_PLATFORM_READ_PREFIXES,
    ADMIN_PLATFORM_WRITE_PREFIXES,
    FORBIDDEN_ADMIN_DIRECT_PREFIXES,
    normalizeRefPath,
    assertAdminPlatformReadPath,
    assertAdminPlatformWritePath,
};
