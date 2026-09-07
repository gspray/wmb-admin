'use strict';

import { canonicalizeBookTypeOptionValue } from '../../public/author/book-type-option-ids.js';
import { currentNavReturnHref, resolveNavReturnUrl } from './nav-return.js';
import { detectNavProduct } from './nav-url-normalize.js';
import { buildProductPath } from './url-contract.js';

const PET_BOOK_TYPE = 'pets_memoir';
const PET_PRODUCT_ID = 'write_my_pet_book';
const CAREER_PRODUCT_ID = 'write_my_book';

/**
 * @param {unknown} bookType
 * @param {unknown} [bookTypeLabel]
 * @returns {'/book' | '/pet'}
 */
export function authorProductRouteForBookType(bookType, bookTypeLabel = '') {
    const canonical = canonicalizeBookTypeOptionValue(bookType, bookTypeLabel);
    return canonical === PET_BOOK_TYPE ? '/pet' : '/book';
}

/**
 * @param {'book'|'pet'} product
 * @returns {string}
 */
export function resolveCustomerPublicBaseUrl(product) {
    const productId = product === 'pet' ? PET_PRODUCT_ID : CAREER_PRODUCT_ID;
    const fromBoot = typeof window !== 'undefined' ? window.__WMB__?.customerProducts : null;
    if (!Array.isArray(fromBoot)) return '';
    const row = fromBoot.find((entry) => entry?.id === productId);
    return String(row?.publicBaseUrl || '').trim().replace(/\/+$/, '');
}

/**
 * Build Admin Desk "Open" URL for a project (Business → /book, Pet → /pet).
 * Admin HMAC must already live in sessionStorage — never put admin_token in the URL.
 * @param {object} project
 * @param {{ basePath?: string, adminToken?: string, returnHref?: string | null }} [opts]
 */
export function buildAdminPreviewOpenUrl(project, opts = {}) {
    const adminBasePath = String(opts.basePath ?? (typeof window !== 'undefined' ? window.__WMB__?.basePath : '') ?? '')
        .replace(/\/+$/, '');
    const id = String(project?.id || '').trim();
    const product = authorProductRouteForBookType(project?.bookType, project?.bookTypeLabel || project?.workTypeLabel) === '/pet'
        ? 'pet'
        : 'book';
    const customerBase = resolveCustomerPublicBaseUrl(product);
    const relativePath = buildProductPath(product, { kind: 'preview', projectId: id, basePath: '' });
    let href = customerBase
        ? `${customerBase}${relativePath}`
        : buildProductPath(product, { kind: 'preview', projectId: id, basePath: adminBasePath });

    // Prefer storing token before navigation (caller). Ignore opts.adminToken in query.
    const returnHref = opts.returnHref !== undefined
        ? opts.returnHref
        : (typeof window !== 'undefined' ? currentNavReturnHref() : '');
    const adminReturn = resolveNavReturnUrl(returnHref);
    if (adminReturn && detectNavProduct(adminReturn) === 'admin') {
        const url = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'http://local.invalid');
        url.searchParams.set('return', adminReturn);
        href = url.href.startsWith('http') ? url.href : `${url.pathname}${url.search}`;
    }
    return href;
}
