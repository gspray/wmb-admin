'use strict';

/**
 * Resolve which Firebase RTDB environment the server is connected to.
 * Used by admin shell to show stage vs production at a glance.
 */

const STAGE_PROJECT_ID = 'write-my-book-stage';
const PROD_PROJECT_ID = 'write-my-book-2026';

function extractProjectIdFromDatabaseUrl(databaseURL) {
    const url = String(databaseURL || '').trim();
    if (!url) return '';
    try {
        const host = new URL(url).hostname;
        const match = host.match(/^(.+?)-default-rtdb(?:\.(?:firebaseio\.com|firebasedatabase\.app))?$/);
        return match ? match[1] : host.split('.')[0];
    } catch (_) {
        return '';
    }
}

function resolveFirebaseProjectId(opts = {}) {
    const fromEnv = String(opts.projectId || process.env.FIREBASE_PROJECT_ID || '').trim();
    if (fromEnv) return fromEnv;
    return extractProjectIdFromDatabaseUrl(
        opts.databaseUrl || process.env.FIREBASE_DATABASE_URL || '',
    );
}

/**
 * @returns {'stage'|'prod'|''} Short label for the active RTDB, or empty when unknown/unconfigured.
 */
function resolveDatabaseEnvironment(opts = {}) {
    const projectId = resolveFirebaseProjectId(opts);
    if (projectId === STAGE_PROJECT_ID) return 'stage';
    if (projectId === PROD_PROJECT_ID) return 'prod';

    const databaseURL = String(opts.databaseUrl || process.env.FIREBASE_DATABASE_URL || '').trim();
    if (/write-my-book-stage/i.test(databaseURL)) return 'stage';
    if (/write-my-book-2026/i.test(databaseURL)) return 'prod';

    return '';
}

module.exports = {
    STAGE_PROJECT_ID,
    PROD_PROJECT_ID,
    extractProjectIdFromDatabaseUrl,
    resolveFirebaseProjectId,
    resolveDatabaseEnvironment,
};
