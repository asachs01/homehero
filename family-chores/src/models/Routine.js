/**
 * Routine model for database operations
 */

const crypto = require('crypto');
const { getDb } = require('../db/pool');

class Routine {
  /**
   * Create a new routine
   * @param {string} householdId - The household UUID
   * @param {Object} data - Routine data
   * @returns {Object} The created routine
   */
  static create(householdId, data) {
    const { name, assignedUserId, tasks = [] } = data;

    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO routines (id, household_id, name, assigned_user_id, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, householdId, name, assignedUserId, now);

    const row = db.prepare('SELECT * FROM routines WHERE id = ?').get(id);
    const routine = Routine.formatRoutine(row);

    // Add tasks if provided
    if (tasks.length > 0) {
      for (const task of tasks) {
        Routine.addTask(routine.id, task.taskId, task.position);
      }
      routine.tasks = Routine.getRoutineTasks(routine.id);
    } else {
      routine.tasks = [];
    }

    return routine;
  }

  /**
   * Find all routines for a household with optional user filter
   * @param {string} householdId - The household UUID
   * @param {string} userId - Optional user UUID filter
   * @returns {Object[]} Array of routines
   */
  static findAll(householdId, userId = null) {
    const db = getDb();
    let sql = `
      SELECT r.*
      FROM routines r
      WHERE r.household_id = ?
    `;
    const params = [householdId];

    if (userId) {
      sql += ' AND r.assigned_user_id = ?';
      params.push(userId);
    }

    sql += ' ORDER BY r.created_at DESC';

    const rows = db.prepare(sql).all(...params);

    // Fetch tasks for each routine
    const routines = rows.map(row => {
      const routine = Routine.formatRoutine(row);
      routine.tasks = Routine.getRoutineTasks(routine.id);
      return routine;
    });

    return routines;
  }

  /**
   * Find a routine by ID
   * @param {string} id - The routine UUID
   * @returns {Object|null} The routine or null if not found
   */
  static findById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM routines WHERE id = ?').get(id);

    if (!row) {
      return null;
    }

    const routine = Routine.formatRoutine(row);
    routine.tasks = Routine.getRoutineTasks(routine.id);
    return routine;
  }

  /**
   * Update a routine
   * @param {string} id - The routine UUID
   * @param {Object} data - Fields to update
   * @returns {Object|null} The updated routine or null if not found
   */
  static update(id, data) {
    const db = getDb();
    const updates = [];
    const params = [];

    const fieldMap = {
      name: 'name',
      assignedUserId: 'assigned_user_id'
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key] !== undefined) {
        updates.push(`${column} = ?`);
        params.push(data[key]);
      }
    }

    if (updates.length === 0) {
      return Routine.findById(id);
    }

    params.push(id);
    const info = db.prepare(
      `UPDATE routines SET ${updates.join(', ')} WHERE id = ?`
    ).run(...params);

    if (info.changes === 0) {
      return null;
    }

    return Routine.findById(id);
  }

  /**
   * Delete a routine
   * @param {string} id - The routine UUID
   * @returns {boolean} True if deleted, false if not found
   */
  static delete(id) {
    const db = getDb();
    const info = db.prepare('DELETE FROM routines WHERE id = ?').run(id);
    return info.changes > 0;
  }

  /**
   * Add a task to a routine
   * @param {string} routineId - The routine UUID
   * @param {string} taskId - The task UUID
   * @param {number} position - The position in the routine
   */
  static addTask(routineId, taskId, position) {
    const db = getDb();

    // If position not provided, add at the end
    if (position === undefined || position === null) {
      const row = db.prepare(
        'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM routine_tasks WHERE routine_id = ?'
      ).get(routineId);
      position = row.next_position;
    }

    // SQLite doesn't have ON CONFLICT DO UPDATE with same syntax, use INSERT OR REPLACE
    db.prepare(
      'INSERT OR REPLACE INTO routine_tasks (routine_id, task_id, position) VALUES (?, ?, ?)'
    ).run(routineId, taskId, position);
  }

  /**
   * Remove a task from a routine
   * @param {string} routineId - The routine UUID
   * @param {string} taskId - The task UUID
   * @returns {boolean} True if removed, false if not found
   */
  static removeTask(routineId, taskId) {
    const db = getDb();
    const info = db.prepare(
      'DELETE FROM routine_tasks WHERE routine_id = ? AND task_id = ?'
    ).run(routineId, taskId);
    return info.changes > 0;
  }

  /**
   * Reorder tasks in a routine
   * @param {string} routineId - The routine UUID
   * @param {string[]} taskOrder - Array of task UUIDs in desired order
   */
  static reorderTasks(routineId, taskOrder) {
    const db = getDb();
    const updateStmt = db.prepare(
      'UPDATE routine_tasks SET position = ? WHERE routine_id = ? AND task_id = ?'
    );

    for (let i = 0; i < taskOrder.length; i++) {
      updateStmt.run(i, routineId, taskOrder[i]);
    }
  }

  /**
   * Get all tasks for a routine in order
   * @param {string} routineId - The routine UUID
   * @returns {Object[]} Array of tasks with position
   */
  static getRoutineTasks(routineId) {
    const db = getDb();
    const rows = db.prepare(
      `SELECT t.*, rt.position
       FROM tasks t
       JOIN routine_tasks rt ON t.id = rt.task_id
       WHERE rt.routine_id = ?
       ORDER BY rt.position ASC`
    ).all(routineId);

    return rows.map(row => {
      let schedule = row.schedule;
      let timeWindow = row.time_window;

      // Parse JSON if stored as string
      if (typeof schedule === 'string') {
        try {
          schedule = JSON.parse(schedule);
        } catch (e) {
          schedule = [];
        }
      }
      if (typeof timeWindow === 'string') {
        try {
          timeWindow = JSON.parse(timeWindow);
        } catch (e) {
          timeWindow = null;
        }
      }

      return {
        id: row.id,
        householdId: row.household_id,
        name: row.name,
        description: row.description,
        icon: row.icon,
        type: row.type,
        dollarValue: parseFloat(row.dollar_value) || 0,
        schedule: schedule || [],
        timeWindow: timeWindow,
        position: row.position,
        createdAt: row.created_at
      };
    });
  }

  /**
   * Get the household ID for a routine
   * @param {string} routineId - The routine UUID
   * @returns {string|null} The household UUID or null
   */
  static getHouseholdId(routineId) {
    const db = getDb();
    const row = db.prepare('SELECT household_id FROM routines WHERE id = ?').get(routineId);
    return row ? row.household_id : null;
  }

  /**
   * Check if a task exists in a routine
   * @param {string} routineId - The routine UUID
   * @param {string} taskId - The task UUID
   * @returns {boolean} True if task exists in routine
   */
  static hasTask(routineId, taskId) {
    const db = getDb();
    const row = db.prepare(
      'SELECT 1 FROM routine_tasks WHERE routine_id = ? AND task_id = ?'
    ).get(routineId, taskId);
    return !!row;
  }

  /**
   * Format a database row to a routine object
   * @param {Object} row - Database row
   * @returns {Object} Formatted routine object
   */
  static formatRoutine(row) {
    return {
      id: row.id,
      householdId: row.household_id,
      name: row.name,
      assignedUserId: row.assigned_user_id,
      createdAt: row.created_at
    };
  }
}

module.exports = Routine;
