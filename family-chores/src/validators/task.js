/**
 * Task validation utilities
 */

// Valid task types - must match database schema CHECK constraint
const VALID_TYPES = ['daily', 'weekly', 'one-time'];
const VALID_DAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Validate task creation/update data
 *
 * Rules:
 * - name: required, 1-255 chars
 * - type: required, enum ['routine', 'bonus']
 * - dollarValue: required if bonus, >= 0
 * - schedule: array of integers 0-6
 * - assignedUsers: array of valid user IDs (UUIDs)
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

  // Type validation
  if (!isUpdate || data.type !== undefined) {
    if (!data.type && !isUpdate) {
      errors.push('type is required');
    } else if (data.type !== undefined) {
      if (!VALID_TYPES.includes(data.type)) {
        errors.push(`type must be one of: ${VALID_TYPES.join(', ')}`);
      }
    }
  }

  // Dollar value validation
  if (data.dollarValue !== undefined) {
    const value = parseFloat(data.dollarValue);
    if (isNaN(value)) {
      errors.push('dollarValue must be a number');
    } else if (value < 0) {
      errors.push('dollarValue must be >= 0');
    }
  }

  // Dollar value required for bonus tasks
  if (data.type === 'bonus' && (data.dollarValue === undefined || data.dollarValue === null)) {
    errors.push('dollarValue is required for bonus tasks');
  }

  // Schedule validation
  if (data.schedule !== undefined) {
    if (!Array.isArray(data.schedule)) {
      errors.push('schedule must be an array');
    } else {
      const invalidDays = data.schedule.filter(day => !VALID_DAYS.includes(day));
      if (invalidDays.length > 0) {
        errors.push('schedule must contain only integers 0-6 (0=Sunday, 6=Saturday)');
      }
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

  // Icon validation (optional)
  if (data.icon !== undefined && data.icon !== null) {
    if (typeof data.icon !== 'string') {
      errors.push('icon must be a string');
    } else if (data.icon.length > 100) {
      errors.push('icon must be at most 100 characters');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateTask,
  VALID_TYPES,
  VALID_DAYS
};
