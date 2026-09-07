'use strict';

import {
    installNavInstrumentation,
    registerDerivedUrlProvider,
} from './nav-instrumentation.js';

/**
 * Install navigation patches and register the active product's derived-URL provider.
 *
 * Product composition roots must supply their own provider. Keeping that import at
 * the product edge keeps the Pet and Admin application graphs explicit.
 *
 * @param {{ deriveUrlFromState?: () => string | null }} [opts]
 */
export function bootNavInstrumentation(opts = {}) {
    installNavInstrumentation();
    registerDerivedUrlProvider(opts.deriveUrlFromState);
}
