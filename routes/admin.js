'use strict';

const express = require('express');
const {
    resolveDeskAdminAccess,
    hasDeskProductAccess,
} = require('../services/deskAdminAccess');
const { listProviders, listAuthorizedProviders, providerForProductId } = require('../services/productProviderRegistry');
const { resolveProductApiBaseUrl } = require('../services/productBackendRegistry');
const productProviderClient = require('../services/productProviderClient');
const { providerForwardHeaders } = require('../services/productBackendProxy');
const { ADMIN_PRODUCT_ID } = require('../services/productIds');

const router = express.Router();

function requestIdentity(req) {
    return {
        uid: req.auth?.uid || '',
        email: req.auth?.email || '',
        phone: req.auth?.phone || '',
    };
}

function bearerToken(req) {
    const header = req.headers.authorization || '';
    return header.startsWith('Bearer ') ? header.slice(7) : null;
}

router.use(async (req, res, next) => {
    const access = await resolveDeskAdminAccess(requestIdentity(req));
    if (!access) {
        return res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
    }
    req.adminAccess = access;
    next();
});

router.get('/boot', (req, res) => {
    const providers = listAuthorizedProviders(req.adminAccess).map((provider) => ({
        id: provider.id,
        label: provider.label,
        bookTypes: [...provider.bookTypes],
        customerRoute: provider.customerRoute,
        providerBaseUrl: provider.providerBaseUrl,
        publicBaseUrl: resolveProductApiBaseUrl(provider.id),
    }));
    res.json({
        productId: ADMIN_PRODUCT_ID,
        isAdminApplication: true,
        customerProducts: providers,
        access: {
            role: req.adminAccess.role,
            crossProduct: req.adminAccess.crossProduct === true,
            adminProductIds: req.adminAccess.adminProductIds || [],
        },
    });
});

router.get('/providers', (req, res) => {
    res.json({
        providers: listAuthorizedProviders(req.adminAccess).map((provider) => ({
            id: provider.id,
            label: provider.label,
            bookTypes: [...provider.bookTypes],
            customerRoute: provider.customerRoute,
            providerBaseUrl: provider.providerBaseUrl,
            publicBaseUrl: resolveProductApiBaseUrl(provider.id),
        })),
    });
});

router.get('/projects', async (req, res) => {
    const token = bearerToken(req);
    const forwardHeaders = providerForwardHeaders(req);
    const providers = listAuthorizedProviders(req.adminAccess);
    const query = {
        page: req.query.page,
        pageSize: req.query.pageSize,
        q: req.query.q,
        status: req.query.status,
        hidden: req.query.hidden,
    };

    const chunks = await Promise.all(providers.map(async (provider) => {
        try {
            const payload = await productProviderClient.listProjects(
                provider,
                token,
                query,
                forwardHeaders,
            );
            const items = Array.isArray(payload?.items) ? payload.items : [];
            return {
                providerId: provider.id,
                items: items.map((item) => ({ ...item, productId: provider.id })),
                total: Number(payload?.total) || items.length,
            };
        } catch (err) {
            return {
                providerId: provider.id,
                error: err.message,
                code: err.code || 'PROVIDER_ERROR',
                items: [],
                total: 0,
            };
        }
    }));

    const items = chunks.flatMap((chunk) => chunk.items);
    const total = chunks.reduce((sum, chunk) => sum + (chunk.total || 0), 0);
    res.json({
        items,
        total,
        providers: chunks.map(({ providerId, error, code }) => ({ providerId, error, code })),
    });
});

router.get('/projects/:projectId', async (req, res) => {
    const token = bearerToken(req);
    const forwardHeaders = providerForwardHeaders(req);
    const projectId = String(req.params.projectId || '').trim();
    const requestedProductId = String(req.query.productId || '').trim();
    const providers = requestedProductId
        ? [providerForProductId(requestedProductId)].filter(Boolean)
        : listAuthorizedProviders(req.adminAccess);

    for (const provider of providers) {
        if (!provider) continue;
        if (!(await hasDeskProductAccess(requestIdentity(req), provider.id))) continue;
        try {
            const payload = await productProviderClient.getProject(
                provider,
                token,
                projectId,
                forwardHeaders,
            );
            return res.json({
                ...payload,
                productId: provider.id,
            });
        } catch (err) {
            if (err.status === 404 || err.status === 403) continue;
            return res.status(err.status || 502).json({
                error: err.message,
                code: err.code || 'PROVIDER_ERROR',
                productId: provider.id,
            });
        }
    }
    return res.status(404).json({ error: 'Project not found', code: 'NOT_FOUND' });
});

router.get('/health', (_req, res) => {
    res.json({
        ok: true,
        configuredProviders: listProviders()
            .filter((provider) => provider.providerBaseUrl)
            .map((provider) => provider.id),
    });
});

module.exports = router;
