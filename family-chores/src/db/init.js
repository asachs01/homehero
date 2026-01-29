/**
 * Database initialization
 * Runs schema and creates default data on first startup
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb, testConnection } = require('./pool');

/**
 * Check if database tables exist
 * @returns {boolean}
 */
function tablesExist() {
  try {
    const db = getDb();
    const result = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='households'
    `).get();
    return !!result;
  } catch (err) {
    console.error('Database: Error checking tables', err.message);
    return false;
  }
}

/**
 * Run schema SQL file
 * Uses exec() to run the entire schema file at once
 * This properly handles multiple statements and comments
 */
function runSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  try {
    const db = getDb();

    // Use exec to run the entire schema
    // This handles multiple statements and comments properly
    db.exec(schema);

    console.log('Database: Schema applied successfully');
  } catch (err) {
    console.error('Database: Error applying schema', err.message);
    throw err;
  }
}

/**
 * Create default household if none exists
 * @returns {Object|null} The created household or null
 */
function createDefaultHousehold() {
  try {
    const db = getDb();

    const existing = db.prepare('SELECT id FROM households LIMIT 1').get();

    if (existing) {
      console.log('Database: Household already exists');
      return null;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO households (id, name, created_at) VALUES (?, ?, ?)'
    ).run(id, 'My Household', now);

    const household = db.prepare('SELECT * FROM households WHERE id = ?').get(id);

    console.log('Database: Default household created');
    return household;
  } catch (err) {
    console.error('Database: Error creating default household', err.message);
    throw err;
  }
}

/**
 * Initialize database
 * Tests connection, runs schema if needed, creates default data
 * @returns {Promise<boolean>} True if initialization successful
 */
async function initialize() {
  console.log('Database: Starting initialization...');

  // Test connection
  const connected = await testConnection();
  if (!connected) {
    console.error('Database: Cannot connect to SQLite');
    return false;
  }

  // Check if tables exist
  const exists = tablesExist();

  if (!exists) {
    console.log('Database: Tables not found, running schema...');
    runSchema();
    createDefaultHousehold();
  } else {
    console.log('Database: Tables already exist');
  }

  console.log('Database: Initialization complete');
  return true;
}

module.exports = {
  initialize,
  tablesExist,
  runSchema,
  createDefaultHousehold
};
