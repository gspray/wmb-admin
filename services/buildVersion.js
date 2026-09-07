'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function isDevHttpEnvironment(req) {
    if (process.env.NODE_ENV === 'production') return false;
    const host = String(req?.headers?.host || '').split(':')[0].trim().toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function resolveBuildVersion({ preferNewerFiles = false, devHttp = false } = {}) {
    if (devHttp || process.env.NODE_ENV !== 'production') {
        return String(Date.now());
    }
    const marker = path.join(ROOT, 'public', 'admin-bootstrap.js');
    try {
        return String(Math.floor(fs.statSync(marker).mtimeMs));
    } catch (_) {
        return String(Date.now());
    }
}

function buildVersionPayload(req) {
    return {
        buildVersion: resolveBuildVersion({ devHttp: isDevHttpEnvironment(req) }),
        env: isDevHttpEnvironment(req) ? 'development' : (process.env.NODE_ENV || 'development'),
    };
}

module.exports = {
    isDevHttpEnvironment,
    resolveBuildVersion,
    buildVersionPayload,
};
