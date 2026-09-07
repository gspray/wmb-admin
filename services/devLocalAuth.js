'use strict';

function isDevLocalAuthEnabled() {
    return process.env.NODE_ENV !== 'production';
}

function isLocalDevRequest(req) {
    if (!isDevLocalAuthEnabled()) return false;
    const host = String(req?.headers?.host || '').split(':')[0].trim().toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

module.exports = {
    isDevLocalAuthEnabled,
    isLocalDevRequest,
};
