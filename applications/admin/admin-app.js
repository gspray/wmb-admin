'use strict';

/**
 * Book Platform Admin — composition root.
 * Entry points inject bootAdminDeskHost; this module does not import Admin Desk host directly.
 */

import { applyAdminShellIdentity } from './layout.js';

/**
 * @param {() => Promise<void>} bootHost
 */
export async function bootAdminApplication(bootHost) {
    applyAdminShellIdentity();
    await bootHost();
}
