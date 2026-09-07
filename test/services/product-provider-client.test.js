'use strict';

const assert = require('node:assert/strict');
const { describe, test, mock } = require('node:test');
const {
    buildProviderUrl,
    providerRequest,
} = require('../../services/productProviderClient');
const { providerForwardHeaders } = require('../../services/productBackendProxy');
const { listAuthorizedProviders } = require('../../services/productProviderRegistry');

describe('productProviderClient', () => {
    test('buildProviderUrl joins base and suffix', () => {
        const url = buildProviderUrl({
            providerBaseUrl: 'http://127.0.0.1:3014/api/admin-provider/v1',
        }, '/projects');
        assert.equal(url, 'http://127.0.0.1:3014/api/admin-provider/v1/projects');
    });

    test('providerRequest forwards Authorization and parses JSON envelope', async () => {
        const originalFetch = global.fetch;
        global.fetch = mock.fn(async (url, init) => ({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => ({ productId: 'write_my_pet_book', items: [] }),
            text: async () => JSON.stringify({ productId: 'write_my_pet_book', items: [] }),
        }));

        try {
            const payload = await providerRequest(
                { providerBaseUrl: 'http://127.0.0.1:3014/api/admin-provider/v1', id: 'write_my_pet_book' },
                'test-token',
                'GET',
                '/projects',
            );
            assert.deepEqual(payload.items, []);
            assert.equal(global.fetch.mock.calls.length, 1);
            const [, init] = global.fetch.mock.calls[0].arguments;
            assert.equal(init.headers.Authorization, 'Bearer test-token');
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('providerRequest forwards local dev project headers', async () => {
        const originalFetch = global.fetch;
        global.fetch = mock.fn(async () => ({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => ({ items: [] }),
            text: async () => '{"items":[]}',
        }));

        try {
            await providerRequest(
                { providerBaseUrl: 'http://127.0.0.1:3014/api/admin-provider/v1', id: 'write_my_pet_book' },
                null,
                'GET',
                '/projects',
                undefined,
                {},
                { 'X-Dev-Project-Id': 'project-1' },
            );
            const [, init] = global.fetch.mock.calls[0].arguments;
            assert.equal(init.headers['X-Dev-Project-Id'], 'project-1');
            assert.equal(init.headers.Authorization, undefined);
        } finally {
            global.fetch = originalFetch;
        }
    });
});

describe('providerForwardHeaders', () => {
    test('copies dev and author project headers from the incoming request', () => {
        const headers = providerForwardHeaders({
            headers: {
                'x-dev-project-id': 'dev-1',
                'x-author-project-id': 'author-1',
            },
        });
        assert.deepEqual(headers, {
            'X-Dev-Project-Id': 'dev-1',
            'X-Author-Project-Id': 'author-1',
        });
    });
});

describe('listAuthorizedProviders', () => {
    test('legacy desk admins can reach all configured providers', () => {
        const providers = listAuthorizedProviders({
            role: 'admin',
            adminProductIds: [],
            crossProduct: false,
            legacy: true,
        });
        assert.ok(providers.length >= 1);
        assert.ok(providers.some((row) => row.id === 'write_my_pet_book'));
    });
});
