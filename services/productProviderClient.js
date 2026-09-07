'use strict';

const { randomUUID } = require('crypto');

function buildProviderUrl(provider, pathSuffix) {
    const base = String(provider?.providerBaseUrl || '').replace(/\/+$/, '');
    const suffix = String(pathSuffix || '').startsWith('/') ? pathSuffix : `/${pathSuffix || ''}`;
    return `${base}${suffix}`;
}

function providerHeaders(authToken, extra = {}) {
    const headers = {
        Accept: 'application/json',
        ...extra,
    };
    if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
    }
    return headers;
}

async function readProviderError(res) {
    const text = await res.text().catch(() => '');
    try {
        const parsed = JSON.parse(text);
        const message = parsed?.error || parsed?.message || text || res.statusText;
        const err = new Error(message || `Provider request failed (${res.status})`);
        err.status = res.status;
        err.code = parsed?.code || 'PROVIDER_ERROR';
        err.productId = parsed?.productId || null;
        err.detail = parsed || text;
        return err;
    } catch (_) {
        const err = new Error(text || res.statusText || `Provider request failed (${res.status})`);
        err.status = res.status;
        err.code = 'PROVIDER_ERROR';
        err.detail = text;
        return err;
    }
}

async function providerRequest(provider, authToken, method, pathSuffix, body, query = {}, extraHeaders = {}) {
    const url = new URL(buildProviderUrl(provider, pathSuffix));
    Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        url.searchParams.set(key, String(value));
    });

    const headers = providerHeaders(authToken, {
        'X-Request-Id': randomUUID(),
        ...extraHeaders,
    });
    const init = { method: String(method || 'GET').toUpperCase(), headers };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);
    if (!res.ok) throw await readProviderError(res);
    if (res.status === 204) return null;
    const contentType = String(res.headers.get('content-type') || '');
    if (contentType.includes('application/json')) return res.json();
    return res.text();
}

async function listProjects(provider, authToken, query = {}, extraHeaders = {}) {
    return providerRequest(provider, authToken, 'GET', '/projects', undefined, query, extraHeaders);
}

async function getProject(provider, authToken, projectId, extraHeaders = {}) {
    return providerRequest(provider, authToken, 'GET', `/projects/${encodeURIComponent(projectId)}`, undefined, {}, extraHeaders);
}

module.exports = {
    buildProviderUrl,
    providerRequest,
    listProjects,
    getProject,
};
