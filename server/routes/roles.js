const express = require('express');
const router = express.Router();
const { requireUserAuth } = require('../middleware/userAuth');
const { requirePermission } = require('../middleware/rolePermission');

let db;

function setDb(database) {
  db = database;
}

// GET /api/roles - Get all available roles
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM forum_roles
      ORDER BY id ASC
    `);

    res.json({ roles: result.rows });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// GET /api/roles/:id - Get specific role details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(`
      SELECT * FROM forum_roles WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    res.json({ role: result.rows[0] });
  } catch (error) {
    console.error('Error fetching role:', error);
    res.status(500).json({ error: 'Failed to fetch role' });
  }
});

// GET /api/roles/user/me - Get current user's role
router.get('/user/me', requireUserAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(`
      SELECT
        u.id as user_id,
        u.username,
        r.id as role_id,
        r.name as role_name,
        r.display_name,
        r.color,
        r.can_moderate,
        r.can_ban,
        r.can_manage_roles
      FROM users u
      LEFT JOIN forum_roles r ON u.forum_role_id = r.id
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ userRole: result.rows[0] });
  } catch (error) {
    console.error('Error fetching user role:', error);
    res.status(500).json({ error: 'Failed to fetch user role' });
  }
});

// GET /api/roles/user/:id - Get specific user's role (requires can_moderate)
router.get('/user/:id', requireUserAuth, requirePermission('can_moderate'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(`
      SELECT
        u.id as user_id,
        u.username,
        r.id as role_id,
        r.name as role_name,
        r.display_name,
        r.color,
        r.can_moderate,
        r.can_ban,
        r.can_manage_roles
      FROM users u
      LEFT JOIN forum_roles r ON u.forum_role_id = r.id
      WHERE u.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ userRole: result.rows[0] });
  } catch (error) {
    console.error('Error fetching user role:', error);
    res.status(500).json({ error: 'Failed to fetch user role' });
  }
});

// POST /api/roles/user/:id/assign - Assign role to user (requires can_manage_roles)
router.post('/user/:id/assign', requireUserAuth, requirePermission('can_manage_roles'), async (req, res) => {
  try {
    const { id } = req.params;
    const { roleId } = req.body;

    if (!roleId) {
      return res.status(400).json({ error: 'Role ID is required' });
    }

    // Check if user exists
    const userResult = await db.query(`
      SELECT id, username, forum_role_id FROM users WHERE id = $1
    `, [id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if role exists
    const roleResult = await db.query(`
      SELECT * FROM forum_roles WHERE id = $1
    `, [roleId]);

    if (roleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Cannot assign role to yourself
    if (parseInt(id) === req.user.id) {
      return res.status(403).json({ error: 'You cannot assign roles to yourself' });
    }

    // Update user's role
    await db.query(`
      UPDATE users
      SET forum_role_id = $1
      WHERE id = $2
    `, [roleId, id]);

    // Record the role change as a moderation action
    await db.query(`
      INSERT INTO forum_moderation_actions
      (user_id, moderator_id, action_type, reason, metadata)
      VALUES ($1, $2, 'role_change', $3, $4)
    `, [
      id,
      req.user.id,
      `Role changed to ${roleResult.rows[0].display_name}`,
      JSON.stringify({
        previousRoleId: userResult.rows[0].forum_role_id,
        newRoleId: roleId
      })
    ]);

    res.json({
      message: 'Role assigned successfully',
      userId: parseInt(id),
      roleId: parseInt(roleId),
      roleName: roleResult.rows[0].display_name
    });
  } catch (error) {
    console.error('Error assigning role:', error);
    res.status(500).json({ error: 'Failed to assign role' });
  }
});

// GET /api/roles/moderators - Get list of all moderators
router.get('/moderators/list', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        u.id,
        u.username,
        u.created_at as joined_at,
        r.id as role_id,
        r.name as role_name,
        r.display_name,
        r.color
      FROM users u
      LEFT JOIN forum_roles r ON u.forum_role_id = r.id
      WHERE r.can_moderate = true OR r.can_ban = true
      ORDER BY r.id ASC, u.username ASC
    `);

    res.json({ moderators: result.rows });
  } catch (error) {
    console.error('Error fetching moderators:', error);
    res.status(500).json({ error: 'Failed to fetch moderators' });
  }
});

// GET /api/roles/permissions - Get all permissions
router.get('/permissions/list', requireUserAuth, async (req, res) => {
  try {
    res.json({
      permissions: [
        {
          name: 'can_moderate',
          description: 'Can pin, lock, and delete threads and comments'
        },
        {
          name: 'can_ban',
          description: 'Can ban and unban users'
        },
        {
          name: 'can_manage_roles',
          description: 'Can assign roles to other users'
        }
      ]
    });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

// GET /api/roles/check-permission/:permission - Check if current user has a permission
router.get('/check-permission/:permission', requireUserAuth, async (req, res) => {
  try {
    const { permission } = req.params;
    const userId = req.user.id;

    const validPermissions = ['can_moderate', 'can_ban', 'can_manage_roles'];
    if (!validPermissions.includes(permission)) {
      return res.status(400).json({ error: 'Invalid permission name' });
    }

    const hasPermission = await db.userHasPermission(userId, permission);

    res.json({
      userId,
      permission,
      hasPermission
    });
  } catch (error) {
    console.error('Error checking permission:', error);
    res.status(500).json({ error: 'Failed to check permission' });
  }
});

// GET /api/roles/user/:id/permissions - Get all permissions for a user (requires can_moderate)
router.get('/user/:id/permissions', requireUserAuth, requirePermission('can_moderate'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(`
      SELECT
        r.can_moderate,
        r.can_ban,
        r.can_manage_roles
      FROM users u
      LEFT JOIN forum_roles r ON u.forum_role_id = r.id
      WHERE u.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const permissions = result.rows[0];

    res.json({
      userId: parseInt(id),
      permissions: {
        can_moderate: permissions.can_moderate || false,
        can_ban: permissions.can_ban || false,
        can_manage_roles: permissions.can_manage_roles || false
      }
    });
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    res.status(500).json({ error: 'Failed to fetch user permissions' });
  }
});

// GET /api/roles/users-by-role/:roleId - Get all users with a specific role (requires can_moderate)
router.get('/users-by-role/:roleId', requireUserAuth, requirePermission('can_moderate'), async (req, res) => {
  try {
    const { roleId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Check if role exists
    const roleResult = await db.query(`
      SELECT * FROM forum_roles WHERE id = $1
    `, [roleId]);

    if (roleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Get users with this role
    const result = await db.query(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.created_at as joined_at,
        COUNT(DISTINCT t.id) as thread_count,
        COUNT(DISTINCT c.id) as comment_count
      FROM users u
      LEFT JOIN forum_threads t ON u.id = t.author_id AND t.is_deleted = false
      LEFT JOIN forum_comments c ON u.id = c.author_id AND c.is_deleted = false
      WHERE u.forum_role_id = $1
      GROUP BY u.id
      ORDER BY u.username ASC
      LIMIT $2 OFFSET $3
    `, [roleId, parseInt(limit), offset]);

    // Get total count
    const countResult = await db.query(`
      SELECT COUNT(*) as total
      FROM users
      WHERE forum_role_id = $1
    `, [roleId]);

    const total = parseInt(countResult.rows[0].total);

    res.json({
      role: roleResult.rows[0],
      users: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching users by role:', error);
    res.status(500).json({ error: 'Failed to fetch users by role' });
  }
});

module.exports = { router, setDb };
