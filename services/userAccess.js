'use strict';

const { rtdbGet } = require('../models/firebase');
const { normalizeProductId } = require('./productIds');
const { ADMIN_PLATFORM_USERS_PATH } = require('./platformDatastorePaths');

const ACCESS_ROLES = new Set(['author', 'admin', 'system']);
const ADMIN_LEVEL_ROLES = new Set(['admin', 'system']);

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeAdminProductIds(value) {
    if (!Array.isArray(value)) return null;
    return Array.from(new Set(value
        .map((productId) => normalizeProductId(productId))
        .filter(Boolean)));
}

function normalizeRole(value) {
    const role = String(value || '').trim().toLowerCase();
    return ACCESS_ROLES.has(role) ? role : '';
}

function isAdminLevelRole(value) {
    const role = String(value || '').trim().toLowerCase();
    return ADMIN_LEVEL_ROLES.has(role);
}

function isDevelopmentIdentity(uid) {
    return String(uid || '') === 'dev' && process.env.NODE_ENV !== 'production';
}

function isAdminPreviewIdentity(uid) {
    return String(uid || '') === 'admin';
}

async function getUserAccess(uid) {
    const key = String(uid || '').trim();
    if (!key) return null;
    if (isAdminPreviewIdentity(key)) {
        return { uid: key, role: 'admin', source: 'admin-preview' };
    }
    if (isDevelopmentIdentity(key)) {
        return { uid: key, role: 'admin', source: 'local-development' };
    }

    const record = await rtdbGet(`${ADMIN_PLATFORM_USERS_PATH}/${key}`);
    if (!record || typeof record !== 'object') return null;
    const role = normalizeRole(record.role);
    if (!role) return null;
    return {
        uid: key,
        role,
        adminProductIds: normalizeAdminProductIds(record.adminProductIds),
        email: normalizeEmail(record.email),
        phone: String(record.phone || '').replace(/\D/g, ''),
        firstName: String(record.firstName || '').trim(),
        lastName: String(record.lastName || '').trim(),
        source: 'rtdb',
    };
}

module.exports = {
    ACCESS_ROLES,
    ADMIN_LEVEL_ROLES,
    USERS_PATH: ADMIN_PLATFORM_USERS_PATH,
    getUserAccess,
    isAdminLevelRole,
    normalizeAdminProductIds,
    normalizeEmail,
    normalizeRole,
};
