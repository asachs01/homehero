/**
 * User model for database operations
 */

const crypto = require('crypto');
const { getDb } = require('../db/pool');
const { hashPin } = require('../utils/pin');

class User {
  /**
   * Create a new user
   * @param {string} householdId - The household UUID
   * @param {Object} data - User data { name, role, pin, avatar }
   * @returns {Promise<Object>} The created user (without pin_hash)
   */
  static async create(householdId, data) {
    const { name, role, pin, avatar = null } = data;

    // Hash PIN if provided
    const pinHash = pin ? await hashPin(pin) : null;

    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO users (id, household_id, name, role, pin_hash, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, householdId, name, role, pinHash, avatar, now);

    const row = db.prepare(
      'SELECT id, household_id, name, role, avatar, created_at FROM users WHERE id = ?'
    ).get(id);

    return User.formatUser(row);
  }

  /**
   * Find a user by ID
   * @param {string} id - The user UUID
   * @returns {Object|null} The user or null if not found
   */
  static findById(id) {
    const db = getDb();
    const row = db.prepare(
      'SELECT id, household_id, name, role, avatar, created_at FROM users WHERE id = ?'
    ).get(id);

    if (!row) {
      return null;
    }

    return User.formatUser(row);
  }

  /**
   * Find all users in a household
   * @param {string} householdId - The household UUID
   * @returns {Object[]} Array of users
   */
  static findByHousehold(householdId) {
    const db = getDb();
    const rows = db.prepare(
      'SELECT id, household_id, name, role, avatar, created_at FROM users WHERE household_id = ? ORDER BY created_at ASC'
    ).all(householdId);

    return rows.map(row => User.formatUser(row));
  }

  /**
   * Update a user
   * @param {string} id - The user UUID
   * @param {Object} data - Fields to update { name, role, pin, avatar }
   * @returns {Promise<Object|null>} The updated user or null if not found
   */
  static async update(id, data) {
    const db = getDb();
    const updates = [];
    const params = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }

    if (data.role !== undefined) {
      updates.push('role = ?');
      params.push(data.role);
    }

    if (data.avatar !== undefined) {
      updates.push('avatar = ?');
      params.push(data.avatar);
    }

    if (data.pin !== undefined) {
      const pinHash = data.pin ? await hashPin(data.pin) : null;
      updates.push('pin_hash = ?');
      params.push(pinHash);
    }

    if (updates.length === 0) {
      return User.findById(id);
    }

    params.push(id);
    const info = db.prepare(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
    ).run(...params);

    if (info.changes === 0) {
      return null;
    }

    return User.findById(id);
  }

  /**
   * Delete a user
   * @param {string} id - The user UUID
   * @returns {boolean} True if deleted, false if not found
   */
  static delete(id) {
    const db = getDb();
    const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return info.changes > 0;
  }

  /**
   * Format a database row to a user object
   * @param {Object} row - Database row
   * @returns {Object} Formatted user object
   */
  static formatUser(row) {
    return {
      id: row.id,
      householdId: row.household_id,
      name: row.name,
      role: row.role,
      avatar: row.avatar,
      createdAt: row.created_at
    };
  }
}

module.exports = User;
