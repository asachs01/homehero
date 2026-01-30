/**
 * Daily Digest Job
 * Generates daily summary notifications for parents
 * Runs at 7 AM daily
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
 * Get all households with their parents
 * @returns {Object[]} Array of households with parent info
 */
function getHouseholdsWithParents() {
  const db = getDb();

  const households = db.prepare(`
    SELECT DISTINCT h.id as household_id, h.name as household_name
    FROM households h
    JOIN users u ON h.id = u.household_id
    WHERE u.role = 'parent'
  `).all();

  return households.map(row => ({
    householdId: row.household_id,
    householdName: row.household_name
  }));
}

/**
 * Get all parents in a household
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
 * Get all children in a household
 * @param {string} householdId - The household UUID
 * @returns {Object[]} Array of child users
 */
function getChildrenInHousehold(householdId) {
  const db = getDb();

  const children = db.prepare(`
    SELECT id, name
    FROM users
    WHERE household_id = ? AND role = 'child'
  `).all(householdId);

  return children;
}

/**
 * Get task completion stats for a household on a specific date
 * @param {string} householdId - The household UUID
 * @param {string} dateStr - The date (YYYY-MM-DD)
 * @returns {Object} Completion statistics
 */
function getCompletionStats(householdId, dateStr) {
  const db = getDb();

  // Get total tasks completed by children in this household
  const completedRow = db.prepare(`
    SELECT COUNT(*) as count
    FROM completions c
    JOIN users u ON c.user_id = u.id
    WHERE u.household_id = ?
      AND u.role = 'child'
      AND c.completion_date = ?
  `).get(householdId, dateStr);

  const completed = parseInt(completedRow.count) || 0;

  // Get total expected tasks (tasks in routines that were scheduled for that day)
  // This is an approximation - we count routine tasks assigned to children
  const expectedRow = db.prepare(`
    SELECT COUNT(DISTINCT rt.task_id) as count
    FROM routine_tasks rt
    JOIN routines r ON rt.routine_id = r.id
    JOIN users u ON r.assigned_user_id = u.id
    WHERE u.household_id = ?
      AND u.role = 'child'
  `).get(householdId);

  const expected = parseInt(expectedRow.count) || 0;

  // Calculate missed as difference (if we have expected tasks)
  const missed = expected > 0 ? Math.max(0, expected - completed) : 0;

  return {
    completed,
    missed
  };
}

/**
 * Get notable streak updates for children in a household
 * @param {string} householdId - The household UUID
 * @returns {Object[]} Array of notable streak info
 */
function getNotableStreaks(householdId) {
  const db = getDb();

  // Get streaks >= 7 days for children in this household
  const streaks = db.prepare(`
    SELECT
      u.name as user_name,
      s.current_count,
      r.name as routine_name
    FROM streaks s
    JOIN users u ON s.user_id = u.id
    JOIN routines r ON s.routine_id = r.id
    WHERE u.household_id = ?
      AND u.role = 'child'
      AND s.current_count >= 7
    ORDER BY s.current_count DESC
    LIMIT 3
  `).all(householdId);

  return streaks.map(row => ({
    userName: row.user_name,
    streakCount: row.current_count,
    routineName: row.routine_name
  }));
}

/**
 * Build the digest message for a household
 * @param {Object} stats - Completion statistics
 * @param {Object[]} streaks - Notable streak updates
 * @returns {string} The formatted digest message
 */
function buildDigestMessage(stats, streaks) {
  const parts = [];

  // Task completion summary
  if (stats.completed > 0 || stats.missed > 0) {
    let taskSummary = `Yesterday: ${stats.completed} task${stats.completed !== 1 ? 's' : ''} completed`;
    if (stats.missed > 0) {
      taskSummary += `, ${stats.missed} missed`;
    }
    parts.push(taskSummary + '.');
  } else {
    parts.push('Yesterday: No task activity recorded.');
  }

  // Add notable streak info (highlight the best one)
  if (streaks.length > 0) {
    const best = streaks[0];
    parts.push(`${best.userName} is on a ${best.streakCount}-day streak!`);
  }

  return parts.join(' ');
}

/**
 * Process daily digest for all households
 * @returns {Promise<Object>} Summary of digest processing
 */
async function processDailyDigest() {
  const startTime = Date.now();
  const yesterday = getYesterdayDate();

  const results = {
    householdsProcessed: 0,
    notificationsSent: 0,
    skipped: 0,
    errors: [],
    details: []
  };

  try {
    const households = getHouseholdsWithParents();
    console.log(`[DailyDigest] Processing ${households.length} households for ${yesterday}`);

    for (const household of households) {
      try {
        // Get children - skip households with no children
        const children = getChildrenInHousehold(household.householdId);
        if (children.length === 0) {
          results.skipped++;
          continue;
        }

        // Get completion stats for yesterday
        const stats = getCompletionStats(household.householdId, yesterday);

        // Get notable streaks
        const streaks = getNotableStreaks(household.householdId);

        // Build the digest message
        const message = buildDigestMessage(stats, streaks);

        // Get parents and send notifications
        const parents = getParentsInHousehold(household.householdId);

        for (const parent of parents) {
          try {
            Notification.create(parent.id, 'system', message);
            results.notificationsSent++;
            console.log(`[DailyDigest] Sent to ${parent.name}: ${message}`);
          } catch (notifErr) {
            console.error(`[DailyDigest] Failed to notify parent ${parent.id}:`, notifErr.message);
            results.errors.push({
              type: 'notification',
              parentId: parent.id,
              error: notifErr.message
            });
          }
        }

        results.householdsProcessed++;
        results.details.push({
          householdId: household.householdId,
          householdName: household.householdName,
          stats,
          streaks: streaks.length,
          message
        });

      } catch (householdErr) {
        console.error(`[DailyDigest] Error processing household ${household.householdId}:`, householdErr.message);
        results.errors.push({
          type: 'household',
          householdId: household.householdId,
          error: householdErr.message
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[DailyDigest] Completed in ${duration}ms. ` +
      `Households: ${results.householdsProcessed}, Skipped: ${results.skipped}, ` +
      `Notifications: ${results.notificationsSent}, Errors: ${results.errors.length}`
    );

    return results;
  } catch (err) {
    console.error('[DailyDigest] Fatal error:', err);
    throw err;
  }
}

/**
 * Start the daily digest cron job
 * Runs daily at 7 AM
 * @param {string} schedule - Cron schedule expression (default: 7 AM daily)
 * @returns {Object} The scheduled task
 */
function startDailyDigest(schedule = '0 7 * * *') {
  console.log(`[DailyDigest] Starting with schedule: ${schedule}`);

  const task = cron.schedule(schedule, async () => {
    console.log(`[DailyDigest] Running at ${new Date().toISOString()}`);
    try {
      await processDailyDigest();
    } catch (err) {
      console.error('[DailyDigest] Job failed:', err);
    }
  }, {
    scheduled: true,
    timezone: 'America/New_York' // Same timezone as other jobs
  });

  return task;
}

/**
 * Stop the daily digest cron job
 * @param {Object} task - The scheduled task to stop
 */
function stopDailyDigest(task) {
  if (task) {
    task.stop();
    console.log('[DailyDigest] Stopped');
  }
}

module.exports = {
  processDailyDigest,
  startDailyDigest,
  stopDailyDigest
};
