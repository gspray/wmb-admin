'use strict';

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forProduction = process.env.NODE_ENV === 'production'
    || process.argv.includes('--production');

const entry = path.join(rootDir, 'scripts', 'wmb-admin-desk-bundle-entry.js');
const outFile = path.join(rootDir, 'public', 'dist', 'admin-desk.bundle.js');

await build({
    absWorkingDir: rootDir,
    entryPoints: [entry],
    bundle: true,
    outfile: outFile,
    platform: 'browser',
    format: 'iife',
    legalComments: 'none',
    minify: true,
    charset: 'utf8',
    sourcemap: false,
    target: ['es2020'],
    drop: forProduction ? ['console', 'debugger'] : [],
});

const bytes = fs.statSync(outFile).size;
if (bytes < 10_000) {
    throw new Error(`[build:frontend] admin-desk bundle suspiciously small (${bytes} bytes)`);
}
console.info(`[build:frontend] Wrote ${path.relative(rootDir, outFile)} (${bytes} bytes)`);
