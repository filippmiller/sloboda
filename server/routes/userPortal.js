const express = require('express');
const router = express.Router();
const { requireUserAuth } = require('../middleware/userAuth');
const { upload } = require('../services/fileStorage');
const { avatarUpload } = require('../middleware/avatarUpload');
const { fileUpload } = require('../middleware/fileUpload');
const s3Storage = require('../services/s3Storage');
const { parseVideoUrl } = require('../utils/videoEmbed');
const { enqueue: enqueueClassification } = require('../services/ai/queue');
const { streamLibrarianResponse } = require('../services/ai/librarian');

// Will be injected from main app
let db;

function setDb(database) {
    db = database;
}

/**
 * Apply translations to a post if a non-Russian language is requested.
 * Overlays translated title/summary/body from content_translations table.
 */
async function applyTranslation(post, lang) {
    if (!lang || lang === 'ru' || !post) return post;
    const translation = await db.getContentTranslation('post', post.id, lang);
    if (!translation) return post;
    return {
        ...post,
        title: translation.title || post.title,
        summary: translation.summary || post.summary,
        body: translation.body || post.body,
        _translated: lang
    };
}

async function applyTranslations(posts, lang) {
    if (!lang || lang === 'ru' || !posts || posts.length === 0) return posts;
    return Promise.all(posts.map(post => applyTranslation(post, lang)));
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
        const lang = req.query.lang;
        const translated = await applyTranslations(posts, lang);
        res.json({ success: true, data: translated });
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
        const lang = req.query.lang;
        const translated = await applyTranslations(posts, lang);
        res.json({ success: true, data: translated });
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

        const lang = req.query.lang;
        const translated = await applyTranslation(post, lang);
        res.json({ success: true, data: translated });
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

        // Check for badge eligibility after submission
        db.checkAndAwardBadges(req.user.id).catch(err =>
            console.error('Error checking badges:', err)
        );

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
// BOOKMARKS
// ============================================

/**
 * GET /api/user/bookmarks
 * User's bookmarks
 */
router.get('/bookmarks', requireUserAuth, async (req, res) => {
    try {
        const bookmarks = await db.getUserBookmarks(req.user.id, {
            limit: req.query.limit ? parseInt(req.query.limit) : 50,
            offset: req.query.offset ? parseInt(req.query.offset) : 0
        });
        res.json({ success: true, data: bookmarks });
    } catch (err) {
        console.error('Error fetching bookmarks:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch bookmarks' });
    }
});

/**
 * POST /api/user/bookmarks/toggle
 * Toggle bookmark on a post
 */
router.post('/bookmarks/toggle', requireUserAuth, async (req, res) => {
    try {
        const { postId } = req.body;
        if (!postId) return res.status(400).json({ success: false, error: 'postId required' });
        const result = await db.toggleBookmark(req.user.id, parseInt(postId));
        res.json({ success: true, data: result });
    } catch (err) {
        console.error('Error toggling bookmark:', err);
        res.status(500).json({ success: false, error: 'Failed to toggle bookmark' });
    }
});

/**
 * GET /api/user/bookmarks/ids
 * Just the post IDs (for quick lookup)
 */
router.get('/bookmarks/ids', requireUserAuth, async (req, res) => {
    try {
        const ids = await db.getUserBookmarkIds(req.user.id);
        res.json({ success: true, data: ids });
    } catch (err) {
        console.error('Error fetching bookmark ids:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch bookmark ids' });
    }
});

// ============================================
// NOTIFICATIONS
// ============================================

/**
 * GET /api/user/notifications
 * User's notifications with unread count
 */
router.get('/notifications', requireUserAuth, async (req, res) => {
    try {
        const notifications = await db.getUserNotifications(req.user.id);
        const unreadCount = await db.getUnreadNotificationCount(req.user.id);
        res.json({ success: true, data: { notifications, unreadCount } });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
    }
});

/**
 * POST /api/user/notifications/read-all
 * Mark all notifications as read
 */
