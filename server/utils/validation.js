/**
 * Strict input parsing helpers for route handlers.
 */

function parsePositiveInt(val) {
    if (val === null || val === undefined || typeof val === 'boolean') return null;
    if (typeof val === 'number') {
        return Number.isSafeInteger(val) && val > 0 ? val : null;
    }
    if (typeof val === 'string') {
        const s = val.trim();
        if (!/^\d+$/.test(s)) return null;
        const n = Number(s);
        return Number.isSafeInteger(n) && n > 0 ? n : null;
    }
    return null;
}

function parseNonNegativeInt(val) {
    if (val === null || val === undefined || typeof val === 'boolean') return null;
    if (typeof val === 'number') {
        return Number.isSafeInteger(val) && val >= 0 ? val : null;
    }
    if (typeof val === 'string') {
        const s = val.trim();
        if (!/^\d+$/.test(s)) return null;
        const n = Number(s);
        return Number.isSafeInteger(n) && n >= 0 ? n : null;
    }
    return null;
}

function parseOptionalInt(val, defaultVal = null) {
    if (val === undefined || val === null || val === '') return defaultVal;
    if (typeof val === 'boolean') return NaN;
    if (typeof val === 'number') {
        return Number.isSafeInteger(val) ? val : NaN;
    }
    if (typeof val === 'string') {
        const s = val.trim();
        if (!/^-?\d+$/.test(s)) return NaN;
        const n = Number(s);
        return Number.isSafeInteger(n) ? n : NaN;
    }
    return NaN;
}

function parseNonNegativeFinite(val, defaultVal = 0) {
    if (val === undefined || val === null || val === '') return defaultVal;
    if (typeof val === 'boolean' || (typeof val !== 'number' && typeof val !== 'string')) {
        return null;
    }
    const s = typeof val === 'string' ? val.trim() : val;
    if (s === '') return defaultVal;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

module.exports = {
    parsePositiveInt,
    parseNonNegativeInt,
    parseOptionalInt,
    parseNonNegativeFinite,
};
