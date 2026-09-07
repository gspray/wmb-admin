'use strict';

/**
 * Admin URL helpers — served from `public/admin-canonical-url.js`.
 * Entry modules (admin-desk-host, app.js) import the public module directly.
 */

export {
    adminBasePath,
    isAdminApplicationPath,
    canonicalAdminHistoryUrl,
    buildAdminDeskUrl,
} from '../../public/admin-canonical-url.js';
