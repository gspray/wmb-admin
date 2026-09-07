'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const describeAdminRepo = pkg.name === 'wmb-admin' ? describe : describe.skip;

const SIBLING_IMPORT_RE = /(?:require|from)\s*\(?\s*['"](?:\.\.\/)+(wmb|wmb-pet|wmb-career)\//;

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

describeAdminRepo('Issue #348 — Admin repository independence', () => {
    test('package identity is wmb-admin', () => {
        assert.equal(pkg.name, 'wmb-admin');
    });

    test('runtime tree contains no sibling-repo imports', () => {
        const roots = ['server.js', 'routes', 'services', 'middleware', 'models', 'public', 'scripts']
            .map((rel) => path.join(ROOT, rel))
            .filter((target) => fs.existsSync(target));
        const violations = [];
        for (const root of roots) {
            const files = fs.statSync(root).isDirectory() ? walkJsFiles(root) : [root];
            for (const file of files) {
                const text = fs.readFileSync(file, 'utf8');
                if (SIBLING_IMPORT_RE.test(text)) {
                    violations.push(path.relative(ROOT, file));
                }
            }
        }
        assert.deepEqual(violations, [], `Sibling repo imports found:\n${violations.join('\n')}`);
    });

    test('does not ship Pet or Career customer application trees', () => {
        const forbidden = ['applications/pet', 'applications/career', 'experiences/pet', 'public/dist/pet-app.bundle.js'];
        const present = forbidden.filter((rel) => fs.existsSync(path.join(ROOT, rel)));
        assert.deepEqual(present, []);
    });

    test('server exposes Admin shell and orchestration routes', () => {
        const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
        assert.match(serverSrc, /\/admin/);
        assert.match(serverSrc, /app\.use\(`\$\{API\}\/admin`, adminRouter\)/);
        assert.match(serverSrc, /routes\/projects/);
        assert.match(serverSrc, /routes\/systemProxy/);
        assert.doesNotMatch(serverSrc, /routes\/author/);
        assert.doesNotMatch(serverSrc, /applications\/pet/);
    });

    test('provider registry reads external base URLs from env', () => {
        const src = fs.readFileSync(path.join(ROOT, 'services/productProviderRegistry.js'), 'utf8');
        assert.match(src, /PET_PROVIDER_BASE_URL/);
        assert.match(src, /CAREER_PROVIDER_BASE_URL/);
        assert.match(src, /admin-provider\/v1/);
    });
});
