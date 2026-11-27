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

/**
 * Execute a database callback inside a transaction, rolling back on abort or error.
 */
async function runInTransaction(fn) {
  const client = await db.pool.connect();
  let inTx = false;
  try {
    await client.query('BEGIN');
    inTx = true;
    const outcome = await fn(client);
    if (outcome && outcome.abort) {
      await client.query('ROLLBACK');
      inTx = false;
    } else {
      await client.query('COMMIT');
      inTx = false;
    }
    return outcome;
  } catch (error) {
    if (inTx) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Error rolling back moderation transaction:', rollbackErr);
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Append a canonical audit record to forum_moderation_actions using an active transaction client.
 */
async function insertAuditAction(client, {
  moderatorId,
  actionType,
  targetUserId = null,
  targetCommentId = null,
  targetThreadId = null,
  reason = null,
  details = null
}) {
  await client.query(
    `INSERT INTO forum_moderation_actions
      (moderator_id, action_type, target_user_id, target_comment_id, target_thread_id, reason, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      moderatorId,
      actionType,
      targetUserId,
      targetCommentId,
      targetThreadId,
      reason,
      details ? JSON.stringify(details) : null
    ]
  );
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

    const reason = typeof req.body.reason === 'string' && req.body.reason.trim()
      ? req.body.reason.trim()
      : null;

    const outcome = await runInTransaction(async (client) => {
      const threadResult = await client.query(
        'SELECT id, author_id FROM forum_threads WHERE id = $1 AND is_deleted = false FOR UPDATE',
        [threadId]
      );

      if (threadResult.rows.length === 0) {
        return { abort: true, status: 404, body: { error: 'Thread not found' } };
      }

      await client.query(
        'UPDATE forum_threads SET is_pinned = $1, updated_at = NOW() WHERE id = $2',
        [pinned, threadId]
      );

      await insertAuditAction(client, {
        moderatorId: req.user.id,
        actionType: pinned ? 'pin_thread' : 'unpin_thread',
        targetUserId: threadResult.rows[0].author_id,
        targetThreadId: threadId,
        reason,
        details: { pinned }
      });

      return {
        status: 200,
        body: {
          message: `Thread ${pinned ? 'pinned' : 'unpinned'} successfully`,
          threadId,
          pinned
        }
      };
    });

    return res.status(outcome.status).json(outcome.body);
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

    const reason = typeof req.body.reason === 'string' && req.body.reason.trim()
      ? req.body.reason.trim()
      : null;

    const outcome = await runInTransaction(async (client) => {
      const threadResult = await client.query(
        'SELECT id, author_id FROM forum_threads WHERE id = $1 AND is_deleted = false FOR UPDATE',
        [threadId]
      );

      if (threadResult.rows.length === 0) {
        return { abort: true, status: 404, body: { error: 'Thread not found' } };
      }

      await client.query(
        'UPDATE forum_threads SET is_locked = $1, updated_at = NOW() WHERE id = $2',
        [locked, threadId]
      );

      await insertAuditAction(client, {
        moderatorId: req.user.id,
        actionType: locked ? 'lock_thread' : 'unlock_thread',
        targetUserId: threadResult.rows[0].author_id,
        targetThreadId: threadId,
        reason,
        details: { locked }
      });

      return {
        status: 200,
        body: {
          message: `Thread ${locked ? 'locked' : 'unlocked'} successfully`,
          threadId,
          locked
        }
      };
    });

    return res.status(outcome.status).json(outcome.body);
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
    const { reason, severity: rawSeverity } = req.body;
    const moderatorId = req.user.id;

    if (typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Warning reason must be at least 5 characters' });
    }

    const severity = rawSeverity === undefined || rawSeverity === null || rawSeverity === ''
      ? 'medium'
      : rawSeverity;
    if (!['low', 'medium', 'high'].includes(severity)) {
      return res.status(400).json({ error: 'Severity must be low, medium, or high' });
    }

    if (userId === moderatorId) {
      return res.status(403).json({ error: 'You cannot warn yourself' });
    }

    const trimmedReason = reason.trim();

    const outcome = await runInTransaction(async (client) => {
      const userResult = await client.query(
        'SELECT id, name FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return { abort: true, status: 404, body: { error: 'User not found' } };
      }

      const warnResult = await client.query(
        `INSERT INTO forum_warnings (user_id, issued_by, severity, reason)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, moderatorId, severity, trimmedReason]
      );

      const warning = warnResult.rows[0];

      await insertAuditAction(client, {
        moderatorId,
        actionType: 'warn_user',
        targetUserId: userId,
        reason: trimmedReason,
        details: { warning_id: warning.id, severity }
      });

      return {
        status: 201,
        body: {
          message: 'Warning issued successfully',
          warning
        }
      };
    });

    return res.status(outcome.status).json(outcome.body);
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

    const MAX_TEMP_BAN_MS = 30 * 24 * 3600 * 1000;
    if (resolvedExpiresAt) {
      const expiresMs = new Date(resolvedExpiresAt).getTime();
      const nowMs = Date.now();
      if (expiresMs <= nowMs) {
        return res.status(400).json({ error: 'Ban expiry must be in the future' });
      }
      if ((expiresMs - nowMs > MAX_TEMP_BAN_MS) && !req.roleConfig?.permissions?.can_ban_users_permanent) {
        return res.status(403).json({ error: 'Temporary bans cannot exceed 30 days without super_moderator permission' });
      }
    }

    const moderatorId = req.user.id;
    if (!resolvedExpiresAt && !req.roleConfig?.permissions?.can_ban_users_permanent) {
      return res.status(403).json({ error: 'Permanent bans require super_moderator permission' });
    }

    if (typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Ban reason must be at least 5 characters' });
    }

    if (userId === moderatorId) {
      return res.status(403).json({ error: 'You cannot ban yourself' });
    }

    const trimmedReason = reason.trim();
    const banType = resolvedExpiresAt ? 'temporary' : 'permanent';

    const outcome = await runInTransaction(async (client) => {
      const userResult = await client.query(
        'SELECT id, name FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return { abort: true, status: 404, body: { error: 'User not found' } };
      }

      // Serialize ban/unban operations per target user inside this transaction
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('forum_ban:' || $1::text))",
        [String(userId)]
      );

      const banCheckResult = await client.query(
        `SELECT id FROM forum_bans
         WHERE user_id = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())`,
        [userId]
      );

      if (banCheckResult.rows.length > 0) {
        return { abort: true, status: 400, body: { error: 'User is already banned' } };
      }

      const banResult = await client.query(
        `INSERT INTO forum_bans (user_id, banned_by, ban_type, reason, expires_at, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING *`,
        [userId, moderatorId, banType, trimmedReason, resolvedExpiresAt]
      );

      const ban = banResult.rows[0];

      await insertAuditAction(client, {
        moderatorId,
        actionType: 'ban_user',
        targetUserId: userId,
        reason: trimmedReason,
        details: {
          ban_id: ban.id,
          ban_type: banType,
          expires_at: resolvedExpiresAt
        }
      });

      return {
        status: 201,
        body: {
          message: 'User banned successfully',
          ban
        }
      };
    });

    return res.status(outcome.status).json(outcome.body);
  } catch (error) {
    console.error('Error banning user:', error);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

// POST /api/moderation/users/:id/unban - Unban a user (requires can_ban_users_temporary; permanent ban lift requires can_ban_users_permanent)
router.post('/users/:id/unban', requireUserAuth, requireCsrfIfCookie, requirePermission('can_ban_users_temporary'), async (req, res) => {
  try {
    const userId = parsePositiveInt(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const moderatorId = req.user.id;
    const reason = typeof req.body?.reason === 'string' && req.body.reason.trim()
      ? req.body.reason.trim()
      : 'Ban lifted';

    const outcome = await runInTransaction(async (client) => {
      // Serialize ban/unban operations per target user inside this transaction
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('forum_ban:' || $1::text))",
        [String(userId)]
      );

      const banResult = await client.query(
        `SELECT id, ban_type, expires_at FROM forum_bans
         WHERE user_id = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())
         FOR UPDATE`,
        [userId]
      );

      if (banResult.rows.length === 0) {
        return { abort: true, status: 404, body: { error: 'No active ban found for this user' } };
      }

      const hasPermanentBan = banResult.rows.some(
        (row) => row.expires_at === null || row.ban_type === 'permanent'
      );
      if (hasPermanentBan && !req.roleConfig?.permissions?.can_ban_users_permanent) {
        return {
          abort: true,
          status: 403,
          body: { error: 'Unbanning permanently banned users requires super_moderator permission' }
        };
      }

      const lockedIds = banResult.rows.map((row) => row.id);

      await client.query(
        `UPDATE forum_bans
         SET is_active = false, lifted_at = NOW(), lifted_by_user_id = $2
         WHERE id = ANY($1)`,
        [lockedIds, moderatorId]
      );

      await insertAuditAction(client, {
        moderatorId,
        actionType: 'unban_user',
        targetUserId: userId,
        reason,
        details: { ban_ids: lockedIds }
      });

      return { status: 200, body: { message: 'User unbanned successfully' } };
    });

    return res.status(outcome.status).json(outcome.body);
  } catch (error) {
    console.error('Error unbanning user:', error);
    res.status(500).json({ error: 'Failed to unban user' });
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

    const [result, countResult, activeBanResult] = await Promise.all([
      db.pool.query(
        `SELECT
           ma.*,
           m.name as moderator_name,
           u.name as target_user_name,
           u.name as user_name
         FROM forum_moderation_actions ma
         LEFT JOIN users m ON ma.moderator_id = m.id
         LEFT JOIN users u ON ma.target_user_id = u.id
         WHERE ma.target_user_id = $1
         ORDER BY ma.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      db.pool.query(
        'SELECT COUNT(*) as total FROM forum_moderation_actions WHERE target_user_id = $1',
        [userId]
      ),
      db.pool.query(
        `SELECT * FROM forum_bans
         WHERE user_id = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY banned_at DESC
         LIMIT 1`,
        [userId]
      )
    ]);

    const total = parseInt(countResult.rows[0].total, 10);

    res.json({
      actions: result.rows,
      activeBan: activeBanResult.rows[0] || null,
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
    const { actionType, user_id: rawUserId, thread_id: rawThreadId } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const conditions = [];
    const params = [];

    if (actionType) {
      params.push(actionType);
      conditions.push(`ma.action_type = $${params.length}`);
    }

    if (rawUserId !== undefined && rawUserId !== '') {
      const targetUserId = parsePositiveInt(rawUserId);
      if (!targetUserId) {
        return res.status(400).json({ error: 'Invalid user_id filter' });
      }
      params.push(targetUserId);
      conditions.push(`ma.target_user_id = $${params.length}`);
    }

    if (rawThreadId !== undefined && rawThreadId !== '') {
      const targetThreadId = parsePositiveInt(rawThreadId);
      if (!targetThreadId) {
        return res.status(400).json({ error: 'Invalid thread_id filter' });
      }
      params.push(targetThreadId);
      conditions.push(`ma.target_thread_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = [...params];
    const dataParams = [...params, limit, offset];

    const [result, countResult] = await Promise.all([
      db.pool.query(
        `SELECT
           ma.*,
           m.name as moderator_name,
           u.name as target_user_name,
           u.name as user_name
         FROM forum_moderation_actions ma
         LEFT JOIN users u ON ma.target_user_id = u.id
         LEFT JOIN users m ON ma.moderator_id = m.id
         ${whereClause}
         ORDER BY ma.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        dataParams
      ),
      db.pool.query(
        `SELECT COUNT(*) as total FROM forum_moderation_actions ma ${whereClause}`,
        countParams
      )
    ]);

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
      SELECT
        b.id as ban_id,
        u.id,
        u.name,
        u.email,
        b.ban_type,
        b.reason as ban_reason,
        b.banned_at,
        b.expires_at as ban_expires_at,
        m.name as banned_by
      FROM forum_bans b
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN users m ON b.banned_by = m.id
      WHERE b.is_active = true
        AND (b.expires_at IS NULL OR b.expires_at > NOW())
      ORDER BY b.banned_at DESC
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

    const trimmedReason = reason.trim();

    const outcome = await runInTransaction(async (client) => {
      const commentResult = await client.query(
        'SELECT id, author_id, thread_id FROM forum_comments WHERE id = $1 FOR UPDATE',
        [commentId]
      );

      if (commentResult.rows.length === 0) {
        return { abort: true, status: 404, body: { error: 'Comment not found' } };
      }

      const comment = commentResult.rows[0];

      await client.query(
        'UPDATE forum_comments SET is_deleted = true, updated_at = NOW() WHERE id = $1',
        [commentId]
      );

      await insertAuditAction(client, {
        moderatorId: req.user.id,
        actionType: 'delete_comment',
        targetUserId: comment.author_id,
        targetCommentId: commentId,
        targetThreadId: comment.thread_id || null,
        reason: trimmedReason,
        details: { commentId }
      });

      return { status: 200, body: { message: 'Comment deleted successfully' } };
    });

    return res.status(outcome.status).json(outcome.body);
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

    const trimmedReason = reason.trim();

    const outcome = await runInTransaction(async (client) => {
      const threadResult = await client.query(
        'SELECT id, author_id FROM forum_threads WHERE id = $1 FOR UPDATE',
        [threadId]
      );

      if (threadResult.rows.length === 0) {
        return { abort: true, status: 404, body: { error: 'Thread not found' } };
      }

      const thread = threadResult.rows[0];

      await client.query(
        'UPDATE forum_threads SET is_deleted = true, updated_at = NOW() WHERE id = $1',
        [threadId]
      );

      await insertAuditAction(client, {
        moderatorId: req.user.id,
        actionType: 'delete_thread',
        targetUserId: thread.author_id,
        targetThreadId: threadId,
        reason: trimmedReason,
        details: { threadId }
      });

      return { status: 200, body: { message: 'Thread deleted successfully' } };
    });

    return res.status(outcome.status).json(outcome.body);
  } catch (error) {
    console.error('Error deleting thread:', error);
    res.status(500).json({ error: 'Failed to delete thread' });
  }
});

module.exports = { router, setDb };
