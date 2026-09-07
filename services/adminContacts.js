'use strict';

const { rtdbGet } = require('../models/firebase');
const { getUserAccess, isAdminLevelRole } = require('./userAccess');
const {
    ADMIN_PLATFORM_USERS_PATH,
    ADMIN_PLATFORM_LEGACY_EMAILS_PATH,
    ADMIN_PLATFORM_LEGACY_PHONES_PATH,
} = require('./platformDatastorePaths');

const CACHE_TTL_MS = 30 * 1000;

let cached = null;
let cachedAt = 0;

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
    return String(value || '').replace(/\D/g, '').trim();
}

function fromEnv() {
    return {
        users: {},
        uids: [],
        emails: (process.env.ADMIN_EMAILS || '')
            .split(',')
            .map(normalizeEmail)
            .filter(Boolean),
        phones: (process.env.ADMIN_PHONES || '')
            .split(',')
            .map(normalizePhone)
            .filter(Boolean),
    };
}

function normalizeContacts(raw) {
    if (!raw || typeof raw !== 'object') return fromEnv();

    const usersRaw = raw.users && typeof raw.users === 'object' ? raw.users : {};
    const users = {};
    const uids = [];
    const emails = [];
    const phones = [];

    for (const [uid, user] of Object.entries(usersRaw)) {
        const key = String(uid || '').trim();
        if (!key) continue;
        const record = (user && typeof user === 'object') ? user : {};
        const email = normalizeEmail(record.email || '');
        const phone = normalizePhone(record.phone || '');
        users[key] = {
            firstName: String(record.firstName || '').trim(),
            lastName: String(record.lastName || '').trim(),
            email,
            phone,
            role: String(record.role || 'admin').trim().toLowerCase() || 'admin',
        };
        uids.push(key);
        if (email) emails.push(email);
        if (phone) phones.push(phone);
    }

    const env = fromEnv();

    // Backward compatibility for legacy format while migration completes.
    const legacyEmails = Array.isArray(raw.emails) ? raw.emails.map(normalizeEmail).filter(Boolean) : [];
    const legacyPhones = Array.isArray(raw.phones) ? raw.phones.map(normalizePhone).filter(Boolean) : [];

    return {
        users,
        uids,
        // Always merge env allowlist so emergency/admin access remains intact
        // even when Firebase contacts are incomplete.
        emails: [...emails, ...legacyEmails, ...env.emails].filter((v, idx, arr) => arr.indexOf(v) === idx),
        phones: [...phones, ...legacyPhones, ...env.phones].filter((v, idx, arr) => arr.indexOf(v) === idx),
    };
}

async function loadAdminContactsFromFirebase() {
    const [usersRaw, legacyEmails, legacyPhones] = await Promise.all([
        rtdbGet(ADMIN_PLATFORM_USERS_PATH),
        rtdbGet(ADMIN_PLATFORM_LEGACY_EMAILS_PATH),
        rtdbGet(ADMIN_PLATFORM_LEGACY_PHONES_PATH),
    ]);
    return normalizeContacts({
        users: usersRaw || {},
        emails: legacyEmails,
        phones: legacyPhones,
    });
}

async function getAdminContacts() {
    const now = Date.now();
    if (cached && (now - cachedAt) < CACHE_TTL_MS) return cached;

    try {
        const contacts = await loadAdminContactsFromFirebase();
        const hasFirebaseContacts = contacts.uids.length > 0 || contacts.emails.length > 0 || contacts.phones.length > 0;
        cached = hasFirebaseContacts ? contacts : fromEnv();
        cachedAt = now;
        return cached;
    } catch (_) {
        cached = fromEnv();
        cachedAt = now;
        return cached;
    }
}

async function isAdminContact({ uid = '' } = {}) {
    const uidKey = String(uid || '').trim();
    if (!uidKey) return false;
    const access = await getUserAccess(uidKey);
    return isAdminLevelRole(access?.role);
}

function clearAdminContactsCache() {
    cached = null;
    cachedAt = 0;
}

module.exports = {
    ADMIN_PLATFORM_USERS_PATH,
    normalizeEmail,
    normalizePhone,
    getAdminContacts,
    isAdminContact,
    clearAdminContactsCache,
};
