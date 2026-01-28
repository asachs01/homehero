/**
 * Completion model for database operations
 * Tracks task completions and provides streak data
 */

const { query } = require('../db/pool');
const { getMilestone, isMilestone } = require('../config/milestones');
const Balance = require('./Balance');

// Time window in minutes for undo functionality
const UNDO_WINDOW_MINUTES = 5;

class Completion {
  /**
   * Create a new completion record
   * @param {string} taskId - The task UUID
   * @param {string} userId - The user UUID
   * @param {Date|string} date - The completion date (defaults to today)
   * @returns {Promise<Object>} The created completion
   */
  static async create(taskId, userId, date = new Date()) {
    const completionDate = date instanceof Date
      ? date.toISOString().split('T')[0]
      : date;

    const result = await query(
      `INSERT INTO completions (task_id, user_id, completion_date)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [taskId, userId, completionDate]
    );

    const completion = Completion.formatCompletion(result.rows[0]);

    // Update balance for the user based on task dollar value
    await Completion.updateBalance(taskId, userId);

    return completion;
  }

  /**
   * Update user balance when task is completed
   * Uses the Balance model for transaction recording
   * @param {string} taskId - The task UUID
   * @param {string} userId - The user UUID
   * @returns {Promise<Object|null>} Transaction result or null if no value
   */
  static async updateBalance(taskId, userId) {
    // Get task dollar value
    const taskResult = await query(
      'SELECT dollar_value, name FROM tasks WHERE id = $1',
      [taskId]
    );

    if (taskResult.rows.length === 0) return null;

    const dollarValue = parseFloat(taskResult.rows[0].dollar_value) || 0;
    const taskName = taskResult.rows[0].name;

    if (dollarValue <= 0) return null;

    // Use Balance model for consistent transaction handling
    const result = await Balance.add(
      userId,
      dollarValue,
      'earned',
      `Completed: ${taskName}`
    );

    return result;
  }

  /**
   * Find completions by user and date
   * @param {string} userId - The user UUID
   * @param {Date|string} date - The date to check (defaults to today)
   * @returns {Promise<Object[]>} Array of completions
   */
  static async findByUserAndDate(userId, date = new Date()) {
    const completionDate = date instanceof Date
      ? date.toISOString().split('T')[0]
      : date;

    const result = await query(
      `SELECT c.*, t.name as task_name, t.icon as task_icon
       FROM completions c
       JOIN tasks t ON c.task_id = t.id
       WHERE c.user_id = $1 AND c.completion_date = $2
       ORDER BY c.completed_at DESC`,
      [userId, completionDate]
    );

    return result.rows.map(row => ({
      ...Completion.formatCompletion(row),
      taskName: row.task_name,
      taskIcon: row.task_icon
    }));
  }

  /**
   * Find completions by task and date
   * @param {string} taskId - The task UUID
   * @param {Date|string} date - The date to check (defaults to today)
   * @returns {Promise<Object[]>} Array of completions
   */
  static async findByTaskAndDate(taskId, date = new Date()) {
    const completionDate = date instanceof Date
      ? date.toISOString().split('T')[0]
      : date;

    const result = await query(
      `SELECT c.*, u.name as user_name
       FROM completions c
       JOIN users u ON c.user_id = u.id
       WHERE c.task_id = $1 AND c.completion_date = $2
       ORDER BY c.completed_at DESC`,
      [taskId, completionDate]
    );

    return result.rows.map(row => ({
      ...Completion.formatCompletion(row),
      userName: row.user_name
    }));
  }

  /**
   * Find a completion by ID
   * @param {string} id - The completion UUID
   * @returns {Promise<Object|null>} The completion or null
   */
  static async findById(id) {
    const result = await query(
      'SELECT * FROM completions WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return Completion.formatCompletion(result.rows[0]);
  }

  /**
   * Undo a completion (soft delete within time window)
   * @param {string} id - The completion UUID
   * @returns {Promise<{success: boolean, error?: string}>} Result of undo operation
   */
  static async undo(id) {
    // Find the completion
    const completion = await Completion.findById(id);

    if (!completion) {
      return { success: false, error: 'Completion not found' };
    }

    // Check if within undo window
    const completedAt = new Date(completion.completedAt);
    const now = new Date();
    const minutesElapsed = (now - completedAt) / (1000 * 60);

    if (minutesElapsed > UNDO_WINDOW_MINUTES) {
      return {
        success: false,
        error: `Undo window expired (${UNDO_WINDOW_MINUTES} minutes)`
      };
    }

    // Get task dollar value to reverse
    const taskResult = await query(
      'SELECT dollar_value, name FROM tasks WHERE id = $1',
      [completion.taskId]
    );

    if (taskResult.rows.length > 0) {
      const dollarValue = parseFloat(taskResult.rows[0].dollar_value) || 0;
      const taskName = taskResult.rows[0].name;

      if (dollarValue > 0) {
        // Use Balance model to reverse the transaction
        await Balance.reverse(
          completion.userId,
          dollarValue,
          `Undone: ${taskName}`
        );
      }
    }

    // Delete the completion
    await query('DELETE FROM completions WHERE id = $1', [id]);

    return { success: true };
  }

  /**
   * Check if a task is completed by user for a date
   * @param {string} taskId - The task UUID
   * @param {string} userId - The user UUID
   * @param {Date|string} date - The date to check
   * @returns {Promise<Object|null>} The completion if exists, null otherwise
   */
  static async isCompleted(taskId, userId, date = new Date()) {
    const completionDate = date instanceof Date
      ? date.toISOString().split('T')[0]
      : date;

    const result = await query(
      `SELECT * FROM completions
       WHERE task_id = $1 AND user_id = $2 AND completion_date = $3
       LIMIT 1`,
      [taskId, userId, completionDate]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return Completion.formatCompletion(result.rows[0]);
  }

  /**
   * Get streak data for a user and routine
   * @param {string} userId - The user UUID
   * @param {string} routineId - The routine UUID
   * @returns {Promise<Object>} Streak data { currentCount, bestCount, lastCompletionDate }
   */
  static async getStreakData(userId, routineId) {
    // Ensure streak record exists
    await query(
      `INSERT INTO streaks (user_id, routine_id, current_count, best_count)
       VALUES ($1, $2, 0, 0)
       ON CONFLICT (user_id, routine_id) DO NOTHING`,
      [userId, routineId]
    );

    const result = await query(
      `SELECT current_count, best_count, last_completion_date
       FROM streaks
       WHERE user_id = $1 AND routine_id = $2`,
      [userId, routineId]
    );

    if (result.rows.length === 0) {
      return { currentCount: 0, bestCount: 0, lastCompletionDate: null };
    }

    const row = result.rows[0];
    return {
      currentCount: row.current_count,
      bestCount: row.best_count,
      lastCompletionDate: row.last_completion_date
    };
  }

  /**
   * Update streak for a user and routine (call when routine is completed)
   * @param {string} userId - The user UUID
   * @param {string} routineId - The routine UUID
   * @param {Date|string} date - The completion date
   * @returns {Promise<Object>} Updated streak data
   */
  static async updateStreak(userId, routineId, date = new Date()) {
    const completionDate = date instanceof Date
      ? date.toISOString().split('T')[0]
      : date;

    // Get current streak data
    const currentStreak = await Completion.getStreakData(userId, routineId);

    // Calculate if this continues the streak
    let newCount = 1;
    if (currentStreak.lastCompletionDate) {
      const lastDate = new Date(currentStreak.lastCompletionDate);
      const currentDate = new Date(completionDate);
      const daysDiff = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));

      if (daysDiff === 1) {
        // Consecutive day, increment streak
        newCount = currentStreak.currentCount + 1;
      } else if (daysDiff === 0) {
        // Same day, keep current count
        newCount = currentStreak.currentCount;
      }
      // If daysDiff > 1, streak resets to 1
    }

    const newBest = Math.max(newCount, currentStreak.bestCount);

    await query(
      `UPDATE streaks
       SET current_count = $1, best_count = $2, last_completion_date = $3
       WHERE user_id = $4 AND routine_id = $5`,
      [newCount, newBest, completionDate, userId, routineId]
    );

    return {
      currentCount: newCount,
      bestCount: newBest,
      lastCompletionDate: completionDate
    };
  }

  /**
   * Get user's total streak count (sum of all routine streaks)
   * @param {string} userId - The user UUID
   * @returns {Promise<number>} Total streak count
   */
  static async getTotalStreakCount(userId) {
    const result = await query(
      `SELECT COALESCE(SUM(current_count), 0) as total_streak
       FROM streaks
       WHERE user_id = $1`,
      [userId]
    );

    return parseInt(result.rows[0].total_streak) || 0;
  }

  /**
   * Get user's current balance
   * Uses the Balance model for consistent access
   * @param {string} userId - The user UUID
   * @returns {Promise<number>} Current balance
   */
  static async getBalance(userId) {
    const balance = await Balance.get(userId);
    return balance.currentBalance;
  }

  /**
   * Check if completion is within undo window
   * @param {string} id - The completion UUID
   * @returns {Promise<boolean>} True if can be undone
   */
  static async canUndo(id) {
    const completion = await Completion.findById(id);

    if (!completion) return false;

    const completedAt = new Date(completion.completedAt);
    const now = new Date();
    const minutesElapsed = (now - completedAt) / (1000 * 60);

    return minutesElapsed <= UNDO_WINDOW_MINUTES;
  }

  /**
   * Format a database row to a completion object
   * @param {Object} row - Database row
   * @returns {Object} Formatted completion object
   */
  static formatCompletion(row) {
    return {
      id: row.id,
      taskId: row.task_id,
      userId: row.user_id,
      completedAt: row.completed_at,
      completionDate: row.completion_date
    };
  }

  /**
   * Calculate streak by counting consecutive days of completions
   * @param {string} userId - The user UUID
   * @param {string} routineId - The routine UUID
   * @returns {Promise<number>} The current streak count
   */
  static async calculateStreak(userId, routineId) {
    // Get all completion dates for this user/routine ordered by date descending
    const result = await query(
      `SELECT DISTINCT c.completion_date
       FROM completions c
       JOIN routine_tasks rt ON c.task_id = rt.task_id
       WHERE c.user_id = $1 AND rt.routine_id = $2
       ORDER BY c.completion_date DESC`,
      [userId, routineId]
    );

    if (result.rows.length === 0) {
      return 0;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Get the most recent completion date
    const mostRecentDate = result.rows[0].completion_date;
    const mostRecentStr = new Date(mostRecentDate).toISOString().split('T')[0];

    // Streak must include today or yesterday to be valid
    if (mostRecentStr !== todayStr && mostRecentStr !== yesterdayStr) {
      return 0;
    }

    // Count consecutive days
    let streak = 0;
    let expectedDate = new Date(mostRecentDate);
    expectedDate.setHours(0, 0, 0, 0);

    for (const row of result.rows) {
      const completionDate = new Date(row.completion_date);
      completionDate.setHours(0, 0, 0, 0);

      const expectedStr = expectedDate.toISOString().split('T')[0];
      const completionStr = completionDate.toISOString().split('T')[0];

      if (completionStr === expectedStr) {
        streak++;
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else if (completionDate < expectedDate) {
        // Gap found, streak is broken
        break;
      }
    }

    return streak;
  }

  /**
   * Check if a streak count hits a milestone
   * @param {number} streak - The current streak count
   * @returns {Object|null} Milestone object if reached, null otherwise
   */
  static checkMilestone(streak) {
    return getMilestone(streak);
  }

  /**
   * Check if a streak count is exactly at a milestone threshold
   * @param {number} streak - The current streak count
   * @returns {boolean} True if streak is at a milestone
   */
  static isMilestoneReached(streak) {
    return isMilestone(streak);
  }

  /**
   * Award a milestone bonus to a user
   * Uses Balance model for consistent transaction handling
   * @param {string} userId - The user UUID
   * @param {Object} milestone - The milestone object { days, bonus, label }
   * @param {string} routineId - The routine UUID for reference
   * @returns {Promise<Object>} Transaction result
   */
  static async awardMilestoneBonus(userId, milestone, routineId = null) {
    // Get routine name for description
    let routineName = 'routine';
    if (routineId) {
      const routineResult = await query(
        'SELECT name FROM routines WHERE id = $1',
        [routineId]
      );
      if (routineResult.rows.length > 0) {
        routineName = routineResult.rows[0].name;
      }
    }

    // Build description and use Balance model
    const description = `Streak milestone: ${milestone.label} (${milestone.days} days) - ${routineName}`;
    const result = await Balance.add(userId, milestone.bonus, 'bonus', description);

    return {
      success: true,
      bonus: milestone.bonus,
      description,
      transaction: result.transaction
    };
  }

  /**
   * Get all streaks for a user
   * @param {string} userId - The user UUID
   * @returns {Promise<Object[]>} Array of streak data
   */
  static async getAllStreaksForUser(userId) {
    const result = await query(
      `SELECT s.*, r.name as routine_name
       FROM streaks s
       JOIN routines r ON s.routine_id = r.id
       WHERE s.user_id = $1
       ORDER BY s.current_count DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      routineId: row.routine_id,
      routineName: row.routine_name,
      currentCount: row.current_count,
      bestCount: row.best_count,
      lastCompletionDate: row.last_completion_date
    }));
  }

  /**
   * Get all user-routine pairs that need streak recalculation
   * @returns {Promise<Object[]>} Array of { userId, routineId } pairs
   */
  static async getAllUserRoutinePairs() {
    const result = await query(
      `SELECT DISTINCT s.user_id, s.routine_id
       FROM streaks s
       JOIN users u ON s.user_id = u.id
       JOIN routines r ON s.routine_id = r.id`
    );

    return result.rows.map(row => ({
      userId: row.user_id,
      routineId: row.routine_id
    }));
  }

  /**
   * Recalculate and update streak, checking for missed days
   * @param {string} userId - The user UUID
   * @param {string} routineId - The routine UUID
   * @returns {Promise<Object>} Updated streak info with milestone if earned
   */
  static async recalculateStreak(userId, routineId) {
    const previousStreak = await Completion.getStreakData(userId, routineId);
    const newStreak = await Completion.calculateStreak(userId, routineId);

    // Update the streak record
    const newBest = Math.max(newStreak, previousStreak.bestCount);

    // Get the most recent completion date
    const completionResult = await query(
      `SELECT MAX(c.completion_date) as last_date
       FROM completions c
       JOIN routine_tasks rt ON c.task_id = rt.task_id
       WHERE c.user_id = $1 AND rt.routine_id = $2`,
      [userId, routineId]
    );

    const lastCompletionDate = completionResult.rows[0]?.last_date || null;

    await query(
      `UPDATE streaks
       SET current_count = $1, best_count = $2, last_completion_date = $3
       WHERE user_id = $4 AND routine_id = $5`,
      [newStreak, newBest, lastCompletionDate, userId, routineId]
    );

    const result = {
      userId,
      routineId,
      previousCount: previousStreak.currentCount,
      currentCount: newStreak,
      bestCount: newBest,
      lastCompletionDate,
      streakBroken: previousStreak.currentCount > 0 && newStreak === 0,
      milestone: null
    };

    // Check for milestone (only award if streak just reached the milestone)
    if (newStreak > previousStreak.currentCount && Completion.isMilestoneReached(newStreak)) {
      const milestone = Completion.checkMilestone(newStreak);
      if (milestone) {
        await Completion.awardMilestoneBonus(userId, milestone, routineId);
        result.milestone = milestone;
      }
    }

    return result;
  }
}

module.exports = Completion;
