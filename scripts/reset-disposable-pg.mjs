#!/usr/bin/env node
/**
 * Guarded disposable PostgreSQL public-schema reset script (SLB-R3-02).
 * Verifies DATABASE_URL config and current_database() on the exact client before dropping public.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const { assertSafeDisposablePgConfig, assertConnectedDisposablePg } = require('../server/utils/pgTestGuard');

const label = 'disposable PG public schema reset (scripts/reset-disposable-pg.mjs)';
const { dbName } = assertSafeDisposablePgConfig(process.env.DATABASE_URL, process.env, label);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
    const actualDb = await assertConnectedDisposablePg(client, dbName, label);
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log(`RESET_DISPOSABLE_PG_OK database=${actualDb}`);
} finally {
    client.release();
    await pool.end();
}
