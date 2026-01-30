/**
 * Database initialization
 * Runs schema and creates default data on first startup
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb, testConnection } = require('./pool');

/**
 * Check if a column exists in a table
 * @param {string} table - Table name
 * @param {string} column - Column name
 * @returns {boolean}
 */
function columnExists(table, column) {
  const db = getDb();
  const result = db.prepare(`PRAGMA table_info(${table})`).all();
  return result.some(col => col.name === column);
}

/**
 * Run migrations for schema changes
 * Handles v1.1.0 -> v1.2.0 task schema migration
 */
function runMigrations() {
  const db = getDb();

  // Migration: Add value_cents and category to tasks if missing (v1.2.0)
  if (!columnExists('tasks', 'value_cents')) {
    console.log('Database: Migrating tasks table - adding value_cents column');
    db.prepare('ALTER TABLE tasks ADD COLUMN value_cents INTEGER DEFAULT 0').run();

    // Migrate dollar_value to value_cents if old column exists
    if (columnExists('tasks', 'dollar_value')) {
      console.log('Database: Migrating dollar_value to value_cents');
      db.prepare('UPDATE tasks SET value_cents = CAST(dollar_value * 100 AS INTEGER) WHERE dollar_value IS NOT NULL').run();
    }
  }

  if (!columnExists('tasks', 'category')) {
    console.log('Database: Migrating tasks table - adding category column');
    db.prepare('ALTER TABLE tasks ADD COLUMN category TEXT').run();

    // Migrate type to category if old column exists
    if (columnExists('tasks', 'type')) {
      console.log('Database: Migrating type to category');
      db.prepare("UPDATE tasks SET category = type WHERE type IS NOT NULL").run();
    }
  }

  // Migration: Add schedule columns to routines if missing (v1.2.0)
  if (!columnExists('routines', 'schedule_type')) {
    console.log('Database: Migrating routines table - adding schedule_type column');
    db.prepare("ALTER TABLE routines ADD COLUMN schedule_type TEXT DEFAULT 'daily'").run();
    db.prepare("UPDATE routines SET schedule_type = 'daily' WHERE schedule_type IS NULL").run();
  }

  if (!columnExists('routines', 'schedule_days')) {
    console.log('Database: Migrating routines table - adding schedule_days column');
    db.prepare('ALTER TABLE routines ADD COLUMN schedule_days TEXT').run();
  }

  console.log('Database: Migrations complete');
}

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
    // Don't create a default household - let onboarding handle it
    // This prevents orphan households that confuse the onboarding status check
  } else {
    console.log('Database: Tables already exist');
    // Run migrations for schema changes (v1.1.0 -> v1.2.0, etc.)
    runMigrations();
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
