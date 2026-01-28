/**
 * Family Dashboard routes
 * Provides parent/admin overview of all family members' progress
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');
const User = require('../models/User');
const Household = require('../models/Household');
const Routine = require('../models/Routine');
const Completion = require('../models/Completion');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { isScheduledForDate } = require('../utils/schedule');

/**
 * GET /api/family/dashboard
 * Returns all family members' progress for the parent view
 * - Each user: avatar, name, today's completion %, streak, balance
 * - Missed tasks today
 * - Household vacation mode status
 *
 * Requires admin (parent) role
 */
router.get('/api/family/dashboard', requireAuth, requireAdmin, async (req, res) => {
  try {
    const householdId = req.user.householdId;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Get household info
    const household = await Household.findById(householdId);
    if (!household) {
      return res.status(404).json({ error: 'Household not found' });
    }

    // Get all users in household
    const users = await User.findByHousehold(householdId);

    // Build member data for each user
    const members = await Promise.all(users.map(async (user) => {
      // Get user's routines
      const routines = await Routine.findAll(householdId, user.id);

      // Get today's completions for this user
      const completions = await Completion.findByUserAndDate(user.id, today);
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

          routineTasks.push({
            id: task.id,
            name: task.name,
            icon: task.icon,
            dollarValue: task.dollarValue,
            isCompleted: completedTaskIds.has(task.id),
            routineName: routine.name
          });
        }
      }

      // Calculate completion stats
      const totalTasks = routineTasks.length;
      const completedTasks = routineTasks.filter(t => t.isCompleted).length;
      const completionPercentage = totalTasks > 0
        ? Math.round((completedTasks / totalTasks) * 100)
        : 0;

      // Get missed tasks (incomplete tasks)
      const missedTasks = routineTasks.filter(t => !t.isCompleted);

      // Get streak data
      let streakCount = 0;
      if (primaryRoutineId) {
        const streakData = await Completion.getStreakData(user.id, primaryRoutineId);
        streakCount = streakData.currentCount;
      }

      // Get total streak across all routines as fallback
      if (streakCount === 0) {
        streakCount = await Completion.getTotalStreakCount(user.id);
      }

      // Get current balance
      const balance = await Completion.getBalance(user.id);

      return {
        id: user.id,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        progress: {
          completed: completedTasks,
          total: totalTasks,
          percentage: completionPercentage
        },
        streak: streakCount,
        balance: {
          current: balance,
          formatted: `$${balance.toFixed(2)}`
        },
        missedTasks: missedTasks.map(t => ({
          id: t.id,
          name: t.name,
          icon: t.icon
        })),
        routineComplete: totalTasks > 0 && completedTasks === totalTasks
      };
    }));

    res.json({
      date: todayStr,
      household: {
        id: household.id,
        name: household.name,
        vacationMode: household.vacationMode
      },
      members,
      summary: {
        totalMembers: members.length,
        membersComplete: members.filter(m => m.routineComplete).length,
        totalMissedTasks: members.reduce((sum, m) => sum + m.missedTasks.length, 0)
      }
    });
  } catch (err) {
    console.error('Error fetching family dashboard:', err);
    res.status(500).json({ error: 'Failed to fetch family dashboard' });
  }
});

/**
 * POST /api/family/vacation-mode
 * Toggle household vacation mode
 *
 * Requires admin (parent) role
 */
router.post('/api/family/vacation-mode', requireAuth, requireAdmin, async (req, res) => {
  try {
    const householdId = req.user.householdId;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const household = await Household.update(householdId, { vacationMode: enabled });

    if (!household) {
      return res.status(404).json({ error: 'Household not found' });
    }

    res.json({
      success: true,
      vacationMode: household.vacationMode
    });
  } catch (err) {
    console.error('Error toggling vacation mode:', err);
    res.status(500).json({ error: 'Failed to toggle vacation mode' });
  }
});

