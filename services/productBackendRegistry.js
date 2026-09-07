'use strict';

const { PET_PRODUCT_ID, CAREER_PRODUCT_ID } = require('./productIds');
const { providerForProductId } = require('./productProviderRegistry');

const DEFAULT_API_BASES = Object.freeze({
    [PET_PRODUCT_ID]: 'http://127.0.0.1:3014',
    [CAREER_PRODUCT_ID]: 'http://127.0.0.1:3016',
});

const API_ENV_KEYS = Object.freeze({
    [PET_PRODUCT_ID]: 'PET_API_BASE_URL',
    [CAREER_PRODUCT_ID]: 'CAREER_API_BASE_URL',
});

function resolveProductApiBaseUrl(productId) {
    const envKey = API_ENV_KEYS[productId];
    const configured = envKey ? String(process.env[envKey] || '').trim() : '';
    if (configured) return configured.replace(/\/+$/, '');
    return DEFAULT_API_BASES[productId] || '';
}

function providerForBookType(rawBookType) {
    const bookType = String(rawBookType || '').trim();
    if (!bookType) return null;
    if (bookType === 'pets_memoir') return providerForProductId(PET_PRODUCT_ID);
    return providerForProductId(CAREER_PRODUCT_ID);
}

function productIdForBookType(rawBookType) {
    const provider = providerForBookType(rawBookType);
    return provider?.id || null;
}

module.exports = {
    DEFAULT_API_BASES,
    resolveProductApiBaseUrl,
    providerForBookType,
    productIdForBookType,
};
