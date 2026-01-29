/**
 * Household model for database operations
 */

const crypto = require('crypto');
const { getDb } = require('../db/pool');

class Household {
  /**
   * Create a new household
   * @param {string} name - The household name
   * @returns {Object} The created household
   */
  static create(name) {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO households (id, name, created_at) VALUES (?, ?, ?)'
    ).run(id, name, now);

    const row = db.prepare('SELECT * FROM households WHERE id = ?').get(id);
    return Household.formatHousehold(row);
  }

  /**
   * Find a household by ID
   * @param {string} id - The household UUID
   * @returns {Object|null} The household or null if not found
   */
  static findById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM households WHERE id = ?').get(id);

    if (!row) {
      return null;
    }

    return Household.formatHousehold(row);
  }

  /**
   * Find the first household (for single-household setups)
   * @returns {Object|null} The household or null if none exist
   */
  static findFirst() {
    const db = getDb();
    const row = db.prepare('SELECT * FROM households ORDER BY created_at ASC LIMIT 1').get();

    if (!row) {
      return null;
    }

    return Household.formatHousehold(row);
  }

  /**
   * Update a household
   * @param {string} id - The household UUID
   * @param {Object} data - Fields to update { name, vacationMode }
   * @returns {Object|null} The updated household or null if not found
   */
  static update(id, data) {
    const db = getDb();
    const updates = [];
    const params = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }

    if (data.vacationMode !== undefined) {
      updates.push('vacation_mode = ?');
      params.push(data.vacationMode ? 1 : 0);
    }

    if (updates.length === 0) {
      return Household.findById(id);
    }

    params.push(id);
    db.prepare(
      `UPDATE households SET ${updates.join(', ')} WHERE id = ?`
    ).run(...params);

    return Household.findById(id);
  }

  /**
   * Check if onboarding is complete for a household
   * Requires at least one admin (parent) and at least one user total
   * @param {string} id - The household UUID
   * @returns {Object} { complete: boolean, hasAdmin: boolean, userCount: number }
   */
  static isOnboardingComplete(id) {
    // Check if household exists
    const household = Household.findById(id);
    if (!household) {
      return { complete: false, hasAdmin: false, userCount: 0, error: 'Household not found' };
    }

    const db = getDb();
    // Count users by role
    const rows = db.prepare(
      'SELECT role, COUNT(*) as count FROM users WHERE household_id = ? GROUP BY role'
    ).all(id);

    let parentCount = 0;
    let childCount = 0;

    for (const row of rows) {
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
      vacationMode: row.vacation_mode === 1,
      createdAt: row.created_at
    };
  }
}

module.exports = Household;
