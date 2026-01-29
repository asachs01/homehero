/**
 * Completion model for database operations
 * Tracks task completions and provides streak data
 */

const crypto = require('crypto');
const { getDb } = require('../db/pool');
const { getMilestone, isMilestone } = require('../config/milestones');
const Balance = require('./Balance');
const Notification = require('./Notification');

// Time window in minutes for undo functionality
const UNDO_WINDOW_MINUTES = 5;

class Completion {
  /**
   * Create a new completion record
   * @param {string} taskId - The task UUID
   * @param {string} userId - The user UUID
   * @param {Date|string} date - The completion date (defaults to today)
   * @returns {Object} The created completion
   */
  static create(taskId, userId, date = new Date()) {
    const completionDate = date instanceof Date
      ? date.toISOString().split('T')[0]
      : date;

    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO completions (id, task_id, user_id, completed_at, completion_date) VALUES (?, ?, ?, ?, ?)'
    ).run(id, taskId, userId, now, completionDate);

    const row = db.prepare('SELECT * FROM completions WHERE id = ?').get(id);
    const completion = Completion.formatCompletion(row);

    // Update balance for the user based on task dollar value
    const balanceResult = Completion.updateBalance(taskId, userId);

    // Create notification for task completion
    Completion.createTaskCompletionNotification(taskId, userId, balanceResult);

