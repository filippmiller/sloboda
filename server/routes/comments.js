const express = require('express');
const router = express.Router();
const { requireUserAuth } = require('../middleware/userAuth');

let db;

function setDb(database) {
  db = database;
}

// POST /api/comments - Create new comment or reply
router.post('/', requireUserAuth, async (req, res) => {
  try {
    const { threadId, content, parentId } = req.body;
    const userId = req.user.id;

    if (!threadId || !content) {
      return res.status(400).json({ error: 'Thread ID and content are required' });
    }

    if (content.length < 1 || content.length > 5000) {
      return res.status(400).json({ error: 'Content must be between 1 and 5000 characters' });
    }

    // Check if thread exists and is not locked
    const threadResult = await db.pool.query(`
      SELECT is_locked, is_deleted FROM forum_threads WHERE id = $1
    `, [threadId]);

    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (threadResult.rows[0].is_deleted) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (threadResult.rows[0].is_locked) {
      // Check if user has moderator permission to post in locked threads
      const canModerate = await db.userHasPermission(userId, 'can_moderate');
      if (!canModerate) {
        return res.status(403).json({ error: 'This thread is locked' });
      }
    }

    // If this is a reply, check if parent comment exists
    if (parentId) {
      const parentResult = await db.pool.query(`
        SELECT id, thread_id FROM forum_comments
        WHERE id = $1 AND is_deleted = false
      `, [parentId]);

      if (parentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Parent comment not found' });
      }

      // Ensure parent belongs to the same thread
      if (parentResult.rows[0].thread_id !== parseInt(threadId)) {
        return res.status(400).json({ error: 'Parent comment does not belong to this thread' });
      }
    }

    const result = await db.createForumComment(userId, threadId, content, parentId || null);

    // Get the created comment with author details
    const commentResult = await db.pool.query(`
      SELECT
        c.*,
        u.name as author_username
      FROM forum_comments c
      LEFT JOIN users u ON c.author_id = u.id
      WHERE c.id = $1
    `, [result.id]);

    res.status(201).json({
      message: 'Comment created successfully',
      comment: commentResult.rows[0]
    });
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// GET /api/comments/:id/replies - Get replies to a comment
router.get('/:id/replies', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Check if parent comment exists
    const parentResult = await db.pool.query(`
      SELECT id FROM forum_comments WHERE id = $1 AND is_deleted = false
    `, [id]);

    if (parentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Get replies with vote counts
    const repliesResult = await db.pool.query(`
      SELECT
        c.*,
        u.name as author_username,
        SUM(CASE WHEN v.vote_type = 'upvote' THEN 1 ELSE 0 END)::integer as upvotes,
        SUM(CASE WHEN v.vote_type = 'downvote' THEN 1 ELSE 0 END)::integer as downvotes
      FROM forum_comments c
      LEFT JOIN users u ON c.author_id = u.id
      LEFT JOIN forum_votes v ON c.id = v.comment_id
      WHERE c.parent_id = $1 AND c.is_deleted = false
      GROUP BY c.id, u.name
      ORDER BY c.created_at ASC
      LIMIT $2 OFFSET $3
    `, [id, parseInt(limit), offset]);

    // Get total count
    const countResult = await db.pool.query(`
      SELECT COUNT(*) as total
      FROM forum_comments
      WHERE parent_id = $1 AND is_deleted = false
    `, [id]);

    const total = parseInt(countResult.rows[0].total);

    res.json({
      replies: repliesResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching replies:', error);
    res.status(500).json({ error: 'Failed to fetch replies' });
  }
});

// PUT /api/comments/:id - Update comment (author only or moderator)
router.put('/:id', requireUserAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    if (content.length < 1 || content.length > 5000) {
      return res.status(400).json({ error: 'Content must be between 1 and 5000 characters' });
    }

    // Check if comment exists
    const commentResult = await db.pool.query(`
      SELECT * FROM forum_comments
      WHERE id = $1 AND is_deleted = false
    `, [id]);

    if (commentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const comment = commentResult.rows[0];

    // Check if user is author or has moderator permission
    const isAuthor = comment.author_id === userId;
    const canModerate = await db.userHasPermission(userId, 'can_moderate');

    if (!isAuthor && !canModerate) {
      return res.status(403).json({ error: 'You do not have permission to edit this comment' });
    }

    // Update comment
    const result = await db.pool.query(`
      UPDATE forum_comments
      SET content = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [content, id]);

    res.json({
      message: 'Comment updated successfully',
      comment: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// DELETE /api/comments/:id - Soft delete comment (author or moderator)
router.delete('/:id', requireUserAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if comment exists
    const commentResult = await db.pool.query(`
      SELECT * FROM forum_comments
      WHERE id = $1 AND is_deleted = false
    `, [id]);

    if (commentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const comment = commentResult.rows[0];

    // Check if user is author or has moderator permission
    const isAuthor = comment.author_id === userId;
    const canModerate = await db.userHasPermission(userId, 'can_moderate');

    if (!isAuthor && !canModerate) {
      return res.status(403).json({ error: 'You do not have permission to delete this comment' });
    }

    // Soft delete
    await db.pool.query(`
      UPDATE forum_comments
      SET is_deleted = true, updated_at = NOW()
      WHERE id = $1
    `, [id]);

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// GET /api/comments/:id - Get single comment with details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.pool.query(`
      SELECT
        c.*,
        u.name as author_username,
        SUM(CASE WHEN v.vote_type = 'upvote' THEN 1 ELSE 0 END)::integer as upvotes,
        SUM(CASE WHEN v.vote_type = 'downvote' THEN 1 ELSE 0 END)::integer as downvotes,
        COUNT(DISTINCT r.id) as reply_count
      FROM forum_comments c
      LEFT JOIN users u ON c.author_id = u.id
      LEFT JOIN forum_votes v ON c.id = v.comment_id
      LEFT JOIN forum_comments r ON c.id = r.parent_id AND r.is_deleted = false
      WHERE c.id = $1 AND c.is_deleted = false
      GROUP BY c.id, u.name
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    res.json({ comment: result.rows[0] });
  } catch (error) {
    console.error('Error fetching comment:', error);
    res.status(500).json({ error: 'Failed to fetch comment' });
  }
});

module.exports = { router, setDb };
