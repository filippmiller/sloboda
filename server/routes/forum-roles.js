// Forum roles management routes
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

let db;

function setDb(database) {
  db = database;
}

// GET /api/forum/roles/users - Get all users with their roles and reputation
router.get('/users', requireAuth, async (req, res) => {
  try {
    // First check if forum_roles table exists
    const testQuery = await db.pool.query(`SELECT COUNT(*) FROM forum_roles`);
    console.log('[forum-roles] Forum roles count:', testQuery.rows[0].count);

    const query = `
      SELECT
        fr.id,
        fr.user_id,
        COALESCE(u.name, 'Unknown') as username,
        COALESCE(u.email, '') as email,
        fr.role,
        COALESCE(frep.total_points, 0) as total_points,
        COALESCE(frep.posts_created, 0) as posts_created,
        COALESCE(frep.threads_created, 0) as threads_created,
        fr.can_post,
        fr.can_comment,
        fr.can_create_threads,
        COALESCE(fr.can_moderate, false) as can_moderate
      FROM forum_roles fr
      LEFT JOIN users u ON u.id = fr.user_id
      LEFT JOIN forum_reputation frep ON frep.user_id = fr.user_id
      ORDER BY frep.total_points DESC NULLS LAST, COALESCE(u.name, '') ASC
    `;

    const result = await db.pool.query(query);

    res.json({
      success: true,
      users: result.rows
    });
  } catch (error) {
    console.error('Error fetching forum users:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
      details: error.message
    });
  }
});

// POST /api/forum/roles/promote/:userId - Promote user to next role
router.post('/promote/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  const { new_role } = req.body;

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // Get permissions for new role
    let permissions = {};
    switch (new_role) {
      case 'member':
        permissions = {
          can_post: true,
          can_comment: true,
          can_create_threads: true,
          can_edit_own_posts: true,
          can_upvote: true,
          can_downvote: true,
          can_bookmark: true
        };
        break;
      case 'senior_member':
        permissions = {
          can_post: true,
          can_comment: true,
          can_create_threads: true,
          can_edit_own_posts: true,
          can_delete_own_posts: true,
          can_upload_images: true,
          can_upvote: true,
          can_downvote: true,
          can_bookmark: true,
          can_see_vote_counts: true
        };
        break;
      case 'moderator':
        permissions = {
          can_post: true,
          can_comment: true,
          can_create_threads: true,
          can_edit_own_posts: true,
          can_delete_own_posts: true,
          can_upload_images: true,
          can_upvote: true,
          can_downvote: true,
          can_bookmark: true,
          can_see_vote_counts: true,
          can_moderate: true,
          can_delete_others_posts: true,
          can_ban_users: true,
          can_view_reports: true
        };
        break;
      case 'super_moderator':
        permissions = {
          can_post: true,
          can_comment: true,
          can_create_threads: true,
          can_edit_own_posts: true,
          can_delete_own_posts: true,
          can_upload_images: true,
          can_upvote: true,
          can_downvote: true,
          can_bookmark: true,
          can_see_vote_counts: true,
          can_moderate: true,
          can_delete_others_posts: true,
          can_ban_users: true,
          can_view_reports: true,
          can_edit_others_posts: true,
          can_pin_threads: true,
          can_lock_threads: true
        };
        break;
      default:
        throw new Error('Invalid role');
    }

    // Build UPDATE query
    const setClause = Object.entries(permissions)
      .map(([key, value]) => `${key} = ${value}`)
      .join(', ');

    await client.query(`
      UPDATE forum_roles
      SET role = $1,
          ${setClause},
          promoted_at = NOW(),
          updated_at = NOW()
      WHERE user_id = $2
    `, [new_role, userId]);

    // Log moderation action
    await client.query(`
      INSERT INTO forum_moderation_actions (
        moderator_id, action_type, target_user_id, reason
      )
      VALUES ($1, 'manual_promote', $2, $3)
    `, [req.admin.id, userId, `Manual promotion to ${new_role}`]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'User promoted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error promoting user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to promote user'
    });
  } finally {
    client.release();
  }
});

// POST /api/forum/roles/demote/:userId - Demote user to previous role
router.post('/demote/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  const { new_role } = req.body;

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // Get permissions for new role
    let permissions = {};
    switch (new_role) {
      case 'new_user':
        permissions = {
          can_post: false,
          can_comment: true,
          can_create_threads: false,
          can_upvote: false,
          can_bookmark: true
        };
        break;
      case 'member':
        permissions = {
          can_post: true,
          can_comment: true,
          can_create_threads: true,
          can_edit_own_posts: true,
          can_upvote: true,
          can_downvote: true,
          can_bookmark: true
        };
        break;
      case 'senior_member':
        permissions = {
          can_post: true,
          can_comment: true,
          can_create_threads: true,
          can_edit_own_posts: true,
          can_delete_own_posts: true,
          can_upload_images: true,
          can_upvote: true,
          can_downvote: true,
          can_bookmark: true,
          can_see_vote_counts: true
        };
        break;
      case 'moderator':
        permissions = {
          can_post: true,
          can_comment: true,
          can_create_threads: true,
          can_edit_own_posts: true,
          can_delete_own_posts: true,
          can_upload_images: true,
          can_upvote: true,
          can_downvote: true,
          can_bookmark: true,
          can_see_vote_counts: true,
          can_moderate: true,
          can_delete_others_posts: true,
          can_ban_users: true,
          can_view_reports: true
        };
        break;
      default:
        throw new Error('Invalid role');
    }

    // Build UPDATE query
    const setClause = Object.entries(permissions)
      .map(([key, value]) => `${key} = ${value}`)
      .join(', ');

    await client.query(`
      UPDATE forum_roles
      SET role = $1,
          ${setClause},
          updated_at = NOW()
      WHERE user_id = $2
    `, [new_role, userId]);

    // Log moderation action
    await client.query(`
      INSERT INTO forum_moderation_actions (
        moderator_id, action_type, target_user_id, reason
      )
      VALUES ($1, 'manual_demote', $2, $3)
    `, [req.admin.id, userId, `Manual demotion to ${new_role}`]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'User demoted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error demoting user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to demote user'
    });
  } finally {
    client.release();
  }
});

module.exports = { router, setDb };
