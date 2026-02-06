const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../services/fileStorage');

// Will be injected from main app
let db;
let emailService;

function setDb(database) {
    db = database;
}

function setEmailService(service) {
    emailService = service;
}

// ============================================
// USER MANAGEMENT
// ============================================

/**
 * GET /api/admin/users
 * List all portal users
 */
router.get('/users', requireAuth, async (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            search: req.query.search,
            limit: req.query.limit ? parseInt(req.query.limit) : undefined,
            offset: req.query.offset ? parseInt(req.query.offset) : undefined
        };

        const users = await db.getUsers(filters);
        const total = await db.getUserCount();

        res.json({ success: true, data: users, total });
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
});

/**
 * PATCH /api/admin/users/:id
 * Update user (suspend, activate, etc.)
 */
router.patch('/users/:id', requireAuth, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { status, name, telegram, location } = req.body;

        const updates = {};
        if (status !== undefined) {
            if (!['active', 'suspended'].includes(status)) {
                return res.status(400).json({ success: false, error: 'Invalid status. Use active or suspended.' });
            }
            updates.status = status;
        }
        if (name !== undefined) updates.name = name;
        if (telegram !== undefined) updates.telegram = telegram;
        if (location !== undefined) updates.location = location;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        const user = await db.updateUser(userId, updates);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({ success: true, data: user });
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ success: false, error: 'Failed to update user' });
    }
});

/**
 * POST /api/admin/users/:id/invite
 * Send invite to a registration (convert registration to user)
 */
router.post('/users/:id/invite', requireAuth, async (req, res) => {
    try {
        const registrationId = parseInt(req.params.id);

        const registration = await db.getRegistrationById(registrationId);
        if (!registration) {
            return res.status(404).json({ success: false, error: 'Registration not found' });
        }

        // Check if already converted
        if (registration.converted_to_user_id) {
            return res.status(400).json({ success: false, error: 'Registration already converted to a user' });
        }

        // Check if user with this email already exists
        const existingUser = await db.getUserByEmail(registration.email);
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'A user with this email already exists' });
        }

        // Generate invite token
        const token = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);

        const invite = await db.createUserInvite({
            registrationId,
            email: registration.email,
            token,
            expiresAt,
            createdBy: req.admin.id
        });

        // Send invite email
        const inviteLink = `${req.protocol}://${req.get('host')}/register/${token}`;

        if (emailService) {
            emailService.sendEmail({
                to: registration.email,
                subject: 'SLOBODA - You are invited to the member portal',
                body: `Dear ${registration.name},\n\nYou have been invited to join the SLOBODA member portal.\n\nClick the link below to set up your account:\n\n${inviteLink}\n\nThis invitation expires in 48 hours.\n\nBest regards,\nThe SLOBODA Team`
            }).catch(err => console.error('Invite email error:', err));
        }

        res.json({
            success: true,
            data: invite,
            inviteLink,
            message: 'Invitation sent'
        });
    } catch (err) {
        console.error('Error creating invite:', err);
        res.status(500).json({ success: false, error: 'Failed to create invitation' });
    }
});

// ============================================
// POSTS (ADMIN CRUD)
// ============================================

/**
 * GET /api/admin/posts
 * List all posts (including drafts)
 */
router.get('/posts', requireAuth, async (req, res) => {
    try {
        const filters = {
            type: req.query.type,
            status: req.query.status,
            categoryId: req.query.categoryId ? parseInt(req.query.categoryId) : undefined,
            search: req.query.search,
            limit: req.query.limit ? parseInt(req.query.limit) : undefined,
            offset: req.query.offset ? parseInt(req.query.offset) : undefined
        };

        const posts = await db.getAllPosts(filters);
        res.json({ success: true, data: posts });
    } catch (err) {
        console.error('Error fetching posts:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch posts' });
    }
});

/**
 * POST /api/admin/posts
 * Create a new post
 */
