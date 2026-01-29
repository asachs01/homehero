/**
 * Dashboard routes
 * Provides dashboard data for child users including tasks, streaks, and balance
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/pool');
const Routine = require('../models/Routine');
const Task = require('../models/Task');
const Completion = require('../models/Completion');
const { requireAuth } = require('../middleware/auth');
const { isScheduledForDate } = require('../utils/schedule');
const { cacheDashboard, invalidateUser } = require('../middleware/cache');

/**
 * GET /api/dashboard
 * Returns user's dashboard data for today
 * - Today's routine tasks (from assigned routines)
 * - Today's bonus tasks (available to claim)
 * - Current streak count
 * - Current balance
 * - Completion status for today
 *
 * Cached per user for 30 seconds
 */
router.get('/api/dashboard', requireAuth, cacheDashboard, async (req, res) => {
  try {
    const userId = req.user.userId;
    const householdId = req.user.householdId;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Get user's routines
    const routines = Routine.findAll(householdId, userId);

    // Get today's completions for this user
    const completions = Completion.findByUserAndDate(userId, today);
    const completedTaskIds = new Set(completions.map(c => c.taskId));

    // Build routine tasks for today
    const routineTasks = [];
    let primaryRoutineId = null;

    for (const routine of routines) {
      if (!primaryRoutineId) {
        primaryRoutineId = routine.id;
      }

      for (const task of routine.tasks) {
        // Check if task is scheduled for today
        if (!isScheduledForDate(task, today)) {
          continue;
        }

        const completion = completions.find(c => c.taskId === task.id);
        const isCompleted = completedTaskIds.has(task.id);

        routineTasks.push({
          id: task.id,
          name: task.name,
          description: task.description,
          icon: task.icon,
          dollarValue: task.dollarValue,
          position: task.position,
          routineId: routine.id,
          routineName: routine.name,
          isCompleted,
          completionId: completion?.id || null,
          completedAt: completion?.completedAt || null,
          canUndo: completion ? Completion.canUndo(completion.id) : false
        });
      }
    }

    // Sort by position
    routineTasks.sort((a, b) => a.position - b.position);

    // Get bonus tasks (type='one-time' or unassigned tasks available for claim)
    const bonusTasks = getBonusTasks(householdId, userId, today, completedTaskIds, completions);

    // Get streak data
    let streakCount = 0;
    if (primaryRoutineId) {
      const streakData = Completion.getStreakData(userId, primaryRoutineId);
      streakCount = streakData.currentCount;
    }

    // Get total streak across all routines as fallback
    if (streakCount === 0) {
      streakCount = Completion.getTotalStreakCount(userId);
    }

    // Get current balance
    const balance = Completion.getBalance(userId);

    // Calculate completion status for today
    const totalRoutineTasks = routineTasks.length;
    const completedRoutineTasks = routineTasks.filter(t => t.isCompleted).length;
    const routineComplete = totalRoutineTasks > 0 && completedRoutineTasks === totalRoutineTasks;

    // Update streak if routine is complete
    if (routineComplete && primaryRoutineId) {
      const updatedStreak = Completion.updateStreak(userId, primaryRoutineId, today);
      streakCount = updatedStreak.currentCount;
    }

    res.json({
      date: todayStr,
      user: {
        id: userId,
        householdId
      },
      routineTasks,
      bonusTasks,
      streak: {
        count: streakCount,
        routineComplete
      },
      balance: {
        current: balance,
        formatted: `$${balance.toFixed(2)}`
      },
      progress: {
        completed: completedRoutineTasks,
        total: totalRoutineTasks,
        percentage: totalRoutineTasks > 0
          ? Math.round((completedRoutineTasks / totalRoutineTasks) * 100)
          : 0
      }
    });
  } catch (err) {
    console.error('Error fetching dashboard:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

/**
 * POST /api/dashboard/complete/:taskId
 * Mark a task as complete
 */
router.post('/api/dashboard/complete/:taskId', requireAuth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.userId;
    const today = new Date();

    // Verify task exists and user has access
    const task = Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if already completed today
    const existing = Completion.isCompleted(taskId, userId, today);
    if (existing) {
      return res.status(400).json({
        error: 'Task already completed today',
        completion: existing
      });
    }

    // Create completion
    const completion = Completion.create(taskId, userId, today);

    // Invalidate dashboard cache for this user
    invalidateUser(userId);

    // Get updated balance
    const balance = Completion.getBalance(userId);

    res.status(201).json({
      completion,
      task: {
        id: task.id,
        name: task.name,
        dollarValue: task.dollarValue
      },
      balance: {
        current: balance,
        formatted: `$${balance.toFixed(2)}`
      },
      canUndo: true
    });
  } catch (err) {
    console.error('Error completing task:', err);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

/**
 * POST /api/dashboard/undo/:completionId
 * Undo a task completion (within 5 minute window)
 */
router.post('/api/dashboard/undo/:completionId', requireAuth, async (req, res) => {
  try {
    const { completionId } = req.params;
    const userId = req.user.userId;

    // Verify completion exists and belongs to user
    const completion = Completion.findById(completionId);
    if (!completion) {
      return res.status(404).json({ error: 'Completion not found' });
    }

    if (completion.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Attempt undo
    const result = Completion.undo(completionId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Invalidate dashboard cache for this user
    invalidateUser(userId);

    // Get updated balance
    const balance = Completion.getBalance(userId);

    res.json({
      success: true,
      balance: {
        current: balance,
        formatted: `$${balance.toFixed(2)}`
      }
    });
  } catch (err) {
    console.error('Error undoing completion:', err);
    res.status(500).json({ error: 'Failed to undo completion' });
  }
});

/**
 * Get bonus tasks available for the user
 * @param {string} householdId - Household UUID
 * @param {string} userId - User UUID
 * @param {Date} date - The date to check
 * @param {Set} completedTaskIds - Set of completed task IDs
 * @param {Array} completions - Array of completion objects
 * @returns {Array} Array of bonus tasks
 */
function getBonusTasks(householdId, userId, date, completedTaskIds, completions) {
  const db = getDb();
  // Get all one-time tasks for the household that are scheduled for today
  const rows = db.prepare(
    `SELECT *
     FROM tasks
     WHERE household_id = ?
     AND type = 'one-time'
     ORDER BY dollar_value DESC, name ASC`
  ).all(householdId);

  const bonusTasks = [];

  for (const row of rows) {
    const task = Task.formatTask ? Task.formatTask(row) : {
      id: row.id,
      householdId: row.household_id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      type: row.type,
      dollarValue: parseFloat(row.dollar_value) || 0,
      schedule: typeof row.schedule === 'string' ? JSON.parse(row.schedule || '[]') : (row.schedule || []),
      timeWindow: typeof row.time_window === 'string' ? JSON.parse(row.time_window || 'null') : row.time_window,
      createdAt: row.created_at
    };

    // Check if scheduled for today
    if (!isScheduledForDate(task, date)) {
      continue;
    }

    // Check if already claimed/completed by anyone today
    const taskCompletions = Completion.findByTaskAndDate(task.id, date);
    const alreadyClaimed = taskCompletions.length > 0;

    // Check if completed by current user
    const completion = completions.find(c => c.taskId === task.id);
    const isCompleted = completedTaskIds.has(task.id);

    bonusTasks.push({
      id: task.id,
      name: task.name,
      description: task.description,
      icon: task.icon,
      dollarValue: task.dollarValue,
      isCompleted,
      isClaimed: alreadyClaimed,
      claimedBy: taskCompletions[0]?.userName || null,
      completionId: completion?.id || null,
      completedAt: completion?.completedAt || null,
      canUndo: completion ? Completion.canUndo(completion.id) : false
    });
  }

  return bonusTasks;
}

module.exports = router;
