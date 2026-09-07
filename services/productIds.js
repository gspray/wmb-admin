'use strict';

const PET_PRODUCT_ID = 'write_my_pet_book';
const CAREER_PRODUCT_ID = 'write_my_book';
const ADMIN_PRODUCT_ID = 'book_platform_admin';

const KNOWN_PRODUCT_IDS = new Set([
    PET_PRODUCT_ID,
    CAREER_PRODUCT_ID,
    ADMIN_PRODUCT_ID,
]);

function normalizeProductId(raw) {
    const value = String(raw || '').trim();
    return KNOWN_PRODUCT_IDS.has(value) ? value : null;
}

module.exports = {
    PET_PRODUCT_ID,
    CAREER_PRODUCT_ID,
    ADMIN_PRODUCT_ID,
    KNOWN_PRODUCT_IDS,
    normalizeProductId,
};