router.post('/posts', requireAuth, async (req, res) => {
    try {
        const { title, summary, body, type, status, categoryId, featuredImage } = req.body;

        if (!title || !body) {
            return res.status(400).json({
                success: false,
                error: 'Title and body are required'
            });
        }

        if (type && !['news', 'article', 'newsletter', 'knowledge'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid post type. Use: news, article, newsletter, or knowledge'
            });
        }

        if (status && !['draft', 'published', 'archived'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status. Use: draft, published, or archived'
            });
        }

        const post = await db.createPost({
            title,
            summary: summary || null,
            body,
            type: type || 'news',
            status: status || 'draft',
            categoryId: categoryId ? parseInt(categoryId) : null,
            authorAdminId: req.admin.id,
            featuredImage: featuredImage || null
        });

        res.json({ success: true, data: post });
    } catch (err) {
        console.error('Error creating post:', err);
        res.status(500).json({ success: false, error: 'Failed to create post' });
    }
});

/**
 * PATCH /api/admin/posts/:id
 * Update a post
 */
router.patch('/posts/:id', requireAuth, async (req, res) => {
    try {
        const postId = parseInt(req.params.id);
        const { title, slug, summary, body, type, status, categoryId, featuredImage } = req.body;

        const updates = {};
        if (title !== undefined) updates.title = title;
        if (slug !== undefined) updates.slug = slug;
        if (summary !== undefined) updates.summary = summary;
        if (body !== undefined) updates.body = body;
        if (type !== undefined) {
            if (!['news', 'article', 'newsletter', 'knowledge'].includes(type)) {
                return res.status(400).json({ success: false, error: 'Invalid post type' });
            }
            updates.type = type;
        }
        if (status !== undefined) {
            if (!['draft', 'published', 'archived'].includes(status)) {
                return res.status(400).json({ success: false, error: 'Invalid status' });
            }
            updates.status = status;
        }
        if (categoryId !== undefined) updates.categoryId = categoryId ? parseInt(categoryId) : null;
        if (featuredImage !== undefined) updates.featuredImage = featuredImage;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        const post = await db.updatePost(postId, updates);
        if (!post) {
            return res.status(404).json({ success: false, error: 'Post not found' });
        }

        res.json({ success: true, data: post });
    } catch (err) {
        console.error('Error updating post:', err);
        res.status(500).json({ success: false, error: 'Failed to update post' });
    }
});

/**
 * DELETE /api/admin/posts/:id
 * Delete a post
 */
router.delete('/posts/:id', requireAuth, async (req, res) => {
    try {
        await db.deletePost(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting post:', err);
        res.status(500).json({ success: false, error: 'Failed to delete post' });
    }
});

// ============================================
// CATEGORIES (ADMIN CRUD)
// ============================================

/**
 * GET /api/admin/categories
 * List all categories
 */
router.get('/categories', requireAuth, async (req, res) => {
    try {
        const categories = await db.getCategories();
        res.json({ success: true, data: categories });
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch categories' });
    }
});

/**
 * POST /api/admin/categories
 * Create a category
 */
router.post('/categories', requireAuth, async (req, res) => {
    try {
        const { name, slug, description, icon, sortOrder } = req.body;

        if (!name || !slug) {
            return res.status(400).json({
                success: false,
                error: 'Name and slug are required'
            });
        }

        // Validate slug format
        if (!/^[a-z0-9-]+$/.test(slug)) {
            return res.status(400).json({
                success: false,
                error: 'Slug must contain only lowercase letters, numbers, and hyphens'
            });
        }

        const category = await db.createCategory({
            name,
            slug,
            description: description || null,
            icon: icon || null,
            sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : 0
        });

        res.json({ success: true, data: category });
    } catch (err) {
        console.error('Error creating category:', err);
        if (err.code === '23505') {
            return res.status(400).json({ success: false, error: 'A category with this slug already exists' });
        }
        res.status(500).json({ success: false, error: 'Failed to create category' });
    }
});

/**
 * PATCH /api/admin/categories/:id
 * Update a category
 */
router.patch('/categories/:id', requireAuth, async (req, res) => {
    try {
        const categoryId = parseInt(req.params.id);
        const { name, slug, description, icon, sortOrder } = req.body;

        if (slug && !/^[a-z0-9-]+$/.test(slug)) {
            return res.status(400).json({
                success: false,
                error: 'Slug must contain only lowercase letters, numbers, and hyphens'
            });
        }

        const category = await db.updateCategory(categoryId, {
            name: name || null,
            slug: slug || null,
            description: description !== undefined ? description : null,
            icon: icon !== undefined ? icon : null,
            sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : null
        });

        if (!category) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }

        res.json({ success: true, data: category });
    } catch (err) {
        console.error('Error updating category:', err);
        if (err.code === '23505') {
            return res.status(400).json({ success: false, error: 'A category with this slug already exists' });
        }
        res.status(500).json({ success: false, error: 'Failed to update category' });
    }
});

