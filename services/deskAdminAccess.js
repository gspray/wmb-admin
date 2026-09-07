'use strict';

const { isAdminContact } = require('./adminContacts');
const { getUserAccess, isAdminLevelRole } = require('./userAccess');
const { ADMIN_PRODUCT_ID, normalizeProductId } = require('./productIds');

async function hasDeskAdminAccess({ uid = '', email = '', phone = '' } = {}) {
    if (String(uid || '') === 'admin') return true;
    if (String(uid || '') === 'dev' && process.env.NODE_ENV !== 'production') return true;
    if (String(email || '').toLowerCase() === 'admin@wmb.local') return true;
    return isAdminContact({ uid, email, phone });
}

async function resolveDeskAdminAccess({ uid = '', email = '', phone = '' } = {}) {
    if (!(await hasDeskAdminAccess({ uid, email, phone }))) return null;

    const id = String(uid || '').trim();
    if (id === 'admin' || (id === 'dev' && process.env.NODE_ENV !== 'production')
        || String(email || '').toLowerCase() === 'admin@wmb.local') {
        return { role: 'system', adminProductIds: null, crossProduct: true };
    }

    const access = await getUserAccess(id);
    if (!access || !isAdminLevelRole(access.role)) {
        return { role: 'admin', adminProductIds: [], crossProduct: false, legacy: true };
    }
    return {
        ...access,
        adminProductIds: Array.isArray(access.adminProductIds) ? access.adminProductIds : [],
        crossProduct: access.role === 'system',
    };
}

async function hasDeskProductAccess(identity, productId) {
    const product = normalizeProductId(productId);
    if (!product || product === ADMIN_PRODUCT_ID) return false;
    const access = await resolveDeskAdminAccess(identity);
    if (!access) return false;
    return access.crossProduct === true || access.adminProductIds.includes(product);
}

module.exports = {
    hasDeskAdminAccess,
    resolveDeskAdminAccess,
    hasDeskProductAccess,
};
