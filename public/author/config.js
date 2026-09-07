'use strict';

export const __WMB__ = window.__WMB__ || {};
export const BASE = __WMB__.basePath || '';
export const auth = firebase.auth();
export const PRODUCT_ID = __WMB__.product || 'book_platform_admin';
export const PRODUCT_LABEL = __WMB__.productLabel || 'Write My Book';
export const IS_ADMIN_APPLICATION = Boolean(__WMB__.isAdminApplication);
