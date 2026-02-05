const { Pool } = require('pg');

// Railway provides DATABASE_URL in production
const connectionString = process.env.DATABASE_URL ||
    'postgresql://postgres:DrFOfHnEjyxSZylZrXGjdKPRClrKvhci@yamanote.proxy.rlwy.net:22556/railway';

const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database table
async function initDatabase() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS registrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                telegram VARCHAR(255),
                location VARCHAR(255),
                motivation VARCHAR(50),
                participation VARCHAR(50),
                skills TEXT[],
                budget VARCHAR(50),
                timeline VARCHAR(50),
                about TEXT,
                newsletter BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Database table initialized');
    } catch (err) {
        console.error('Error initializing database:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Save registration
async function saveRegistration(data) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO registrations
                (name, email, telegram, location, motivation, participation, skills, budget, timeline, about, newsletter)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id`,
            [
                data.name,
                data.email,
                data.telegram || null,
                data.location || null,
                data.motivation || null,
                data.participation || null,
                data.skills || [],
                data.budget || null,
                data.timeline || null,
                data.about || null,
                data.newsletter !== false
            ]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

// Get all registrations (for admin)
async function getRegistrations() {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM registrations ORDER BY created_at DESC'
        );
        return result.rows;
    } finally {
        client.release();
    }
}

module.exports = { pool, initDatabase, saveRegistration, getRegistrations };
