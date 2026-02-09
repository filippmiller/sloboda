// Auto-run migrations on server startup if MIGRATE_ON_START=true
const path = require('path');
const fs = require('fs');
const db = require('../db');

async function checkAndRunMigrations() {
  if (process.env.MIGRATE_ON_START !== 'true') {
    console.log('Skipping auto-migration (MIGRATE_ON_START not set)');
    return;
  }

  try {
    console.log('Checking if forum tables exist...');

    // Check if forum_threads table exists
    const checkQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'forum_threads'
      );
    `;

    const result = await db.pool.query(checkQuery);
    const tablesExist = result.rows[0].exists;

    if (tablesExist) {
      console.log('✓ Forum tables already exist, skipping migration');
      return;
    }

    console.log('Forum tables not found, running migration...');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../migrations/add-forum-system.sql'),
      'utf8'
    );

    await db.pool.query(migrationSQL);
    console.log('✓ Forum migration completed successfully!');
  } catch (error) {
    console.error('✗ Migration check/run failed:', error.message);
    // Don't exit - let the server start anyway
  }
}

module.exports = { checkAndRunMigrations };
