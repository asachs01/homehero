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
const { cacheDashboard, invalidateUser } = require('../middleware/cache');

/**
 * Check if a routine is scheduled for a given date
 * @param {Object} routine - Routine object with scheduleType and scheduleDays
 * @param {Date} date - The date to check
 * @returns {boolean} True if routine is scheduled for the date
 */
function isRoutineScheduledForDate(routine, date) {
  if (routine.scheduleType === 'daily') {
    return true;
  }

  if (routine.scheduleType === 'weekly' && routine.scheduleDays) {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    return routine.scheduleDays.includes(dayOfWeek);
  }

  return false;
}

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
      // Check if routine is scheduled for today
      if (!isRoutineScheduledForDate(routine, today)) {
        continue;
      }

      if (!primaryRoutineId) {
        primaryRoutineId = routine.id;
      }

      for (const task of routine.tasks) {
        const completion = completions.find(c => c.taskId === task.id);
        const isCompleted = completedTaskIds.has(task.id);

        routineTasks.push({
          id: task.id,
          name: task.name,
          description: task.description,
          icon: task.icon,
          valueCents: task.valueCents,
          sortOrder: task.sortOrder,
          routineId: routine.id,
          routineName: routine.name,
          isCompleted,
          completionId: completion?.id || null,
          completedAt: completion?.completedAt || null,
          canUndo: completion ? Completion.canUndo(completion.id) : false
        });
      }
    }

    // Sort by sortOrder
    routineTasks.sort((a, b) => a.sortOrder - b.sortOrder);

    // Get bonus tasks (tasks not in any routine, available for claim)
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
        valueCents: task.valueCents
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
 * These are tasks that exist but are not part of any routine
 * @param {string} householdId - Household UUID
 * @param {string} userId - User UUID
 * @param {Date} date - The date to check
 * @param {Set} completedTaskIds - Set of completed task IDs
 * @param {Array} completions - Array of completion objects
 * @returns {Array} Array of bonus tasks
 */
function getBonusTasks(householdId, userId, date, completedTaskIds, completions) {
  const db = getDb();
  // Get all tasks for the household that are NOT part of any routine
  const rows = db.prepare(
    `SELECT t.*
     FROM tasks t
     WHERE t.household_id = ?
     AND NOT EXISTS (
       SELECT 1 FROM routine_tasks rt WHERE rt.task_id = t.id
     )
     ORDER BY t.value_cents DESC, t.name ASC`
  ).all(householdId);

  const bonusTasks = [];

  for (const row of rows) {
    const task = Task.formatTask(row);

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
      valueCents: task.valueCents,
      category: task.category,
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
