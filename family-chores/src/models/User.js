/**
 * User model for database operations
 */

const { query } = require('../db/pool');
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

    const result = await query(
      `INSERT INTO users (household_id, name, role, pin_hash, avatar)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, household_id, name, role, avatar, created_at`,
      [householdId, name, role, pinHash, avatar]
    );

    return User.formatUser(result.rows[0]);
  }

  /**
   * Find a user by ID
   * @param {string} id - The user UUID
   * @returns {Promise<Object|null>} The user or null if not found
   */
  static async findById(id) {
    const result = await query(
      'SELECT id, household_id, name, role, avatar, created_at FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return User.formatUser(result.rows[0]);
  }

  /**
   * Find all users in a household
   * @param {string} householdId - The household UUID
   * @returns {Promise<Object[]>} Array of users
   */
  static async findByHousehold(householdId) {
    const result = await query(
      'SELECT id, household_id, name, role, avatar, created_at FROM users WHERE household_id = $1 ORDER BY created_at ASC',
      [householdId]
    );

    return result.rows.map(row => User.formatUser(row));
  }

  /**
   * Update a user
   * @param {string} id - The user UUID
   * @param {Object} data - Fields to update { name, role, pin, avatar }
   * @returns {Promise<Object|null>} The updated user or null if not found
   */
  static async update(id, data) {
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(data.name);
      paramIndex++;
    }

    if (data.role !== undefined) {
      updates.push(`role = $${paramIndex}`);
      params.push(data.role);
      paramIndex++;
    }

    if (data.avatar !== undefined) {
      updates.push(`avatar = $${paramIndex}`);
      params.push(data.avatar);
      paramIndex++;
    }

    if (data.pin !== undefined) {
      const pinHash = data.pin ? await hashPin(data.pin) : null;
      updates.push(`pin_hash = $${paramIndex}`);
      params.push(pinHash);
      paramIndex++;
    }

    if (updates.length === 0) {
      return User.findById(id);
    }

    params.push(id);
    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, household_id, name, role, avatar, created_at`,
      params
    );

    if (result.rows.length === 0) {
      return null;
    }

    return User.formatUser(result.rows[0]);
  }

  /**
   * Delete a user
   * @param {string} id - The user UUID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  static async delete(id) {
    const result = await query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [id]
    );

    return result.rows.length > 0;
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
