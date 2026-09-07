'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '../..');

describe('Admin bootstrap routes', () => {
    test('server serves /admin shell with runtime config injection', async () => {
        process.env.NODE_ENV = 'test';
        const { app } = require('../../server');
        const server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;

        const request = (pathname, headers = {}) => new Promise((resolve, reject) => {
            http.get({ host: '127.0.0.1', port, path: pathname, headers }, (res) => {
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => resolve({ status: res.statusCode, body }));
            }).on('error', reject);
        });

        try {
            const adminPage = await request('/admin');
            assert.equal(adminPage.status, 200);
            assert.match(adminPage.body, /window\.__WMB__/);
            assert.match(adminPage.body, /book_platform_admin/);
            assert.match(adminPage.body, /admin-bootstrap\.js/);

            const boot = await request('/api/admin/boot', { 'X-Dev-Admin': '1' });
            assert.equal(boot.status, 200);
            const payload = JSON.parse(boot.body);
            assert.equal(payload.productId, 'book_platform_admin');
            assert.ok(Array.isArray(payload.customerProducts));
            assert.equal(payload.isAdminApplication, true);

            const petRoute = await request('/pet');
            assert.equal(petRoute.status, 404);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    test('admin-independent-runtime doc exists', () => {
        const doc = path.join(ROOT, 'docs/architecture/admin-independent-runtime.md');
        assert.ok(fs.existsSync(doc));
        const src = fs.readFileSync(doc, 'utf8');
        assert.match(src, /3018/);
        assert.match(src, /admin-provider/);
    });
});
