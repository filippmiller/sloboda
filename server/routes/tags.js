const express = require('express');
const router = express.Router();

// Will be injected from main app
let db;

function setDb(database) {
    db = database;
}

/**
 * GET /api/tags/popular
 * Get popular tags with usage counts
 */
router.get('/popular', async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 50;

        const result = await db.pool.query(`
            SELECT
                DISTINCT UNNEST(tags) as tag,
                COUNT(*) as count
            FROM posts
            WHERE tags IS NOT NULL
                AND status = 'published'
            GROUP BY tag
            ORDER BY count DESC, tag ASC
            LIMIT $1
        `, [limit]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Error fetching popular tags:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch tags' });
    }
});

/**
 * GET /api/tags/search
 * Search for tags by query
 */
router.get('/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        const limit = req.query.limit ? parseInt(req.query.limit) : 20;

        if (!query || query.length < 2) {
            return res.json({ success: true, data: [] });
        }

        const result = await db.pool.query(`
            SELECT
                DISTINCT UNNEST(tags) as tag,
                COUNT(*) as count
            FROM posts
            WHERE tags IS NOT NULL
                AND status = 'published'
                AND UNNEST(tags) ILIKE $1
            GROUP BY tag
            ORDER BY count DESC, tag ASC
            LIMIT $2
        `, [`%${query}%`, limit]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Error searching tags:', err);
        res.status(500).json({ success: false, error: 'Failed to search tags' });
    }
});

/**
 * GET /api/tags/related
 * Get tags that frequently co-occur with the given tag
 */
router.get('/related', async (req, res) => {
    try {
        const tag = req.query.tag;
        const limit = req.query.limit ? parseInt(req.query.limit) : 10;

        if (!tag) {
            return res.status(400).json({ success: false, error: 'Tag parameter required' });
        }

        // Find posts with this tag, then count co-occurring tags
        const result = await db.pool.query(`
            WITH posts_with_tag AS (
                SELECT id, tags
                FROM posts
                WHERE tags IS NOT NULL
                    AND status = 'published'
                    AND $1 = ANY(tags)
            )
            SELECT
                UNNEST(tags) as tag,
                COUNT(*) as count
            FROM posts_with_tag
            WHERE UNNEST(tags) != $1
            GROUP BY tag
            ORDER BY count DESC, tag ASC
            LIMIT $2
        `, [tag, limit]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Error fetching related tags:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch related tags' });
    }
});

/**
 * GET /api/tags/categories
 * Get tag categories
 */
router.get('/categories', async (req, res) => {
    try {
        const result = await db.pool.query(`
            SELECT id, name, slug, color, description
            FROM tag_categories
            ORDER BY sort_order ASC, name ASC
        `);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Error fetching tag categories:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch tag categories' });
    }
});

module.exports = { router, setDb };
