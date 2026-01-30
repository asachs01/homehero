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
    const { name, scheduleType, scheduleDays = null, assignedUserId = null, tasks = [] } = data;

    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Store scheduleDays as JSON string if it's an array
    const scheduleDaysJson = scheduleDays ? JSON.stringify(scheduleDays) : null;

    db.prepare(
      'INSERT INTO routines (id, household_id, name, schedule_type, schedule_days, assigned_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, householdId, name, scheduleType, scheduleDaysJson, assignedUserId, now);

    const row = db.prepare('SELECT * FROM routines WHERE id = ?').get(id);
    const routine = Routine.formatRoutine(row);

    // Add tasks if provided
    if (tasks.length > 0) {
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        Routine.addTask(routine.id, task.taskId, task.sortOrder !== undefined ? task.sortOrder : i);
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
      scheduleType: 'schedule_type',
      assignedUserId: 'assigned_user_id'
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key] !== undefined) {
        updates.push(`${column} = ?`);
        params.push(data[key]);
      }
    }

    // Handle scheduleDays separately (needs JSON stringify)
    if (data.scheduleDays !== undefined) {
      updates.push('schedule_days = ?');
      params.push(data.scheduleDays ? JSON.stringify(data.scheduleDays) : null);
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
   * @param {number} sortOrder - The sort order in the routine
   */
  static addTask(routineId, taskId, sortOrder) {
    const db = getDb();
    const id = crypto.randomUUID();

    // If sortOrder not provided, add at the end
    if (sortOrder === undefined || sortOrder === null) {
      const row = db.prepare(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM routine_tasks WHERE routine_id = ?'
      ).get(routineId);
      sortOrder = row.next_order;
    }

    // Check if task already exists in routine
    const existing = db.prepare(
      'SELECT id FROM routine_tasks WHERE routine_id = ? AND task_id = ?'
    ).get(routineId, taskId);

    if (existing) {
      // Update sort_order if task already exists
      db.prepare(
        'UPDATE routine_tasks SET sort_order = ? WHERE id = ?'
      ).run(sortOrder, existing.id);
    } else {
      // Insert new entry
      db.prepare(
        'INSERT INTO routine_tasks (id, routine_id, task_id, sort_order) VALUES (?, ?, ?, ?)'
      ).run(id, routineId, taskId, sortOrder);
    }
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
      'UPDATE routine_tasks SET sort_order = ? WHERE routine_id = ? AND task_id = ?'
    );

    for (let i = 0; i < taskOrder.length; i++) {
      updateStmt.run(i, routineId, taskOrder[i]);
    }
  }

  /**
   * Get all tasks for a routine in order
   * @param {string} routineId - The routine UUID
   * @returns {Object[]} Array of tasks with sortOrder
   */
  static getRoutineTasks(routineId) {
    const db = getDb();
    const rows = db.prepare(
      `SELECT t.*, rt.id as routine_task_id, rt.sort_order
       FROM tasks t
       JOIN routine_tasks rt ON t.id = rt.task_id
       WHERE rt.routine_id = ?
       ORDER BY rt.sort_order ASC`
    ).all(routineId);

    return rows.map(row => {
      return {
        id: row.id,
        routineTaskId: row.routine_task_id,
        householdId: row.household_id,
        name: row.name,
        description: row.description,
        icon: row.icon,
        valueCents: row.value_cents || 0,
        category: row.category,
        sortOrder: row.sort_order,
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
    let scheduleDays = row.schedule_days;

    // Parse JSON if stored as string
    if (typeof scheduleDays === 'string') {
      try {
        scheduleDays = JSON.parse(scheduleDays);
      } catch (e) {
        scheduleDays = null;
      }
    }

    return {
      id: row.id,
      householdId: row.household_id,
      name: row.name,
      scheduleType: row.schedule_type,
      scheduleDays: scheduleDays,
      assignedUserId: row.assigned_user_id,
      createdAt: row.created_at
    };
  }
}

module.exports = Routine;
