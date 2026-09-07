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

    const providers = listAuthorizedProviders(req.adminAccess || {});
    for (const provider of providers) {
        try {
            const payload = await productProviderClient.getProject(provider, authToken, key);
            const productId = payload?.productId || provider.id;
            projectProductCache.set(key, productId);
            return productId;
        } catch (err) {
            if (err.status !== 404 && err.status !== 403) throw err;
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

function buildBackendUrl(productId, apiPath, query = {}) {
    const base = resolveProductApiBaseUrl(productId);
    const url = new URL(`${base}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`);
    Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        url.searchParams.set(key, String(value));
    });
    return url;
}

async function forwardToProductApi(req, res, {
    productId,
    apiPath,
    method,
    body,
}) {
    const targetProductId = productId || PET_PRODUCT_ID;
    const base = resolveProductApiBaseUrl(targetProductId);
    if (!base) {
        return res.status(503).json({
            error: 'Product backend is not configured',
            code: 'BACKEND_UNAVAILABLE',
            productId: targetProductId,
        });
    }

    const url = buildBackendUrl(targetProductId, apiPath, req.query);
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
    const productId = await resolveTargetProductId(req);
    const apiPath = `/api/system/author${req.path}`;
    let targetPath = apiPath;
    if (productId === CAREER_PRODUCT_ID) {
        targetPath = apiPath.replace('/api/system/author', '/api/author');
    }
    return forwardToProductApi(req, res, { productId, apiPath: targetPath, method: req.method });
}

module.exports = {
    bearerToken,
    forwardToProductApi,
    forwardAuthorShim,
    resolveTargetProductId,
    resolveProjectProductId,
    buildBackendUrl,
};
