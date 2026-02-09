const express = require('express');
const router = express.Router();
const { requireUserAuth } = require('../middleware/userAuth');
const { requirePermission } = require('../middleware/rolePermission');

let db;

function setDb(database) {
  db = database;
}

// DEBUG endpoint to verify db object structure
router.get('/debug', (req, res) => {
  res.json({
    hasDb: !!db,
    hasPool: !!db?.pool,
    hasQuery: !!db?.query,
    hasPoolQuery: !!db?.pool?.query,
    dbType: typeof db,
    poolType: typeof db?.pool
  });
});

// GET /api/forum/threads - List all threads with pagination and filtering
router.get('/threads', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'recent',
      pinned,
      locked,
      search
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT
        t.*,
        u.name as author_username,
        COUNT(DISTINCT c.id) as comment_count,
        MAX(COALESCE(c.created_at, t.created_at)) as last_activity
      FROM forum_threads t
      LEFT JOIN users u ON t.author_id = u.id
      LEFT JOIN forum_comments c ON t.id = c.thread_id AND c.is_deleted = false
      WHERE t.is_deleted = false
    `;

    const params = [];
    let paramCount = 1;

    if (pinned !== undefined) {
      query += ` AND t.is_pinned = $${paramCount}`;
      params.push(pinned === 'true');
      paramCount++;
    }

    if (locked !== undefined) {
      query += ` AND t.is_locked = $${paramCount}`;
      params.push(locked === 'true');
      paramCount++;
    }

    if (search) {
      query += ` AND (t.title ILIKE $${paramCount} OR t.body ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` GROUP BY t.id, u.name`;

    // Sorting
    switch (sortBy) {
      case 'recent':
        query += ` ORDER BY t.is_pinned DESC, last_activity DESC`;
        break;
      case 'popular':
        query += ` ORDER BY t.is_pinned DESC, comment_count DESC`;
        break;
      case 'oldest':
        query += ` ORDER BY t.is_pinned DESC, t.created_at ASC`;
        break;
      default:
        query += ` ORDER BY t.is_pinned DESC, last_activity DESC`;
    }

    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), offset);

    const result = await db.pool.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(DISTINCT t.id) as total
      FROM forum_threads t
      WHERE t.is_deleted = false
    `;
    const countParams = [];
    let countParamIndex = 1;

    if (pinned !== undefined) {
      countQuery += ` AND t.is_pinned = $${countParamIndex}`;
      countParams.push(pinned === 'true');
      countParamIndex++;
    }

    if (locked !== undefined) {
      countQuery += ` AND t.is_locked = $${countParamIndex}`;
      countParams.push(locked === 'true');
      countParamIndex++;
    }

    if (search) {
      countQuery += ` AND (t.title ILIKE $${countParamIndex} OR t.body ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await db.pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      threads: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching threads:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to fetch threads',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

// GET /api/forum/threads/:id - Get single thread with comments
router.get('/threads/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get thread details
    const threadResult = await db.pool.query(`
      SELECT
        t.*,
        u.name as author_username,
        COUNT(DISTINCT c.id) as comment_count
      FROM forum_threads t
      LEFT JOIN users u ON t.author_id = u.id
      LEFT JOIN forum_comments c ON t.id = c.thread_id AND c.is_deleted = false
      WHERE t.id = $1 AND t.is_deleted = false
      GROUP BY t.id, u.name
    `, [id]);

    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const thread = threadResult.rows[0];

    // Get top-level comments with vote counts
    const commentsResult = await db.pool.query(`
      SELECT
        c.*,
        u.name as author_username,
        COUNT(DISTINCT r.id) as reply_count,
        SUM(CASE WHEN v.vote_type = 'upvote' THEN 1 ELSE 0 END)::integer as upvotes,
        SUM(CASE WHEN v.vote_type = 'downvote' THEN 1 ELSE 0 END)::integer as downvotes
      FROM forum_comments c
      LEFT JOIN users u ON c.author_id = u.id
      LEFT JOIN forum_comments r ON c.id = r.parent_id AND r.is_deleted = false
      LEFT JOIN forum_votes v ON c.id = v.comment_id
      WHERE c.thread_id = $1 AND c.parent_id IS NULL AND c.is_deleted = false
      GROUP BY c.id, u.name
      ORDER BY c.created_at ASC
    `, [id]);

    // Increment view count
    await db.pool.query(`
      UPDATE forum_threads
      SET view_count = view_count + 1
      WHERE id = $1
    `, [id]);

    res.json({
      thread: {
        ...thread,
        view_count: thread.view_count + 1
      },
      comments: commentsResult.rows
    });
  } catch (error) {
    console.error('Error fetching thread:', error);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// POST /api/forum/threads - Create new thread (requires authentication)
router.post('/threads', requireUserAuth, async (req, res) => {
  try {
    const { title, content } = req.body;
    const userId = req.user.id;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    if (title.length < 3 || title.length > 200) {
      return res.status(400).json({ error: 'Title must be between 3 and 200 characters' });
    }

    if (content.length < 10) {
      return res.status(400).json({ error: 'Content must be at least 10 characters' });
    }

    const result = await db.createForumThread(userId, title, content);

    res.status(201).json({
      message: 'Thread created successfully',
      thread: result
    });
  } catch (error) {
    console.error('Error creating thread:', error);
    res.status(500).json({ error: 'Failed to create thread' });
  }
});

// PUT /api/forum/threads/:id - Update thread (author only or moderator)
router.put('/threads/:id', requireUserAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    const userId = req.user.id;

    // Check if thread exists
    const threadResult = await db.pool.query(`
      SELECT * FROM forum_threads
      WHERE id = $1 AND is_deleted = false
    `, [id]);

    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const thread = threadResult.rows[0];

    // Check if user is author or has moderator permission
    const isAuthor = thread.author_id === userId;
    const canModerate = await db.userHasPermission(userId, 'can_moderate');

    if (!isAuthor && !canModerate) {
      return res.status(403).json({ error: 'You do not have permission to edit this thread' });
    }

    // Validate input
    if (title && (title.length < 3 || title.length > 200)) {
      return res.status(400).json({ error: 'Title must be between 3 and 200 characters' });
    }

    if (content && content.length < 10) {
      return res.status(400).json({ error: 'Content must be at least 10 characters' });
    }

    // Update thread
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount}`);
      params.push(title);
      paramCount++;
    }

    if (content !== undefined) {
      updates.push(`content = $${paramCount}`);
      params.push(content);
      paramCount++;
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const updateQuery = `
      UPDATE forum_threads
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.pool.query(updateQuery, params);

    res.json({
      message: 'Thread updated successfully',
      thread: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating thread:', error);
    res.status(500).json({ error: 'Failed to update thread' });
  }
});

// DELETE /api/forum/threads/:id - Soft delete thread (author or moderator)
router.delete('/threads/:id', requireUserAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if thread exists
    const threadResult = await db.pool.query(`
      SELECT * FROM forum_threads
      WHERE id = $1 AND is_deleted = false
    `, [id]);

    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const thread = threadResult.rows[0];

    // Check if user is author or has moderator permission
    const isAuthor = thread.author_id === userId;
    const canModerate = await db.userHasPermission(userId, 'can_moderate');

    if (!isAuthor && !canModerate) {
      return res.status(403).json({ error: 'You do not have permission to delete this thread' });
    }

    // Soft delete
    await db.pool.query(`
      UPDATE forum_threads
      SET is_deleted = true, updated_at = NOW()
      WHERE id = $1
    `, [id]);

    res.json({ message: 'Thread deleted successfully' });
  } catch (error) {
    console.error('Error deleting thread:', error);
    res.status(500).json({ error: 'Failed to delete thread' });
  }
});

module.exports = { router, setDb };
