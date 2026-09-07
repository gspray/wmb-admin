'use strict';

const { rtdbGet, rtdbUpdate } = require('../models/firebase');
const {
    ADMIN_PLATFORM_PRESENCE_PATH,
    ADMIN_PLATFORM_USERS_PATH,
} = require('./platformDatastorePaths');

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MIN_TOUCH_INTERVAL_MS = 45 * 1000;

const lastTouchByUid = new Map();

function presenceKey(uid) {
    return String(uid || '').trim().replace(/[.#$[\]/]/g, '_');
}

function shouldTrackUid(uid) {
    const key = String(uid || '').trim();
    return Boolean(key && key !== 'admin' && key !== 'dev');
}

function composeDisplayName({ firstName = '', lastName = '', displayName = '', name = '', email = '' } = {}) {
    const full = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
    return full
        || String(displayName || '').trim()
        || String(name || '').trim()
        || String(email || '').trim();
}

async function readAdminUsersMetaMap() {
    try {
        const raw = await rtdbGet(ADMIN_PLATFORM_USERS_PATH);
        return raw && typeof raw === 'object' ? raw : {};
    } catch (_) {
        return {};
    }
}

/**
 * Record activity for an authenticated user. Throttled per uid in-process.
 */
async function touchPresence(uid, { email, name, surface } = {}) {
    if (!shouldTrackUid(uid)) return;

    const key = presenceKey(uid);
    const now = Date.now();
    const last = lastTouchByUid.get(key) || 0;
    if (now - last < MIN_TOUCH_INTERVAL_MS) return;
    lastTouchByUid.set(key, now);

    const patch = {
        uid: String(uid || '').trim(),
        lastSeenAt: new Date(now).toISOString(),
    };
    const emailNorm = String(email || '').trim().toLowerCase();
    const nameNorm = String(name || '').trim();
    const surfaceNorm = String(surface || '').trim();
    if (emailNorm) patch.email = emailNorm;
    if (nameNorm) patch.name = nameNorm;
    if (surfaceNorm) patch.surface = surfaceNorm;

    await rtdbUpdate(`${ADMIN_PLATFORM_PRESENCE_PATH}/${key}`, patch);
}

async function listOnlineUsers({ ttlMs = DEFAULT_TTL_MS } = {}) {
    const [raw, metaMap] = await Promise.all([
        rtdbGet(ADMIN_PLATFORM_PRESENCE_PATH),
        readAdminUsersMetaMap(),
    ]);
    if (!raw || typeof raw !== 'object') return [];

    const cutoff = Date.now() - ttlMs;
    const users = [];

    for (const entry of Object.values(raw)) {
        if (!entry || typeof entry !== 'object') continue;
        const lastSeen = Date.parse(String(entry.lastSeenAt || ''));
        if (!Number.isFinite(lastSeen) || lastSeen < cutoff) continue;

        const uid = String(entry.uid || '').trim();
        const meta = metaMap[uid] || {};
        const displayName = composeDisplayName({
            firstName: meta.firstName,
            lastName: meta.lastName,
            displayName: meta.displayName,
            name: entry.name,
            email: meta.email || entry.email,
        });

        users.push({
            uid,
            email: String(meta.email || entry.email || '').trim().toLowerCase() || null,
            name: String(entry.name || '').trim() || null,
            displayName: displayName || uid || 'Unknown',
            surface: String(entry.surface || '').trim() || null,
            lastSeenAt: entry.lastSeenAt,
        });
    }

    users.sort((a, b) => {
        const ta = Date.parse(a.lastSeenAt) || 0;
        const tb = Date.parse(b.lastSeenAt) || 0;
        return tb - ta;
    });

    return users;
}

function inferSurfaceFromRequest(req) {
    const path = String(req.originalUrl || req.url || req.path || '');
    if (/\/api\/author(?:\/|$)/.test(path)) return 'author';
    if (/\/api\/system(?:\/|$)/.test(path)) return 'system';
    if (/\/api\/projects(?:\/|$)/.test(path)) return 'admin';
    return null;
}

module.exports = {
    touchPresence,
    listOnlineUsers,
    inferSurfaceFromRequest,
    shouldTrackUid,
    composeDisplayName,
    DEFAULT_TTL_MS,
};
