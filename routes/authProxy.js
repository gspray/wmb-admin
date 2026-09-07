'use strict';

const express = require('express');
const { forwardToProductApi } = require('../services/productBackendProxy');
const { PET_PRODUCT_ID } = require('../services/productIds');

const router = express.Router();

const LOCAL_AUTH_PATHS = new Set([
    '/me',
    '/admin-login',
    '/dev-entry',
    '/dev-entry/ensure',
    '/exchange-admin-token',
]);

router.use(async (req, res, next) => {
    if (LOCAL_AUTH_PATHS.has(req.path)) return next();
    const apiPath = `/api/auth${req.path}`;
    return forwardToProductApi(req, res, {
        productId: PET_PRODUCT_ID,
        apiPath,
        method: req.method,
    });
});

module.exports = router;
