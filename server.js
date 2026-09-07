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

assertProductionAdminTokenSecret();

const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://www.gstatic.com', 'https://apis.google.com'],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'", 'https://*.googleapis.com', 'https://*.firebaseapp.com'],
            fontSrc: ["'self'"],
            frameSrc: ["'self'", 'https://accounts.google.com', 'https://*.firebaseapp.com'],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: NODE_ENV === 'production' ? [] : null,
        },
    },
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const { requireAuth } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const publicRouter = require('./routes/public');
const adminRouter = require('./routes/admin');
const { resolveBuildVersion, isDevHttpEnvironment } = require('./services/buildVersion');
const { listProviders } = require('./services/productProviderRegistry');
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
    const payload = {
        basePath: BASE_PATH,
        firebase: FIREBASE_CONFIG,
        version: pkg.version,
        buildVersion,
        env: isDevHttpEnvironment(req) ? 'development' : NODE_ENV,
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
        })),
    };
    return `<meta name="wmb-build" content="${String(buildVersion || '').replace(/"/g, '')}" />\n<script>window.__WMB__=${JSON.stringify(payload)};</script>`;
}

const FIREBASE_SCRIPTS = `
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
<script>if(window.__WMB__ && window.__WMB__.firebase && window.__WMB__.firebase.apiKey){firebase.initializeApp(window.__WMB__.firebase);}else{console.warn('Firebase not configured — auth disabled.');}</script>`;

function serveAdminHtml(req, res) {
    const htmlPath = path.join(publicDir, 'admin.html');
    if (!fs.existsSync(htmlPath)) return res.status(404).send('Not found');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html
        .replace('<!--WMB_ENV-->', buildEnvScript(req))
        .replace('<!--WMB_FIREBASE-->', FIREBASE_SCRIPTS);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
}

app.use(`${API}/auth`, authRouter);
app.use(`${API}/public`, publicRouter);
app.use(`${API}/admin`, requireAuth, adminRouter);

app.get(['/admin', '/admin/'], serveAdminHtml);
app.get(['/admin/login', '/admin/login.html'], serveAdminHtml);
app.get('/', (_req, res) => res.redirect(`${BASE_PATH}/admin`.replace(/\/+/g, '/') || '/admin'));
app.use(`${BASE_PATH}/`, express.static(publicDir, { index: false }));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

const server = http.createServer(app);

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`[wmb-admin] listening on http://localhost:${PORT}${BASE_PATH}/admin`);
    });
}

module.exports = { app, server, PORT, BASE_PATH, API };
