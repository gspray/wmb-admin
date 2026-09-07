'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { createAdminHmacToken } = require('../services/adminToken');
const { isLocalDevRequest } = require('../services/devLocalAuth');

const router = express.Router();

router.get('/me', requireAuth, (req, res) => {
    res.json({
        uid: req.auth.uid,
        email: req.auth.email,
        name: req.auth.name,
    });
});

router.post('/admin-login', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ error: 'Not found' });
    }
    const expectedUser = String(process.env.ADMIN_DEV_USERNAME || 'admin').trim();
    const expectedPass = String(process.env.ADMIN_DEV_PASSWORD || '').trim();
    if (!expectedPass) {
        return res.status(503).json({
            error: 'Local admin login is disabled. Set ADMIN_DEV_PASSWORD in .env or use Firebase email sign-in.',
        });
    }
    const username = String(req.body?.username || '');
    const password = String(req.body?.password || '');
    if (username !== expectedUser || password !== expectedPass) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }
    return res.json({ token: createAdminHmacToken() });
});

router.get('/dev-entry', (req, res) => {
    if (!isLocalDevRequest(req)) {
        return res.status(404).json({ error: 'Not found' });
    }
    return res.json({
        enabled: true,
        productId: 'book_platform_admin',
        enterPath: '/admin',
        note: 'Standalone Admin — pick a project from Book Projects or pass ?dev_project= on /admin.',
    });
});

module.exports = router;
