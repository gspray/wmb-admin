'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach, afterEach } = require('node:test');

describe('admin-preview-url', () => {
    const priorWmb = global.window;

    beforeEach(() => {
        global.window = {
            __WMB__: {
                basePath: '',
                customerProducts: [
                    {
                        id: 'write_my_pet_book',
                        publicBaseUrl: 'http://127.0.0.1:3014',
                        customerRoute: '/pet',
                    },
                    {
                        id: 'write_my_book',
                        publicBaseUrl: 'http://127.0.0.1:3016',
                        customerRoute: '/book',
                    },
                ],
            },
            location: {
                origin: 'http://localhost:3018',
                href: 'http://localhost:3018/admin?desk=home&project=book-123',
            },
        };
    });

    afterEach(() => {
        global.window = priorWmb;
    });

    test('buildAdminPreviewOpenUrl targets external Pet runtime, not Admin origin', async () => {
        const {
            buildAdminPreviewOpenUrl,
            resolveCustomerPublicBaseUrl,
        } = await import('../../platform/client/admin-preview-url.js');

        assert.equal(resolveCustomerPublicBaseUrl('pet'), 'http://127.0.0.1:3014');
        const href = buildAdminPreviewOpenUrl({
            id: 'book-123',
            bookType: 'pets_memoir',
        }, { returnHref: null });
        assert.equal(href, 'http://127.0.0.1:3014/pet/preview/book-123');
    });

    test('buildAdminPreviewOpenUrl targets external Career runtime for memoir books', async () => {
        const { buildAdminPreviewOpenUrl } = await import('../../platform/client/admin-preview-url.js');
        const href = buildAdminPreviewOpenUrl({
            id: 'career-9',
            bookType: 'memoir',
        }, { returnHref: null });
        assert.equal(href, 'http://127.0.0.1:3016/book/preview/career-9');
    });
});
