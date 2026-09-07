'use strict';

const {
    PET_PRODUCT_ID,
    CAREER_PRODUCT_ID,
} = require('./productIds');
const { listAuthorizedProviders } = require('./productProviderRegistry');

const ADMIN_BOOK_TYPE_TABS = Object.freeze([
    { id: 'memoir', label: 'Career Memoir' },
    { id: 'pets_memoir', label: "Pet's Memoir" },
]);

/** Platform-owned routes that only exist on Pet `/api/system/*`. */
const PLATFORM_PET_ONLY_PREFIXES = Object.freeze([
    '/api/system/ai-usage',
    '/api/system/ask-turn-feedback',
    '/api/system/app-requests',
    '/api/system/pet-talk-listen-settings',
    '/api/system/pet-author-copy',
]);

/**
 * Career catalog/settings live on `/api/admin-provider/v1/*`, not `/api/system/*`.
 * Keys are exact `/api/system/...` paths (no query string).
 */
const CAREER_SYSTEM_ROUTE_MAP = Object.freeze({
    '/api/system/chapter-strategy-settings': Object.freeze({
        providerPath: '/content/chapter-strategies',
        methodMap: Object.freeze({ GET: 'GET', PUT: 'PATCH', PATCH: 'PATCH' }),
        adapter: 'chapterStrategySettings',
    }),
    '/api/system/ghostwriter-settings': Object.freeze({
        providerPath: '/settings/ghostwriter',
        methodMap: Object.freeze({ GET: 'GET', PATCH: 'PATCH' }),
        adapter: 'ghostwriterSettings',
    }),
    '/api/system/discovery-settings': Object.freeze({
        providerPath: '/settings/discovery',
        methodMap: Object.freeze({ GET: 'GET', PATCH: 'PATCH' }),
        adapter: 'passThroughSettings',
    }),
    '/api/system/assignment-pacing': Object.freeze({
        providerPath: '/content/assignment-pacing',
        methodMap: Object.freeze({ GET: 'GET', PATCH: 'PATCH' }),
        adapter: 'passThroughCatalog',
    }),
    '/api/system/start-my-book-editor-data': Object.freeze({
        providerPath: '/content/start-my-book-editor',
        methodMap: Object.freeze({ GET: 'GET', PATCH: 'PATCH' }),
        adapter: 'passThroughCatalog',
    }),
    '/api/system/question-assignment-editor-data': Object.freeze({
        providerPath: '/content/question-assignment-editor',
        methodMap: Object.freeze({ GET: 'GET', PATCH: 'PATCH', POST: 'POST' }),
        adapter: 'passThroughCatalog',
    }),
});

function normalizeSystemPath(apiPath) {
    const pathOnly = String(apiPath || '').split('?')[0];
    return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
}

function isPlatformPetOnlySystemPath(apiPath) {
    const normalized = normalizeSystemPath(apiPath);
    return PLATFORM_PET_ONLY_PREFIXES.some((prefix) =>
        normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function resolveCareerSystemRoute(apiPath) {
    return CAREER_SYSTEM_ROUTE_MAP[normalizeSystemPath(apiPath)] || null;
}

function shouldForwardCareerViaProvider(productId, apiPath) {
    return productId === CAREER_PRODUCT_ID && Boolean(resolveCareerSystemRoute(apiPath));
}

function resolveProviderMethod(routeMap, method) {
    const upper = String(method || 'GET').toUpperCase();
    return routeMap?.methodMap?.[upper] || null;
}

function filterBookTypeTabs(adminAccess) {
    const providers = listAuthorizedProviders(adminAccess || {});
    const allowed = new Set(providers.flatMap((provider) => provider.bookTypes || []));
    return ADMIN_BOOK_TYPE_TABS.filter((tab) => allowed.has(tab.id));
}

function listEnabledStrategyIds(strategies) {
    return (Array.isArray(strategies) ? strategies : [])
        .filter((strategy) => strategy && strategy.enabled !== false)
        .map((strategy) => String(strategy.id || '').trim())
        .filter(Boolean);
}

function adaptChapterStrategySettings(envelope, adminAccess, { isWrite = false } = {}) {
    const catalog = envelope?.catalog || {};
    const strategies = catalog.strategies || [];
    const bookType = envelope?.bookType || catalog.bookType || null;
    const base = {
        bookType,
        defaultStrategyId: catalog.defaultStrategyId,
        strategies,
        availableStrategies: strategies,
        enabledStrategyIds: listEnabledStrategyIds(strategies),
        updatedAt: catalog.updatedAt || null,
        updatedBy: catalog.updatedBy || null,
        readinessPolicy: null,
    };
    if (isWrite) {
        return { ok: true, ...base };
    }
    return {
        ...base,
        bookTypeTabs: filterBookTypeTabs(adminAccess),
    };
}

function adaptGhostwriterSettings(envelope) {
    return envelope?.settings || {};
}

function adaptPassThroughCatalog(envelope) {
    return envelope?.catalog ?? envelope;
}

function adaptPassThroughSettings(envelope) {
    return envelope?.settings ?? envelope;
}

function adaptProviderEnvelope(routeMap, envelope, adminAccess, { isWrite = false } = {}) {
    switch (routeMap.adapter) {
    case 'chapterStrategySettings':
        return adaptChapterStrategySettings(envelope, adminAccess, { isWrite });
    case 'ghostwriterSettings':
        return adaptGhostwriterSettings(envelope);
    case 'passThroughCatalog':
        return adaptPassThroughCatalog(envelope);
    case 'passThroughSettings':
        return adaptPassThroughSettings(envelope);
    default:
        return envelope;
    }
}

function buildProviderQuery(routeMap, req) {
    const query = { ...(req.query || {}) };
    if (routeMap.providerPath.startsWith('/content/start-my-book-editor')
        || routeMap.providerPath.startsWith('/content/question-assignment-editor')
        || routeMap.providerPath.startsWith('/content/assignment-pacing')) {
        return query;
    }
    if (!query.bookType && req.body?.bookType) {
        query.bookType = req.body.bookType;
    }
    return query;
}

function buildProviderBody(routeMap, req) {
    const body = req.body && typeof req.body === 'object' ? { ...req.body } : {};
    if (!body.bookType && req.query?.bookType) {
        body.bookType = req.query.bookType;
    }
    return body;
}

module.exports = {
    ADMIN_BOOK_TYPE_TABS,
    PLATFORM_PET_ONLY_PREFIXES,
    CAREER_SYSTEM_ROUTE_MAP,
    normalizeSystemPath,
    isPlatformPetOnlySystemPath,
    resolveCareerSystemRoute,
    shouldForwardCareerViaProvider,
    resolveProviderMethod,
    adaptProviderEnvelope,
    buildProviderQuery,
    buildProviderBody,
    PET_PRODUCT_ID,
    CAREER_PRODUCT_ID,
};