    return completion;
  }

  /**
   * Create a notification for task completion
   * @param {string} taskId - The task UUID
   * @param {string} userId - The user UUID
   * @param {Object|null} balanceResult - Result from balance update
   */
  static createTaskCompletionNotification(taskId, userId, balanceResult) {
    try {
      const db = getDb();
      // Get task name
      const taskRow = db.prepare('SELECT name, dollar_value FROM tasks WHERE id = ?').get(taskId);

      if (!taskRow) return;

      const taskName = taskRow.name;
      const dollarValue = parseFloat(taskRow.dollar_value) || 0;

      let message = `You completed "${taskName}"!`;
      if (dollarValue > 0) {
        message += ` Earned $${dollarValue.toFixed(2)}.`;
      }

      Notification.create(userId, 'task_complete', message);
    } catch (err) {
      // Log but don't fail the completion
      console.error('Error creating task completion notification:', err);
    }
  }

  /**
   * Update user balance when task is completed
   * Uses the Balance model for transaction recording
   * @param {string} taskId - The task UUID
   * @param {string} userId - The user UUID
   * @returns {Object|null} Transaction result or null if no value
   */
  static updateBalance(taskId, userId) {
    const db = getDb();
    // Get task dollar value
    const taskRow = db.prepare('SELECT dollar_value, name FROM tasks WHERE id = ?').get(taskId);

    if (!taskRow) return null;

    const dollarValue = parseFloat(taskRow.dollar_value) || 0;
    const taskName = taskRow.name;

    if (dollarValue <= 0) return null;

    // Use Balance model for consistent transaction handling
    const result = Balance.add(
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
   * @returns {Object[]} Array of completions
   */
  static findByUserAndDate(userId, date = new Date()) {
    const completionDate = date instanceof Date
      ? date.toISOString().split('T')[0]
      : date;

    const db = getDb();
    const rows = db.prepare(
      `SELECT c.*, t.name as task_name, t.icon as task_icon
       FROM completions c
       JOIN tasks t ON c.task_id = t.id
       WHERE c.user_id = ? AND c.completion_date = ?
       ORDER BY c.completed_at DESC`
    ).all(userId, completionDate);

    return rows.map(row => ({
      ...Completion.formatCompletion(row),
      taskName: row.task_name,
      taskIcon: row.task_icon
    }));
  }

  /**
   * Find completions by task and date
   * @param {string} taskId - The task UUID
   * @param {Date|string} date - The date to check (defaults to today)
   * @returns {Object[]} Array of completions
   */
  static findByTaskAndDate(taskId, date = new Date()) {
    const completionDate = date instanceof Date
      ? date.toISOString().split('T')[0]
      : date;

    const db = getDb();
    const rows = db.prepare(
      `SELECT c.*, u.name as user_name
       FROM completions c
       JOIN users u ON c.user_id = u.id
       WHERE c.task_id = ? AND c.completion_date = ?
       ORDER BY c.completed_at DESC`
    ).all(taskId, completionDate);

    return rows.map(row => ({
      ...Completion.formatCompletion(row),
      userName: row.user_name
    }));
  }

  /**
   * Find a completion by ID
   * @param {string} id - The completion UUID
   * @returns {Object|null} The completion or null
   */
  static findById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM completions WHERE id = ?').get(id);

    if (!row) {
      return null;
    }

    return Completion.formatCompletion(row);
  }

  /**
   * Undo a completion (soft delete within time window)
   * @param {string} id - The completion UUID
   * @returns {{success: boolean, error?: string}} Result of undo operation
   */
  static undo(id) {
    // Find the completion
    const completion = Completion.findById(id);

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

    const db = getDb();
    // Get task dollar value to reverse
    const taskRow = db.prepare('SELECT dollar_value, name FROM tasks WHERE id = ?').get(completion.taskId);

    if (taskRow) {
      const dollarValue = parseFloat(taskRow.dollar_value) || 0;
      const taskName = taskRow.name;

      if (dollarValue > 0) {
        // Use Balance model to reverse the transaction
        Balance.reverse(
          completion.userId,
          dollarValue,
          `Undone: ${taskName}`
        );
      }
    }

    // Delete the completion
    db.prepare('DELETE FROM completions WHERE id = ?').run(id);

    return { success: true };
  }

  /**
   * Check if a task is completed by user for a date
   * @param {string} taskId - The task UUID
   * @param {string} userId - The user UUID
   * @param {Date|string} date - The date to check
   * @returns {Object|null} The completion if exists, null otherwise
   */
  static isCompleted(taskId, userId, date = new Date()) {
    const completionDate = date instanceof Date
      ? date.toISOString().split('T')[0]
      : date;

    const db = getDb();
    const row = db.prepare(
      `SELECT * FROM completions
       WHERE task_id = ? AND user_id = ? AND completion_date = ?
       LIMIT 1`
    ).get(taskId, userId, completionDate);

    if (!row) {
      return null;
    }

    return Completion.formatCompletion(row);
  }

  /**
   * Get streak data for a user and routine
   * @param {string} userId - The user UUID
   * @param {string} routineId - The routine UUID
   * @returns {Object} Streak data { currentCount, bestCount, lastCompletionDate }
   */
  static getStreakData(userId, routineId) {
    const db = getDb();

    // Ensure streak record exists
    const existing = db.prepare(
      'SELECT id FROM streaks WHERE user_id = ? AND routine_id = ?'
    ).get(userId, routineId);

    if (!existing) {
      const id = crypto.randomUUID();
      db.prepare(
        'INSERT INTO streaks (id, user_id, routine_id, current_count, best_count) VALUES (?, ?, ?, 0, 0)'
      ).run(id, userId, routineId);
    }

    const row = db.prepare(
      'SELECT current_count, best_count, last_completion_date FROM streaks WHERE user_id = ? AND routine_id = ?'
    ).get(userId, routineId);

    if (!row) {
      return { currentCount: 0, bestCount: 0, lastCompletionDate: null };
    }

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
   * @returns {Object} Updated streak data
   */
  static updateStreak(userId, routineId, date = new Date()) {
    const completionDate = date instanceof Date
      ? date.toISOString().split('T')[0]
      : date;

    // Get current streak data
    const currentStreak = Completion.getStreakData(userId, routineId);

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

    const db = getDb();
    db.prepare(
      'UPDATE streaks SET current_count = ?, best_count = ?, last_completion_date = ? WHERE user_id = ? AND routine_id = ?'
    ).run(newCount, newBest, completionDate, userId, routineId);

    return {
      currentCount: newCount,
      bestCount: newBest,
      lastCompletionDate: completionDate
    };
  }

  /**
   * Get user's total streak count (sum of all routine streaks)
   * @param {string} userId - The user UUID
   * @returns {number} Total streak count
   */
  static getTotalStreakCount(userId) {
    const db = getDb();
    const row = db.prepare(
      'SELECT COALESCE(SUM(current_count), 0) as total_streak FROM streaks WHERE user_id = ?'
    ).get(userId);

    return parseInt(row.total_streak) || 0;
  }

  /**
   * Get user's current balance
   * Uses the Balance model for consistent access
   * @param {string} userId - The user UUID
   * @returns {number} Current balance
   */
  static getBalance(userId) {
    const balance = Balance.get(userId);
    return balance.currentBalance;
  }

  /**
   * Check if completion is within undo window
   * @param {string} id - The completion UUID
   * @returns {boolean} True if can be undone
   */
  static canUndo(id) {
    const completion = Completion.findById(id);

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
   * @returns {number} The current streak count
   */
  static calculateStreak(userId, routineId) {
    const db = getDb();
    // Get all completion dates for this user/routine ordered by date descending
    const rows = db.prepare(
      `SELECT DISTINCT c.completion_date
       FROM completions c
       JOIN routine_tasks rt ON c.task_id = rt.task_id
       WHERE c.user_id = ? AND rt.routine_id = ?
       ORDER BY c.completion_date DESC`
    ).all(userId, routineId);

    if (rows.length === 0) {
      return 0;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Get the most recent completion date
    const mostRecentDate = rows[0].completion_date;
    const mostRecentStr = new Date(mostRecentDate).toISOString().split('T')[0];

    // Streak must include today or yesterday to be valid
    if (mostRecentStr !== todayStr && mostRecentStr !== yesterdayStr) {
      return 0;
    }

    // Count consecutive days
    let streak = 0;
    let expectedDate = new Date(mostRecentDate);
    expectedDate.setHours(0, 0, 0, 0);

    for (const row of rows) {
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
   * @returns {Object} Transaction result
   */
  static awardMilestoneBonus(userId, milestone, routineId = null) {
    const db = getDb();
    // Get routine name for description
    let routineName = 'routine';
    if (routineId) {
      const routineRow = db.prepare('SELECT name FROM routines WHERE id = ?').get(routineId);
      if (routineRow) {
        routineName = routineRow.name;
      }
    }

    // Build description and use Balance model
    const description = `Streak milestone: ${milestone.label} (${milestone.days} days) - ${routineName}`;
    const result = Balance.add(userId, milestone.bonus, 'bonus', description);

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
   * @returns {Object[]} Array of streak data
   */
  static getAllStreaksForUser(userId) {
    const db = getDb();
    const rows = db.prepare(
      `SELECT s.*, r.name as routine_name
       FROM streaks s
       JOIN routines r ON s.routine_id = r.id
       WHERE s.user_id = ?
       ORDER BY s.current_count DESC`
    ).all(userId);

    return rows.map(row => ({
      routineId: row.routine_id,
      routineName: row.routine_name,
      currentCount: row.current_count,
      bestCount: row.best_count,
      lastCompletionDate: row.last_completion_date
    }));
  }

  /**
   * Get all user-routine pairs that need streak recalculation
   * @returns {Object[]} Array of { userId, routineId } pairs
   */
  static getAllUserRoutinePairs() {
    const db = getDb();
    const rows = db.prepare(
      `SELECT DISTINCT s.user_id, s.routine_id
       FROM streaks s
       JOIN users u ON s.user_id = u.id
       JOIN routines r ON s.routine_id = r.id`
    ).all();

    return rows.map(row => ({
      userId: row.user_id,
      routineId: row.routine_id
    }));
  }

  /**
   * Recalculate and update streak, checking for missed days
   * @param {string} userId - The user UUID
   * @param {string} routineId - The routine UUID
   * @returns {Object} Updated streak info with milestone if earned
   */
  static recalculateStreak(userId, routineId) {
    const previousStreak = Completion.getStreakData(userId, routineId);
    const newStreak = Completion.calculateStreak(userId, routineId);

    // Update the streak record
    const newBest = Math.max(newStreak, previousStreak.bestCount);

    const db = getDb();
    // Get the most recent completion date
    const completionRow = db.prepare(
      `SELECT MAX(c.completion_date) as last_date
       FROM completions c
       JOIN routine_tasks rt ON c.task_id = rt.task_id
       WHERE c.user_id = ? AND rt.routine_id = ?`
    ).get(userId, routineId);

    const lastCompletionDate = completionRow?.last_date || null;

    db.prepare(
      'UPDATE streaks SET current_count = ?, best_count = ?, last_completion_date = ? WHERE user_id = ? AND routine_id = ?'
    ).run(newStreak, newBest, lastCompletionDate, userId, routineId);

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
        Completion.awardMilestoneBonus(userId, milestone, routineId);
        result.milestone = milestone;

        // Create notification for milestone
        Completion.createMilestoneNotification(userId, milestone, routineId);
      }
    }

    // Create notification if streak was broken
    if (result.streakBroken) {
      Completion.createStreakBrokenNotification(userId, previousStreak.currentCount, routineId);
    }

    return result;
  }

  /**
   * Create a notification for reaching a streak milestone
   * @param {string} userId - The user UUID
   * @param {Object} milestone - The milestone object
   * @param {string} routineId - The routine UUID
   */
  static createMilestoneNotification(userId, milestone, routineId) {
    try {
      const db = getDb();
      // Get routine name
      let routineName = 'routine';
      if (routineId) {
        const routineRow = db.prepare('SELECT name FROM routines WHERE id = ?').get(routineId);
        if (routineRow) {
          routineName = routineRow.name;
        }
      }

      const message = `Streak milestone reached! ${milestone.label} (${milestone.days} days) on "${routineName}". Bonus: $${milestone.bonus.toFixed(2)}!`;
      Notification.create(userId, 'streak_milestone', message);
    } catch (err) {
      console.error('Error creating milestone notification:', err);
    }
  }

  /**
   * Create a notification for broken streak
   * @param {string} userId - The user UUID
   * @param {number} previousCount - The previous streak count
   * @param {string} routineId - The routine UUID
   */
  static createStreakBrokenNotification(userId, previousCount, routineId) {
    try {
      const db = getDb();
      // Get routine name
      let routineName = 'routine';
      if (routineId) {
        const routineRow = db.prepare('SELECT name FROM routines WHERE id = ?').get(routineId);
        if (routineRow) {
          routineName = routineRow.name;
        }
      }

      const message = `Your ${previousCount}-day streak on "${routineName}" was broken. Start fresh today!`;
      Notification.create(userId, 'streak_broken', message);
    } catch (err) {
      console.error('Error creating streak broken notification:', err);
    }
  }
}

module.exports = Completion;
