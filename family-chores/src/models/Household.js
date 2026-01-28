/**
 * Household model for database operations
 */

const { query } = require('../db/pool');

class Household {
  /**
   * Create a new household
   * @param {string} name - The household name
   * @returns {Promise<Object>} The created household
   */
  static async create(name) {
    const result = await query(
      'INSERT INTO households (name) VALUES ($1) RETURNING *',
      [name]
    );

    return Household.formatHousehold(result.rows[0]);
  }

  /**
   * Find a household by ID
   * @param {string} id - The household UUID
   * @returns {Promise<Object|null>} The household or null if not found
   */
  static async findById(id) {
    const result = await query(
      'SELECT * FROM households WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return Household.formatHousehold(result.rows[0]);
  }

  /**
   * Find the first household (for single-household setups)
   * @returns {Promise<Object|null>} The household or null if none exist
   */
  static async findFirst() {
    const result = await query(
      'SELECT * FROM households ORDER BY created_at ASC LIMIT 1'
    );

    if (result.rows.length === 0) {
      return null;
    }

    return Household.formatHousehold(result.rows[0]);
  }

  /**
   * Update a household
   * @param {string} id - The household UUID
   * @param {Object} data - Fields to update { name, vacationMode }
   * @returns {Promise<Object|null>} The updated household or null if not found
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

    if (data.vacationMode !== undefined) {
      updates.push(`vacation_mode = $${paramIndex}`);
      params.push(data.vacationMode);
      paramIndex++;
    }

    if (updates.length === 0) {
      return Household.findById(id);
    }

    params.push(id);
    const result = await query(
      `UPDATE households SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return null;
    }

    return Household.formatHousehold(result.rows[0]);
  }

  /**
   * Check if onboarding is complete for a household
   * Requires at least one admin (parent) and at least one user total
   * @param {string} id - The household UUID
   * @returns {Promise<Object>} { complete: boolean, hasAdmin: boolean, userCount: number }
   */
  static async isOnboardingComplete(id) {
    // Check if household exists
    const household = await Household.findById(id);
    if (!household) {
      return { complete: false, hasAdmin: false, userCount: 0, error: 'Household not found' };
    }

    // Count users by role
    const result = await query(
      `SELECT role, COUNT(*) as count FROM users WHERE household_id = $1 GROUP BY role`,
      [id]
    );

    let parentCount = 0;
    let childCount = 0;

    for (const row of result.rows) {
      if (row.role === 'parent') {
        parentCount = parseInt(row.count, 10);
      } else if (row.role === 'child') {
        childCount = parseInt(row.count, 10);
      }
    }

    const totalUsers = parentCount + childCount;
    const hasAdmin = parentCount > 0;
    // Onboarding is complete if there's at least one admin (parent) and at least one user total
    const complete = hasAdmin && totalUsers >= 1;

    return {
      complete,
      hasAdmin,
      userCount: totalUsers,
      parentCount,
      childCount
    };
  }

  /**
   * Format a database row to a household object
   * @param {Object} row - Database row
   * @returns {Object} Formatted household object
   */
  static formatHousehold(row) {
    return {
      id: row.id,
      name: row.name,
      vacationMode: row.vacation_mode,
      createdAt: row.created_at
    };
  }
}

module.exports = Household;
