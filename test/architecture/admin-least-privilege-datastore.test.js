'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const describeAdminRepo = pkg.name === 'wmb-admin' ? describe : describe.skip;

const {
    assertAdminPlatformReadPath,
    assertAdminPlatformWritePath,
    ADMIN_PLATFORM_USERS_PATH,
    ADMIN_PLATFORM_PRESENCE_PATH,
    FORBIDDEN_ADMIN_DIRECT_PREFIXES,
} = require('../../services/platformDatastorePaths');

function walkJsFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) walkJsFiles(absolute, files);
        else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) files.push(absolute);
    }
    return files;
}

describeAdminRepo('Issue #348 Phase 8 — Admin least-privilege datastore', () => {
    test('platform path guards allow operator paths and reject product/content paths', () => {
        assert.doesNotThrow(() => assertAdminPlatformReadPath(ADMIN_PLATFORM_USERS_PATH));
        assert.doesNotThrow(() => assertAdminPlatformReadPath(`${ADMIN_PLATFORM_USERS_PATH}/uid123`));
        assert.doesNotThrow(() => assertAdminPlatformReadPath(ADMIN_PLATFORM_PRESENCE_PATH));
        assert.doesNotThrow(() => assertAdminPlatformWritePath(`${ADMIN_PLATFORM_PRESENCE_PATH}/uid123`));

        assert.throws(
            () => assertAdminPlatformReadPath('projects/pet123'),
            /forbidden path: projects\/pet123/,
        );
        assert.throws(
            () => assertAdminPlatformWritePath('_wmbServer/content/contentBanks/pets_memoir'),
            /forbidden path: _wmbServer\/content\/contentBanks\/pets_memoir/,
        );
        assert.throws(
            () => assertAdminPlatformReadPath('_wmbServer/settings/ghostwriter'),
            /forbidden path: _wmbServer\/settings\/ghostwriter/,
        );
        assert.throws(
            () => assertAdminPlatformWritePath(`${ADMIN_PLATFORM_USERS_PATH}/uid123`),
            /write outside platform allowlist/,
        );

        assert.ok(FORBIDDEN_ADMIN_DIRECT_PREFIXES.includes('projects'));
        assert.ok(FORBIDDEN_ADMIN_DIRECT_PREFIXES.includes('project_index'));
    });

    test('Admin repo does not ship product store.js', () => {
        assert.equal(fs.existsSync(path.join(ROOT, 'models/store.js')), false);
    });

    test('runtime services route RTDB through guarded firebase helpers', () => {
        const roots = ['services', 'middleware', 'routes']
            .map((rel) => path.join(ROOT, rel))
            .filter((target) => fs.existsSync(target));
        const violations = [];
        for (const root of roots) {
            for (const file of walkJsFiles(root)) {
                const rel = path.relative(ROOT, file);
                const text = fs.readFileSync(file, 'utf8');
                if (/\bgetDb\(\)\.ref\(/.test(text)) {
                    violations.push(rel);
                }
            }
        }
        assert.deepEqual(violations, [], `Direct getDb().ref() found:\n${violations.join('\n')}`);
    });

    test('adminContacts reads scoped platform paths only', () => {
        const src = fs.readFileSync(path.join(ROOT, 'services/adminContacts.js'), 'utf8');
        assert.match(src, /rtdbGet\(ADMIN_PLATFORM_USERS_PATH\)/);
        assert.match(src, /rtdbGet\(ADMIN_PLATFORM_LEGACY_EMAILS_PATH\)/);
        assert.match(src, /rtdbGet\(ADMIN_PLATFORM_LEGACY_PHONES_PATH\)/);
        assert.doesNotMatch(src, /ref\(['"]_wmbServer['"]\)/);
        assert.doesNotMatch(src, /\.ref\(ADMIN_CONTACTS_PATH\)/);
    });

    test('project orchestration uses provider HTTP client, not direct RTDB store', () => {
        const src = fs.readFileSync(path.join(ROOT, 'routes/projects.js'), 'utf8');
        assert.match(src, /productProviderClient/);
        assert.doesNotMatch(src, /models\/store/);
        assert.doesNotMatch(src, /rtdbSet\(['"]projects\//);
    });

    test('firebase helpers enforce platform path guards', () => {
        const src = fs.readFileSync(path.join(ROOT, 'models/firebase.js'), 'utf8');
        assert.match(src, /assertAdminPlatformReadPath/);
        assert.match(src, /assertAdminPlatformWritePath/);
    });
});