router.post('/notifications/read-all', requireUserAuth, async (req, res) => {
    try {
        await db.markNotificationsRead(req.user.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Error marking notifications:', err);
        res.status(500).json({ success: false, error: 'Failed to mark notifications' });
    }
});

/**
 * POST /api/user/notifications/:id/read
 * Mark single notification as read
 */
router.post('/notifications/:id/read', requireUserAuth, async (req, res) => {
    try {
        await db.markNotificationRead(parseInt(req.params.id), req.user.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Error marking notification:', err);
        res.status(500).json({ success: false, error: 'Failed to mark notification' });
    }
});

// ============================================
// LIBRARIAN AI CHAT
// ============================================

const librarianRateMap = new Map();
const LIBRARIAN_RATE_LIMIT = 20;
const LIBRARIAN_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Clear expired rate limit entries every 30 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of librarianRateMap) {
        if (now - entry.windowStart > LIBRARIAN_RATE_WINDOW_MS) {
            librarianRateMap.delete(key);
        }
    }
}, 30 * 60 * 1000);

/**
 * POST /api/user/librarian/chat
 * Stream AI librarian response via SSE
 */
router.post('/librarian/chat', requireUserAuth, async (req, res) => {
    const userId = req.user.id;

    // Rate limiting per user
    const now = Date.now();
    let rateEntry = librarianRateMap.get(userId);
    if (!rateEntry || now - rateEntry.windowStart > LIBRARIAN_RATE_WINDOW_MS) {
        rateEntry = { count: 0, windowStart: now };
        librarianRateMap.set(userId, rateEntry);
    }
    if (rateEntry.count >= LIBRARIAN_RATE_LIMIT) {
        return res.status(429).json({
            success: false,
            error: 'Слишком много запросов. Попробуйте через час.'
        });
    }
    rateEntry.count++;

    // Validate input
    const { question, history } = req.body;
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Вопрос не может быть пустым'
        });
    }
    if (question.length > 1000) {
        return res.status(400).json({
            success: false,
            error: 'Вопрос слишком длинный (макс. 1000 символов)'
        });
    }

    const chatHistory = Array.isArray(history) ? history : [];

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
        const { stream, sources } = await streamLibrarianResponse(question.trim(), chatHistory, db);

        // Send sources as a metadata event
        res.write(`event: sources\ndata: ${JSON.stringify(sources)}\n\n`);

        // Stream text chunks
        for await (const chunk of stream) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        // Signal completion
        res.write('data: [DONE]\n\n');
        res.end();
    } catch (err) {
        console.error('[librarian] Chat error:', err.message);

        if (err.message === 'AI_NOT_CONFIGURED') {
            res.write(`event: error\ndata: ${JSON.stringify('AI-сервис временно недоступен. Попробуйте позже.')}\n\n`);
        } else {
            res.write(`event: error\ndata: ${JSON.stringify('Произошла ошибка. Попробуйте ещё раз.')}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
    }
});

// ============================================
// PROFILE
// ============================================

/**
 * Helper to format user + profile data for API responses
 */
function formatProfileResponse(user) {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        telegram: user.telegram,
        location: user.location,
        status: user.status,
        avatarUrl: user.avatar_url || null,
        onboardingCompletedAt: user.onboarding_completed_at || null,
        preferredLanguage: user.preferred_language || 'ru',
        lastLogin: user.last_login,
        createdAt: user.created_at,
        profile: user.country_code !== undefined ? {
            countryCode: user.country_code || null,
            city: user.profile_city || null,
            region: user.region || null,
            birthYear: user.birth_year || null,
            gender: user.gender || null,
            bio: user.bio || null,
            profession: user.profession || null,
            skills: user.skills || [],
            interests: user.interests || [],
            hobbies: user.hobbies || [],
            motivation: user.motivation || null,
            participationInterest: user.participation_interest || null
        } : null
    };
}

/**
 * GET /api/user/profile
 * Get current user profile with extended data
 */
router.get('/profile', requireUserAuth, async (req, res) => {
    try {
        const user = await db.getUserWithProfile(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({ success: true, data: formatProfileResponse(user) });
    } catch (err) {
        console.error('Error fetching profile:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch profile' });
    }
});

/**
 * PATCH /api/user/profile
 * Update basic user profile fields
 */
router.patch('/profile', requireUserAuth, async (req, res) => {
    try {
        const { name, telegram, location, preferredLanguage } = req.body;

        if (name !== undefined && (!name || name.trim().length === 0)) {
            return res.status(400).json({
                success: false,
                error: 'Name cannot be empty'
            });
        }

        if (preferredLanguage !== undefined && !['ru', 'en', 'es', 'de', 'fr'].includes(preferredLanguage)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid language. Use: ru, en, es, de, fr'
            });
        }

        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (telegram !== undefined) updates.telegram = telegram;
        if (location !== undefined) updates.location = location;
        if (preferredLanguage !== undefined) updates.preferred_language = preferredLanguage;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No fields to update'
            });
        }

        await db.updateUser(req.user.id, updates);
        const user = await db.getUserWithProfile(req.user.id);

        res.json({ success: true, data: formatProfileResponse(user) });
    } catch (err) {
        console.error('Error updating profile:', err);
        res.status(500).json({ success: false, error: 'Failed to update profile' });
    }
});

/**
 * PUT /api/user/profile/extended
 * Create or update extended profile data (upsert)
 */
router.put('/profile/extended', requireUserAuth, async (req, res) => {
    try {
        const { countryCode, city, region, birthYear, gender,
                bio, profession, skills, interests, hobbies,
                motivation, participationInterest } = req.body;

        // Validate gender
        const validGenders = ['male', 'female', 'other', 'prefer_not_to_say'];
        if (gender && !validGenders.includes(gender)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid gender value'
            });
        }

        // Validate country code (2 letters)
        if (countryCode && (typeof countryCode !== 'string' || countryCode.length !== 2)) {
            return res.status(400).json({
                success: false,
                error: 'Country code must be a 2-letter ISO code'
            });
        }

        // Validate birth year
        if (birthYear !== undefined && birthYear !== null) {
            const year = parseInt(birthYear);
            const currentYear = new Date().getFullYear();
            if (isNaN(year) || year < 1900 || year > currentYear) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid birth year'
                });
            }
        }

        // Validate participation interest
        const validParticipation = ['relocate', 'invest', 'remote', 'visit', 'other'];
        if (participationInterest && !validParticipation.includes(participationInterest)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid participation interest'
            });
        }

        await db.upsertUserProfile(req.user.id, {
            countryCode: countryCode || null,
            city: city || null,
            region: region || null,
            birthYear: birthYear ? parseInt(birthYear) : null,
            gender: gender || null,
            bio: bio || null,
            profession: profession || null,
            skills: Array.isArray(skills) ? skills : null,
            interests: Array.isArray(interests) ? interests : null,
            hobbies: Array.isArray(hobbies) ? hobbies : null,
            motivation: motivation || null,
            participationInterest: participationInterest || null
        });

        // Check for badge eligibility after profile update
        db.checkAndAwardBadges(req.user.id).catch(err =>
            console.error('Error checking badges:', err)
        );

        const user = await db.getUserWithProfile(req.user.id);
        res.json({ success: true, data: formatProfileResponse(user) });
    } catch (err) {
        console.error('Error updating extended profile:', err);
        res.status(500).json({ success: false, error: 'Failed to update profile' });
    }
});

/**
 * POST /api/user/profile/avatar
 * Upload avatar image to S3
 */
router.post('/profile/avatar', requireUserAuth, avatarUpload.single('avatar'), async (req, res) => {
    try {
        if (!s3Storage.isConfigured()) {
            return res.status(503).json({
                success: false,
                error: 'File storage is not configured'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No avatar file provided'
            });
        }

        // Delete old avatar if exists
        const currentUser = await db.getUserById(req.user.id);
        if (currentUser && currentUser.avatar_url) {
            const oldKey = s3Storage.extractKeyFromUrl(currentUser.avatar_url);
            if (oldKey) {
                s3Storage.deleteFile(oldKey).catch(err =>
                    console.error('Error deleting old avatar:', err)
                );
            }
        }

        // Upload new avatar
        const key = s3Storage.generateAvatarKey(req.file.originalname);
        const { url } = await s3Storage.uploadFile(req.file.buffer, key, req.file.mimetype);

        // Save URL in database
        await db.updateUserAvatar(req.user.id, url);

        res.json({ success: true, avatarUrl: url });
    } catch (err) {
        console.error('Error uploading avatar:', err);
        if (err.message && err.message.includes('allowed')) {
            return res.status(400).json({ success: false, error: err.message });
        }
        res.status(500).json({ success: false, error: 'Failed to upload avatar' });
    }
});

/**
 * DELETE /api/user/profile/avatar
 * Remove avatar
 */
router.delete('/profile/avatar', requireUserAuth, async (req, res) => {
    try {
        const currentUser = await db.getUserById(req.user.id);
        if (currentUser && currentUser.avatar_url) {
            if (s3Storage.isConfigured()) {
                const key = s3Storage.extractKeyFromUrl(currentUser.avatar_url);
                if (key) {
                    s3Storage.deleteFile(key).catch(err =>
                        console.error('Error deleting avatar from S3:', err)
                    );
                }
            }
            await db.updateUserAvatar(req.user.id, null);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting avatar:', err);
        res.status(500).json({ success: false, error: 'Failed to delete avatar' });
    }
});

/**
 * POST /api/user/onboarding/complete
 * Mark onboarding as completed
 */
router.post('/onboarding/complete', requireUserAuth, async (req, res) => {
    try {
        await db.completeOnboarding(req.user.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Error completing onboarding:', err);
        res.status(500).json({ success: false, error: 'Failed to complete onboarding' });
    }
});

// ============================================
// FILE STORAGE
// ============================================

/**
 * GET /api/user/files
 * List current user's files
 */
router.get('/files', requireUserAuth, async (req, res) => {
    try {
        const { context } = req.query;
        const files = await db.getUserFiles(req.user.id, context || null);
        const storageUsed = await db.getUserStorageUsed(req.user.id);
        res.json({
            success: true,
            data: files,
            storage: {
                used: storageUsed,
                limit: db.USER_STORAGE_LIMIT,
                remaining: Math.max(0, db.USER_STORAGE_LIMIT - storageUsed)
            }
        });
    } catch (err) {
        console.error('Error fetching user files:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch files' });
    }
});

/**
 * POST /api/user/files/upload
 * Upload a file to private S3 storage
 */
router.post('/files/upload', requireUserAuth, fileUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file provided' });
        }

        if (!s3Storage.isConfigured()) {
            return res.status(503).json({ success: false, error: 'File storage is not configured' });
        }

        // Check quota
        const storageUsed = await db.getUserStorageUsed(req.user.id);
        if (storageUsed + req.file.size > db.USER_STORAGE_LIMIT) {
            return res.status(413).json({
                success: false,
                error: 'Storage quota exceeded',
                storage: {
                    used: storageUsed,
                    limit: db.USER_STORAGE_LIMIT,
                    remaining: Math.max(0, db.USER_STORAGE_LIMIT - storageUsed)
                }
            });
        }

        const context = req.body.context || 'general';
        const description = req.body.description || null;
        const s3Key = s3Storage.generateFileKey(req.file.originalname, context);

        await s3Storage.uploadPrivateFile(req.file.buffer, s3Key, req.file.mimetype);

        const fileRecord = await db.createUserFile({
            filename: s3Key.split('/').pop(),
            originalFilename: req.file.originalname,
            filepath: s3Key,
            mimetype: req.file.mimetype,
            sizeBytes: req.file.size,
            userId: req.user.id,
            s3Key,
            context,
            description
        });

        res.json({ success: true, file: fileRecord });
    } catch (err) {
        console.error('Error uploading file:', err);
        res.status(500).json({ success: false, error: 'Failed to upload file' });
    }
});

/**
 * GET /api/user/files/:id/download
 * Get a presigned download URL for a private file
 */
router.get('/files/:id/download', requireUserAuth, async (req, res) => {
    try {
        const file = await db.getFileById(parseInt(req.params.id, 10));
        if (!file) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }
        if (file.uploaded_by_user_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }
        if (!file.s3_key) {
            return res.status(400).json({ success: false, error: 'File has no S3 key' });
        }

        const downloadUrl = await s3Storage.getPresignedDownloadUrl(file.s3_key, 3600);
        res.json({ success: true, downloadUrl, expiresIn: 3600 });
    } catch (err) {
        console.error('Error generating download URL:', err);
        res.status(500).json({ success: false, error: 'Failed to generate download URL' });
    }
});

/**
 * DELETE /api/user/files/:id
 * Delete a user's file from S3 and database
 */
router.delete('/files/:id', requireUserAuth, async (req, res) => {
    try {
        const file = await db.getFileById(parseInt(req.params.id, 10));
        if (!file) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }
        if (file.uploaded_by_user_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        // Delete from S3 if key exists
        if (file.s3_key) {
            try {
                await s3Storage.deletePrivateFile(file.s3_key);
            } catch (s3Err) {
                console.error('Error deleting file from S3:', s3Err);
            }
        }

        await db.deleteFile(file.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting file:', err);
        res.status(500).json({ success: false, error: 'Failed to delete file' });
    }
});

/**
 * GET /api/user/files/storage
 * Get storage usage info
 */
router.get('/files/storage', requireUserAuth, async (req, res) => {
    try {
        const storageUsed = await db.getUserStorageUsed(req.user.id);
        res.json({
            success: true,
            storage: {
                used: storageUsed,
                limit: db.USER_STORAGE_LIMIT,
                remaining: Math.max(0, db.USER_STORAGE_LIMIT - storageUsed)
            }
        });
    } catch (err) {
        console.error('Error fetching storage info:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch storage info' });
    }
});

// ============================================
// VIDEO EMBED
// ============================================

/**
 * POST /api/user/video/parse
 * Parse a video URL and return embed data
 */
router.post('/video/parse', requireUserAuth, async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const parsed = parseVideoUrl(url);
    if (!parsed) {
        return res.status(400).json({ success: false, error: 'Unsupported video URL' });
    }

    res.json({ success: true, video: parsed });
});

// ============================================
// COMMUNITY MAP
// ============================================

/**
 * GET /api/user/map/members
 * Get all members visible on the community map
 */
router.get('/map/members', requireUserAuth, async (req, res) => {
    try {
        const members = await db.getUsersForMap();
        res.json({ success: true, data: members });
    } catch (err) {
        console.error('Error fetching map members:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch map members' });
    }
});

/**
 * PATCH /api/user/map/settings
 * Update user's map visibility and coordinates
 */
router.patch('/map/settings', requireUserAuth, async (req, res) => {
    try {
        const { latitude, longitude, mapVisibility } = req.body;

        // Validate coordinates if provided
        if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
            return res.status(400).json({ success: false, error: 'Invalid latitude' });
        }
        if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
            return res.status(400).json({ success: false, error: 'Invalid longitude' });
        }

        const updated = await db.updateUserMapSettings(
            req.user.id,
            latitude,
            longitude,
            mapVisibility
        );

        res.json({ success: true, data: updated });
    } catch (err) {
        console.error('Error updating map settings:', err);
        res.status(500).json({ success: false, error: 'Failed to update map settings' });
    }
});

// ============================================
// BADGES
// ============================================

/**
 * GET /api/user/badges
 * Get current user's earned badges
 */
router.get('/badges', requireUserAuth, async (req, res) => {
    try {
        const badges = await db.getUserBadges(req.user.id);
        res.json({ success: true, data: badges });
    } catch (err) {
        console.error('Error fetching user badges:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch badges' });
    }
});

/**
 * GET /api/user/badges/all
 * Get all badges with earned status for current user
 */
router.get('/badges/all', requireUserAuth, async (req, res) => {
    try {
        const badges = await db.getUserBadgesWithStatus(req.user.id);
        res.json({ success: true, data: badges });
    } catch (err) {
        console.error('Error fetching all badges:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch badges' });
    }
});

/**
 * POST /api/user/badges/check
 * Manually trigger badge checking for current user
 */
router.post('/badges/check', requireUserAuth, async (req, res) => {
    try {
        await db.checkAndAwardBadges(req.user.id);
        const badges = await db.getUserBadges(req.user.id);
        res.json({ success: true, data: badges });
    } catch (err) {
        console.error('Error checking badges:', err);
        res.status(500).json({ success: false, error: 'Failed to check badges' });
    }
});

// ============================================
// EVENTS
// ============================================

/**
 * GET /api/user/events
 * List events with filters
 */
router.get('/events', requireUserAuth, async (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            eventType: req.query.eventType,
            userId: req.user.id,
            limit: req.query.limit ? parseInt(req.query.limit) : 50,
            offset: req.query.offset ? parseInt(req.query.offset) : 0
        };

        const events = await db.getEvents(filters);
        res.json({ success: true, data: events });
    } catch (err) {
        console.error('Error fetching events:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch events' });
    }
});

/**
 * GET /api/user/events/my-rsvps
 * Get user's upcoming RSVPs
 */
router.get('/events/my-rsvps', requireUserAuth, async (req, res) => {
    try {
        const rsvps = await db.getUserRSVPs(req.user.id);
        res.json({ success: true, data: rsvps });
    } catch (err) {
        console.error('Error fetching RSVPs:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch RSVPs' });
    }
});

/**
 * GET /api/user/events/:id
 * Get event details
 */
router.get('/events/:id', requireUserAuth, async (req, res) => {
    try {
        const event = await db.getEventById(parseInt(req.params.id), req.user.id);
        if (!event) {
            return res.status(404).json({ success: false, error: 'Event not found' });
        }

        const attendees = await db.getEventAttendees(event.id);
        res.json({ success: true, data: { ...event, attendees } });
    } catch (err) {
        console.error('Error fetching event:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch event' });
    }
});

/**
 * POST /api/user/events
 * Create new event
 */
router.post('/events', requireUserAuth, async (req, res) => {
    try {
        const { title, description, location, eventType, startDate, endDate, maxAttendees } = req.body;

        if (!title || !eventType || !startDate) {
            return res.status(400).json({
                success: false,
                error: 'Title, event type, and start date are required'
            });
        }

        const validEventTypes = ['meetup', 'workshop', 'workday', 'webinar'];
        if (!validEventTypes.includes(eventType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid event type'
            });
        }

        const event = await db.createEvent({
            title,
            description,
            location,
            eventType,
            startDate,
            endDate,
            maxAttendees: maxAttendees ? parseInt(maxAttendees) : null
        }, req.user.id);

        res.json({ success: true, data: event });
    } catch (err) {
        console.error('Error creating event:', err);
        res.status(500).json({ success: false, error: 'Failed to create event' });
    }
});

/**
 * PATCH /api/user/events/:id
 * Update event (creator only)
 */
router.patch('/events/:id', requireUserAuth, async (req, res) => {
    try {
        const eventId = parseInt(req.params.id);
        const event = await db.getEventById(eventId);

        if (!event) {
            return res.status(404).json({ success: false, error: 'Event not found' });
        }

        if (event.created_by !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const updated = await db.updateEvent(eventId, req.body);
        res.json({ success: true, data: updated });
    } catch (err) {
        console.error('Error updating event:', err);
        res.status(500).json({ success: false, error: 'Failed to update event' });
    }
});

/**
 * POST /api/user/events/:id/rsvp
 * RSVP to event
 */
router.post('/events/:id/rsvp', requireUserAuth, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['going', 'maybe', 'not_going'];

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid RSVP status'
            });
        }

        const rsvp = await db.rsvpEvent(parseInt(req.params.id), req.user.id, status);
        res.json({ success: true, data: rsvp });
    } catch (err) {
        console.error('Error RSVPing to event:', err);
        res.status(500).json({ success: false, error: 'Failed to RSVP' });
    }
});

/**
 * GET /api/user/events/:id/ical
 * Download iCalendar file
 */
router.get('/events/:id/ical', requireUserAuth, async (req, res) => {
    try {
        const event = await db.getEventById(parseInt(req.params.id));
        if (!event) {
            return res.status(404).json({ success: false, error: 'Event not found' });
        }

        const formatICS = (date) => {
            return new Date(date).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        };

        const ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SLOBODA//Events//RU
BEGIN:VEVENT
UID:event-${event.id}@sloboda.land
DTSTAMP:${formatICS(new Date())}
DTSTART:${formatICS(event.start_date)}
${event.end_date ? `DTEND:${formatICS(event.end_date)}` : ''}
SUMMARY:${event.title}
${event.description ? `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}` : ''}
${event.location ? `LOCATION:${event.location}` : ''}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="event-${event.id}.ics"`);
        res.send(ical);
    } catch (err) {
        console.error('Error generating iCal:', err);
        res.status(500).json({ success: false, error: 'Failed to generate calendar file' });
    }
});

