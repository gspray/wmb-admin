'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const repoRoot = path.join(__dirname, '../..');

describe('wmb-admin Font Awesome shell support', () => {
    test('server injects bundled Font Awesome stylesheet for Admin Desk icons', () => {
        const serverSrc = fs.readFileSync(path.join(repoRoot, 'server.js'), 'utf8');
        assert.match(serverSrc, /buildFaHeadTags/);
        assert.match(serverSrc, /\/fa\/css\/all\.min\.css/);
        assert.match(serverSrc, /express\.static\(faDir\)/);
    });

    test('injectAdminHtml adds Font Awesome tags before </head>', () => {
        const { injectAdminHtml } = require('../../server');
        const htmlPath = path.join(repoRoot, 'public/admin.html');
        const html = injectAdminHtml(htmlPath, { headers: { host: 'localhost:3018' } });
        assert.match(html, /\/fa\/css\/all\.min\.css/);
    });
});
