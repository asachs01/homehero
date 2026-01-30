/**
 * Missed Task Checker Job
 * Daily cron job to detect incomplete routine tasks from previous day
 * and notify parents about missed tasks
 */

const cron = require('node-cron');
const { getDb } = require('../db/pool');
const Notification = require('../models/Notification');

/**
 * Get yesterday's date as YYYY-MM-DD string
 * @returns {string} Yesterday's date
 */
function getYesterdayDate() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

/**
 * Check if a routine should have been active on a given day
 * @param {Object} routine - The routine object
 * @param {string} dateStr - The date to check (YYYY-MM-DD)
 * @returns {boolean} True if routine was scheduled for that day
 */
function wasRoutineScheduledForDate(routine, dateStr) {
  // Daily routines are always scheduled
  if (routine.scheduleType === 'daily') {
    return true;
  }

  // Weekly routines - check if day matches
  if (routine.scheduleType === 'weekly' && routine.scheduleDays) {
    const date = new Date(dateStr + 'T12:00:00'); // noon to avoid timezone issues
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

    // scheduleDays is an array like [0, 2, 4] for Sun, Tue, Thu
    return routine.scheduleDays.includes(dayOfWeek);
  }

  // Default: assume scheduled (for routines without schedule info)
  return true;
}

/**
 * Get all routines with their tasks and assigned users
 * @returns {Object[]} Array of routines with user and task info
 */
function getRoutinesWithAssignments() {
  const db = getDb();

  const routines = db.prepare(`
    SELECT
      r.id as routine_id,
      r.name as routine_name,
      r.schedule_type,
      r.schedule_days,
      r.assigned_user_id,
      r.household_id,
      u.name as user_name,
      u.role as user_role
    FROM routines r
    JOIN users u ON r.assigned_user_id = u.id
    WHERE r.assigned_user_id IS NOT NULL
  `).all();

  return routines.map(row => ({
    routineId: row.routine_id,
    routineName: row.routine_name,
    scheduleType: row.schedule_type,
    scheduleDays: row.schedule_days ? JSON.parse(row.schedule_days) : null,
    assignedUserId: row.assigned_user_id,
    householdId: row.household_id,
    userName: row.user_name,
    userRole: row.user_role
  }));
}

/**
 * Get tasks for a routine
 * @param {string} routineId - The routine UUID
 * @returns {Object[]} Array of tasks
 */
function getRoutineTasks(routineId) {
  const db = getDb();

  const tasks = db.prepare(`
    SELECT t.id, t.name
    FROM tasks t
    JOIN routine_tasks rt ON t.id = rt.task_id
    WHERE rt.routine_id = ?
    ORDER BY rt.sort_order
  `).all(routineId);

  return tasks;
}

/**
 * Get completed task IDs for a user on a specific date
 * @param {string} userId - The user UUID
 * @param {string} dateStr - The date (YYYY-MM-DD)
 * @returns {Set<string>} Set of completed task IDs
 */
function getCompletedTaskIds(userId, dateStr) {
  const db = getDb();

  const completions = db.prepare(`
    SELECT task_id
    FROM completions
    WHERE user_id = ? AND completion_date = ?
  `).all(userId, dateStr);

  return new Set(completions.map(c => c.task_id));
}

/**
 * Get all parent users in a household
 * @param {string} householdId - The household UUID
 * @returns {Object[]} Array of parent users
 */
function getParentsInHousehold(householdId) {
  const db = getDb();

  const parents = db.prepare(`
    SELECT id, name
    FROM users
    WHERE household_id = ? AND role = 'parent'
  `).all(householdId);

  return parents;
}

/**
 * Process missed task checks for all users with assigned routines
 * @returns {Promise<Object>} Summary of checks
 */
