/**
 * Task validation utilities
 */

const taskIcons = require('../data/task-icons.json');

// Create a set of valid icon IDs for quick lookup
const validIconIds = new Set(taskIcons.map(icon => icon.id));

/**
 * Check if an icon ID is valid
 * @param {string} iconId - The icon ID to validate
 * @returns {boolean} True if valid, false otherwise
 */
function isValidIcon(iconId) {
  return validIconIds.has(iconId);
}

/**
 * Get icon data by ID
 * @param {string} iconId - The icon ID
 * @returns {Object|null} The icon data or null if not found
 */
function getIconData(iconId) {
  if (!iconId) return null;
  return taskIcons.find(icon => icon.id === iconId) || null;
}

/**
 * Validate task creation/update data
 *
 * Rules:
 * - name: required, 1-255 chars
 * - valueCents: optional, integer >= 0
 * - category: optional, string
 * - assignedUsers: array of valid user IDs (UUIDs)
 * - icon: optional, must be valid icon ID from task-icons.json
 *
 * @param {Object} data - The task data to validate
 * @param {boolean} isUpdate - Whether this is an update (makes fields optional)
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateTask(data, isUpdate = false) {
  const errors = [];

  // Name validation
  if (!isUpdate || data.name !== undefined) {
    if (!data.name && !isUpdate) {
      errors.push('name is required');
    } else if (data.name !== undefined) {
      if (typeof data.name !== 'string') {
        errors.push('name must be a string');
      } else if (data.name.length < 1 || data.name.length > 255) {
        errors.push('name must be between 1 and 255 characters');
      }
    }
  }

  // Value cents validation (optional)
  if (data.valueCents !== undefined) {
    const value = parseInt(data.valueCents, 10);
    if (isNaN(value)) {
      errors.push('valueCents must be an integer');
    } else if (value < 0) {
      errors.push('valueCents must be >= 0');
    }
  }

  // Category validation (optional)
  if (data.category !== undefined && data.category !== null) {
    if (typeof data.category !== 'string') {
      errors.push('category must be a string');
    } else if (data.category.length > 100) {
      errors.push('category must be at most 100 characters');
    }
  }

  // Assigned users validation
  if (data.assignedUsers !== undefined) {
    if (!Array.isArray(data.assignedUsers)) {
      errors.push('assignedUsers must be an array');
    } else {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const invalidIds = data.assignedUsers.filter(id => !uuidRegex.test(id));
      if (invalidIds.length > 0) {
        errors.push('assignedUsers must contain valid UUIDs');
      }
    }
  }

  // Description validation (optional)
  if (data.description !== undefined && data.description !== null) {
    if (typeof data.description !== 'string') {
      errors.push('description must be a string');
    }
  }

  // Icon validation (optional but must be valid if provided)
  if (data.icon !== undefined && data.icon !== null) {
    if (typeof data.icon !== 'string') {
      errors.push('icon must be a string');
    } else if (!isValidIcon(data.icon)) {
      errors.push(`icon '${data.icon}' is not a valid icon ID`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateTask,
  isValidIcon,
  getIconData
};
