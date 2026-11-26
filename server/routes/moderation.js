const express = require('express');
const router = express.Router();
const { requireUserAuth } = require('../middleware/userAuth');
const { requirePermission } = require('../middleware/rolePermission');
const { requireCsrfIfCookie } = require('../middleware/csrf');
const { parsePositiveInt } = require('../utils/validation');

let db;

function setDb(database) {
  db = database;
}

function parsePagination(query) {
  const rawPage = parseInt(query.page, 10);
  const rawLimit = parseInt(query.limit, 10);
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 50;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

// POST /api/moderation/threads/:id/pin - Pin/unpin thread (requires can_pin_threads)
router.post('/threads/:id/pin', requireUserAuth, requireCsrfIfCookie, requirePermission('can_pin_threads'), async (req, res) => {
  try {
    const threadId = parsePositiveInt(req.params.id);
    if (!threadId) {
      return res.status(400).json({ error: 'Invalid thread ID' });
    }
    const { pinned } = req.body;

    if (typeof pinned !== 'boolean') {
      return res.status(400).json({ error: 'Pinned status must be a boolean' });
    }

    // Check if thread exists
    const threadResult = await db.pool.query(`
      SELECT id FROM forum_threads WHERE id = $1 AND is_deleted = false
    `, [threadId]);

    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Update pin status
    await db.pool.query(`
      UPDATE forum_threads
      SET is_pinned = $1, updated_at = NOW()
      WHERE id = $2
    `, [pinned, threadId]);

    res.json({
      message: `Thread ${pinned ? 'pinned' : 'unpinned'} successfully`,
      threadId,
      pinned
    });
  } catch (error) {
    console.error('Error updating pin status:', error);
    res.status(500).json({ error: 'Failed to update pin status' });
  }
});

// POST /api/moderation/threads/:id/lock - Lock/unlock thread (requires can_lock_threads)
router.post('/threads/:id/lock', requireUserAuth, requireCsrfIfCookie, requirePermission('can_lock_threads'), async (req, res) => {
  try {
    const threadId = parsePositiveInt(req.params.id);
    if (!threadId) {
      return res.status(400).json({ error: 'Invalid thread ID' });
    }
    const { locked } = req.body;

    if (typeof locked !== 'boolean') {
      return res.status(400).json({ error: 'Locked status must be a boolean' });
    }

    // Check if thread exists
    const threadResult = await db.pool.query(`
      SELECT id FROM forum_threads WHERE id = $1 AND is_deleted = false
    `, [threadId]);

    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Update lock status
    await db.pool.query(`
      UPDATE forum_threads
      SET is_locked = $1, updated_at = NOW()
      WHERE id = $2
    `, [locked, threadId]);

    res.json({
      message: `Thread ${locked ? 'locked' : 'unlocked'} successfully`,
      threadId,
      locked
    });
  } catch (error) {
    console.error('Error updating lock status:', error);
    res.status(500).json({ error: 'Failed to update lock status' });
  }
});

// POST /api/moderation/users/:id/warn - Warn a user (requires can_warn_users)
router.post('/users/:id/warn', requireUserAuth, requireCsrfIfCookie, requirePermission('can_warn_users'), async (req, res) => {
  try {
    const userId = parsePositiveInt(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const { reason } = req.body;
    const moderatorId = req.user.id;

    if (typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Warning reason must be at least 5 characters' });
    }

    // Check if user exists
    const userResult = await db.pool.query(`
      SELECT id, name FROM users WHERE id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Cannot warn yourself
    if (userId === moderatorId) {
      return res.status(403).json({ error: 'You cannot warn yourself' });
    }

    // Record the warning
    const result = await db.pool.query(`
      INSERT INTO forum_moderation_actions
      (user_id, moderator_id, action_type, reason)
      VALUES ($1, $2, 'warn', $3)
      RETURNING *
    `, [userId, moderatorId, reason.trim()]);

    res.status(201).json({
      message: 'Warning issued successfully',
      warning: result.rows[0]
    });
  } catch (error) {
    console.error('Error issuing warning:', error);
    res.status(500).json({ error: 'Failed to issue warning' });
  }
});

// POST /api/moderation/users/:id/ban - Ban a user (requires can_ban_users_temporary; permanent ban checks can_ban_users_permanent)
router.post('/users/:id/ban', requireUserAuth, requireCsrfIfCookie, requirePermission('can_ban_users_temporary'), async (req, res) => {
  try {
    const userId = parsePositiveInt(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const { reason, expiresAt: rawExpiresAt, duration_hours: rawDurationHours } = req.body;
    let resolvedExpiresAt = rawExpiresAt || null;
    if (!resolvedExpiresAt && rawDurationHours !== undefined && rawDurationHours !== null && rawDurationHours !== '') {
      const hours = Number(rawDurationHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        return res.status(400).json({ error: 'Invalid duration_hours' });
      }
      resolvedExpiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    } else if (resolvedExpiresAt) {
      const parsedDate = new Date(resolvedExpiresAt);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'Invalid expiresAt timestamp' });
      }
      resolvedExpiresAt = parsedDate.toISOString();
    }
    const moderatorId = req.user.id;
    if (!resolvedExpiresAt && !req.roleConfig?.permissions?.can_ban_users_permanent) {
      return res.status(403).json({ error: 'Permanent bans require super_moderator permission' });
    }

    if (typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Ban reason must be at least 5 characters' });
    }

    // Check if user exists
    const userResult = await db.pool.query(`
      SELECT id, name FROM users WHERE id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Cannot ban yourself
    if (userId === moderatorId) {
      return res.status(403).json({ error: 'You cannot ban yourself' });
    }

    // Check if user is already banned
    const banCheckResult = await db.pool.query(`
      SELECT id FROM forum_moderation_actions
      WHERE user_id = $1 AND action_type = 'ban' AND is_active = true
    `, [userId]);

    if (banCheckResult.rows.length > 0) {
      return res.status(400).json({ error: 'User is already banned' });
    }

    // Record the ban
    const result = await db.pool.query(`
      INSERT INTO forum_moderation_actions
      (user_id, moderator_id, action_type, reason, expires_at)
      VALUES ($1, $2, 'ban', $3, $4)
      RETURNING *
    `, [userId, moderatorId, reason.trim(), resolvedExpiresAt]);

    res.status(201).json({
      message: 'User banned successfully',
      ban: result.rows[0]
    });
  } catch (error) {
    console.error('Error banning user:', error);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

// POST /api/moderation/users/:id/unban - Unban a user (requires can_ban_users_temporary; permanent ban lift requires can_ban_users_permanent)
router.post('/users/:id/unban', requireUserAuth, requireCsrfIfCookie, requirePermission('can_ban_users_temporary'), async (req, res) => {
  const userId = parsePositiveInt(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  const moderatorId = req.user.id;
  let client;
  let inTx = false;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    inTx = true;

    // Lock active ban rows for this user
    const banResult = await client.query(`
      SELECT id, expires_at FROM forum_moderation_actions
      WHERE user_id = $1 AND action_type = 'ban' AND is_active = true
      FOR UPDATE
    `, [userId]);

    if (banResult.rows.length === 0) {
      await client.query('ROLLBACK');
      inTx = false;
      return res.status(404).json({ error: 'No active ban found for this user' });
    }

    const hasPermanentBan = banResult.rows.some((row) => row.expires_at === null);
    if (hasPermanentBan && !req.roleConfig?.permissions?.can_ban_users_permanent) {
      await client.query('ROLLBACK');
      inTx = false;
      return res.status(403).json({ error: 'Unbanning permanently banned users requires super_moderator permission' });
    }

    const lockedIds = banResult.rows.map((row) => row.id);

    // Deactivate only the locked ban rows
    await client.query(`
      UPDATE forum_moderation_actions
      SET is_active = false, updated_at = NOW()
      WHERE id = ANY($1)
    `, [lockedIds]);

    // Record the unban action
    await client.query(`
      INSERT INTO forum_moderation_actions
      (user_id, moderator_id, action_type, reason)
      VALUES ($1, $2, 'unban', 'Ban lifted')
    `, [userId, moderatorId]);

    await client.query('COMMIT');
    inTx = false;

    res.json({ message: 'User unbanned successfully' });
  } catch (error) {
    if (inTx && client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Error rolling back unban transaction:', rollbackErr);
      }
    }
    console.error('Error unbanning user:', error);
    res.status(500).json({ error: 'Failed to unban user' });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// GET /api/moderation/users/:id/history - Get moderation history for a user (requires can_view_user_history)
router.get('/users/:id/history', requireUserAuth, requirePermission('can_view_user_history'), async (req, res) => {
  try {
    const userId = parsePositiveInt(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const { page, limit, offset } = parsePagination(req.query);

    const result = await db.pool.query(`
      SELECT
        ma.*,
        m.name as moderator_name,
        u.name as user_name
      FROM forum_moderation_actions ma
      LEFT JOIN users m ON ma.moderator_id = m.id
      LEFT JOIN users u ON ma.user_id = u.id
      WHERE ma.user_id = $1
      ORDER BY ma.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    // Get total count
    const countResult = await db.pool.query(`
      SELECT COUNT(*) as total
      FROM forum_moderation_actions
      WHERE user_id = $1
    `, [userId]);

    const total = parseInt(countResult.rows[0].total, 10);

    res.json({
      actions: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching moderation history:', error);
    res.status(500).json({ error: 'Failed to fetch moderation history' });
  }
});

// GET /api/moderation/actions - Get all moderation actions (requires can_view_mod_log)
router.get('/actions', requireUserAuth, requirePermission('can_view_mod_log'), async (req, res) => {
  try {
    const { actionType, isActive } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    let query = `
      SELECT
        ma.*,
        m.name as moderator_name,
        u.name as user_name
      FROM forum_moderation_actions ma
      LEFT JOIN users m ON ma.moderator_id = m.id
      LEFT JOIN users u ON ma.user_id = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (actionType) {
      query += ` AND ma.action_type = $${paramCount}`;
      params.push(actionType);
      paramCount++;
    }

    if (isActive !== undefined) {
      query += ` AND ma.is_active = $${paramCount}`;
      params.push(isActive === 'true');
      paramCount++;
    }

    query += ` ORDER BY ma.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM forum_moderation_actions WHERE 1=1`;
    const countParams = [];
    let countParamIndex = 1;

    if (actionType) {
      countQuery += ` AND action_type = $${countParamIndex}`;
      countParams.push(actionType);
      countParamIndex++;
    }

    if (isActive !== undefined) {
      countQuery += ` AND is_active = $${countParamIndex}`;
      countParams.push(isActive === 'true');
    }

    const countResult = await db.pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total, 10);

    res.json({
      actions: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching moderation actions:', error);
    res.status(500).json({ error: 'Failed to fetch moderation actions' });
  }
});

// GET /api/moderation/banned-users - Get list of currently banned users (requires can_view_mod_log)
router.get('/banned-users', requireUserAuth, requirePermission('can_view_mod_log'), async (req, res) => {
  try {
    const result = await db.pool.query(`
      SELECT DISTINCT
        u.id,
        u.name,
        u.email,
        ma.reason as ban_reason,
        ma.created_at as banned_at,
        ma.expires_at as ban_expires_at,
        m.name as banned_by
      FROM forum_moderation_actions ma
      LEFT JOIN users u ON ma.user_id = u.id
      LEFT JOIN users m ON ma.moderator_id = m.id
      WHERE ma.action_type = 'ban'
        AND ma.is_active = true
        AND (ma.expires_at IS NULL OR ma.expires_at > NOW())
      ORDER BY ma.created_at DESC
    `);

    res.json({ bannedUsers: result.rows });
  } catch (error) {
    console.error('Error fetching banned users:', error);
    res.status(500).json({ error: 'Failed to fetch banned users' });
  }
});

// POST /api/moderation/comments/:id/delete - Delete comment (requires can_delete_others_content)
router.post('/comments/:id/delete', requireUserAuth, requireCsrfIfCookie, requirePermission('can_delete_others_content'), async (req, res) => {
  try {
    const commentId = parsePositiveInt(req.params.id);
    if (!commentId) {
      return res.status(400).json({ error: 'Invalid comment ID' });
    }
    const { reason } = req.body;

    if (typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Deletion reason must be at least 5 characters' });
    }

    // Check if comment exists
    const commentResult = await db.pool.query(`
      SELECT * FROM forum_comments WHERE id = $1
    `, [commentId]);

    if (commentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Soft delete the comment
    await db.pool.query(`
      UPDATE forum_comments
      SET is_deleted = true, updated_at = NOW()
      WHERE id = $1
    `, [commentId]);

    // Record the moderation action
    await db.pool.query(`
      INSERT INTO forum_moderation_actions
      (user_id, moderator_id, action_type, reason, metadata)
      VALUES ($1, $2, 'delete_comment', $3, $4)
    `, [
      commentResult.rows[0].author_id,
      req.user.id,
      reason.trim(),
      JSON.stringify({ commentId })
    ]);

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// POST /api/moderation/threads/:id/delete - Delete thread (requires can_delete_others_content)
router.post('/threads/:id/delete', requireUserAuth, requireCsrfIfCookie, requirePermission('can_delete_others_content'), async (req, res) => {
  try {
    const threadId = parsePositiveInt(req.params.id);
    if (!threadId) {
      return res.status(400).json({ error: 'Invalid thread ID' });
    }
    const { reason } = req.body;

    if (typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Deletion reason must be at least 5 characters' });
    }

    // Check if thread exists
    const threadResult = await db.pool.query(`
      SELECT * FROM forum_threads WHERE id = $1
    `, [threadId]);

    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Soft delete the thread
    await db.pool.query(`
      UPDATE forum_threads
      SET is_deleted = true, updated_at = NOW()
      WHERE id = $1
    `, [threadId]);

    // Record the moderation action
    await db.pool.query(`
      INSERT INTO forum_moderation_actions
      (user_id, moderator_id, action_type, reason, metadata)
      VALUES ($1, $2, 'delete_thread', $3, $4)
    `, [
      threadResult.rows[0].author_id,
      req.user.id,
      reason.trim(),
      JSON.stringify({ threadId })
    ]);

    res.json({ message: 'Thread deleted successfully' });
  } catch (error) {
    console.error('Error deleting thread:', error);
    res.status(500).json({ error: 'Failed to delete thread' });
  }
});

module.exports = { router, setDb };
