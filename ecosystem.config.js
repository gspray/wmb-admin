'use strict';

const fs = require('fs');

const parsePort = (value, fallback) => {
    const parsed = Number.parseInt(String(value || fallback), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const webAppName = String(process.env.WMB_PM2_APP_NAME || 'wmb-admin').trim() || 'wmb-admin';
const isStageApp = webAppName === 'wmb-admin-stage';
const defaultPort = isStageApp ? 3019 : 3018;
const port = parsePort(process.env.PORT, defaultPort);
const logSuffix = isStageApp ? 'admin-stage-' : 'admin-';

module.exports = {
    apps: [
        {
            name: webAppName,
            script: 'npm',
            args: 'run start',
            cwd: '.',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            max_memory_restart: '300M',
            env: {
                NODE_ENV: 'production',
                PORT: port,
                BASE_PATH: '',
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            error_file: `./logs/pm2-${logSuffix}error.log`,
            out_file: `./logs/pm2-${logSuffix}out.log`,
            merge_logs: true,
        },
    ],
};
