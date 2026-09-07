'use strict';

const crypto = require('crypto');

/** Dev-only fallback when ADMIN_TOKEN_SECRET is unset (never used in production). */
const DEV_FALLBACK_SECRET = 'wmb-fallback-dev-secret-2024';

const DEFAULT_TTL_HOURS = 24;
const CLOCK_SKEW_MS = 60 * 1000;

/**
 * HMAC secret for WMB admin preview tokens (base64(payload).hexSig).
 * Production requires ADMIN_TOKEN_SECRET; development may use the dev fallback.
 */
function getAdminTokenSecret() {
    const secret = String(process.env.ADMIN_TOKEN_SECRET || '').trim();
    if (secret) return secret;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('ADMIN_TOKEN_SECRET is required in production');
    }
    return DEV_FALLBACK_SECRET;
}

function getAdminTokenTtlMs() {
    const raw = String(process.env.ADMIN_TOKEN_TTL_HOURS || '').trim();
    const hours = raw ? parseFloat(raw) : DEFAULT_TTL_HOURS;
    if (!Number.isFinite(hours) || hours <= 0) {
        return DEFAULT_TTL_HOURS * 60 * 60 * 1000;
    }
    return hours * 60 * 60 * 1000;
}

/**
 * Payload: admin:<issuedAtMs> or admin:<issuedAtMs>:<expiresAtMs>
 */
function parseAdminPayload(payload) {
    if (!payload.startsWith('admin:')) return null;
    const rest = payload.slice('admin:'.length);
    const segments = rest.split(':').filter((s) => s.length > 0);
    if (!segments.length) return null;

    const issuedAt = Number(segments[0]);
    if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;

    let expiresAt;
    if (segments.length >= 2) {
        expiresAt = Number(segments[1]);
        if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null;
    } else {
        expiresAt = issuedAt + getAdminTokenTtlMs();
    }

    return { issuedAt, expiresAt };
}

function isAdminPayloadWithinLifetime({ issuedAt, expiresAt }) {
    const now = Date.now();
    if (issuedAt > now + CLOCK_SKEW_MS) return false;
    if (now > expiresAt) return false;
    return true;
}

function signAdminPayload(payload) {
    const sig = crypto.createHmac('sha256', getAdminTokenSecret()).update(payload).digest('hex');
    return `${Buffer.from(payload, 'utf8').toString('base64')}.${sig}`;
}

/** Issue a new admin HMAC token (dev login / preview handoff). */
function createAdminHmacToken() {
    const issuedAt = Date.now();
    const expiresAt = issuedAt + getAdminTokenTtlMs();
    return signAdminPayload(`admin:${issuedAt}:${expiresAt}`);
}

/**
 * Verify a two-part admin HMAC token. Returns decoded auth fields or null.
 */
function verifyAdminHmacToken(token) {
    const raw = String(token || '').trim();
    const parts = raw.split('.');
    if (parts.length !== 2) return null;

    try {
        const payload = Buffer.from(parts[0], 'base64').toString('utf8');
        const timing = parseAdminPayload(payload);
        if (!timing || !isAdminPayloadWithinLifetime(timing)) return null;

        const secret = getAdminTokenSecret();
        const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        const expectedBuf = Buffer.from(expectedSig, 'hex');
        const providedBuf = Buffer.from(parts[1].padEnd(expectedSig.length, '0'), 'hex');
        if (providedBuf.length !== expectedBuf.length ||
            !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
            return null;
        }

        return {
            uid: 'admin',
            email: 'admin@wmb.local',
            name: 'Admin',
            adminTokenIssuedAt: timing.issuedAt,
            adminTokenExpiresAt: timing.expiresAt,
        };
    } catch (_) {
        return null;
    }
}

function assertProductionAdminTokenSecret() {
    if (process.env.NODE_ENV !== 'production') return;
    if (!String(process.env.ADMIN_TOKEN_SECRET || '').trim()) {
        throw new Error('ADMIN_TOKEN_SECRET must be set when NODE_ENV=production');
    }
}

module.exports = {
    getAdminTokenSecret,
    getAdminTokenTtlMs,
    createAdminHmacToken,
    verifyAdminHmacToken,
    assertProductionAdminTokenSecret,
};
