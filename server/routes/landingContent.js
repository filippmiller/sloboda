/**
 * Landing Page Content Management Routes
 * Admin-only endpoints for editing landing page content
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');

let db = null;

function setDb(database) {
    db = database;
}

// ============================================
// PUBLIC ROUTES (no auth required)
// ============================================

// Get all landing page content (public)
router.get('/public/landing-content', async (req, res) => {
    try {
        const sections = await db.getLandingPageContent();

        // Transform array to object for easier frontend consumption
        const content = {};
        sections.forEach(section => {
            content[section.section] = section.content;
        });

        res.json(content);
    } catch (error) {
        console.error('Error fetching landing content:', error);
        res.status(500).json({ error: 'Failed to fetch landing content' });
    }
});

// Get specific section (public)
router.get('/public/landing-content/:section', async (req, res) => {
    try {
        const { section } = req.params;
        const result = await db.getLandingPageContent(section);

        if (!result) {
            return res.status(404).json({ error: 'Section not found' });
        }

        res.json(result);
    } catch (error) {
        console.error('Error fetching section:', error);
        res.status(500).json({ error: 'Failed to fetch section' });
    }
});

// ============================================
// ADMIN ROUTES (require authentication)
// ============================================

// Get all sections with metadata (admin)
router.get('/admin/landing-content', requireAuth, async (req, res) => {
    try {
        const sections = await db.getAllLandingPageSections();
        res.json(sections);
    } catch (error) {
        console.error('Error fetching admin landing content:', error);
        res.status(500).json({ error: 'Failed to fetch landing content' });
    }
});

// Update section content (admin only)
router.patch('/admin/landing-content/:section', requireAuth, async (req, res) => {
    try {
        const { section } = req.params;
        const { content } = req.body;
        const adminId = req.user.userId;

        if (!content) {
            return res.status(400).json({ error: 'Content is required' });
        }

        const updated = await db.updateLandingPageContent(section, content, adminId);

        if (!updated) {
            return res.status(404).json({ error: 'Section not found' });
        }

        res.json({
            message: 'Section updated successfully',
            section: updated
        });
    } catch (error) {
        console.error('Error updating section:', error);
        res.status(500).json({ error: 'Failed to update section' });
    }
});

module.exports = { router, setDb };
