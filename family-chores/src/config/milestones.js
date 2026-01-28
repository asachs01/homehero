/**
 * Milestone configuration for streak rewards
 * Defines the thresholds and bonus amounts for streak milestones
 */

const MILESTONES = [
  { days: 7, bonus: 1.00, label: '1 Week' },
  { days: 14, bonus: 2.50, label: '2 Weeks' },
  { days: 30, bonus: 5.00, label: '1 Month' },
  { days: 60, bonus: 10.00, label: '2 Months' },
  { days: 90, bonus: 20.00, label: '3 Months' }
];

/**
 * Get milestone by day count
 * @param {number} days - The streak day count
 * @returns {Object|null} Milestone object or null if not a milestone
 */
function getMilestone(days) {
  return MILESTONES.find(m => m.days === days) || null;
}

/**
 * Check if a day count is a milestone
 * @param {number} days - The streak day count
 * @returns {boolean} True if the day count is a milestone
 */
function isMilestone(days) {
  return MILESTONES.some(m => m.days === days);
}

/**
 * Get all milestones up to a certain day count
 * @param {number} days - Maximum day count
 * @returns {Object[]} Array of milestones up to the day count
 */
function getMilestonesUpTo(days) {
  return MILESTONES.filter(m => m.days <= days);
}

/**
 * Get the next milestone after a given day count
 * @param {number} days - Current streak day count
 * @returns {Object|null} Next milestone or null if none remaining
 */
function getNextMilestone(days) {
  return MILESTONES.find(m => m.days > days) || null;
}

/**
 * Get all milestone thresholds
 * @returns {number[]} Array of milestone day thresholds
 */
function getMilestoneThresholds() {
  return MILESTONES.map(m => m.days);
}

module.exports = {
  MILESTONES,
  getMilestone,
  isMilestone,
  getMilestonesUpTo,
  getNextMilestone,
  getMilestoneThresholds
};
