const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireUserAuth, optionalUserAuth } = require('../middleware/userAuth');
const { issueCsrf, requireCsrf, rejectHoneypot, getVoterKey } = require('../middleware/csrf');
const { sanitizePlain } = require('../utils/sanitizeHtml');
const emailService = require('../services/email');

let db;

function setDb(database) {
    db = database;
}

const DOMAINS = [
    { code: 'GEN', name: 'Общие принципы' },
    { code: 'DOM', name: 'Дом и стройка' },
    { code: 'EKO', name: 'Еда и хозяйство' },
    { code: 'ENR', name: 'Энергия' },
    { code: 'VOD', name: 'Вода' },
    { code: 'MED', name: 'Здоровье' },
    { code: 'OBR', name: 'Обучение' },
    { code: 'NOR', name: 'Право' },
];

async function ensureTables() {
    const client = await db.pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS community_polls (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                body TEXT,
                options TEXT[] NOT NULL,
                kind VARCHAR(20) NOT NULL DEFAULT 'advisory',
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                author_name VARCHAR(120),
                author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                ends_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS community_poll_votes (
                id SERIAL PRIMARY KEY,
                poll_id INTEGER NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
                option_index INTEGER NOT NULL,
                voter_key VARCHAR(80) NOT NULL,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(poll_id, voter_key)
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS community_wall (
                id SERIAL PRIMARY KEY,
                name VARCHAR(80) NOT NULL,
                city VARCHAR(80),
                body TEXT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                ip_hash VARCHAR(64),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS newsletter_subscribers (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                confirm_token VARCHAR(64),
                confirmed_at TIMESTAMP,
                unsubscribed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS community_news (
                id SERIAL PRIMARY KEY,
                title VARCHAR(300) NOT NULL,
                summary TEXT NOT NULL,
                source_url TEXT,
                source_name VARCHAR(200),
                status VARCHAR(20) NOT NULL DEFAULT 'draft',
                created_by VARCHAR(20) NOT NULL DEFAULT 'agent',
                published_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS contribution_intents (
                id SERIAL PRIMARY KEY,
                name VARCHAR(120),
                email VARCHAR(255) NOT NULL,
                amount INTEGER NOT NULL,
                kind VARCHAR(30) NOT NULL DEFAULT 'future_help',
                note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS curator_votes (
                id SERIAL PRIMARY KEY,
                domain_code VARCHAR(10) NOT NULL,
                nominee VARCHAR(120) NOT NULL,
                voter_key VARCHAR(80) NOT NULL,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(domain_code, voter_key)
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS knowledge_quality_votes (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                vote VARCHAR(10) NOT NULL,
                voter_key VARCHAR(80) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(post_id, voter_key)
            )
        `);

        const pollCount = await client.query('SELECT COUNT(*)::int AS n FROM community_polls');
        if (pollCount.rows[0].n === 0) {
            await client.query(
                `INSERT INTO community_polls (title, body, options, kind, status, author_name)
                 VALUES ($1, $2, $3, 'advisory', 'published', 'SLOBODA')`,
                [
                    'С чего начать Слободу в ближайшие 90 дней?',
                    'Это совет, не приказ. Голос поможет выбрать первый настоящий шаг.',
                    [
                        'Собрать базу знаний и выбрать кураторов',
                        'Сначала юрист и оформление АНО',
                        'Сразу искать землю',
                        'Сначала виртуальное поселение на сайте',
                    ],
                ]
            );
        }

        const newsCount = await client.query('SELECT COUNT(*)::int AS n FROM community_news');
        if (newsCount.rows[0].n === 0) {
            await client.query(
                `INSERT INTO community_news (title, summary, source_name, status, created_by, published_at)
                 VALUES ($1, $2, $3, 'published', 'editor', NOW())`,
                [
                    'Мы убрали фейковые цифры и кнопку оплаты',
                    'На сайте больше нет нарисованных участников, собранных сумм и якобы Яндекс/Тинькофф. Денег не берём, пока нет юридического лица. Пожертвование не даёт долю в земле или заводе.',
                    'SLOBODA',
                ]
            );
        }
    } finally {
        client.release();
    }
}

router.get('/public/csrf', (req, res) => {
    const { token } = issueCsrf(req, res);
    res.json({ success: true, token });
});

function mapPoll(row, voterKey) {
    const counts = row.vote_counts || [];
    const options = (row.options || []).map((text, index) => ({
        text,
        votes: counts[index] || 0,
    }));
    return {
        id: row.id,
        title: row.title,
        body: row.body,
        kind: row.kind,
        status: row.status,
        author_name: row.author_name,
        ends_at: row.ends_at,
        created_at: row.created_at,
        options,
        total_votes: options.reduce((s, o) => s + o.votes, 0),
        my_vote: row.my_vote === null || row.my_vote === undefined ? null : Number(row.my_vote),
    };
}

async function attachPollVotes(polls, voterKey) {
    if (!polls.length) return [];
    const ids = polls.map((p) => p.id);
    const votes = await db.pool.query(
        `SELECT poll_id, option_index, COUNT(*)::int AS n
         FROM community_poll_votes
         WHERE poll_id = ANY($1)
         GROUP BY poll_id, option_index`,
        [ids]
    );
    const mine = voterKey
        ? await db.pool.query(
            `SELECT poll_id, option_index FROM community_poll_votes WHERE poll_id = ANY($1) AND voter_key = $2`,
            [ids, voterKey]
        )
        : { rows: [] };

    return polls.map((poll) => {
        const vote_counts = [];
        votes.rows.filter((v) => v.poll_id === poll.id).forEach((v) => {
            vote_counts[v.option_index] = v.n;
        });
        const my = mine.rows.find((v) => v.poll_id === poll.id);
        return mapPoll({ ...poll, vote_counts, my_vote: my ? my.option_index : null }, voterKey);
    });
}

router.get('/public/community', optionalUserAuth, async (req, res) => {
    try {
        const voterKey = getVoterKey(req);
        const [pollsRes, wallRes, newsRes, curatorsRes] = await Promise.all([
            db.pool.query(
                `SELECT * FROM community_polls WHERE status = 'published' ORDER BY created_at DESC LIMIT 20`
            ),
            db.pool.query(
                `SELECT id, name, city, body, created_at FROM community_wall
                 WHERE status = 'approved' ORDER BY created_at DESC LIMIT 40`
            ),
            db.pool.query(
                `SELECT id, title, summary, source_url, source_name, published_at
                 FROM community_news WHERE status = 'published'
                 ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT 12`
            ),
            db.pool.query(
                `SELECT domain_code, nominee, COUNT(*)::int AS votes
                 FROM curator_votes
                 GROUP BY domain_code, nominee
                 ORDER BY votes DESC`
            ),
        ]);

        const polls = await attachPollVotes(pollsRes.rows, voterKey);
        const curators = DOMAINS.map((d) => ({
            ...d,
            leaders: curatorsRes.rows
                .filter((r) => r.domain_code === d.code)
                .slice(0, 3),
        }));

        res.json({
            success: true,
            polls,
            wall: wallRes.rows,
            news: newsRes.rows,
            curators,
        });
    } catch (err) {
        console.error('[community] public list', err);
        res.status(500).json({ success: false, error: 'Не удалось загрузить сообщество' });
    }
});

router.post('/public/polls', requireCsrf, rejectHoneypot, optionalUserAuth, async (req, res) => {
    try {
        const title = sanitizePlain(req.body.title, 180);
        const body = sanitizePlain(req.body.body, 800);
        const authorName = sanitizePlain(req.body.authorName || req.user?.name || 'Гость', 80);
        const options = Array.isArray(req.body.options)
            ? req.body.options.map((o) => sanitizePlain(o, 120)).filter(Boolean).slice(0, 6)
            : [];
        const kind = req.body.kind === 'binding' ? 'binding' : 'advisory';

        if (title.length < 8 || options.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Нужен вопрос не короче 8 символов и минимум два варианта',
            });
        }

        const result = await db.pool.query(
            `INSERT INTO community_polls (title, body, options, kind, status, author_name, author_user_id)
             VALUES ($1, $2, $3, $4, 'pending', $5, $6)
             RETURNING id`,
            [title, body, options, kind, authorName, req.user?.id || null]
        );

        res.json({
            success: true,
            id: result.rows[0].id,
            message: 'Опрос отправлен на проверку. Он появится после одобрения.',
        });
    } catch (err) {
        console.error('[community] create poll', err);
        res.status(500).json({ success: false, error: 'Не удалось создать опрос' });
    }
});

router.post('/public/polls/:id/vote', requireCsrf, rejectHoneypot, optionalUserAuth, async (req, res) => {
    try {
        const pollId = parseInt(req.params.id, 10);
        const optionIndex = parseInt(req.body.optionIndex, 10);
        const voterKey = getVoterKey(req);

        const poll = await db.pool.query(
            `SELECT id, options, status FROM community_polls WHERE id = $1`,
            [pollId]
        );
        if (!poll.rows[0] || poll.rows[0].status !== 'published') {
            return res.status(404).json({ success: false, error: 'Опрос не найден' });
        }
        if (Number.isNaN(optionIndex) || optionIndex < 0 || optionIndex >= poll.rows[0].options.length) {
            return res.status(400).json({ success: false, error: 'Нет такого варианта' });
        }

        await db.pool.query(
            `INSERT INTO community_poll_votes (poll_id, option_index, voter_key, user_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (poll_id, voter_key) DO UPDATE SET option_index = EXCLUDED.option_index`,
            [pollId, optionIndex, voterKey, req.user?.id || null]
        );

        const fresh = await db.pool.query(`SELECT * FROM community_polls WHERE id = $1`, [pollId]);
        const [mapped] = await attachPollVotes(fresh.rows, voterKey);
        res.json({ success: true, poll: mapped });
    } catch (err) {
        console.error('[community] vote', err);
        res.status(500).json({ success: false, error: 'Не удалось проголосовать' });
    }
});

router.post('/public/wall', requireCsrf, rejectHoneypot, async (req, res) => {
    try {
        const name = sanitizePlain(req.body.name, 80);
        const city = sanitizePlain(req.body.city, 80);
        const body = sanitizePlain(req.body.body, 600);
        if (name.length < 2 || body.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'Нужны имя и сообщение не короче 8 символов',
            });
        }

        const ipHash = crypto.createHash('sha256').update(String(req.ip || '')).digest('hex').slice(0, 32);
        await db.pool.query(
            `INSERT INTO community_wall (name, city, body, status, ip_hash)
             VALUES ($1, $2, $3, 'pending', $4)`,
            [name, city || null, body, ipHash]
        );

        res.json({
            success: true,
            message: 'Сообщение принято. Оно появится на стене после проверки.',
        });
    } catch (err) {
        console.error('[community] wall', err);
        res.status(500).json({ success: false, error: 'Не удалось отправить сообщение' });
    }
});

router.post('/public/subscribe', requireCsrf, rejectHoneypot, async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, error: 'Нужна настоящая почта' });
        }

        const token = crypto.randomBytes(20).toString('hex');
        await db.pool.query(
            `INSERT INTO newsletter_subscribers (email, confirm_token)
             VALUES ($1, $2)
             ON CONFLICT (email) DO UPDATE
               SET confirm_token = EXCLUDED.confirm_token,
                   unsubscribed_at = NULL
             WHERE newsletter_subscribers.confirmed_at IS NULL`,
            [email, token]
        );

        const base = process.env.PUBLIC_BASE_URL || 'https://sloboda-production.up.railway.app';
        const link = `${base}/api/public/subscribe/confirm?token=${token}`;
        const sent = await emailService.sendEmail({
            to: email,
            subject: 'Подтвердите подписку на СЛОБОДУ',
            body: `Здравствуйте.<br><br>Если это вы просили письма Слободы, откройте ссылку:<br><a href="${link}">${link}</a><br><br>Если нет — просто удалите это письмо.`,
        });

        res.json({
            success: true,
            message: sent.success
                ? 'Проверьте почту и подтвердите подписку.'
                : 'Почту записали. Письмо подтверждения отправим, когда заработает рассылка.',
            emailed: !!sent.success,
        });
    } catch (err) {
        console.error('[community] subscribe', err);
        res.status(500).json({ success: false, error: 'Не удалось подписаться' });
    }
});

router.get('/public/subscribe/confirm', async (req, res) => {
    try {
        const token = String(req.query.token || '');
        if (!token) {
            return res.status(400).send('Нет кода подтверждения');
        }
        const result = await db.pool.query(
            `UPDATE newsletter_subscribers
             SET confirmed_at = NOW(), confirm_token = NULL
             WHERE confirm_token = $1 AND unsubscribed_at IS NULL
             RETURNING email`,
            [token]
        );
        if (!result.rows[0]) {
            return res.status(400).send('Ссылка устарела или уже использована.');
        }
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send('<!doctype html><meta charset="utf-8"><title>СЛОБОДА</title><body style="font-family:sans-serif;padding:40px;background:#0a0a0a;color:#eee"><h1>Подписка подтверждена</h1><p>Будем писать только по делу.</p><p><a href="/" style="color:#c23616">На главную</a></p></body>');
    } catch (err) {
        console.error('[community] confirm', err);
        res.status(500).send('Ошибка подтверждения');
    }
});

router.post('/public/intents', requireCsrf, rejectHoneypot, async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const name = sanitizePlain(req.body.name, 80);
        const amount = parseInt(req.body.amount, 10);
        const kind = req.body.kind === 'future_pai' ? 'future_pai' : 'future_help';
        const note = sanitizePlain(req.body.note, 400);

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !amount || amount < 100) {
            return res.status(400).json({
                success: false,
                error: 'Нужны почта и сумма от 100 рублей. Это не платёж.',
            });
        }

        await db.pool.query(
            `INSERT INTO contribution_intents (name, email, amount, kind, note)
             VALUES ($1, $2, $3, $4, $5)`,
            [name || null, email, amount, kind, note || null]
        );

        res.json({
            success: true,
            message: 'Намерение записано. Деньги не списаны. Доли нет. Когда появится кооператив — напишем.',
        });
    } catch (err) {
        console.error('[community] intent', err);
        res.status(500).json({ success: false, error: 'Не удалось записать намерение' });
    }
});

router.post('/public/curators/vote', requireCsrf, rejectHoneypot, optionalUserAuth, async (req, res) => {
    try {
        const domain = sanitizePlain(req.body.domain, 10).toUpperCase();
        const nominee = sanitizePlain(req.body.nominee, 80);
        if (!DOMAINS.some((d) => d.code === domain) || nominee.length < 2) {
            return res.status(400).json({ success: false, error: 'Нужны раздел и имя куратора' });
        }
        const voterKey = getVoterKey(req);
        await db.pool.query(
            `INSERT INTO curator_votes (domain_code, nominee, voter_key, user_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (domain_code, voter_key) DO UPDATE SET nominee = EXCLUDED.nominee`,
            [domain, nominee, voterKey, req.user?.id || null]
        );
        res.json({ success: true, message: 'Голос за куратора принят. Один голос на раздел.' });
    } catch (err) {
        console.error('[community] curator', err);
        res.status(500).json({ success: false, error: 'Не удалось проголосовать' });
    }
});

router.post('/public/knowledge/:id/quality', rejectHoneypot, optionalUserAuth, async (req, res) => {
    try {
        const postId = parseInt(req.params.id, 10);
        const vote = req.body.vote === 'unsafe' ? 'unsafe' : 'safe';
        const voterKey = getVoterKey(req);
        const post = await db.pool.query(
            `SELECT id FROM posts WHERE id = $1 AND status = 'published'`,
            [postId]
        );
        if (!post.rows[0]) {
            return res.status(404).json({ success: false, error: 'Материал не найден' });
        }
        await db.pool.query(
            `INSERT INTO knowledge_quality_votes (post_id, vote, voter_key)
             VALUES ($1, $2, $3)
             ON CONFLICT (post_id, voter_key) DO UPDATE SET vote = EXCLUDED.vote`,
            [postId, vote, voterKey]
        );
        const counts = await db.pool.query(
            `SELECT vote, COUNT(*)::int AS n FROM knowledge_quality_votes WHERE post_id = $1 GROUP BY vote`,
            [postId]
        );
        res.json({
            success: true,
            safe: counts.rows.find((r) => r.vote === 'safe')?.n || 0,
            unsafe: counts.rows.find((r) => r.vote === 'unsafe')?.n || 0,
        });
    } catch (err) {
        console.error('[community] quality', err);
        res.status(500).json({ success: false, error: 'Не удалось оценить материал' });
    }
});

router.get('/admin/community', requireAuth, async (req, res) => {
    try {
        const [wall, polls, news, intents, subs] = await Promise.all([
            db.pool.query(`SELECT * FROM community_wall ORDER BY created_at DESC LIMIT 100`),
            db.pool.query(`SELECT * FROM community_polls ORDER BY created_at DESC LIMIT 100`),
            db.pool.query(`SELECT * FROM community_news ORDER BY created_at DESC LIMIT 100`),
            db.pool.query(`SELECT * FROM contribution_intents ORDER BY created_at DESC LIMIT 200`),
            db.pool.query(
                `SELECT id, email, confirmed_at, unsubscribed_at, created_at
                 FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 300`
            ),
        ]);
        res.json({
            success: true,
            wall: wall.rows,
            polls: polls.rows,
            news: news.rows,
            intents: intents.rows,
            subscribers: subs.rows,
        });
    } catch (err) {
        console.error('[community] admin list', err);
        res.status(500).json({ success: false, error: 'Не удалось загрузить модерацию' });
    }
});

router.post('/admin/community/wall/:id/:action', requireAuth, async (req, res) => {
    const action = req.params.action === 'approve' ? 'approved' : 'rejected';
    await db.pool.query(`UPDATE community_wall SET status = $1 WHERE id = $2`, [action, parseInt(req.params.id, 10)]);
    res.json({ success: true });
});

router.post('/admin/community/polls/:id/:action', requireAuth, async (req, res) => {
    const map = { approve: 'published', reject: 'rejected', close: 'closed' };
    const status = map[req.params.action];
    if (!status) return res.status(400).json({ success: false, error: 'Неизвестное действие' });
    await db.pool.query(`UPDATE community_polls SET status = $1 WHERE id = $2`, [status, parseInt(req.params.id, 10)]);
    res.json({ success: true });
});

router.post('/admin/community/news/:id/:action', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (req.params.action === 'publish') {
        await db.pool.query(
            `UPDATE community_news SET status = 'published', published_at = NOW() WHERE id = $1`,
            [id]
        );
    } else if (req.params.action === 'reject') {
        await db.pool.query(`UPDATE community_news SET status = 'rejected' WHERE id = $1`, [id]);
    } else {
        return res.status(400).json({ success: false, error: 'Неизвестное действие' });
    }
    res.json({ success: true });
});

router.post('/admin/community/news/generate', requireAuth, async (req, res) => {
    try {
        const { callClaude } = require('../services/ai/anthropic');
        const { content } = await callClaude({
            model: 'claude-haiku-4-5-20251001',
            maxTokens: 1200,
            systemPrompt: [
                'Ты редактор ленты SLOBODA. Тема: жизнь без офисной работы, автономные поселения, земля, стройка, право в России, ИИ и занятость.',
                'Верни ТОЛЬКО JSON-массив из 3 объектов: title, summary, source_name, source_url.',
                'Не выдумывай ссылки. Если нет надёжного источника — source_url пустая строка, а в summary напиши, что это обзор, не новость с фактом.',
                'Язык русский. Коротко. Без паники и без обещаний дохода.',
            ].join(' '),
            userPrompt: 'Собери три черновика для ленты на сегодня.',
        });

        let items = [];
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            items = JSON.parse(jsonMatch[0]);
        }
        if (!Array.isArray(items) || !items.length) {
            return res.status(502).json({ success: false, error: 'Агент не вернул список новостей' });
        }

        const created = [];
        for (const item of items.slice(0, 5)) {
            const title = sanitizePlain(item.title, 300);
            const summary = sanitizePlain(item.summary, 800);
            if (!title || !summary) continue;
            const sourceUrl = typeof item.source_url === 'string' && item.source_url.startsWith('http')
                ? item.source_url.slice(0, 500)
                : null;
            const result = await db.pool.query(
                `INSERT INTO community_news (title, summary, source_url, source_name, status, created_by)
                 VALUES ($1, $2, $3, $4, 'draft', 'agent')
                 RETURNING *`,
                [title, summary, sourceUrl, sanitizePlain(item.source_name, 120) || 'обзор']
            );
            created.push(result.rows[0]);
        }

        res.json({ success: true, drafts: created });
    } catch (err) {
        console.error('[community] generate news', err);
        res.status(500).json({
            success: false,
            error: 'Не удалось собрать черновики. Проверьте ключ ИИ.',
        });
    }
});

module.exports = { router, setDb, ensureTables };
