// Automated forum role progression service
const db = require('../db');

// Role progression criteria
const ROLE_CRITERIA = {
  member: {
    min_days: 7,
    min_reputation: 10,
    min_posts: 5
  },
  senior_member: {
    min_days: 30,
    min_reputation: 50,
    min_posts: 20,
    min_threads: 3
  },
  moderator: {
    // Manual promotion only
    requires_manual: true
  }
};

/**
 * Check and automatically promote users based on their activity
 */
async function checkRoleProgressions() {
  try {
    console.log('[RoleProgression] Checking user progressions...');

    // Get all users with their current roles and reputation
    const query = `
      SELECT
        u.id as user_id,
        fr.role as current_role,
        fr.id as role_id,
        COALESCE(frep.total_points, 0) as reputation,
        COALESCE(frep.posts_created, 0) as posts_created,
        COALESCE(frep.threads_created, 0) as threads_created,
        EXTRACT(DAY FROM (NOW() - u.created_at)) as days_since_registration
      FROM users u
      LEFT JOIN forum_roles fr ON u.id = fr.user_id
      LEFT JOIN forum_reputation frep ON u.id = frep.user_id
      WHERE u.environment = 'production'
        AND (fr.role = 'new_user' OR fr.role = 'member')
    `;

    const result = await db.pool.query(query);
    const users = result.rows;

    let promotedCount = 0;

    for (const user of users) {
      const { user_id, current_role, reputation, posts_created, threads_created, days_since_registration } = user;

      let targetRole = null;

      // Check for promotion to member
      if (current_role === 'new_user') {
        const criteria = ROLE_CRITERIA.member;
        if (
          days_since_registration >= criteria.min_days &&
          reputation >= criteria.min_reputation &&
          posts_created >= criteria.min_posts
        ) {
          targetRole = 'member';
        }
      }

      // Check for promotion to senior_member
      if (current_role === 'member') {
        const criteria = ROLE_CRITERIA.senior_member;
        if (
          days_since_registration >= criteria.min_days &&
          reputation >= criteria.min_reputation &&
          posts_created >= criteria.min_posts &&
          threads_created >= criteria.min_threads
        ) {
          targetRole = 'senior_member';
        }
      }

      // Perform promotion
      if (targetRole) {
        await promoteUser(user_id, targetRole);
        promotedCount++;
        console.log(`[RoleProgression] Promoted user ${user_id} to ${targetRole}`);
      }
    }

    console.log(`[RoleProgression] Completed. Promoted ${promotedCount} users.`);
    return promotedCount;

  } catch (error) {
    console.error('[RoleProgression] Error:', error.message);
    throw error;
  }
}

/**
 * Promote a user to a new role
 */
async function promoteUser(userId, newRole) {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // Update role
    await client.query(`
      UPDATE forum_roles
      SET role = $1,
          promoted_at = NOW(),
          updated_at = NOW(),
          ${getPermissionsForRole(newRole)}
      WHERE user_id = $2
    `, [newRole, userId]);

    // Log moderation action
    await client.query(`
      INSERT INTO forum_moderation_actions (
        moderator_id, action_type, target_user_id, reason
      )
      VALUES (NULL, 'auto_promote', $1, $2)
    `, [userId, `Automatic promotion to ${newRole} based on activity`]);

    await client.query('COMMIT');

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get permission SQL updates for a role
 */
function getPermissionsForRole(role) {
  switch (role) {
    case 'member':
      return `
        can_post = TRUE,
        can_comment = TRUE,
        can_create_threads = TRUE,
        can_edit_own_posts = TRUE,
        can_upvote = TRUE,
        can_downvote = TRUE,
        can_bookmark = TRUE
      `;
    case 'senior_member':
      return `
        can_post = TRUE,
        can_comment = TRUE,
        can_create_threads = TRUE,
        can_edit_own_posts = TRUE,
        can_delete_own_posts = TRUE,
        can_upload_images = TRUE,
        can_upvote = TRUE,
        can_downvote = TRUE,
        can_bookmark = TRUE,
        can_see_vote_counts = TRUE
      `;
    default:
      return '';
  }
}

/**
 * Get role progression status for a user
 */
async function getUserProgressionStatus(userId) {
  try {
    const query = `
      SELECT
        fr.role as current_role,
        COALESCE(frep.total_points, 0) as reputation,
        COALESCE(frep.posts_created, 0) as posts_created,
        COALESCE(frep.threads_created, 0) as threads_created,
        EXTRACT(DAY FROM (NOW() - u.created_at)) as days_since_registration
      FROM users u
      LEFT JOIN forum_roles fr ON u.id = fr.user_id
      LEFT JOIN forum_reputation frep ON u.id = frep.user_id
      WHERE u.id = $1
    `;

    const result = await db.pool.query(query, [userId]);
    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    const { current_role } = user;

    let nextRole = null;
    let criteria = null;
    let progress = null;

    if (current_role === 'new_user') {
      nextRole = 'member';
      criteria = ROLE_CRITERIA.member;
      progress = {
        days: {
          current: parseInt(user.days_since_registration),
          required: criteria.min_days,
          met: user.days_since_registration >= criteria.min_days
        },
        reputation: {
          current: parseInt(user.reputation),
          required: criteria.min_reputation,
          met: user.reputation >= criteria.min_reputation
        },
        posts: {
          current: parseInt(user.posts_created),
          required: criteria.min_posts,
          met: user.posts_created >= criteria.min_posts
        }
      };
    } else if (current_role === 'member') {
      nextRole = 'senior_member';
      criteria = ROLE_CRITERIA.senior_member;
      progress = {
        days: {
          current: parseInt(user.days_since_registration),
          required: criteria.min_days,
          met: user.days_since_registration >= criteria.min_days
        },
        reputation: {
          current: parseInt(user.reputation),
          required: criteria.min_reputation,
          met: user.reputation >= criteria.min_reputation
        },
        posts: {
          current: parseInt(user.posts_created),
          required: criteria.min_posts,
          met: user.posts_created >= criteria.min_posts
        },
        threads: {
          current: parseInt(user.threads_created),
          required: criteria.min_threads,
          met: user.threads_created >= criteria.min_threads
        }
      };
    }

    return {
      current_role,
      next_role: nextRole,
      progress
    };

  } catch (error) {
    console.error('[RoleProgression] Error getting user status:', error.message);
    throw error;
  }
}

module.exports = {
  checkRoleProgressions,
  getUserProgressionStatus,
  ROLE_CRITERIA
};
