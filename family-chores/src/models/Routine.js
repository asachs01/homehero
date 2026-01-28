/**
 * Routine model for database operations
 */

const { query } = require('../db/pool');

class Routine {
  /**
   * Create a new routine
   * @param {string} householdId - The household UUID
   * @param {Object} data - Routine data
   * @returns {Promise<Object>} The created routine
   */
  static async create(householdId, data) {
    const { name, assignedUserId, tasks = [] } = data;

    const result = await query(
      `INSERT INTO routines (household_id, name, assigned_user_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [householdId, name, assignedUserId]
    );

    const routine = Routine.formatRoutine(result.rows[0]);

    // Add tasks if provided
    if (tasks.length > 0) {
      for (const task of tasks) {
        await Routine.addTask(routine.id, task.taskId, task.position);
      }
      routine.tasks = await Routine.getRoutineTasks(routine.id);
    } else {
      routine.tasks = [];
    }

    return routine;
  }

  /**
   * Find all routines for a household with optional user filter
   * @param {string} householdId - The household UUID
   * @param {string} userId - Optional user UUID filter
   * @returns {Promise<Object[]>} Array of routines
   */
  static async findAll(householdId, userId = null) {
    let sql = `
      SELECT r.*
      FROM routines r
      WHERE r.household_id = $1
    `;
    const params = [householdId];

    if (userId) {
      sql += ' AND r.assigned_user_id = $2';
      params.push(userId);
    }

    sql += ' ORDER BY r.created_at DESC';

    const result = await query(sql, params);

    // Fetch tasks for each routine
    const routines = await Promise.all(
      result.rows.map(async (row) => {
        const routine = Routine.formatRoutine(row);
        routine.tasks = await Routine.getRoutineTasks(routine.id);
        return routine;
      })
    );

    return routines;
  }

  /**
   * Find a routine by ID
   * @param {string} id - The routine UUID
   * @returns {Promise<Object|null>} The routine or null if not found
   */
  static async findById(id) {
    const result = await query(
      'SELECT * FROM routines WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const routine = Routine.formatRoutine(result.rows[0]);
    routine.tasks = await Routine.getRoutineTasks(routine.id);
    return routine;
  }

  /**
   * Update a routine
   * @param {string} id - The routine UUID
   * @param {Object} data - Fields to update
   * @returns {Promise<Object|null>} The updated routine or null if not found
   */
  static async update(id, data) {
    const updates = [];
    const params = [];
    let paramIndex = 1;

    const fieldMap = {
      name: 'name',
      assignedUserId: 'assigned_user_id'
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key] !== undefined) {
        updates.push(`${column} = $${paramIndex}`);
        params.push(data[key]);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return Routine.findById(id);
    }

    params.push(id);
    const result = await query(
      `UPDATE routines SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return null;
    }

    const routine = Routine.formatRoutine(result.rows[0]);
    routine.tasks = await Routine.getRoutineTasks(routine.id);
    return routine;
  }

  /**
   * Delete a routine
   * @param {string} id - The routine UUID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  static async delete(id) {
    const result = await query(
      'DELETE FROM routines WHERE id = $1 RETURNING id',
      [id]
    );

    return result.rows.length > 0;
  }

  /**
   * Add a task to a routine
   * @param {string} routineId - The routine UUID
   * @param {string} taskId - The task UUID
   * @param {number} position - The position in the routine
   * @returns {Promise<void>}
   */
  static async addTask(routineId, taskId, position) {
    // If position not provided, add at the end
    if (position === undefined || position === null) {
      const result = await query(
        'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM routine_tasks WHERE routine_id = $1',
        [routineId]
      );
      position = result.rows[0].next_position;
    }

    await query(
      `INSERT INTO routine_tasks (routine_id, task_id, position)
       VALUES ($1, $2, $3)
       ON CONFLICT (routine_id, task_id) DO UPDATE SET position = $3`,
      [routineId, taskId, position]
    );
  }

  /**
   * Remove a task from a routine
   * @param {string} routineId - The routine UUID
   * @param {string} taskId - The task UUID
   * @returns {Promise<boolean>} True if removed, false if not found
   */
  static async removeTask(routineId, taskId) {
    const result = await query(
      'DELETE FROM routine_tasks WHERE routine_id = $1 AND task_id = $2 RETURNING task_id',
      [routineId, taskId]
    );

    return result.rows.length > 0;
  }

  /**
   * Reorder tasks in a routine
   * @param {string} routineId - The routine UUID
   * @param {string[]} taskOrder - Array of task UUIDs in desired order
   * @returns {Promise<void>}
   */
  static async reorderTasks(routineId, taskOrder) {
    // Update positions based on array order
    for (let i = 0; i < taskOrder.length; i++) {
      await query(
        'UPDATE routine_tasks SET position = $1 WHERE routine_id = $2 AND task_id = $3',
        [i, routineId, taskOrder[i]]
      );
    }
  }

  /**
   * Get all tasks for a routine in order
   * @param {string} routineId - The routine UUID
   * @returns {Promise<Object[]>} Array of tasks with position
   */
  static async getRoutineTasks(routineId) {
    const result = await query(
      `SELECT t.*, rt.position
       FROM tasks t
       JOIN routine_tasks rt ON t.id = rt.task_id
       WHERE rt.routine_id = $1
       ORDER BY rt.position ASC`,
      [routineId]
    );

    return result.rows.map(row => ({
      id: row.id,
      householdId: row.household_id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      type: row.type,
      dollarValue: parseFloat(row.dollar_value) || 0,
      schedule: row.schedule || [],
      timeWindow: row.time_window,
      position: row.position,
      createdAt: row.created_at
    }));
  }

  /**
   * Get the household ID for a routine
   * @param {string} routineId - The routine UUID
   * @returns {Promise<string|null>} The household UUID or null
   */
  static async getHouseholdId(routineId) {
    const result = await query(
      'SELECT household_id FROM routines WHERE id = $1',
      [routineId]
    );

    return result.rows.length > 0 ? result.rows[0].household_id : null;
  }

  /**
   * Check if a task exists in a routine
   * @param {string} routineId - The routine UUID
   * @param {string} taskId - The task UUID
   * @returns {Promise<boolean>} True if task exists in routine
   */
  static async hasTask(routineId, taskId) {
    const result = await query(
      'SELECT 1 FROM routine_tasks WHERE routine_id = $1 AND task_id = $2',
      [routineId, taskId]
    );

    return result.rows.length > 0;
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
