'use strict';

const { getDb } = require('../models/firebase');
const { verifyAdminHmacToken } = require('../services/adminToken');
const { isLocalDevRequest } = require('../services/devLocalAuth');

async function requireAuth(req, res, next) {
    if (req.path === '/auth' || req.path.startsWith('/auth/')) return next();
    if (req.path === '/public' || req.path.startsWith('/public/')) return next();

    if (isLocalDevRequest(req) && req.headers['x-dev-admin'] === '1') {
        req.auth = {
            uid: 'dev',
            email: process.env.ADMIN_EMAILS?.split(',')[0]?.trim() || 'dev@localhost',
            name: 'Dev',
        };
        return next();
    }

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: 'Authorization required' });
    }

    const adminAuth = verifyAdminHmacToken(token);
    if (adminAuth) {
        req.auth = adminAuth;
        return next();
    }

    try {
        getDb();
        const admin = require('firebase-admin');
        const decoded = await admin.auth().verifyIdToken(token);
        if (!decoded.email_verified) {
            return res.status(403).json({ error: 'Email address not verified' });
        }
        req.auth = {
            uid: decoded.uid,
            email: decoded.email || null,
            phone: decoded.phone_number || null,
            name: decoded.name || decoded.email || decoded.uid,
        };
        return next();
    } catch (_) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

module.exports = { requireAuth };
