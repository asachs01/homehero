/**
 * Task model for database operations
 */

const crypto = require('crypto');
const { getDb } = require('../db/pool');

class Task {
  /**
   * Create a new task
   * @param {string} householdId - The household UUID
   * @param {Object} data - Task data
   * @returns {Object} The created task
   */
  static create(householdId, data) {
    const {
      name,
      description = null,
      icon = null,
      valueCents = 0,
      category = null,
      assignedUsers = []
    } = data;

    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO tasks (id, household_id, name, description, icon, value_cents, category, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, householdId, name, description, icon, valueCents, category, now);

    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    const task = Task.formatTask(row);

    // Assign users if provided
    if (assignedUsers.length > 0) {
      Task.assignUsers(task.id, assignedUsers);
      task.assignedUsers = assignedUsers;
    } else {
      task.assignedUsers = [];
    }

    return task;
  }

  /**
   * Find all tasks for a household with optional filters
   * @param {string} householdId - The household UUID
   * @param {Object} filters - Optional filters { category, userId }
   * @returns {Object[]} Array of tasks
   */
  static findAll(householdId, filters = {}) {
    const db = getDb();
    let sql = `
      SELECT DISTINCT t.*
      FROM tasks t
      LEFT JOIN task_assignments ta ON t.id = ta.task_id
      WHERE t.household_id = ?
    `;
    const params = [householdId];

    if (filters.category) {
      sql += ' AND t.category = ?';
      params.push(filters.category);
    }

    if (filters.userId) {
      sql += ' AND ta.user_id = ?';
      params.push(filters.userId);
    }

    sql += ' ORDER BY t.created_at DESC';

    const rows = db.prepare(sql).all(...params);

    // Fetch assigned users for each task
    const tasks = rows.map(row => {
      const task = Task.formatTask(row);
      task.assignedUsers = Task.getAssignedUsers(task.id);
      return task;
    });

    return tasks;
  }

  /**
   * Find a task by ID
   * @param {string} id - The task UUID
   * @returns {Object|null} The task or null if not found
   */
  static findById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

    if (!row) {
      return null;
    }

    const task = Task.formatTask(row);
    task.assignedUsers = Task.getAssignedUsers(task.id);
    return task;
  }

  /**
   * Update a task
   * @param {string} id - The task UUID
   * @param {Object} data - Fields to update
   * @returns {Object|null} The updated task or null if not found
   */
  static update(id, data) {
    const db = getDb();
    // Build dynamic update query
    const updates = [];
    const params = [];

    const fieldMap = {
      name: 'name',
      description: 'description',
      icon: 'icon',
      valueCents: 'value_cents',
      category: 'category'
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key] !== undefined) {
        updates.push(`${column} = ?`);
        params.push(data[key]);
      }
    }

    if (updates.length === 0 && !data.assignedUsers) {
      // Nothing to update
      return Task.findById(id);
    }

    let task = null;

    if (updates.length > 0) {
      params.push(id);
      const info = db.prepare(
        `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`
      ).run(...params);

      if (info.changes === 0) {
        return null;
      }

      task = Task.findById(id);
    } else {
      task = Task.findById(id);
      if (!task) return null;
    }

    // Update assigned users if provided
    if (data.assignedUsers !== undefined) {
      Task.assignUsers(id, data.assignedUsers);
      task.assignedUsers = data.assignedUsers;
    } else {
      task.assignedUsers = Task.getAssignedUsers(id);
    }

    return task;
  }

  /**
   * Delete a task
   * @param {string} id - The task UUID
   * @returns {boolean} True if deleted, false if not found
   */
  static delete(id) {
    const db = getDb();
    const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return info.changes > 0;
  }

  /**
   * Assign users to a task (replaces existing assignments)
   * @param {string} taskId - The task UUID
   * @param {string[]} userIds - Array of user UUIDs
   */
  static assignUsers(taskId, userIds) {
    const db = getDb();

    // Remove existing assignments
    db.prepare('DELETE FROM task_assignments WHERE task_id = ?').run(taskId);

    // Add new assignments
    if (userIds.length > 0) {
      const insertStmt = db.prepare(
        'INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)'
      );
      for (const userId of userIds) {
        insertStmt.run(taskId, userId);
      }
    }
  }

  /**
   * Get all users assigned to a task
   * @param {string} taskId - The task UUID
   * @returns {string[]} Array of user UUIDs
   */
  static getAssignedUsers(taskId) {
    const db = getDb();
    const rows = db.prepare(
      'SELECT user_id FROM task_assignments WHERE task_id = ?'
    ).all(taskId);

    return rows.map(row => row.user_id);
  }

  /**
   * Get tasks assigned to a user
   * @param {string} userId - The user UUID
   * @returns {Object[]} Array of tasks assigned to the user
   */
  static getTasksForUser(userId) {
    const db = getDb();
    const rows = db.prepare(
      `SELECT t.*
       FROM tasks t
       JOIN task_assignments ta ON t.id = ta.task_id
       WHERE ta.user_id = ?
       ORDER BY t.created_at DESC`
    ).all(userId);

    const tasks = rows.map(row => Task.formatTask(row));

    // Fetch assigned users for each task
    for (const task of tasks) {
      task.assignedUsers = Task.getAssignedUsers(task.id);
    }

    return tasks;
  }

  /**
   * Get the household ID for a task
   * @param {string} taskId - The task UUID
   * @returns {string|null} The household UUID or null
   */
  static getHouseholdId(taskId) {
    const db = getDb();
    const row = db.prepare('SELECT household_id FROM tasks WHERE id = ?').get(taskId);
    return row ? row.household_id : null;
  }

  /**
   * Format a database row to a task object
   * @param {Object} row - Database row
   * @returns {Object} Formatted task object
   */
  static formatTask(row) {
    return {
      id: row.id,
      householdId: row.household_id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      valueCents: row.value_cents || 0,
      category: row.category,
      createdAt: row.created_at
    };
  }
}

module.exports = Task;
