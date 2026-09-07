'use strict';

const assert = require('node:assert/strict');
const { describe, test, mock } = require('node:test');
const {
    buildProviderUrl,
    providerRequest,
} = require('../../services/productProviderClient');

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
});
