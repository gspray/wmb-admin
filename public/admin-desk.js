'use strict';

/**
 * Local / unbundled Admin Desk entry (production uses dist/admin-desk.bundle.js).
 * Approved composition boundary: admin-app + admin-desk-host.
 */

import './admin-nav-instrumentation-boot.js';
import { bootAdminApplication } from '../applications/admin/admin-app.js';
import { bootAdminDeskHost } from './admin-desk-host.js';

bootAdminApplication(bootAdminDeskHost).catch((err) => {
    console.error('[admin-desk] boot failed', err);
});
