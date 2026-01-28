/**
 * Routine validation utilities
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate routine creation/update data
 *
 * Rules:
 * - name: required, 1-255 chars
 * - assignedUserId: required, valid UUID
 * - tasks: optional array of { taskId, position }
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

  // Assigned user ID validation
  if (!isUpdate || data.assignedUserId !== undefined) {
    if (!data.assignedUserId && !isUpdate) {
      errors.push('assignedUserId is required');
    } else if (data.assignedUserId !== undefined) {
      if (typeof data.assignedUserId !== 'string') {
        errors.push('assignedUserId must be a string');
      } else if (!UUID_REGEX.test(data.assignedUserId)) {
        errors.push('assignedUserId must be a valid UUID');
      }
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

        if (task.position !== undefined && task.position !== null) {
          if (typeof task.position !== 'number' || !Number.isInteger(task.position)) {
            errors.push(`tasks[${index}].position must be an integer`);
          } else if (task.position < 0) {
            errors.push(`tasks[${index}].position must be >= 0`);
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
 * @param {Object} data - { taskId, position? }
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateAddTask(data) {
  const errors = [];

  if (!data.taskId) {
    errors.push('taskId is required');
  } else if (!UUID_REGEX.test(data.taskId)) {
    errors.push('taskId must be a valid UUID');
  }

  if (data.position !== undefined && data.position !== null) {
    if (typeof data.position !== 'number' || !Number.isInteger(data.position)) {
      errors.push('position must be an integer');
    } else if (data.position < 0) {
      errors.push('position must be >= 0');
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
