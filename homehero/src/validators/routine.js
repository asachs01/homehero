/**
 * Routine validation utilities
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_SCHEDULE_TYPES = ['daily', 'weekly'];
const VALID_DAYS = [0, 1, 2, 3, 4, 5, 6]; // 0 = Sunday, 6 = Saturday

/**
 * Validate routine creation/update data
 *
 * Rules:
 * - name: required, 1-255 chars
 * - scheduleType: required, enum ['daily', 'weekly']
 * - scheduleDays: required if scheduleType is 'weekly', array of integers 0-6
 * - assignedUserId: optional, valid UUID
 * - tasks: optional array of { taskId, sortOrder }
 *
 * @param {Object} data - The routine data to validate
 * @param {boolean} isUpdate - Whether this is an update (makes fields optional)
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateRoutine(data, isUpdate = false) {
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

  // Schedule type validation
  if (!isUpdate || data.scheduleType !== undefined) {
    if (!data.scheduleType && !isUpdate) {
      errors.push('scheduleType is required');
    } else if (data.scheduleType !== undefined) {
      if (!VALID_SCHEDULE_TYPES.includes(data.scheduleType)) {
        errors.push(`scheduleType must be one of: ${VALID_SCHEDULE_TYPES.join(', ')}`);
      }
    }
  }

  // Schedule days validation (required for weekly schedules)
  if (data.scheduleType === 'weekly' || (!isUpdate && !data.scheduleType)) {
    if (data.scheduleDays !== undefined) {
      if (!Array.isArray(data.scheduleDays)) {
        errors.push('scheduleDays must be an array');
      } else if (data.scheduleDays.length === 0) {
        errors.push('scheduleDays must contain at least one day for weekly schedules');
      } else {
        const invalidDays = data.scheduleDays.filter(day => !VALID_DAYS.includes(day));
        if (invalidDays.length > 0) {
          errors.push('scheduleDays must contain only integers 0-6 (0=Sunday, 6=Saturday)');
        }
      }
    } else if (data.scheduleType === 'weekly' && !isUpdate) {
      errors.push('scheduleDays is required for weekly schedules');
    }
  }

  // Assigned user ID validation (optional)
  if (data.assignedUserId !== undefined && data.assignedUserId !== null) {
    if (typeof data.assignedUserId !== 'string') {
      errors.push('assignedUserId must be a string');
    } else if (!UUID_REGEX.test(data.assignedUserId)) {
      errors.push('assignedUserId must be a valid UUID');
    }
  }

  // Tasks validation (optional)
  if (data.tasks !== undefined) {
    if (!Array.isArray(data.tasks)) {
      errors.push('tasks must be an array');
    } else {
      data.tasks.forEach((task, index) => {
        if (!task.taskId) {
          errors.push(`tasks[${index}].taskId is required`);
        } else if (!UUID_REGEX.test(task.taskId)) {
          errors.push(`tasks[${index}].taskId must be a valid UUID`);
        }

        if (task.sortOrder !== undefined && task.sortOrder !== null) {
          if (typeof task.sortOrder !== 'number' || !Number.isInteger(task.sortOrder)) {
            errors.push(`tasks[${index}].sortOrder must be an integer`);
          } else if (task.sortOrder < 0) {
            errors.push(`tasks[${index}].sortOrder must be >= 0`);
          }
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate task order array for reordering
 *
 * @param {string[]} taskOrder - Array of task UUIDs
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateTaskOrder(taskOrder) {
  const errors = [];

  if (!Array.isArray(taskOrder)) {
    errors.push('taskOrder must be an array');
  } else {
    taskOrder.forEach((taskId, index) => {
      if (!UUID_REGEX.test(taskId)) {
        errors.push(`taskOrder[${index}] must be a valid UUID`);
      }
    });

    // Check for duplicates
    const uniqueIds = new Set(taskOrder);
    if (uniqueIds.size !== taskOrder.length) {
      errors.push('taskOrder must not contain duplicate task IDs');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate task addition to routine
 *
 * @param {Object} data - { taskId, sortOrder? }
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateAddTask(data) {
  const errors = [];

  if (!data.taskId) {
    errors.push('taskId is required');
  } else if (!UUID_REGEX.test(data.taskId)) {
    errors.push('taskId must be a valid UUID');
  }

  if (data.sortOrder !== undefined && data.sortOrder !== null) {
    if (typeof data.sortOrder !== 'number' || !Number.isInteger(data.sortOrder)) {
      errors.push('sortOrder must be an integer');
    } else if (data.sortOrder < 0) {
      errors.push('sortOrder must be >= 0');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateRoutine,
  validateTaskOrder,
  validateAddTask
};
