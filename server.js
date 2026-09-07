'use strict';

if (String(process.env.WMB_CONFIG_SOURCE || '').trim().toLowerCase() !== 'doppler') {
    require('dotenv').config();
}

const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const { assertProductionAdminTokenSecret } = require('./services/adminToken');

const PORT = Number.parseInt(process.env.PORT || '3018', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const BASE_PATH = (() => {
    const raw = String(process.env.BASE_PATH || '').trim();
    return !raw || raw === '/' ? '' : `/${raw.replace(/^\/+|\/+$/g, '')}`;
})();
const API = `${BASE_PATH}/api`;
const publicDir = path.join(__dirname, 'public');
const applicationsDir = path.join(__dirname, 'applications');
const faDir = path.join(__dirname, 'node_modules/@fortawesome/fontawesome-free');

/** Font Awesome Kit (Pro). Override with FONTAWESOME_KIT_URL; set to `off` for CSS-only. */
const FA_KIT_SCRIPT = 'https://kit.fontawesome.com/3a26ade3db.js';

function resolveFaKitScriptSrc() {
    const raw = (process.env.FONTAWESOME_KIT_URL || '').trim();
    if (/^(off|none|false|0)$/i.test(raw)) return '';
    if (raw) return raw;
    return FA_KIT_SCRIPT;
}

function resolveFaStylesheetHref() {
    const raw = (process.env.FONTAWESOME_CSS_URL || '').trim();
    if (/^bundled$/i.test(raw) || /^local$/i.test(raw)) {
        return `${BASE_PATH}/fa/css/all.min.css`;
    }
    if (raw) return raw;
    return `${BASE_PATH}/fa/css/all.min.css`;
}

function buildFaStylesheetLink() {
    const href = resolveFaStylesheetHref();
    const isRemote = /^https?:\/\//i.test(href);
    const extra = isRemote ? ' crossorigin="anonymous" referrerpolicy="no-referrer"' : '';
    return `<link rel="stylesheet" href="${href}"${extra} />`;
}

function buildFaHeadTags() {
    const kitSrc = resolveFaKitScriptSrc();
    const stylesheet = buildFaStylesheetLink();
    if (kitSrc) {
        const safe = String(kitSrc).replace(/"/g, '&quot;');
        return `${stylesheet}<script src="${safe}" crossorigin="anonymous" data-auto-replace-svg="false"></script>`;
    }
    return stylesheet;
}

function firebaseCspHostsFromEnv() {
    const connectHosts = new Set();
    const frameHosts = new Set();
    const addDbUrl = (raw) => {
        const value = String(raw || '').trim();
        if (!value) return;
        try {
            const host = new URL(value).host;
            if (!host) return;
            connectHosts.add(`https://${host}`);
            connectHosts.add(`wss://${host}`);
        } catch (_) { /* ignore bad URL */ }
    };
    const addAuthDomain = (raw) => {
        const host = String(raw || '').trim().replace(/^https?:\/\//i, '').split('/')[0];
        if (host) frameHosts.add(`https://${host}`);
    };
    addDbUrl(process.env.FIREBASE_DATABASE_URL);
    addDbUrl(process.env.PROD_FIREBASE_DATABASE_URL);
    addAuthDomain(process.env.FIREBASE_AUTH_DOMAIN);
    addAuthDomain(process.env.PROD_FIREBASE_AUTH_DOMAIN);
    return {
        connectHosts: [...connectHosts],
        frameHosts: [...frameHosts],
    };
}

const firebaseCsp = firebaseCspHostsFromEnv();

assertProductionAdminTokenSecret();

const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://www.gstatic.com', 'https://apis.google.com', 'https://www.google.com', 'https://kit.fontawesome.com'],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com', 'https://ka-f.fontawesome.com', 'https://ka-p.fontawesome.com'],
            imgSrc: ["'self'", 'data:', 'blob:', 'https://lh3.googleusercontent.com'],
            connectSrc: [
                "'self'",
                'https://*.googleapis.com',
                'https://*.firebaseapp.com',
                'https://*.firebaseio.com',
                'wss://*.firebaseio.com',
                'https://www.gstatic.com',
                'https://apis.google.com',
                'https://www.google.com',
                'https://identitytoolkit.googleapis.com',
                'https://kit.fontawesome.com',
                'https://ka-f.fontawesome.com',
                'https://ka-p.fontawesome.com',
                ...firebaseCsp.connectHosts,
            ],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'https://ka-f.fontawesome.com', 'https://ka-p.fontawesome.com'],
            frameSrc: [
                "'self'",
                'https://accounts.google.com',
                'https://*.firebaseapp.com',
                'https://www.google.com',
                ...firebaseCsp.frameHosts,
            ],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: NODE_ENV === 'production' ? [] : null,
        },
    },
}));
app.use(express.json({ limit: '40mb' }));
app.use(express.urlencoded({ extended: true, limit: '40mb' }));

const { requireAuth } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const authProxyRouter = require('./routes/authProxy');
const publicRouter = require('./routes/public');
const adminRouter = require('./routes/admin');
const projectsRouter = require('./routes/projects');
const systemProxyRouter = require('./routes/systemProxy');
const { resolveBuildVersion, isDevHttpEnvironment } = require('./services/buildVersion');
const { resolveDatabaseEnvironment } = require('./services/databaseEnvironment');
const { listProviders } = require('./services/productProviderRegistry');
const { resolveProductApiBaseUrl } = require('./services/productBackendRegistry');
const pkg = require('./package.json');

