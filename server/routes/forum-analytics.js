const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

let db;

function setDb(database) {
  db = database;
}

// GET /api/forum/analytics - Get forum analytics data
router.get('/', requireAuth, async (req, res) => {
  try {
    const { range = '30d' } = req.query;

    // Calculate date range
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Overview stats
    const overviewQuery = `
      SELECT
        (SELECT COUNT(*) FROM forum_threads WHERE is_deleted = false) as total_threads,
        (SELECT COUNT(*) FROM forum_comments WHERE is_deleted = false) as total_comments,
        (SELECT COUNT(*) FROM users WHERE environment = 'production') as total_users,
        (SELECT COUNT(DISTINCT author_id) FROM forum_threads
         WHERE created_at >= NOW() - INTERVAL '7 days' AND is_deleted = false) as active_users_7d,
        CASE
          WHEN (SELECT COUNT(*) FROM forum_threads WHERE is_deleted = false) > 0
          THEN (SELECT COUNT(*) FROM forum_comments WHERE is_deleted = false)::float /
               (SELECT COUNT(*) FROM forum_threads WHERE is_deleted = false)
          ELSE 0
        END as avg_comments_per_thread
    `;

    const overviewResult = await db.pool.query(overviewQuery);
    const overview = overviewResult.rows[0];

    // Timeline data
    const timelineQuery = `
      SELECT
        DATE(created_at) as date,
        COUNT(CASE WHEN type = 'thread' THEN 1 END) as threads,
        COUNT(CASE WHEN type = 'comment' THEN 1 END) as comments,
        COUNT(DISTINCT user_id) as users
      FROM (
        SELECT created_at, 'thread' as type, author_id as user_id FROM forum_threads
        WHERE created_at >= $1 AND is_deleted = false
        UNION ALL
        SELECT created_at, 'comment' as type, author_id as user_id FROM forum_comments
        WHERE created_at >= $1 AND is_deleted = false
      ) combined
      GROUP BY DATE(created_at)
      ORDER BY date
    `;

    const timelineResult = await db.pool.query(timelineQuery, [startDate]);
    const timeline = timelineResult.rows;

    // Top contributors
    const contributorsQuery = `
      SELECT
        u.name as username,
        COUNT(DISTINCT t.id) as threads_count,
        COUNT(DISTINCT c.id) as comments_count,
        COALESCE(r.total_points, 0) as reputation
      FROM users u
      LEFT JOIN forum_threads t ON u.id = t.author_id AND t.is_deleted = false
      LEFT JOIN forum_comments c ON u.id = c.author_id AND c.is_deleted = false
      LEFT JOIN forum_reputation r ON u.id = r.user_id
      GROUP BY u.id, u.name, r.total_points
      HAVING COUNT(DISTINCT t.id) > 0 OR COUNT(DISTINCT c.id) > 0
      ORDER BY reputation DESC, threads_count DESC, comments_count DESC
      LIMIT 10
    `;

    const contributorsResult = await db.pool.query(contributorsQuery);
    const top_contributors = contributorsResult.rows;

    // Activity by hour
    const hourlyQuery = `
      SELECT
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as activity_count
      FROM (
        SELECT created_at FROM forum_threads WHERE created_at >= $1 AND is_deleted = false
        UNION ALL
        SELECT created_at FROM forum_comments WHERE created_at >= $1 AND is_deleted = false
      ) combined
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `;

    const hourlyResult = await db.pool.query(hourlyQuery, [startDate]);

    // Fill in missing hours with 0
    const engagement_by_hour = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      activity_count: 0
    }));

    hourlyResult.rows.forEach(row => {
      engagement_by_hour[parseInt(row.hour)] = {
        hour: parseInt(row.hour),
        activity_count: parseInt(row.activity_count)
      };
    });

    res.json({
      overview: {
        total_threads: parseInt(overview.total_threads),
        total_comments: parseInt(overview.total_comments),
        total_users: parseInt(overview.total_users),
        active_users_7d: parseInt(overview.active_users_7d),
        avg_comments_per_thread: parseFloat(overview.avg_comments_per_thread)
      },
      timeline,
      top_contributors,
      engagement_by_hour
    });

  } catch (error) {
    console.error('Error fetching forum analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

module.exports = { router, setDb };
