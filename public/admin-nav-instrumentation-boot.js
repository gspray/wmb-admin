'use strict';

import { bootNavInstrumentation } from '../platform/client/nav-instrumentation-boot.js';
import { deriveAdminUrlFromState } from './admin-nav-derived-url.js';

void bootNavInstrumentation({ deriveUrlFromState: deriveAdminUrlFromState });