/**
 * POST /api/family/sick-day/:userId
 * Mark a user's tasks as complete for the day (sick day)
 *
 * Requires admin (parent) role
 */
router.post('/api/family/sick-day/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const householdId = req.user.householdId;
    const today = new Date();

    // Verify user exists and belongs to this household
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.householdId !== householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get user's routines
    const routines = await Routine.findAll(householdId, userId);

    // Get today's completions for this user
    const existingCompletions = await Completion.findByUserAndDate(userId, today);
    const completedTaskIds = new Set(existingCompletions.map(c => c.taskId));

    // Find all scheduled tasks for today that aren't completed
    const completedNow = [];

    for (const routine of routines) {
      for (const task of routine.tasks) {
        // Check if task is scheduled for today
        if (!isScheduledForDate(task, today)) {
          continue;
        }

        // Skip if already completed
        if (completedTaskIds.has(task.id)) {
          continue;
        }

        // Create completion (without earning money - sick day is a pass)
        await query(
          `INSERT INTO completions (task_id, user_id, completion_date)
           VALUES ($1, $2, $3)`,
          [task.id, userId, today.toISOString().split('T')[0]]
        );

        completedNow.push({
          id: task.id,
          name: task.name,
          icon: task.icon
        });
      }
    }

    res.json({
      success: true,
      tasksCompleted: completedNow.length,
      tasks: completedNow,
      message: `Marked ${completedNow.length} task(s) complete for ${user.name}'s sick day`
    });
  } catch (err) {
    console.error('Error marking sick day:', err);
    res.status(500).json({ error: 'Failed to mark sick day' });
  }
});

/**
 * GET /api/family/member/:userId
 * Get detailed view for a specific family member
 *
 * Requires admin (parent) role
 */
router.get('/api/family/member/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const householdId = req.user.householdId;
    const today = new Date();

    // Verify user exists and belongs to this household
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.householdId !== householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get user's routines
    const routines = await Routine.findAll(householdId, userId);

    // Get today's completions for this user
    const completions = await Completion.findByUserAndDate(userId, today);
    const completedTaskIds = new Set(completions.map(c => c.taskId));

    // Build detailed routine data
    const routineData = [];

    for (const routine of routines) {
      const tasks = [];

      for (const task of routine.tasks) {
        // Check if task is scheduled for today
        const scheduledToday = isScheduledForDate(task, today);

        if (scheduledToday) {
          const completion = completions.find(c => c.taskId === task.id);

          tasks.push({
            id: task.id,
            name: task.name,
            description: task.description,
            icon: task.icon,
            dollarValue: task.dollarValue,
            position: task.position,
            isCompleted: completedTaskIds.has(task.id),
            completedAt: completion?.completedAt || null
          });
        }
      }

      if (tasks.length > 0) {
        routineData.push({
          id: routine.id,
          name: routine.name,
          tasks
        });
      }
    }

    // Get streak data
    let streakCount = 0;
    let bestStreak = 0;
    if (routines.length > 0) {
      const streakData = await Completion.getStreakData(userId, routines[0].id);
      streakCount = streakData.currentCount;
      bestStreak = streakData.bestCount;
    }

    // Get current balance
    const balance = await Completion.getBalance(userId);

    // Get recent balance transactions
    const transactionsResult = await query(
      `SELECT * FROM balance_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    const transactions = transactionsResult.rows.map(row => ({
      id: row.id,
      amount: parseFloat(row.amount),
      type: row.type,
      description: row.description,
      createdAt: row.created_at
    }));

    res.json({
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        avatar: user.avatar
      },
      routines: routineData,
      streak: {
        current: streakCount,
        best: bestStreak
      },
      balance: {
        current: balance,
        formatted: `$${balance.toFixed(2)}`
      },
      recentTransactions: transactions
    });
  } catch (err) {
    console.error('Error fetching member details:', err);
    res.status(500).json({ error: 'Failed to fetch member details' });
  }
});

module.exports = router;
