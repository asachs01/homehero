/**
 * SQLite database connection
 * Creates and exports a reusable database connection using better-sqlite3
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file location - use /data for Home Assistant persistent storage
// Falls back to ./data for local development if /data is not writable
function getDataDir() {
  const haDir = '/data';
  const localDir = path.join(__dirname, '..', '..', 'data');

  // Check if we have a DATA_DIR env var set
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR;
  }

  // Try /data first (Home Assistant add-on environment)
  try {
    if (!fs.existsSync(haDir)) {
      fs.mkdirSync(haDir, { recursive: true });
    }
    // Test write access
    const testFile = path.join(haDir, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return haDir;
  } catch (err) {
    // /data not available or not writable, use local directory
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    return localDir;
  }
}

const DATA_DIR = getDataDir();
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'homehero.db');

// Ensure data directory exists
function ensureDataDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Database: Created data directory at ${dir}`);
  }
}

// Create database connection
let db = null;

function getDb() {
  if (!db) {
    ensureDataDir();
    db = new Database(DB_PATH);
    // Enable foreign keys
    db.pragma('foreign_keys = ON');
    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');
    console.log(`Database: Connected to SQLite at ${DB_PATH}`);
  }
  return db;
}

/**
 * Test database connection
 * @returns {Promise<boolean>} True if connection successful
 */
async function testConnection() {
  try {
    const database = getDb();
    database.prepare('SELECT 1').get();
    console.log('Database: Connection test successful');
    return true;
  } catch (err) {
    console.error('Database: Connection test failed', err.message);
    return false;
  }
}

/**
 * Get database status
 * @returns {Object} Database status information
 */
function getPoolStatus() {
  return {
    type: 'sqlite',
    path: DB_PATH,
    connected: db !== null
  };
}

/**
 * Gracefully close database connection
 * @returns {Promise<void>}
 */
async function close() {
  if (db) {
    db.close();
    db = null;
    console.log('Database: Connection closed');
  }
}

/**
 * Execute a query (for compatibility with PostgreSQL-style code during migration)
 * This wraps better-sqlite3's synchronous API in an async-compatible interface
 * @param {string} sql - SQL query with ? placeholders
 * @param {Array} params - Query parameters
 * @returns {Object} Result object with rows property
 */
function query(sql, params = []) {
  const database = getDb();

  // Determine query type
  const trimmedSql = sql.trim().toUpperCase();
  const isSelect = trimmedSql.startsWith('SELECT');
  const isInsert = trimmedSql.startsWith('INSERT');
  const isUpdate = trimmedSql.startsWith('UPDATE');
  const isDelete = trimmedSql.startsWith('DELETE');

  try {
    const stmt = database.prepare(sql);

    if (isSelect) {
      const rows = stmt.all(...params);
      return { rows };
    } else if (isInsert || isUpdate || isDelete) {
      const info = stmt.run(...params);
      return {
        rows: [],
        rowCount: info.changes,
        lastInsertRowid: info.lastInsertRowid
      };
    } else {
      // For other statements (CREATE, etc.)
      stmt.run(...params);
      return { rows: [] };
    }
  } catch (err) {
    console.error('Database query error:', err.message);
    console.error('SQL:', sql);
    console.error('Params:', params);
    throw err;
  }
}

module.exports = {
  getDb,
  query,
  testConnection,
  getPoolStatus,
  close
};
