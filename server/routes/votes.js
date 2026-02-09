const express = require('express');
const router = express.Router();
const { requireUserAuth } = require('../middleware/rolePermission');

let db;

function setDb(database) {
  db = database;
}

// POST /api/votes - Cast or update vote on a comment
router.post('/', requireUserAuth, async (req, res) => {
  try {
    const { commentId, voteType } = req.body;
    const userId = req.user.id;

    if (!commentId || !voteType) {
      return res.status(400).json({ error: 'Comment ID and vote type are required' });
    }

    if (!['upvote', 'downvote'].includes(voteType)) {
      return res.status(400).json({ error: 'Vote type must be "upvote" or "downvote"' });
    }

    // Check if comment exists
    const commentResult = await db.query(`
      SELECT id, author_id FROM forum_comments
      WHERE id = $1 AND is_deleted = false
    `, [commentId]);

    if (commentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Prevent voting on own comments
    if (commentResult.rows[0].author_id === userId) {
      return res.status(403).json({ error: 'You cannot vote on your own comments' });
    }

    // Check if user has already voted on this comment
    const existingVoteResult = await db.query(`
      SELECT * FROM forum_votes
      WHERE user_id = $1 AND comment_id = $2
    `, [userId, commentId]);

    if (existingVoteResult.rows.length > 0) {
      const existingVote = existingVoteResult.rows[0];

      // If same vote type, remove the vote (toggle off)
      if (existingVote.vote_type === voteType) {
        await db.query(`
          DELETE FROM forum_votes
          WHERE user_id = $1 AND comment_id = $2
        `, [userId, commentId]);

        return res.json({
          message: 'Vote removed',
          action: 'removed'
        });
      } else {
        // Update to the new vote type
        await db.query(`
          UPDATE forum_votes
          SET vote_type = $1, created_at = NOW()
          WHERE user_id = $2 AND comment_id = $3
        `, [voteType, userId, commentId]);

        return res.json({
          message: 'Vote updated',
          action: 'updated',
          voteType
        });
      }
    } else {
      // Create new vote
      await db.query(`
        INSERT INTO forum_votes (user_id, comment_id, vote_type)
        VALUES ($1, $2, $3)
      `, [userId, commentId, voteType]);

      return res.status(201).json({
        message: 'Vote cast successfully',
        action: 'created',
        voteType
      });
    }
  } catch (error) {
    console.error('Error casting vote:', error);
    res.status(500).json({ error: 'Failed to cast vote' });
  }
});

// GET /api/votes/comment/:commentId - Get vote counts for a comment
router.get('/comment/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;

    const result = await db.query(`
      SELECT
        SUM(CASE WHEN vote_type = 'upvote' THEN 1 ELSE 0 END)::integer as upvotes,
        SUM(CASE WHEN vote_type = 'downvote' THEN 1 ELSE 0 END)::integer as downvotes
      FROM forum_votes
      WHERE comment_id = $1
    `, [commentId]);

    const voteCounts = result.rows[0];

    res.json({
      commentId: parseInt(commentId),
      upvotes: voteCounts.upvotes || 0,
      downvotes: voteCounts.downvotes || 0,
      score: (voteCounts.upvotes || 0) - (voteCounts.downvotes || 0)
    });
  } catch (error) {
    console.error('Error fetching vote counts:', error);
    res.status(500).json({ error: 'Failed to fetch vote counts' });
  }
});

// GET /api/votes/user/comment/:commentId - Get current user's vote on a comment
router.get('/user/comment/:commentId', requireUserAuth, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const result = await db.query(`
      SELECT vote_type, created_at
      FROM forum_votes
      WHERE user_id = $1 AND comment_id = $2
    `, [userId, commentId]);

    if (result.rows.length === 0) {
      return res.json({
        commentId: parseInt(commentId),
        voted: false,
        voteType: null
      });
    }

    res.json({
      commentId: parseInt(commentId),
      voted: true,
      voteType: result.rows[0].vote_type,
      votedAt: result.rows[0].created_at
    });
  } catch (error) {
    console.error('Error fetching user vote:', error);
    res.status(500).json({ error: 'Failed to fetch user vote' });
  }
});

// DELETE /api/votes/comment/:commentId - Remove vote from a comment
router.delete('/comment/:commentId', requireUserAuth, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    // Check if vote exists
    const voteResult = await db.query(`
      SELECT * FROM forum_votes
      WHERE user_id = $1 AND comment_id = $2
    `, [userId, commentId]);

    if (voteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Vote not found' });
    }

    // Remove vote
    await db.query(`
      DELETE FROM forum_votes
      WHERE user_id = $1 AND comment_id = $2
    `, [userId, commentId]);

    res.json({ message: 'Vote removed successfully' });
  } catch (error) {
    console.error('Error removing vote:', error);
    res.status(500).json({ error: 'Failed to remove vote' });
  }
});

// GET /api/votes/user/comments - Get all comments the current user has voted on
router.get('/user/comments', requireUserAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 50, voteType } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT
        v.comment_id,
        v.vote_type,
        v.created_at as voted_at,
        c.content as comment_content,
        c.thread_id,
        t.title as thread_title
      FROM forum_votes v
      LEFT JOIN forum_comments c ON v.comment_id = c.id
      LEFT JOIN forum_threads t ON c.thread_id = t.id
      WHERE v.user_id = $1 AND c.is_deleted = false
    `;

    const params = [userId];
    let paramCount = 2;

    if (voteType && ['upvote', 'downvote'].includes(voteType)) {
      query += ` AND v.vote_type = $${paramCount}`;
      params.push(voteType);
      paramCount++;
    }

    query += ` ORDER BY v.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), offset);

    const result = await db.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM forum_votes v
      LEFT JOIN forum_comments c ON v.comment_id = c.id
      WHERE v.user_id = $1 AND c.is_deleted = false
    `;
    const countParams = [userId];

    if (voteType && ['upvote', 'downvote'].includes(voteType)) {
      countQuery += ` AND v.vote_type = $2`;
      countParams.push(voteType);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      votes: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching user votes:', error);
    res.status(500).json({ error: 'Failed to fetch user votes' });
  }
});

module.exports = { router, setDb };
