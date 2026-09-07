'use strict';

const express = require('express');
const productProviderClient = require('../services/productProviderClient');
const { bearerToken, providerForwardHeaders } = require('../services/productBackendProxy');
const {
    listAuthorizedProviders,
    providerForProductId,
} = require('../services/productProviderRegistry');
const { productIdForBookType } = require('../services/productBackendRegistry');
const { PET_PRODUCT_ID } = require('../services/productIds');
const { resolveDeskAdminAccess } = require('../services/deskAdminAccess');

const router = express.Router();

function requestIdentity(req) {
    return {
        uid: req.auth?.uid || '',
        email: req.auth?.email || '',
        phone: req.auth?.phone || '',
    };
}

router.use(async (req, res, next) => {
    const access = await resolveDeskAdminAccess(requestIdentity(req));
    if (!access) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    req.adminAccess = access;
    next();
});

function unwrapProject(payload) {
    if (payload?.project && typeof payload.project === 'object') return payload.project;
    return payload;
}

router.get('/', async (req, res) => {
    try {
        const token = bearerToken(req);
        const forwardHeaders = providerForwardHeaders(req);
        const providers = listAuthorizedProviders(req.adminAccess);
        const chunks = await Promise.all(providers.map(async (provider) => {
            try {
                const payload = await productProviderClient.listProjects(
                    provider,
                    token,
                    req.query,
                    forwardHeaders,
                );
                return {
                    items: (payload?.items || []).map((item) => ({
                        ...item,
                        productId: provider.id,
                    })),
                    total: Number(payload?.total) || 0,
                    page: Number(payload?.page) || 1,
                    pageSize: Number(payload?.pageSize) || 50,
                    totalPages: Number(payload?.totalPages) || 1,
                    summary: payload?.summary || null,
                };
            } catch (err) {
                console.error('[projects.list.provider]', provider.id, err.message);
                return { items: [], total: 0, page: 1, pageSize: 50, totalPages: 1, summary: null };
            }
        }));

        const items = chunks.flatMap((chunk) => chunk.items)
            .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
        const total = chunks.reduce((sum, chunk) => sum + chunk.total, 0);
        const summary = chunks.reduce((acc, chunk) => {
            const s = chunk.summary || {};
            acc.total = (acc.total || 0) + (s.total || 0);
            acc.active = (acc.active || 0) + (s.active || 0);
            acc.hidden = (acc.hidden || 0) + (s.hidden || 0);
            acc.inviteNotSent = (acc.inviteNotSent || 0) + (s.inviteNotSent || 0);
            return acc;
        }, {});

        const pageSize = Number.parseInt(String(req.query.pageSize || '50'), 10) || 50;
        const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
        const start = (page - 1) * pageSize;
        const pageItems = items.slice(start, start + pageSize);
        const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

        res.json({
            items: pageItems,
            total: items.length || total,
            page,
            pageSize,
            totalPages,
            summary,
        });
    } catch (err) {
        console.error('[projects.list]', err);
        res.status(500).json({ error: err.message });
    }
});

async function providerForProjectRoute(req, res, projectId) {
    const token = bearerToken(req);
    const forwardHeaders = providerForwardHeaders(req);
    const providers = listAuthorizedProviders(req.adminAccess);
    for (const provider of providers) {
        try {
            const payload = await productProviderClient.getProject(
                provider,
                token,
                projectId,
                forwardHeaders,
            );
            return { provider, payload };
        } catch (err) {
            if (err.status !== 404 && err.status !== 403) throw err;
        }
    }
    res.status(404).json({ error: 'Project not found' });
    return null;
}

router.get('/:id', async (req, res) => {
    try {
        const hit = await providerForProjectRoute(req, res, req.params.id);
        if (!hit) return;
        res.json(unwrapProject(hit.payload));
    } catch (err) {
        console.error('[projects.get]', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const productId = productIdForBookType(req.body?.bookType) || PET_PRODUCT_ID;
        const provider = providerForProductId(productId);
        if (!provider || !provider.providerBaseUrl) {
            return res.status(400).json({ error: 'A supported product bookType is required.' });
        }
        const payload = await productProviderClient.providerRequest(
            provider,
            bearerToken(req),
            'POST',
            '/projects',
            req.body,
            {},
            providerForwardHeaders(req),
        );
        res.status(201).json(unwrapProject(payload));
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const hit = await providerForProjectRoute(req, res, req.params.id);
        if (!hit) return;
        const payload = await productProviderClient.providerRequest(
            hit.provider,
            bearerToken(req),
            'PUT',
            `/projects/${encodeURIComponent(req.params.id)}`,
            req.body,
            {},
            providerForwardHeaders(req),
        );
        res.json(unwrapProject(payload));
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
});

router.post('/:id/duplicate', async (req, res) => {
    try {
        const hit = await providerForProjectRoute(req, res, req.params.id);
        if (!hit) return;
        const payload = await productProviderClient.providerRequest(
            hit.provider,
            bearerToken(req),
            'POST',
            `/projects/${encodeURIComponent(req.params.id)}/duplicate`,
            req.body,
            {},
            providerForwardHeaders(req),
        );
        res.status(201).json(unwrapProject(payload));
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const hit = await providerForProjectRoute(req, res, req.params.id);
        if (!hit) return;
        await productProviderClient.providerRequest(
            hit.provider,
            bearerToken(req),
            'DELETE',
            `/projects/${encodeURIComponent(req.params.id)}`,
            undefined,
            {},
            providerForwardHeaders(req),
        );
        res.status(204).end();
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
});

module.exports = router;
