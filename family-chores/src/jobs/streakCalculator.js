/**
 * Streak Calculator Job
 * Daily cron job to recalculate streaks for all users and routines
 */

const cron = require('node-cron');
const Completion = require('../models/Completion');

/**
 * Process streak calculations for all user-routine pairs
 * @returns {Promise<Object>} Summary of streak calculations
 */
async function processStreaks() {
  const startTime = Date.now();
  const results = {
    processed: 0,
    streaksBroken: 0,
    milestonesAwarded: 0,
    errors: [],
    details: []
  };

  try {
    const pairs = await Completion.getAllUserRoutinePairs();
    console.log(`[StreakCalculator] Processing ${pairs.length} user-routine pairs`);

    for (const { userId, routineId } of pairs) {
      try {
        const result = await Completion.recalculateStreak(userId, routineId);
        results.processed++;

        if (result.streakBroken) {
          results.streaksBroken++;
          console.log(`[StreakCalculator] Streak broken for user ${userId}, routine ${routineId}`);
        }

        if (result.milestone) {
          results.milestonesAwarded++;
          console.log(
            `[StreakCalculator] Milestone awarded to user ${userId}: ` +
            `${result.milestone.label} ($${result.milestone.bonus.toFixed(2)})`
          );
        }

        results.details.push(result);
      } catch (err) {
        console.error(
          `[StreakCalculator] Error processing user ${userId}, routine ${routineId}:`,
          err.message
        );
        results.errors.push({
          userId,
          routineId,
          error: err.message
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[StreakCalculator] Completed in ${duration}ms. ` +
      `Processed: ${results.processed}, Broken: ${results.streaksBroken}, ` +
      `Milestones: ${results.milestonesAwarded}, Errors: ${results.errors.length}`
    );

    return results;
  } catch (err) {
    console.error('[StreakCalculator] Fatal error:', err);
    throw err;
  }
}

/**
 * Start the streak calculator cron job
 * Runs daily at midnight
 * @param {string} schedule - Cron schedule expression (default: midnight daily)
 * @returns {Object} The scheduled task
 */
function startStreakCalculator(schedule = '0 0 * * *') {
  console.log(`[StreakCalculator] Starting with schedule: ${schedule}`);

  const task = cron.schedule(schedule, async () => {
    console.log(`[StreakCalculator] Running at ${new Date().toISOString()}`);
    try {
      await processStreaks();
    } catch (err) {
      console.error('[StreakCalculator] Job failed:', err);
    }
  }, {
    scheduled: true,
    timezone: 'America/New_York' // Adjust timezone as needed
  });

  return task;
}

/**
 * Stop the streak calculator cron job
 * @param {Object} task - The scheduled task to stop
 */
function stopStreakCalculator(task) {
  if (task) {
    task.stop();
    console.log('[StreakCalculator] Stopped');
  }
}

module.exports = {
  processStreaks,
  startStreakCalculator,
  stopStreakCalculator
};
