/**
 * Shared Disposable PostgreSQL Target Guard (SLB-R3-02)
 * Enforced before ANY destructive PG operation, schema reset, or RESET_ADMIN_PASSWORD boot.
 */
const { parse: parsePgConnectionString } = require('pg-connection-string');

const DISPOSABLE_DB_RE = /(^|[_-])(test|ci|local|dev)($|[_-])/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const MAX_PG_IDENT_BYTES = 63;

function validateDisposableDbName(dbName, contextLabel = 'destructive PG operation') {
    if (typeof dbName !== 'string' || !dbName) {
        throw new Error(`Refusing ${contextLabel}: PostgreSQL database name is missing`);
    }
    if (Buffer.byteLength(dbName, 'utf8') > MAX_PG_IDENT_BYTES) {
        throw new Error(
            `Refusing ${contextLabel}: database name "${dbName}" exceeds PostgreSQL ${MAX_PG_IDENT_BYTES}-byte identifier limit`
        );
    }
    if (dbName.includes('/') || /[\s\x00-\x1f\x7f]/.test(dbName)) {
        throw new Error(
            `Refusing ${contextLabel}: database name "${dbName}" contains disallowed characters`
        );
    }
    if (!DISPOSABLE_DB_RE.test(dbName)) {
        throw new Error(
            `Refusing ${contextLabel} against non-disposable database "${dbName}"`
        );
    }
    return dbName;
}

function assertSafeDisposablePgConfig(connectionString, env = process.env, contextLabel = 'destructive PG operation') {
    if (typeof connectionString !== 'string' || !connectionString.trim()) {
        throw new Error(`Refusing ${contextLabel}: DATABASE_URL is required`);
    }
    if (!env || env.ALLOW_DESTRUCTIVE_PG_VERIFY !== 'true') {
        throw new Error(
            `Refusing ${contextLabel} without ALLOW_DESTRUCTIVE_PG_VERIFY=true (use a disposable test database only)`
        );
    }

    let parsed;
    try {
        parsed = parsePgConnectionString(connectionString);
    } catch (err) {
        throw new Error(`Refusing ${contextLabel}: invalid or multi-host DATABASE_URL (${err.message})`);
    }
    const host = typeof parsed.host === 'string' ? parsed.host.trim() : '';
    if (!host) {
        throw new Error(
            `Refusing ${contextLabel}: DATABASE_URL must specify an explicit host (implicit/socket host rejected)`
        );
    }
    if (host.includes(',')) {
        throw new Error(
            `Refusing ${contextLabel}: multi-host DATABASE_URL ("${host}") is rejected`
        );
    }
    const normalizedHost = host.replace(/^\[|\]$/g, '').toLowerCase();
    if (!LOCAL_HOSTS.has(normalizedHost) && env.ALLOW_REMOTE_DISPOSABLE_PG_VERIFY !== 'true') {
        throw new Error(
            `Refusing ${contextLabel} against non-local host "${host}" without ALLOW_REMOTE_DISPOSABLE_PG_VERIFY=true`
        );
    }

    const dbName = validateDisposableDbName(parsed.database, contextLabel);
    return { dbName, host: normalizedHost, parsed };
}

async function assertConnectedDisposablePg(poolOrClient, expectedDbName, contextLabel = 'destructive PG operation') {
    validateDisposableDbName(expectedDbName, contextLabel);
    const res = await poolOrClient.query('SELECT current_database() AS db_name');
    const actualDbName = res.rows[0]?.db_name || '';
    validateDisposableDbName(actualDbName, contextLabel);
    if (actualDbName !== expectedDbName) {
        throw new Error(
            `Refusing ${contextLabel}: connected database "${actualDbName}" does not match configured "${expectedDbName}"`
        );
    }
    return actualDbName;
}

module.exports = {
    DISPOSABLE_DB_RE,
    LOCAL_HOSTS,
    MAX_PG_IDENT_BYTES,
    validateDisposableDbName,
    assertSafeDisposablePgConfig,
    assertConnectedDisposablePg,
};
