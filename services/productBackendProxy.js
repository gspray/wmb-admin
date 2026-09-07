'use strict';

const { randomUUID } = require('crypto');
const productProviderClient = require('./productProviderClient');
const {
    PET_PRODUCT_ID,
    CAREER_PRODUCT_ID,
} = require('./productIds');
const {
    listAuthorizedProviders,
    providerForProductId,
} = require('./productProviderRegistry');
const {
    resolveProductApiBaseUrl,
    productIdForBookType,
} = require('./productBackendRegistry');
const {
    isPlatformPetOnlySystemPath,
    resolveCareerSystemRoute,
    shouldForwardCareerViaProvider,
    resolveProviderMethod,
    adaptProviderEnvelope,
    buildProviderQuery,
    buildProviderBody,
    PET_PRODUCT_ID: ADAPTER_PET_PRODUCT_ID,
} = require('./systemRouteAdapter');

const projectProductCache = new Map();

function bearerToken(req) {
    const header = req.headers.authorization || '';
    return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function forwardHeaders(req, authToken, { includeJsonContentType = true } = {}) {
    const headers = {
        Accept: req.headers.accept || 'application/json',
        'X-Request-Id': randomUUID(),
    };
    if (includeJsonContentType && req.headers['content-type']) {
        headers['Content-Type'] = req.headers['content-type'];
    } else if (includeJsonContentType && req.method !== 'GET' && req.method !== 'HEAD') {
        headers['Content-Type'] = 'application/json';
    }
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const authorProjectId = String(req.headers['x-author-project-id'] || '').trim();
    if (authorProjectId) headers['X-Author-Project-Id'] = authorProjectId;
    const devProjectId = String(req.headers['x-dev-project-id'] || '').trim();
    if (devProjectId) headers['X-Dev-Project-Id'] = devProjectId;
    return headers;
}

async function resolveProjectProductId(projectId, req, authToken) {
    const key = String(projectId || '').trim();
    if (!key) return null;
    if (projectProductCache.has(key)) return projectProductCache.get(key);

    const providerHeaders = (() => {
        const headers = {};
        const authorProjectId = String(req.headers['x-author-project-id'] || '').trim();
        const devProjectId = String(req.headers['x-dev-project-id'] || '').trim();
        if (authorProjectId) headers['X-Author-Project-Id'] = authorProjectId;
        if (devProjectId) headers['X-Dev-Project-Id'] = devProjectId;
        return headers;
    })();
    const providers = listAuthorizedProviders(req.adminAccess || {});
    for (const provider of providers) {
        try {
            const payload = await productProviderClient.getProject(
                provider,
                authToken,
                key,
                providerHeaders,
            );
            const productId = payload?.productId || provider.id;
            projectProductCache.set(key, productId);
            return productId;
        } catch (err) {
            if (err.status !== 404 && err.status !== 403 && err.status !== 401) throw err;
        }
    }
    return null;
}

async function resolveTargetProductId(req, { preferBookType = true } = {}) {
    if (preferBookType) {
        const fromQuery = productIdForBookType(req.query?.bookType || req.body?.bookType);
        if (fromQuery) return fromQuery;
    }
    const authorProjectId = String(req.headers['x-author-project-id'] || req.headers['x-dev-project-id'] || '').trim();
    if (authorProjectId) {
        const productId = await resolveProjectProductId(authorProjectId, req, bearerToken(req));
        if (productId) return productId;
    }
    return PET_PRODUCT_ID;
}

function resolveProductAuthorApiPath(productId, apiPath) {
    const normalized = String(apiPath || '').startsWith('/') ? apiPath : `/${apiPath || ''}`;
    if (productId !== CAREER_PRODUCT_ID) return normalized;
    if (normalized.startsWith('/api/system/author/')) {
        return normalized.replace('/api/system/author/', '/api/author/');
    }
    if (normalized === '/api/system/author') return '/api/author';
    return normalized;
}

function buildBackendUrl(productId, apiPath, query = {}) {
    const base = resolveProductApiBaseUrl(productId);
    const url = new URL(`${base}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`);
    Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        url.searchParams.set(key, String(value));
    });
    return url;
}

