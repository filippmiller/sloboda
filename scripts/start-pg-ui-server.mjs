#!/usr/bin/env node
/**
 * Guarded Playwright PG UI E2E server launcher (SLB-R3-02).
 * Loads dotenv identically to server/index.js, uses the exact same DB-mode predicate,
 * and verifies disposable target config AND current_database() on the actual server/db pool
 * BEFORE requiring server/index.js (which runs RESET_ADMIN_PASSWORD=true).
 */
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
const { assertSafeDisposablePgConfig, assertConnectedDisposablePg } = require('../server/utils/pgTestGuard');

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
dotenv.config({
    path: path.join(rootDir, process.env.NODE_ENV === 'test' ? '.env.test' : '.env'),
});

const label = 'Playwright PG UI E2E server startup (scripts/start-pg-ui-server.mjs)';
const useTestNoDbStub = process.env.NODE_ENV === 'test' && process.env.TEST_NO_DB === 'true';

if (!useTestNoDbStub) {
    const { dbName } = assertSafeDisposablePgConfig(process.env.DATABASE_URL, process.env, label);
    const db = require('../server/db');
    if (!db || !db.pool) {
        throw new Error(`Refusing ${label}: server/db did not initialize a PostgreSQL pool`);
    }
    await assertConnectedDisposablePg(db.pool, dbName, label);
}

require('../server/index.js');