// ============================================
// FUNDRAISING CAMPAIGNS
// ============================================

/**
 * GET /api/user/campaigns
 * List all active campaigns
 */
router.get('/campaigns', requireUserAuth, async (req, res) => {
    try {
        const filters = {
            status: req.query.status || 'active',
            limit: req.query.limit ? parseInt(req.query.limit) : 50,
            offset: req.query.offset ? parseInt(req.query.offset) : 0
        };

        const campaigns = await db.getCampaigns(filters);
        res.json({ success: true, data: campaigns });
    } catch (err) {
        console.error('Error fetching campaigns:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch campaigns' });
    }
});

/**
 * GET /api/user/campaigns/my
 * Get user's campaigns
 */
router.get('/campaigns/my', requireUserAuth, async (req, res) => {
    try {
        const campaigns = await db.getCampaigns({
            userId: req.user.id,
            limit: 50,
            offset: 0
        });
        res.json({ success: true, data: campaigns });
    } catch (err) {
        console.error('Error fetching user campaigns:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch campaigns' });
    }
});

/**
 * GET /api/user/campaigns/:id
 * Get campaign details
 */
router.get('/campaigns/:id', requireUserAuth, async (req, res) => {
    try {
        const campaign = await db.getCampaignById(parseInt(req.params.id));
        if (!campaign) {
            return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        const donations = await db.getCampaignDonations(campaign.id);
        res.json({ success: true, data: { ...campaign, donations } });
    } catch (err) {
        console.error('Error fetching campaign:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch campaign' });
    }
});

