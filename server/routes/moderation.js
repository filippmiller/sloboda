const express = require('express');
const router = express.Router();
const { requireUserAuth, requirePermission } = require('../middleware/rolePermission');

let db;

function setDb(database) {
  db = database;
}

// POST /api/moderation/threads/:id/pin - Pin/unpin thread (requires can_moderate)
router.post('/threads/:id/pin', requireUserAuth, requirePermission('can_moderate'), async (req, res) => {
  try {
    const { id } = req.params;
    const { pinned } = req.body;

    if (typeof pinned !== 'boolean') {
      return res.status(400).json({ error: 'Pinned status must be a boolean' });
    }

    // Check if thread exists
    const threadResult = await db.query(`
      SELECT id FROM forum_threads WHERE id = $1 AND is_deleted = false
    `, [id]);

    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Update pin status
    await db.query(`
      UPDATE forum_threads
      SET is_pinned = $1, updated_at = NOW()
      WHERE id = $2
    `, [pinned, id]);

    res.json({
      message: `Thread ${pinned ? 'pinned' : 'unpinned'} successfully`,
      threadId: parseInt(id),
      pinned
    });
  } catch (error) {
    console.error('Error updating pin status:', error);
    res.status(500).json({ error: 'Failed to update pin status' });
  }
});

// POST /api/moderation/threads/:id/lock - Lock/unlock thread (requires can_moderate)
router.post('/threads/:id/lock', requireUserAuth, requirePermission('can_moderate'), async (req, res) => {
  try {
    const { id } = req.params;
    const { locked } = req.body;

    if (typeof locked !== 'boolean') {
      return res.status(400).json({ error: 'Locked status must be a boolean' });
    }

    // Check if thread exists
    const threadResult = await db.query(`
      SELECT id FROM forum_threads WHERE id = $1 AND is_deleted = false
    `, [id]);

    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Update lock status
    await db.query(`
      UPDATE forum_threads
      SET is_locked = $1, updated_at = NOW()
      WHERE id = $2
    `, [locked, id]);

    res.json({
      message: `Thread ${locked ? 'locked' : 'unlocked'} successfully`,
      threadId: parseInt(id),
      locked
    });
  } catch (error) {
    console.error('Error updating lock status:', error);
    res.status(500).json({ error: 'Failed to update lock status' });
  }
});

