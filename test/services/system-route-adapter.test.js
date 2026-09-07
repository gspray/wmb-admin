'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const {
    isPlatformPetOnlySystemPath,
    resolveCareerSystemRoute,
    shouldForwardCareerViaProvider,
    resolveProviderMethod,
    adaptProviderEnvelope,
    normalizeSystemPath,
    CAREER_PRODUCT_ID,
} = require('../../services/systemRouteAdapter');

describe('systemRouteAdapter', () => {
    test('platform-only routes stay on Pet /api/system', () => {
        assert.equal(isPlatformPetOnlySystemPath('/api/system/ai-usage'), true);
        assert.equal(isPlatformPetOnlySystemPath('/api/system/ask-turn-feedback/item'), true);
        assert.equal(isPlatformPetOnlySystemPath('/api/system/chapter-strategy-settings'), false);
    });

    test('Career chapter strategies map to admin provider content route', () => {
        const route = resolveCareerSystemRoute('/api/system/chapter-strategy-settings');
        assert.ok(route);
        assert.equal(route.providerPath, '/content/chapter-strategies');
        assert.equal(resolveProviderMethod(route, 'PUT'), 'PATCH');
        assert.equal(shouldForwardCareerViaProvider(CAREER_PRODUCT_ID, normalizeSystemPath('/api/system/chapter-strategy-settings')), true);
    });

    test('adaptProviderEnvelope shapes chapter strategy catalog for Admin Desk', () => {
        const route = resolveCareerSystemRoute('/api/system/chapter-strategy-settings');
        const adapted = adaptProviderEnvelope(route, {
            productId: CAREER_PRODUCT_ID,
            bookType: 'memoir',
            catalog: {
                bookType: 'memoir',
                defaultStrategyId: 'chronological',
                strategies: [{ id: 'chronological', enabled: true, chapters: ['Intro'] }],
            },
        }, {
            crossProduct: true,
        });
        assert.equal(adapted.bookType, 'memoir');
        assert.equal(adapted.defaultStrategyId, 'chronological');
        assert.deepEqual(adapted.enabledStrategyIds, ['chronological']);
        assert.ok(Array.isArray(adapted.bookTypeTabs));
    });
});
