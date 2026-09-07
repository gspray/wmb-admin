'use strict';

function normalizeBaseUrl(input) {
    const raw = String(input || 'http://localhost:3018').trim();
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function parseArgs(argv) {
    const flags = {
        timeoutMs: Number(process.env.SMOKE_TIMEOUT_MS || 15000),
        baseUrl: normalizeBaseUrl(process.env.WMB_BASE_URL || process.env.SMOKE_BASE_URL),
    };
    for (let i = 0; i < argv.slice(2).length; i += 1) {
        const token = argv[2 + i];
        if (token === '--base-url' && argv[2 + i + 1]) {
            flags.baseUrl = normalizeBaseUrl(argv[2 + i + 1]);
            i += 1;
        }
    }
    return flags;
}

async function fetchWithTimeout(url, timeoutMs, opts = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            method: 'GET',
            redirect: opts.redirect || 'follow',
            signal: controller.signal,
            headers: opts.headers || {},
        });
        const body = opts.redirect === 'manual' ? '' : await response.text();
        return { response, body };
    } finally {
        clearTimeout(timeout);
    }
}

async function run() {
    const { baseUrl, timeoutMs } = parseArgs(process.argv);
    console.log(`[wmb-admin] Running smoke test against ${baseUrl} (timeout=${timeoutMs}ms)`);

    const checks = [
        {
            name: 'Root redirects to /admin',
            path: '/',
            redirect: 'manual',
            assert: ({ response }) => {
                if (![301, 302, 303, 307, 308].includes(response.status)) {
                    throw new Error(`expected redirect, got ${response.status}`);
                }
            },
        },
        {
            name: 'Admin bootstrap shell responds',
            path: '/admin',
            assert: ({ response, body }) => {
                if (!response.ok) throw new Error(`expected 2xx, got ${response.status}`);
                if (!body.includes('window.__WMB__')) throw new Error('missing runtime config injection');
                if (!body.includes('admin-desk.bundle.js')) throw new Error('missing Admin Desk bundle');
            },
        },
        {
            name: 'Admin boot API accepts localhost dev header',
            path: '/api/admin/boot',
            headers: { 'X-Dev-Admin': '1' },
            assert: ({ response, body }) => {
                if (!response.ok) throw new Error(`expected 2xx, got ${response.status}`);
                if (!body.includes('book_platform_admin')) throw new Error('missing admin product id');
            },
        },
        {
            name: 'Pet customer route is absent',
            path: '/pet',
            assert: ({ response }) => {
                if (response.status !== 404) throw new Error(`expected 404, got ${response.status}`);
            },
        },
    ];

    for (const check of checks) {
        const url = `${baseUrl}${check.path.startsWith('/') ? check.path : `/${check.path}`}`;
        const { response, body } = await fetchWithTimeout(url, timeoutMs, {
            redirect: check.redirect,
            headers: check.headers,
        });
        check.assert({ response, body });
        console.log(`  ok  ${check.name}`);
    }

    console.log('[wmb-admin] Smoke test passed');
}

run().catch((err) => {
    console.error('[wmb-admin] Smoke test failed:', err.message);
    process.exit(1);
});
