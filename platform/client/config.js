'use strict';

/** Book Platform — shared browser config (BASE path, Firebase auth handle). */

const browserWindow = typeof window === 'undefined' ? {} : window;
export const __WMB__ = browserWindow.__WMB__ || {};
export const BASE = __WMB__.basePath || '';
export const auth = typeof firebase !== 'undefined' ? firebase.auth() : null;

export const PRODUCT_ID = __WMB__.product || 'write_my_pet_book';
export const PRODUCT_LABEL = __WMB__.productLabel || 'Write My Pet Book';
export const PET_PROJECT_LS_KEY = 'wmb-pet-project-id';
