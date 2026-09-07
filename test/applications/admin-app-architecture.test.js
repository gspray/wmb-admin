'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const repoRoot = path.join(__dirname, '../..');
const adminAppDir = path.join(repoRoot, 'applications/admin');

describe('Admin application architecture — wmb-admin Phase 5', () => {
    test('Admin app has composition root, layout, navigation, and registry', () => {
        for (const rel of ['admin-app.js', 'layout.js', 'navigation.js', 'registry.js', 'admin-app.css']) {
            assert.ok(fs.existsSync(path.join(adminAppDir, rel)), `missing applications/admin/${rel}`);
        }
    });

    test('Admin composition root does not import Pet application modules', () => {
        const src = fs.readFileSync(path.join(adminAppDir, 'admin-app.js'), 'utf8');
        assert.doesNotMatch(src, /applications\/pet/);
        assert.doesNotMatch(src, /author-app\.js/);
    });

    test('bundle entry imports Admin Desk host and desk panels', () => {
        const entry = fs.readFileSync(path.join(repoRoot, 'scripts/wmb-admin-desk-bundle-entry.js'), 'utf8');
        assert.match(entry, /bootAdminApplication/);
        assert.match(entry, /bootAdminDeskHost/);
        assert.match(entry, /desk-draft-integrity/);
    });

    test('server mounts projects, system proxy, and Admin shell', () => {
        const serverSrc = fs.readFileSync(path.join(repoRoot, 'server.js'), 'utf8');
        assert.match(serverSrc, /routes\/projects/);
        assert.match(serverSrc, /routes\/systemProxy/);
        assert.match(serverSrc, /serveAdminHtml\('admin\.html'\)/);
        assert.doesNotMatch(serverSrc, /admin-bootstrap/);
    });

    test('public admin shell references production Admin bundle', () => {
        const html = fs.readFileSync(path.join(repoRoot, 'public/admin.html'), 'utf8');
        assert.match(html, /Book Platform Admin/);
        assert.match(html, /admin-desk\.bundle\.js/);
    });
});
