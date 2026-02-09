// Run forum system migration
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const db = require('../db');

async function runMigration() {
  try {
    console.log('Initializing database connection...');
    await db.initDatabase();

    console.log('Reading migration file...');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../migrations/add-forum-system.sql'),
      'utf8'
    );

    console.log('Running migration...');
    await db.pool.query(migrationSQL);

    console.log('✓ Forum system migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
