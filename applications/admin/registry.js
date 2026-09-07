'use strict';

/**
 * Registered customer products exposed to Admin (from platform product registry).
 * Admin configuration must not hardcode a parallel product catalog.
 */

/** @returns {object[]} */
export function registeredCustomerProducts() {
    const fromBoot = window.__WMB__?.customerProducts;
    return Array.isArray(fromBoot) ? fromBoot : [];
}

/** @returns {object[]} */
export function registeredProducts() {
    const admin = {
        id: window.__WMB__?.product || 'book_platform_admin',
        label: window.__WMB__?.productLabel || 'Book Platform Admin',
        route: window.__WMB__?.productRoute || '/admin',
        crossProduct: true,
    };
    return [...registeredCustomerProducts(), admin];
}