/**
 * DELETE /api/admin/categories/:id
 * Delete a category
 */
router.delete('/categories/:id', requireAuth, async (req, res) => {
    try {
        await db.deleteCategory(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting category:', err);
        res.status(500).json({ success: false, error: 'Failed to delete category' });
    }
});

// ============================================
// KNOWLEDGE SUBMISSIONS (ADMIN REVIEW)
// ============================================

/**
 * GET /api/admin/knowledge
 * List submissions (filterable by status)
 */
router.get('/knowledge', requireAuth, async (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            search: req.query.search,
            limit: req.query.limit ? parseInt(req.query.limit) : undefined,
            offset: req.query.offset ? parseInt(req.query.offset) : undefined
        };

        const submissions = await db.getPendingSubmissions(filters);
        res.json({ success: true, data: submissions });
    } catch (err) {
        console.error('Error fetching submissions:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch submissions' });
    }
});

/**
 * PATCH /api/admin/knowledge/:id
 * Update submission (approve, reject, set category, etc.)
 */
router.patch('/knowledge/:id', requireAuth, async (req, res) => {
    try {
        const submissionId = parseInt(req.params.id);
        const { status, finalCategoryId, reviewNotes, aiTags, aiSummary, aiConfidence, aiCategoryId } = req.body;

        const updates = {};

        if (status !== undefined) {
            if (!['pending', 'reviewing', 'approved', 'rejected', 'published'].includes(status)) {
                return res.status(400).json({ success: false, error: 'Invalid status' });
            }
            updates.status = status;
        }

        if (finalCategoryId !== undefined) updates.finalCategoryId = finalCategoryId ? parseInt(finalCategoryId) : null;
        if (reviewNotes !== undefined) updates.reviewNotes = reviewNotes;
        if (aiTags !== undefined) updates.aiTags = aiTags;
        if (aiSummary !== undefined) updates.aiSummary = aiSummary;
        if (aiConfidence !== undefined) updates.aiConfidence = aiConfidence;
        if (aiCategoryId !== undefined) updates.aiCategoryId = aiCategoryId ? parseInt(aiCategoryId) : null;

        // Set reviewer info on status changes
        if (status === 'approved' || status === 'rejected') {
            updates.reviewedBy = req.admin.id;
            updates.reviewedAt = new Date();
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        const submission = await db.updateKnowledgeSubmission(submissionId, updates);
        if (!submission) {
            return res.status(404).json({ success: false, error: 'Submission not found' });
        }

        res.json({ success: true, data: submission });
    } catch (err) {
        console.error('Error updating submission:', err);
        res.status(500).json({ success: false, error: 'Failed to update submission' });
    }
});

/**
 * POST /api/admin/knowledge/:id/publish
 * Publish a knowledge submission as a post
 */
router.post('/knowledge/:id/publish', requireAuth, async (req, res) => {
    try {
        const submissionId = parseInt(req.params.id);

        const submission = await db.getKnowledgeSubmissionById(submissionId);
        if (!submission) {
            return res.status(404).json({ success: false, error: 'Submission not found' });
        }

        if (submission.published_post_id) {
            return res.status(400).json({ success: false, error: 'Submission already published' });
        }

        // Create a post from the submission
        const post = await db.createPost({
            title: submission.title,
            summary: submission.ai_summary || submission.description,
            body: submission.body || submission.description,
            type: 'knowledge',
            status: 'published',
            categoryId: submission.final_category_id || submission.ai_category_id || submission.suggested_category_id,
            authorAdminId: req.admin.id,
            authorUserId: submission.user_id
        });

        // Link the post back to the submission
        await db.updateKnowledgeSubmission(submissionId, {
            status: 'published',
            publishedPostId: post.id,
            reviewedBy: req.admin.id,
            reviewedAt: new Date()
        });

        res.json({ success: true, data: post });
    } catch (err) {
        console.error('Error publishing submission:', err);
        res.status(500).json({ success: false, error: 'Failed to publish submission' });
    }
});

module.exports = { router, setDb, setEmailService };