async function forwardCareerSystemViaProvider(req, res, {
    apiPath,
    method,
    body,
}) {
    const routeMap = resolveCareerSystemRoute(apiPath);
    if (!routeMap) {
        return res.status(404).json({
            error: 'Career system route is not mapped to admin provider',
            code: 'NOT_FOUND',
            path: apiPath,
        });
    }

    const provider = providerForProductId(CAREER_PRODUCT_ID);
    if (!provider?.providerBaseUrl) {
        return res.status(503).json({
            error: 'Career admin provider is not configured',
            code: 'BACKEND_UNAVAILABLE',
            productId: CAREER_PRODUCT_ID,
        });
    }

    const upper = String(method || req.method || 'GET').toUpperCase();
    const providerMethod = resolveProviderMethod(routeMap, upper);
    if (!providerMethod) {
        return res.status(405).json({
            error: `Method ${upper} is not supported for ${apiPath}`,
            code: 'METHOD_NOT_ALLOWED',
        });
    }

    const authToken = bearerToken(req);
    const query = buildProviderQuery(routeMap, req);
    const payload = body !== undefined ? body : req.body;
    const providerBody = (providerMethod === 'GET' || providerMethod === 'HEAD')
        ? undefined
        : buildProviderBody(routeMap, { ...req, body: payload });
    const extraHeaders = {};
    const authorProjectId = String(req.headers['x-author-project-id'] || '').trim();
    const devProjectId = String(req.headers['x-dev-project-id'] || '').trim();
    if (authorProjectId) extraHeaders['X-Author-Project-Id'] = authorProjectId;
    if (devProjectId) extraHeaders['X-Dev-Project-Id'] = devProjectId;

    try {
        const envelope = await productProviderClient.providerRequest(
            provider,
            authToken,
            providerMethod,
            routeMap.providerPath,
            providerBody,
            query,
            extraHeaders,
        );
        const adapted = adaptProviderEnvelope(routeMap, envelope, req.adminAccess, {
            isWrite: providerMethod !== 'GET',
        });
        return res.json(adapted);
    } catch (err) {
        const status = Number(err.status) || 502;
        return res.status(status).json({
            error: err.message || 'Career provider request failed',
            code: err.code || 'PROVIDER_ERROR',
            productId: CAREER_PRODUCT_ID,
        });
    }
}

async function forwardToProductApi(req, res, {
    productId,
    apiPath,
    method,
    body,
}) {
    const normalizedPath = String(apiPath || '').startsWith('/') ? apiPath : `/${apiPath || ''}`;
    let targetProductId = productId || PET_PRODUCT_ID;
    if (isPlatformPetOnlySystemPath(normalizedPath)) {
        targetProductId = ADAPTER_PET_PRODUCT_ID;
    }

    if (shouldForwardCareerViaProvider(targetProductId, normalizedPath)) {
        return forwardCareerSystemViaProvider(req, res, {
            apiPath: normalizedPath,
            method,
            body,
        });
    }

    const base = resolveProductApiBaseUrl(targetProductId);
    if (!base) {
        return res.status(503).json({
            error: 'Product backend is not configured',
            code: 'BACKEND_UNAVAILABLE',
            productId: targetProductId,
        });
    }

    const targetPath = resolveProductAuthorApiPath(targetProductId, normalizedPath);
    const url = buildBackendUrl(targetProductId, targetPath, req.query);
    const authToken = bearerToken(req);
    const headers = forwardHeaders(req, authToken);
    const upper = String(method || req.method || 'GET').toUpperCase();
    const init = { method: upper, headers };
    const payload = body !== undefined ? body : req.body;
    if (upper !== 'GET' && upper !== 'HEAD' && payload !== undefined && Object.keys(payload || {}).length) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(payload);
    }

    const upstream = await fetch(url, init);
    const text = await upstream.text();
    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    if (!text) return res.end();
    if (contentType && contentType.includes('application/json')) {
        try {
            return res.json(JSON.parse(text));
        } catch (_) {
            /* fall through */
        }
    }
    return res.send(text);
}

async function forwardAuthorShim(req, res) {
    try {
        const productId = await resolveTargetProductId(req);
        const apiPath = `/api/system/author${req.path}`;
        const targetPath = resolveProductAuthorApiPath(productId, apiPath);
        return forwardToProductApi(req, res, { productId, apiPath: targetPath, method: req.method });
    } catch (err) {
        console.error('[systemProxy] author shim failed:', err?.message || err);
        return res.status(502).json({ error: err.message || 'Author proxy failed' });
    }
}

module.exports = {
    bearerToken,
    forwardToProductApi,
    forwardAuthorShim,
    resolveTargetProductId,
    resolveProjectProductId,
    buildBackendUrl,
};