// POST /api/moderation/users/:id/warn - Warn a user (requires can_moderate)
router.post('/users/:id/warn', requireUserAuth, requirePermission('can_moderate'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const moderatorId = req.user.id;

    if (!reason || reason.length < 5) {
      return res.status(400).json({ error: 'Warning reason must be at least 5 characters' });
    }

    // Check if user exists
    const userResult = await db.query(`
      SELECT id, username FROM users WHERE id = $1
    `, [id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Cannot warn yourself
    if (parseInt(id) === moderatorId) {
      return res.status(403).json({ error: 'You cannot warn yourself' });
    }

    // Record the warning
    const result = await db.query(`
      INSERT INTO forum_moderation_actions
      (user_id, moderator_id, action_type, reason)
      VALUES ($1, $2, 'warn', $3)
      RETURNING *
    `, [id, moderatorId, reason]);

    res.status(201).json({
      message: 'Warning issued successfully',
      warning: result.rows[0]
    });
  } catch (error) {
    console.error('Error issuing warning:', error);
    res.status(500).json({ error: 'Failed to issue warning' });
  }
});

// POST /api/moderation/users/:id/ban - Ban a user (requires can_ban)
router.post('/users/:id/ban', requireUserAuth, requirePermission('can_ban'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, expiresAt } = req.body;
    const moderatorId = req.user.id;

    if (!reason || reason.length < 5) {
      return res.status(400).json({ error: 'Ban reason must be at least 5 characters' });
    }

    // Check if user exists
    const userResult = await db.query(`
      SELECT id, username FROM users WHERE id = $1
    `, [id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Cannot ban yourself
    if (parseInt(id) === moderatorId) {
      return res.status(403).json({ error: 'You cannot ban yourself' });
    }

    // Check if user is already banned
    const banCheckResult = await db.query(`
      SELECT id FROM forum_moderation_actions
      WHERE user_id = $1 AND action_type = 'ban' AND is_active = true
    `, [id]);

    if (banCheckResult.rows.length > 0) {
      return res.status(400).json({ error: 'User is already banned' });
    }

    // Record the ban
    const result = await db.query(`
      INSERT INTO forum_moderation_actions
      (user_id, moderator_id, action_type, reason, expires_at)
      VALUES ($1, $2, 'ban', $3, $4)
      RETURNING *
    `, [id, moderatorId, reason, expiresAt || null]);

    res.status(201).json({
      message: 'User banned successfully',
      ban: result.rows[0]
    });
  } catch (error) {
    console.error('Error banning user:', error);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

// POST /api/moderation/users/:id/unban - Unban a user (requires can_ban)
router.post('/users/:id/unban', requireUserAuth, requirePermission('can_ban'), async (req, res) => {
  try {
    const { id } = req.params;
    const moderatorId = req.user.id;

    // Check if user is banned
    const banResult = await db.query(`
      SELECT id FROM forum_moderation_actions
      WHERE user_id = $1 AND action_type = 'ban' AND is_active = true
    `, [id]);

    if (banResult.rows.length === 0) {
      return res.status(404).json({ error: 'No active ban found for this user' });
    }

    // Deactivate the ban
    await db.query(`
      UPDATE forum_moderation_actions
      SET is_active = false, updated_at = NOW()
      WHERE user_id = $1 AND action_type = 'ban' AND is_active = true
    `, [id]);

    // Record the unban action
    await db.query(`
      INSERT INTO forum_moderation_actions
      (user_id, moderator_id, action_type, reason)
      VALUES ($1, $2, 'unban', 'Ban lifted')
    `, [id, moderatorId]);

    res.json({ message: 'User unbanned successfully' });
  } catch (error) {
    console.error('Error unbanning user:', error);
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

// GET /api/moderation/users/:id/history - Get moderation history for a user (requires can_moderate)
router.get('/users/:id/history', requireUserAuth, requirePermission('can_moderate'), async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await db.query(`
      SELECT
        ma.*,
        m.username as moderator_username,
        u.username as user_username
      FROM forum_moderation_actions ma
      LEFT JOIN users m ON ma.moderator_id = m.id
      LEFT JOIN users u ON ma.user_id = u.id
      WHERE ma.user_id = $1
      ORDER BY ma.created_at DESC
      LIMIT $2 OFFSET $3
    `, [id, parseInt(limit), offset]);

    // Get total count
    const countResult = await db.query(`
      SELECT COUNT(*) as total
      FROM forum_moderation_actions
      WHERE user_id = $1
    `, [id]);

    const total = parseInt(countResult.rows[0].total);

    res.json({
      actions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching moderation history:', error);
    res.status(500).json({ error: 'Failed to fetch moderation history' });
  }
});

// GET /api/moderation/actions - Get all moderation actions (requires can_moderate)
router.get('/actions', requireUserAuth, requirePermission('can_moderate'), async (req, res) => {
  try {
    const { page = 1, limit = 50, actionType, isActive } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT
        ma.*,
        m.username as moderator_username,
        u.username as user_username
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
    params.push(parseInt(limit), offset);

    const result = await db.query(query, params);

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

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      actions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching moderation actions:', error);
    res.status(500).json({ error: 'Failed to fetch moderation actions' });
  }
});

// GET /api/moderation/banned-users - Get list of currently banned users (requires can_moderate)
router.get('/banned-users', requireUserAuth, requirePermission('can_moderate'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DISTINCT
        u.id,
        u.username,
        u.email,
        ma.reason as ban_reason,
        ma.created_at as banned_at,
        ma.expires_at as ban_expires_at,
        m.username as banned_by
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

// POST /api/moderation/comments/:id/delete - Hard delete comment (requires can_moderate)
router.post('/comments/:id/delete', requireUserAuth, requirePermission('can_moderate'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.length < 5) {
      return res.status(400).json({ error: 'Deletion reason must be at least 5 characters' });
    }

    // Check if comment exists
    const commentResult = await db.query(`
      SELECT * FROM forum_comments WHERE id = $1
    `, [id]);

    if (commentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Soft delete the comment
    await db.query(`
      UPDATE forum_comments
      SET is_deleted = true, updated_at = NOW()
      WHERE id = $1
    `, [id]);

    // Record the moderation action
    await db.query(`
      INSERT INTO forum_moderation_actions
      (user_id, moderator_id, action_type, reason, metadata)
      VALUES ($1, $2, 'delete_comment', $3, $4)
    `, [
      commentResult.rows[0].author_id,
      req.user.id,
      reason,
      JSON.stringify({ commentId: id })
    ]);

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// POST /api/moderation/threads/:id/delete - Hard delete thread (requires can_moderate)
router.post('/threads/:id/delete', requireUserAuth, requirePermission('can_moderate'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.length < 5) {
      return res.status(400).json({ error: 'Deletion reason must be at least 5 characters' });
    }

    // Check if thread exists
    const threadResult = await db.query(`
      SELECT * FROM forum_threads WHERE id = $1
    `, [id]);

    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Soft delete the thread
    await db.query(`
      UPDATE forum_threads
      SET is_deleted = true, updated_at = NOW()
      WHERE id = $1
    `, [id]);

    // Record the moderation action
    await db.query(`
      INSERT INTO forum_moderation_actions
      (user_id, moderator_id, action_type, reason, metadata)
      VALUES ($1, $2, 'delete_thread', $3, $4)
    `, [
      threadResult.rows[0].author_id,
      req.user.id,
      reason,
      JSON.stringify({ threadId: id })
    ]);

    res.json({ message: 'Thread deleted successfully' });
  } catch (error) {
    console.error('Error deleting thread:', error);
    res.status(500).json({ error: 'Failed to delete thread' });
  }
});

module.exports = { router, setDb };
