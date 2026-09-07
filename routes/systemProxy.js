'use strict';

const express = require('express');
const {
    forwardToProductApi,
    forwardAuthorShim,
    resolveTargetProductId,
} = require('../services/productBackendProxy');
const { resolveDeskAdminAccess } = require('../services/deskAdminAccess');
const { PET_PRODUCT_ID } = require('../services/productIds');

const router = express.Router();

router.use(async (req, res, next) => {
    const access = await resolveDeskAdminAccess({
        uid: req.auth?.uid || '',
        email: req.auth?.email || '',
        phone: req.auth?.phone || '',
    });
    if (!access) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    req.adminAccess = access;
    next();
});

router.use('/author', async (req, res) => forwardAuthorShim(req, res));

router.use(async (req, res) => {
    const productId = await resolveTargetProductId(req);
    const apiPath = `/api/system${req.path}`;
    return forwardToProductApi(req, res, {
        productId: productId || PET_PRODUCT_ID,
        apiPath,
        method: req.method,
    });
});

module.exports = router;
