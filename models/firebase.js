'use strict';

/**
 * models/firebase.js
 * Firebase Admin SDK initialization and RTDB helper functions.
 *
 * Reads two environment variables:
 *   FIREBASE_DATABASE_URL     – e.g. https://your-project-default-rtdb.firebaseio.com
 *   FIREBASE_SERVICE_ACCOUNT  – path to the service account JSON file, relative to
 *                               the project root or absolute.
 *
 * All helpers throw if Firebase is not configured, so callers must ensure
 * Firebase is available before calling them (store.js guarantees this).
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let _db = null;
let _storageBucket = null;
let _initialized = false;
let _serviceAccountProjectId = '';

function isFirebaseConfigured() {
    return Boolean(
        process.env.FIREBASE_DATABASE_URL
        && (process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    );
}

function resolveStorageBucketName(serviceAccount) {
    const configured = String(process.env.FIREBASE_STORAGE_BUCKET || '').trim();
    if (configured) {
        return configured;
    }
    const projectId = String(serviceAccount?.project_id || _serviceAccountProjectId || '').trim();
    if (!projectId) {
        return '';
    }
    // Default Firebase {project}.appspot.com / .firebasestorage.app buckets often do not exist
    // until Storage is enabled in the console. WMB uses dedicated buckets per project instead.
    return `wmb-app-requests-${projectId}`;
}

function resolveServiceAccountPath() {
    const jsonInline = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
    if (jsonInline) {
        return { source: 'FIREBASE_SERVICE_ACCOUNT_JSON', json: jsonInline };
    }

    const saPath = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!saPath) {
        return null;
    }

    const resolved = path.isAbsolute(saPath)
        ? saPath
        : path.join(__dirname, '..', saPath);

    if (!fs.existsSync(resolved)) {
        console.warn(`[firebase] Service account file not found: ${resolved}`);
        return null;
    }

    return { source: resolved, json: fs.readFileSync(resolved, 'utf8') };
}

function getDb() {
    if (_initialized) return _db;
    _initialized = true;

    const dbUrl = process.env.FIREBASE_DATABASE_URL;
    const serviceAccountPayload = resolveServiceAccountPath();

    if (!dbUrl || !serviceAccountPayload) {
        return null;
    }

    try {
        const serviceAccount = JSON.parse(serviceAccountPayload.json);
        _serviceAccountProjectId = String(serviceAccount?.project_id || '').trim();
        const storageBucket = resolveStorageBucketName(serviceAccount);
        const initOptions = {
            credential: admin.credential.cert(serviceAccount),
            databaseURL: dbUrl,
        };
        if (storageBucket) {
            initOptions.storageBucket = storageBucket;
        }
        admin.initializeApp(initOptions);
        _db = admin.database();
        if (storageBucket) {
            _storageBucket = admin.storage().bucket(storageBucket);
            console.log('[firebase] Storage bucket:', storageBucket);
        }
        console.log('[firebase] Connected to RTDB:', dbUrl);
        return _db;
    } catch (err) {
        console.error('[firebase] Failed to initialize:', err.message);
        return null;
    }
}

function getStorageBucket() {
    getDb();
    if (!_storageBucket) {
        throw new Error('Firebase Storage is not configured. Set FIREBASE_STORAGE_BUCKET or ensure the service account project id is available.');
    }
    return _storageBucket;
}

// ── RTDB helpers ──────────────────────────────────────────────────────────────
// All helpers are async and operate on slash-separated path strings.

/**
 * Read a value at path. Returns null if nothing exists there.
 */
async function rtdbGet(refPath) {
    const snap = await getDb().ref(refPath).once('value');
    return snap.val();
}

/**
 * Firebase RTDB rejects undefined anywhere in a write payload.
 */
function rtdbSanitize(value) {
    if (value === undefined) return null;
    if (value === null) return null;
    if (Array.isArray(value)) {
        return value
            .map((entry) => rtdbSanitize(entry))
            // Drop null holes — Firebase turns sparse arrays into objects with
            // numeric keys, which then fail Array.isArray on read.
            .filter((entry) => entry !== undefined && entry !== null);
    }
    if (typeof value === 'object') {
        const out = {};
        for (const [key, entry] of Object.entries(value)) {
            if (entry === undefined) continue;
            const next = rtdbSanitize(entry);
            if (next !== undefined) out[key] = next;
        }
        return out;
    }
    return value;
}

/**
 * Set (overwrite) a value at path.
 */
async function rtdbSet(refPath, value) {
    await getDb().ref(refPath).set(rtdbSanitize(value));
}

/**
 * Merge/update fields at path without overwriting the whole node.
 */
async function rtdbUpdate(refPath, updates) {
    await getDb().ref(refPath).update(updates);
}

/**
 * Delete the node at path.
 */
async function rtdbDelete(refPath) {
    await getDb().ref(refPath).remove();
}

/**
 * Append a value under path using Firebase's auto-generated push key.
 * Returns the generated key string.
 */
async function rtdbPush(refPath, value) {
    const ref = await getDb().ref(refPath).push(rtdbSanitize(value));
    return ref.key;
}

/**
 * Atomically update a value. The updater must be synchronous and return the
 * next value, or undefined to abort. Returns the committed value and status.
 */
function wrapRtdbTransactionUpdater(updater) {
    return (current) => {
        const next = updater(current);
        // Admin RTDB may invoke the updater once with an empty local cache
        // before retrying with the server value. Returning undefined on that
        // first null would abort before a lease can inspect existing work.
        if (next === undefined) return current === null ? null : undefined;
        return rtdbSanitize(next);
    };
}

async function rtdbTransaction(refPath, updater) {
    const result = await getDb().ref(refPath).transaction(
        wrapRtdbTransactionUpdater(updater),
    );
    return {
        committed: result.committed,
        value: result.snapshot.val(),
    };
}

/**
 * Read all children of a keyed-object node and return them as an array.
 * Preserves the Firebase key as _key on each item (not used by the app but
 * handy for debugging). Returns [] if the node is empty/missing.
 */
async function rtdbGetList(refPath) {
    const snap = await getDb().ref(refPath).once('value');
    const val = snap.val();
    if (!val || typeof val !== 'object') return [];
    return Object.values(val);
}

/**
 * Read the most recent N children without downloading an entire keyed-object node.
 * Uses Firebase push-key ordering when no orderBy index exists.
 */
async function rtdbGetListLimited(refPath, limit = 80) {
    const cap = Math.max(1, Number(limit) || 80);
    const snap = await getDb().ref(refPath).limitToLast(cap).once('value');
    const val = snap.val();
    if (!val || typeof val !== 'object') return [];
    return Object.values(val);
}

module.exports = {
    getDb,
    getStorageBucket,
    isFirebaseConfigured,
    rtdbGet,
    rtdbSet,
    rtdbUpdate,
    rtdbDelete,
    rtdbPush,
    rtdbTransaction,
    wrapRtdbTransactionUpdater,
    rtdbGetList,
    rtdbGetListLimited,
    rtdbSanitize,
};
