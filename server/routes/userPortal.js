const express = require('express');
const router = express.Router();
const { requireUserAuth } = require('../middleware/userAuth');
const { upload } = require('../services/fileStorage');
const { enqueue: enqueueClassification } = require('../services/ai/queue');

// Will be injected from main app
let db;

function setDb(database) {
    db = database;
}

// ============================================
// NEWS & ARTICLES
// ============================================

/**
 * GET /api/user/news
 * Published news posts, paginated
 */
router.get('/news', requireUserAuth, async (req, res) => {
    try {
        const filters = {
            type: 'news',
            search: req.query.search,
            categoryId: req.query.categoryId ? parseInt(req.query.categoryId) : undefined,
            limit: req.query.limit ? parseInt(req.query.limit) : 20,
            offset: req.query.offset ? parseInt(req.query.offset) : 0
        };

        const posts = await db.getPublishedPosts(filters);
        res.json({ success: true, data: posts });
    } catch (err) {
        console.error('Error fetching news:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch news' });
    }
});

/**
 * GET /api/user/articles
 * Published article posts, paginated
 */
router.get('/articles', requireUserAuth, async (req, res) => {
    try {
        const filters = {
            type: 'article',
            search: req.query.search,
            categoryId: req.query.categoryId ? parseInt(req.query.categoryId) : undefined,
            limit: req.query.limit ? parseInt(req.query.limit) : 20,
            offset: req.query.offset ? parseInt(req.query.offset) : 0
        };

        const posts = await db.getPublishedPosts(filters);
        res.json({ success: true, data: posts });
    } catch (err) {
        console.error('Error fetching articles:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch articles' });
    }
});

/**
 * GET /api/user/posts/:slug
 * Single post by slug (must be published)
 */
router.get('/posts/:slug', requireUserAuth, async (req, res) => {
    try {
        const post = await db.getPostBySlug(req.params.slug);
        if (!post || post.status !== 'published') {
            return res.status(404).json({ success: false, error: 'Post not found' });
        }

        // Increment view count (async, don't block)
        db.incrementPostViews(post.id).catch(err =>
            console.error('Error incrementing views:', err)
        );

        res.json({ success: true, data: post });
    } catch (err) {
        console.error('Error fetching post:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch post' });
    }
});

// ============================================
// CATEGORIES
// ============================================

/**
 * GET /api/user/categories
 * All categories
 */
router.get('/categories', requireUserAuth, async (req, res) => {
    try {
        const categories = await db.getCategories();
        res.json({ success: true, data: categories });
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch categories' });
    }
});

// ============================================
// KNOWLEDGE
// ============================================

/**
 * GET /api/user/knowledge
 * Search published knowledge (approved submissions that became posts)
 */
router.get('/knowledge', requireUserAuth, async (req, res) => {
    try {
        const filters = {
            type: 'knowledge',
            search: req.query.search,
            categoryId: req.query.categoryId ? parseInt(req.query.categoryId) : undefined,
            limit: req.query.limit ? parseInt(req.query.limit) : 20,
            offset: req.query.offset ? parseInt(req.query.offset) : 0
        };

        const posts = await db.getPublishedPosts(filters);
        res.json({ success: true, data: posts });
    } catch (err) {
        console.error('Error fetching knowledge:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch knowledge' });
    }
});

/**
 * GET /api/user/knowledge/my
 * User's own submissions
 */
router.get('/knowledge/my', requireUserAuth, async (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            limit: req.query.limit ? parseInt(req.query.limit) : 20,
            offset: req.query.offset ? parseInt(req.query.offset) : 0
        };

        const submissions = await db.getUserSubmissions(req.user.id, filters);
        res.json({ success: true, data: submissions });
    } catch (err) {
        console.error('Error fetching submissions:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch submissions' });
    }
});

/**
 * POST /api/user/knowledge
 * Submit knowledge (with optional file attachments)
 */
router.post('/knowledge', requireUserAuth, upload.array('files', 5), async (req, res) => {
    try {
        const { title, description, body, suggestedCategoryId } = req.body;

        if (!title || !description) {
            return res.status(400).json({
                success: false,
                error: 'Title and description are required'
            });
        }

        if (title.length > 500) {
            return res.status(400).json({
                success: false,
                error: 'Title must be 500 characters or less'
            });
        }

        const submission = await db.createKnowledgeSubmission({
            userId: req.user.id,
            title,
            description,
            body: body || null,
            suggestedCategoryId: suggestedCategoryId ? parseInt(suggestedCategoryId) : null
        });

        // Save file metadata if files were uploaded
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await db.createFile({
                    filename: file.filename,
                    originalFilename: file.originalname,
                    filepath: file.path,
                    mimetype: file.mimetype,
                    sizeBytes: file.size,
                    uploadedByUserId: req.user.id,
                    knowledgeSubmissionId: submission.id
                });
            }
        }

        // Trigger AI classification in the background
        enqueueClassification(submission.id);

        res.json({ success: true, data: submission });
    } catch (err) {
        console.error('Error creating submission:', err);
        if (err.message && err.message.includes('File type')) {
            return res.status(400).json({ success: false, error: err.message });
        }
        res.status(500).json({ success: false, error: 'Failed to create submission' });
    }
});

// ============================================
// PROFILE
// ============================================

/**
 * GET /api/user/profile
 * Get current user profile
 */
router.get('/profile', requireUserAuth, async (req, res) => {
    try {
        const user = await db.getUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                telegram: user.telegram,
                location: user.location,
                status: user.status,
                lastLogin: user.last_login,
                createdAt: user.created_at
            }
        });
    } catch (err) {
        console.error('Error fetching profile:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch profile' });
    }
});

/**
 * PATCH /api/user/profile
 * Update current user profile
 */
router.patch('/profile', requireUserAuth, async (req, res) => {
    try {
        const { name, telegram, location } = req.body;

        if (name !== undefined && (!name || name.trim().length === 0)) {
            return res.status(400).json({
                success: false,
                error: 'Name cannot be empty'
            });
        }

        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (telegram !== undefined) updates.telegram = telegram;
        if (location !== undefined) updates.location = location;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No fields to update'
            });
        }

        const user = await db.updateUser(req.user.id, updates);

        res.json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                telegram: user.telegram,
                location: user.location
            }
        });
    } catch (err) {
        console.error('Error updating profile:', err);
        res.status(500).json({ success: false, error: 'Failed to update profile' });
    }
});

module.exports = { router, setDb };
