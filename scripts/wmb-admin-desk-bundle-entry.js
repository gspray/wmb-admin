'use strict';

/**
 * Admin Desk shell — production bundle for /admin (Book Platform Admin).
 * Composition root: applications/admin/admin-app.js
 */

import '../public/admin-nav-instrumentation-boot.js';
import '../public/admin-desk-state.js';
import '../public/admin-desk-api.js';
import '../public/dialogs.js';
import '../public/author/book-audit-report.js';
import '../public/author/desk-answers-browser.js';
import '../public/author/desk-question-assignment-editor.js';
import '../public/author/desk-assignment-pacing.js';
import '../public/author/desk-ai-prompts.js';
import '../public/author/desk-ai-usage.js';
import '../public/author/desk-ask-turn-feedback.js';
import '../public/author/desk-whos-online.js';
import '../public/author/desk-users-admin.js';
import '../public/author/desk-activity-log.js';
import '../public/author/desk-ghostwriter-settings.js';
import '../public/author/desk-ui-feature-flags.js';
import '../public/author/desk-allowed-book-types.js';
import '../public/author/desk-strategy-settings.js';
import '../public/author/desk-start-my-book-editor.js';
import '../public/author/desk-content-bank-revisions.js';
import '../public/author/desk-book-revision-manager.js';
import '../public/author/desk-voice-clone-settings.js';
import '../public/author/desk-pet-talk-listen-settings.js';
import '../public/author/desk-pet-copy.js';
import '../public/author/desk-interview-preparation.js';
import '../public/author/desk-draft-integrity.js';
import { bootAdminApplication } from '../applications/admin/admin-app.js';
import { bootAdminDeskHost } from '../public/admin-desk-host.js';

bootAdminApplication(bootAdminDeskHost).catch((err) => {
    console.error('[admin-desk] boot failed', err);
});
