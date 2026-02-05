// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDatabase, saveRegistration, getRegistrations, getRegistrationCount } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
            fontSrc: ["'self'", "fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'"],
        }
    },
    crossOriginEmbedderPolicy: false
}));

// Rate limiting for registration endpoint
const registrationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 registrations per IP per window
    message: {
        success: false,
        error: 'Too many registration attempts. Please try again in 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from src directory
app.use(express.static(path.join(__dirname, '../src')));

// API: Submit registration (rate limited)
app.post('/api/register', registrationLimiter, async (req, res) => {
    try {
        const data = req.body;

        // Basic validation
        if (!data.name || !data.email) {
            return res.status(400).json({
                success: false,
                error: 'Name and email are required'
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        // Save to database
        const result = await saveRegistration(data);

        console.log(`New registration: ${data.name} (${data.email}) - ID: ${result.id}`);

        res.json({
            success: true,
            message: 'Registration saved successfully',
            id: result.id
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to save registration'
        });
    }
});

// API: Get registrations (basic admin endpoint)
app.get('/api/registrations', async (req, res) => {
    try {
        // Simple auth check - require admin key in header
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== process.env.ADMIN_KEY && process.env.ADMIN_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const registrations = await getRegistrations();
        res.json({ success: true, data: registrations });
    } catch (err) {
        console.error('Error fetching registrations:', err);
        res.status(500).json({ error: 'Failed to fetch registrations' });
    }
});

// API: Get registration statistics (public)
app.get('/api/stats', async (req, res) => {
    try {
        const count = await getRegistrationCount();
        res.json({
            success: true,
            count: count,
            // Only show count if above threshold for social proof
            displayCount: count >= 10 ? count : null
        });
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../src/index.html'));
});

// Start server
async function start() {
    try {
        // Initialize database
        await initDatabase();

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Static files served from: ${path.join(__dirname, '../src')}`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

start();
