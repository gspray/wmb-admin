'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const ROOT = path.resolve(__dirname, '../..');

describe('Issue #348 Phase 6 — Admin runtime/deploy boundary', () => {
    test('deploy.sh is Admin-only and does not restart Pet/Career PM2 apps', () => {
        const deploySh = fs.readFileSync(path.join(ROOT, 'deploy.sh'), 'utf8');
        assert.match(deploySh, /\[wmb-admin deploy\]/);
        assert.match(deploySh, /wmb-admin/);
        assert.doesNotMatch(deploySh, /wmb-pet/);
        assert.doesNotMatch(deploySh, /wmb-career/);
        assert.match(deploySh, /3018/);
        assert.match(deploySh, /3019/);
    });

    test('deploy-server builds Admin bundle only and smokes /admin', () => {
        const src = fs.readFileSync(path.join(ROOT, 'scripts/deploy-server.sh'), 'utf8');
        assert.match(src, /admin-desk\.bundle\.js/);
        assert.match(src, /smoke-test\.js/);
        assert.match(src, /\/admin/);
        assert.doesNotMatch(src, /author-app\.bundle/);
        assert.doesNotMatch(src, /pet-app\.bundle/);
        assert.doesNotMatch(src, /wmb-pet/);
        assert.doesNotMatch(src, /wmb-career/);
    });

    test('ecosystem.config.js defines independent PM2 identities and ports', () => {
        const src = fs.readFileSync(path.join(ROOT, 'ecosystem.config.js'), 'utf8');
        assert.match(src, /wmb-admin/);
        assert.match(src, /wmb-admin-stage/);
        assert.match(src, /3018/);
        assert.match(src, /3019/);
        assert.match(src, /logSuffix/);
        assert.match(src, /pm2-\$\{logSuffix\}/);
    });

    test('package.json exposes Admin deploy scripts', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
        assert.equal(pkg.scripts['deploy:admin'], 'bash deploy.sh');
        assert.equal(pkg.scripts['smoke:admin'], 'node scripts/smoke-test.js');
    });

    test('runtime deploy doc exists with proxy cutover preparation', () => {
        const doc = fs.readFileSync(path.join(ROOT, 'docs/architecture/admin-independent-runtime-deploy.md'), 'utf8');
        assert.match(doc, /Phase 6/);
        assert.match(doc, /3018/);
        assert.match(doc, /does not build, restart, or smoke Pet or Career/);
        assert.match(doc, /Phase 7/);
    });
});