async function processMissedTasks() {
  const startTime = Date.now();
  const yesterday = getYesterdayDate();

  const results = {
    processed: 0,
    missedTasksFound: 0,
    notificationsSent: 0,
    errors: [],
    details: []
  };

  try {
    const routines = getRoutinesWithAssignments();
    console.log(`[MissedTaskChecker] Processing ${routines.length} assigned routines for ${yesterday}`);

    // Group by user and household for efficient processing
    const userRoutineMap = new Map();

    for (const routine of routines) {
      // Skip if routine wasn't scheduled for yesterday
      if (!wasRoutineScheduledForDate(routine, yesterday)) {
        continue;
      }

      const key = `${routine.assignedUserId}|${routine.householdId}`;
      if (!userRoutineMap.has(key)) {
        userRoutineMap.set(key, {
          userId: routine.assignedUserId,
          userName: routine.userName,
          userRole: routine.userRole,
          householdId: routine.householdId,
          routines: []
        });
      }
      userRoutineMap.get(key).routines.push(routine);
    }

    // Process each user
    for (const [, userData] of userRoutineMap) {
      try {
        // Skip parents - we only track children's missed tasks
        if (userData.userRole === 'parent') {
          continue;
        }

        const completedTaskIds = getCompletedTaskIds(userData.userId, yesterday);
        const missedByRoutine = [];

        // Check each routine for missed tasks
        for (const routine of userData.routines) {
          const routineTasks = getRoutineTasks(routine.routineId);
          const missedTasks = routineTasks.filter(task => !completedTaskIds.has(task.id));

          if (missedTasks.length > 0) {
            missedByRoutine.push({
              routineName: routine.routineName,
              missedCount: missedTasks.length,
              totalTasks: routineTasks.length,
              missedTasks: missedTasks.map(t => t.name)
            });
            results.missedTasksFound += missedTasks.length;
          }
        }

        results.processed++;

        // If there are missed tasks, notify parents
        if (missedByRoutine.length > 0) {
          const parents = getParentsInHousehold(userData.householdId);

          for (const missed of missedByRoutine) {
            const message = `${userData.userName} missed ${missed.missedCount} task${missed.missedCount > 1 ? 's' : ''} in ${missed.routineName} yesterday`;

            // Notify each parent
            for (const parent of parents) {
              try {
                Notification.create(parent.id, 'missed_tasks', message);
                results.notificationsSent++;
                console.log(`[MissedTaskChecker] Notified parent ${parent.name}: ${message}`);
              } catch (notifErr) {
                console.error(`[MissedTaskChecker] Failed to notify parent ${parent.id}:`, notifErr.message);
                results.errors.push({
                  type: 'notification',
                  parentId: parent.id,
                  error: notifErr.message
                });
              }
            }
          }

          results.details.push({
            userId: userData.userId,
            userName: userData.userName,
            missedRoutines: missedByRoutine
          });
        }
      } catch (userErr) {
        console.error(`[MissedTaskChecker] Error processing user ${userData.userId}:`, userErr.message);
        results.errors.push({
          type: 'user',
          userId: userData.userId,
          error: userErr.message
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[MissedTaskChecker] Completed in ${duration}ms. ` +
      `Processed: ${results.processed}, Missed tasks: ${results.missedTasksFound}, ` +
      `Notifications: ${results.notificationsSent}, Errors: ${results.errors.length}`
    );

    return results;
  } catch (err) {
    console.error('[MissedTaskChecker] Fatal error:', err);
    throw err;
  }
}

/**
 * Start the missed task checker cron job
 * Runs daily at 00:05 (5 minutes after midnight)
 * @param {string} schedule - Cron schedule expression (default: 5 minutes after midnight)
 * @returns {Object} The scheduled task
 */
function startMissedTaskChecker(schedule = '5 0 * * *') {
  console.log(`[MissedTaskChecker] Starting with schedule: ${schedule}`);

  const task = cron.schedule(schedule, async () => {
    console.log(`[MissedTaskChecker] Running at ${new Date().toISOString()}`);
    try {
      await processMissedTasks();
    } catch (err) {
      console.error('[MissedTaskChecker] Job failed:', err);
    }
  }, {
    scheduled: true,
    timezone: 'America/New_York' // Same timezone as streak calculator
  });

  return task;
}

/**
 * Stop the missed task checker cron job
 * @param {Object} task - The scheduled task to stop
 */
function stopMissedTaskChecker(task) {
  if (task) {
    task.stop();
    console.log('[MissedTaskChecker] Stopped');
  }
}

module.exports = {
  processMissedTasks,
  startMissedTaskChecker,
  stopMissedTaskChecker
};
