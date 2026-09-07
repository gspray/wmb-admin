'use strict';

const fs = require('fs');

const parsePort = (value, fallback) => {
    const parsed = Number.parseInt(String(value || fallback), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeBasePath = (value) => {
    if (typeof value !== 'string') {
        return '';
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed === '/') {
        return '';
    }
    return `/${trimmed.replace(/^\/+/, '').replace(/\/+$/, '')}`;
};

const webAppName = String(process.env.WMB_PM2_APP_NAME || 'wmb-admin').trim() || 'wmb-admin';
const isStageApp = webAppName === 'wmb-admin-stage';
const defaultPort = isStageApp ? 3019 : 3018;
const defaultBasePath = '';
const port = parsePort(process.env.PORT, defaultPort);
const basePath = Object.prototype.hasOwnProperty.call(process.env, 'BASE_PATH')
    ? normalizeBasePath(process.env.BASE_PATH)
    : defaultBasePath;
const logSuffix = isStageApp ? 'admin-stage-' : 'admin-';

const dopplerTokenFile = String(
    process.env.DOPPLER_TOKEN_FILE || (isStageApp ? '/etc/wmb-admin/doppler.stg.token' : '/etc/wmb-admin/doppler.token'),
).trim();
const useDoppler =
    String(process.env.WMB_CONFIG_SOURCE || '').trim().toLowerCase() === 'doppler'
    || fs.existsSync(dopplerTokenFile);

const sharedEnv = {
    NODE_ENV: 'production',
    PORT: port,
    BASE_PATH: basePath,
    DOPPLER_TOKEN_FILE: dopplerTokenFile,
    DOPPLER_PROJECT: String(process.env.DOPPLER_PROJECT || 'wmb-admin').trim() || 'wmb-admin',
    DOPPLER_CONFIG: String(process.env.DOPPLER_CONFIG || (isStageApp ? 'stg' : 'prd')).trim(),
};

module.exports = {
    apps: [
        useDoppler
            ? {
                name: webAppName,
                script: 'scripts/pm2-start-with-doppler.sh',
                interpreter: 'bash',
                cwd: '.',
                instances: 1,
                exec_mode: 'fork',
                autorestart: true,
                watch: false,
                max_memory_restart: '300M',
                env: sharedEnv,
                log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
                error_file: `./logs/pm2-${logSuffix}error.log`,
                out_file: `./logs/pm2-${logSuffix}out.log`,
                merge_logs: true,
            }
            : {
                name: webAppName,
                script: 'npm',
                args: 'run start',
                cwd: '.',
                instances: 1,
                exec_mode: 'fork',
                autorestart: true,
                watch: false,
                max_memory_restart: '300M',
                env: sharedEnv,
                log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
                error_file: `./logs/pm2-${logSuffix}error.log`,
                out_file: `./logs/pm2-${logSuffix}out.log`,
                merge_logs: true,
            },
    ],
};
