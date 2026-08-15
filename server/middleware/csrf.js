const crypto = require('crypto');

const COOKIE = 'slobodaCsrf';
const VOTER = 'slobodaVoter';

function issueCsrf(req, res) {
    let token = req.cookies?.[COOKIE];
    if (!token || token.length < 16) {
        token = crypto.randomBytes(24).toString('hex');
        res.cookie(COOKIE, token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
    }

    let voter = req.cookies?.[VOTER];
    if (!voter || voter.length < 16) {
        voter = crypto.randomBytes(16).toString('hex');
        res.cookie(VOTER, voter, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 365 * 24 * 60 * 60 * 1000,
        });
    }

    return { token, voter };
}

function requireCsrf(req, res, next) {
    const cookieToken = req.cookies?.[COOKIE];
    const headerToken = req.get('x-csrf-token') || req.body?.csrfToken;
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        return res.status(403).json({
            success: false,
            error: 'Проверка формы не прошла. Обновите страницу и попробуйте снова.',
        });
    }
    next();
}

function honeypotTripped(body) {
    const bait = body?.fax_number ?? body?.company_url ?? body?.website;
    return typeof bait === 'string' && bait.trim().length > 0;
}

function rejectHoneypot(req, res, next) {
    if (honeypotTripped(req.body)) {
        return res.json({ success: true, message: 'ok' });
    }
    next();
}

function getVoterKey(req) {
    return req.cookies?.[VOTER] || `ip:${req.ip || 'unknown'}`;
}

module.exports = {
    issueCsrf,
    requireCsrf,
    rejectHoneypot,
    getVoterKey,
};
