#!/usr/bin/env node
'use strict';

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(REPO_ROOT, 'logs');

function parseArgs(argv = process.argv.slice(2)) {
    let port = 3018;
    let basePath = '';
    let stop = false;
    let status = false;
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--port' || arg === '-p') port = Number(argv[++i]) || 3018;
        else if (arg === '--base-path') basePath = String(argv[++i] || '').trim();
        else if (arg === '--stop') stop = true;
        else if (arg === '--status') status = true;
    }
    if (basePath === '/') basePath = '';
    else if (basePath && !basePath.startsWith('/')) basePath = `/${basePath}`;
    return { port, basePath, stop, status };
}

function pidfilePath(port) {
    return path.join(LOGS_DIR, `wmb-admin-dev-${Number(port) || 3018}.pid`);
}

function readPid(port) {
    try {
        return Number.parseInt(fs.readFileSync(pidfilePath(port), 'utf8').trim(), 10) || 0;
    } catch (_) {
        return 0;
    }
}

function isAlive(pid) {
    if (!pid) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (_) {
        return false;
    }
}

function stopServer(port) {
    const pid = readPid(port);
    if (pid && isAlive(pid)) {
        process.kill(pid, 'SIGTERM');
        console.log(`[dev] stopped pid ${pid}`);
    }
    try { fs.unlinkSync(pidfilePath(port)); } catch (_) {}
}

function startServer(port, basePath) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    const env = {
        ...process.env,
        PORT: String(port),
        BASE_PATH: basePath,
        NODE_ENV: process.env.NODE_ENV || 'development',
    };
    const child = spawn(process.execPath, ['server.js'], {
        cwd: REPO_ROOT,
        env,
        detached: true,
        stdio: 'ignore',
    });
    child.unref();
    fs.writeFileSync(pidfilePath(port), String(child.pid));
    console.log(`[wmb-admin] dev server pid ${child.pid} on http://localhost:${port}${basePath}/admin`);
}

const { port, basePath, stop, status } = parseArgs();
if (stop) {
    stopServer(port);
    process.exit(0);
}
if (status) {
    const pid = readPid(port);
    console.log(isAlive(pid) ? `[wmb-admin] running pid ${pid}` : '[wmb-admin] not running');
    process.exit(isAlive(pid) ? 0 : 1);
}

stopServer(port);
startServer(port, basePath);
