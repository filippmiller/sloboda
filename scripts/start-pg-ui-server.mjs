#!/usr/bin/env node
/**
 * Guarded Playwright PG UI E2E server launcher (SLB-R3-02).
 * When DATABASE_URL is configured, verifies disposable target config AND current_database()
 * on the actual server/db pool BEFORE requiring server/index.js (which runs RESET_ADMIN_PASSWORD=true).
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertSafeDisposablePgConfig, assertConnectedDisposablePg } = require('../server/utils/pgTestGuard');

const label = 'Playwright PG UI E2E server startup (scripts/start-pg-ui-server.mjs)';

if (process.env.DATABASE_URL && process.env.TEST_NO_DB !== 'true') {
    const { dbName } = assertSafeDisposablePgConfig(process.env.DATABASE_URL, process.env, label);
    const db = require('../server/db');
    if (!db || !db.pool) {
        throw new Error(`Refusing ${label}: server/db did not initialize a PostgreSQL pool`);
    }
    await assertConnectedDisposablePg(db.pool, dbName, label);
}

require('../server/index.js');
