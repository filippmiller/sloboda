#!/usr/bin/env node
/**
 * Read-only CLI preflight check for Sloboda Core R2/R3 upgrade.
 * Connects to DATABASE_URL, runs runFullPreflight(client), prints JSON report,
 * and exits 0 if financial integrity passes or 2 if discrepancies are found.
 * Never mutates the database.
 */
import 'dotenv/config';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const { runFullPreflight } = require('../server/services/upgradePreflight');

if (!process.env.DATABASE_URL) {
    console.error(JSON.stringify({ ok: false, error: 'DATABASE_URL environment variable is required' }, null, 2));
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

let client;
try {
    client = await pool.connect();
    await client.query('BEGIN TRANSACTION READ ONLY');
    const report = await runFullPreflight(client);
    await client.query('COMMIT');
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.financial.ok ? 0 : 2;
} catch (err) {
    if (client) {
        await client.query('ROLLBACK').catch(() => {});
    }
    console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
    process.exitCode = 1;
} finally {
    if (client) {
        client.release();
    }
    await pool.end().catch(() => {});
}