/**
 * POST /api/user/campaigns
 * Create campaign
 */
router.post('/campaigns', requireUserAuth, async (req, res) => {
    try {
        const { title, description, goalAmount, endDate } = req.body;

        if (!title || !description || !goalAmount) {
            return res.status(400).json({
                success: false,
                error: 'Title, description, and goal amount are required'
            });
        }

        if (title.length > 100) {
            return res.status(400).json({
                success: false,
                error: 'Title must be 100 characters or less'
            });
        }

        if (description.length > 1000) {
            return res.status(400).json({
                success: false,
                error: 'Description must be 1000 characters or less'
            });
        }

        const amount = parseInt(goalAmount);
        if (isNaN(amount) || amount < 100) {
            return res.status(400).json({
                success: false,
                error: 'Goal amount must be at least 100 rubles'
            });
        }

        const campaign = await db.createCampaign({
            title,
            description,
            goalAmount: amount,
            endDate: endDate || null
        }, req.user.id);

        res.json({ success: true, data: campaign });
    } catch (err) {
        console.error('Error creating campaign:', err);
        res.status(500).json({ success: false, error: 'Failed to create campaign' });
    }
});

/**
 * PATCH /api/user/campaigns/:id
 * Update campaign (creator only)
 */
router.patch('/campaigns/:id', requireUserAuth, async (req, res) => {
    try {
        const campaignId = parseInt(req.params.id);
        const campaign = await db.getCampaignById(campaignId);

        if (!campaign) {
            return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        if (campaign.user_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const updated = await db.updateCampaign(campaignId, req.body);
        res.json({ success: true, data: updated });
    } catch (err) {
        console.error('Error updating campaign:', err);
        res.status(500).json({ success: false, error: 'Failed to update campaign' });
    }
});

/**
 * POST /api/user/campaigns/:id/donate
 * Record donation (placeholder)
 */
router.post('/campaigns/:id/donate', requireUserAuth, async (req, res) => {
    try {
        const { amount, donorName, message, isAnonymous } = req.body;

        if (!amount || isNaN(parseInt(amount)) || parseInt(amount) < 10) {
            return res.status(400).json({
                success: false,
                error: 'Amount must be at least 10 rubles'
            });
        }

        const donation = await db.recordCampaignDonation(parseInt(req.params.id), {
            amount: parseInt(amount),
            donorName: donorName || req.user.name,
            message: message || null,
            isAnonymous: isAnonymous || false
        });

        res.json({ success: true, data: donation });
    } catch (err) {
        console.error('Error recording donation:', err);
        res.status(500).json({ success: false, error: 'Failed to record donation' });
    }
});

module.exports = { router, setDb };