const FIREBASE_CONFIG = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    appId: process.env.FIREBASE_APP_ID,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
};

function buildEnvScript(req) {
    const buildVersion = resolveBuildVersion({ devHttp: isDevHttpEnvironment(req) });
    return `<meta name="wmb-build" content="${String(buildVersion || '').replace(/"/g, '')}" />\n<script>window.__WMB__=${JSON.stringify({
        basePath: BASE_PATH,
        firebase: FIREBASE_CONFIG,
        version: pkg.version,
        buildVersion,
        env: isDevHttpEnvironment(req) ? 'development' : NODE_ENV,
        databaseEnv: resolveDatabaseEnvironment({
            projectId: FIREBASE_CONFIG.projectId,
            databaseUrl: FIREBASE_CONFIG.databaseURL,
        }),
        devLocalAuth: NODE_ENV !== 'production',
        product: 'book_platform_admin',
        productLabel: 'Book Platform Admin',
        productRoute: '/admin',
        isAdminApplication: true,
        customerProducts: listProviders().map((provider) => ({
            id: provider.id,
            label: provider.label,
            bookTypes: [...provider.bookTypes],
            customerRoute: provider.customerRoute,
            providerBaseUrl: provider.providerBaseUrl,
            publicBaseUrl: resolveProductApiBaseUrl(provider.id),
        })),
    })};</script>`;
}

const FIREBASE_SCRIPTS = `
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
<script>if(window.__WMB__ && window.__WMB__.firebase && window.__WMB__.firebase.apiKey){firebase.initializeApp(window.__WMB__.firebase);}else{console.warn('Firebase not configured — auth disabled.');}</script>`;

function injectAdminHtml(htmlPath, req) {
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html
        .replace('<link rel="stylesheet" href="styles.css" />', `<link rel="stylesheet" href="${BASE_PATH || ''}/styles.css" />`)
        .replace('<link rel="stylesheet" href="admin-desk.css" />', `<link rel="stylesheet" href="${BASE_PATH || ''}/admin-desk.css" />`)
        .replace('<link rel="stylesheet" href="admin-responsive.css" />', `<link rel="stylesheet" href="${BASE_PATH || ''}/admin-responsive.css" />`)
        .replace('<link rel="stylesheet" href="applications/admin/admin-app.css" />', `<link rel="stylesheet" href="${BASE_PATH || ''}/applications/admin/admin-app.css" />`)
        .replace(/src="dist\/admin-desk\.bundle\.js"/, `src="${BASE_PATH || ''}/dist/admin-desk.bundle.js?v=${encodeURIComponent(resolveBuildVersion({ devHttp: isDevHttpEnvironment(req) }))}"`)
        .replace(/src="([^"]+)"/g, (match, src) => {
            if (src.startsWith('http') || src.startsWith('//') || src.startsWith(`${BASE_PATH}/`)) return match;
            return `src="${BASE_PATH}/${src.replace(/^\//, '')}"`;
        })
        .replace(/href="(?!https?:|data:|#|\/)([^"]+)"/g, (match, href) => `href="${BASE_PATH}/${href.replace(/^\//, '')}"`);
    if (!html.includes('window.__WMB__')) {
        html = html.replace('</head>', `${buildEnvScript(req)}</head>`);
    }
    if (!html.includes('firebase-app-compat')) {
        html = html.replace('</head>', `${FIREBASE_SCRIPTS}</head>`);
    }
    if (!html.includes('/fa/css/all.min.css') && !html.includes('kit.fontawesome.com')) {
        html = html.replace('</head>', `${buildFaHeadTags()}</head>`);
    }
    return html;
}

function serveAdminHtml(htmlFile) {
    return (req, res) => {
        const htmlPath = path.join(publicDir, htmlFile);
        if (!fs.existsSync(htmlPath)) return res.status(404).send('Not found');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(injectAdminHtml(htmlPath, req));
    };
}

app.use(`${API}/auth`, authRouter);
app.use(`${API}/auth`, authProxyRouter);
app.use(`${API}/public`, publicRouter);
app.use(API, requireAuth);
app.use(`${API}/admin`, adminRouter);
app.use(`${API}/projects`, projectsRouter);
app.use(`${API}/system`, systemProxyRouter);

app.get(['/admin', '/admin/'], serveAdminHtml('admin.html'));
app.get(['/admin/login', '/admin/login.html'], (req, res) => {
    const loginPath = path.join(applicationsDir, 'admin', 'login.html');
    if (!fs.existsSync(loginPath)) return res.status(404).send('Not found');
    let html = fs.readFileSync(loginPath, 'utf8');
    html = html.replace('</head>', `${buildEnvScript(req)}${FIREBASE_SCRIPTS}</head>`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
});
app.get('/', (_req, res) => res.redirect(`${BASE_PATH}/admin`.replace(/\/{2,}/g, '/') || '/admin'));

if (BASE_PATH) {
    app.use(`${BASE_PATH}/fa`, express.static(faDir));
}
app.use('/fa', express.static(faDir));
app.use(BASE_PATH || '/', express.static(publicDir, { index: false }));
app.use('/applications', express.static(applicationsDir, { index: false }));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

const server = http.createServer(app);

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`[wmb-admin] listening on http://localhost:${PORT}${BASE_PATH}/admin`);
    });
}

module.exports = {
    app,
    server,
    PORT,
    BASE_PATH,
    API,
    buildFaHeadTags,
    injectAdminHtml,
};
