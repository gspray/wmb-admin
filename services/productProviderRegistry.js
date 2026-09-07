'use strict';

const {
    PET_PRODUCT_ID,
    CAREER_PRODUCT_ID,
} = require('./productIds');

const DEFAULT_PROVIDER_BASES = Object.freeze({
    [PET_PRODUCT_ID]: 'http://127.0.0.1:3014/api/admin-provider/v1',
    [CAREER_PRODUCT_ID]: 'http://127.0.0.1:3016/api/admin-provider/v1',
});

const PROVIDER_ENV_KEYS = Object.freeze({
    [PET_PRODUCT_ID]: 'PET_PROVIDER_BASE_URL',
    [CAREER_PRODUCT_ID]: 'CAREER_PROVIDER_BASE_URL',
});

const PROVIDERS = Object.freeze({
    [PET_PRODUCT_ID]: Object.freeze({
        id: PET_PRODUCT_ID,
        label: 'Pet',
        bookTypes: Object.freeze(['pets_memoir']),
        customerRoute: '/pet',
        providerBaseUrl: '',
    }),
    [CAREER_PRODUCT_ID]: Object.freeze({
        id: CAREER_PRODUCT_ID,
        label: 'Career',
        bookTypes: Object.freeze(['memoir', 'life_story', 'novel_fiction']),
        customerRoute: '/book',
        providerBaseUrl: '',
    }),
});

function resolveProviderBaseUrl(productId) {
    const envKey = PROVIDER_ENV_KEYS[productId];
    const configured = envKey ? String(process.env[envKey] || '').trim() : '';
    if (configured) return configured.replace(/\/+$/, '');
    return DEFAULT_PROVIDER_BASES[productId] || '';
}

function hydrateProvider(productId) {
    const base = PROVIDERS[productId];
    if (!base) return null;
    return {
        ...base,
        providerBaseUrl: resolveProviderBaseUrl(productId),
    };
}

function listProviders() {
    return Object.keys(PROVIDERS).map((productId) => hydrateProvider(productId));
}

function providerForProductId(rawProductId) {
    const productId = String(rawProductId || '').trim();
    return hydrateProvider(productId);
}

function listAuthorizedProviders(access) {
    const providers = listProviders().filter((row) => row.providerBaseUrl);
    if (!access) return [];
    if (access.crossProduct === true) return providers;
    const allowed = new Set(Array.isArray(access.adminProductIds) ? access.adminProductIds : []);
    return providers.filter((provider) => allowed.has(provider.id));
}

module.exports = {
    PROVIDERS,
    listProviders,
    providerForProductId,
    listAuthorizedProviders,
    resolveProviderBaseUrl,
};
