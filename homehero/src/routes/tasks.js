/**
 * Task routes
 * All endpoints require authentication. Non-GET require admin role.
 */

const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const User = require('../models/User');
const { validateTask, getIconData } = require('../validators/task');
const { requireAuth, requireAdmin } = require('../middleware/auth');

/**
 * Enrich a task object with icon data and user details
 * @param {Object} task - The task object
 * @returns {Object} Enriched task object
 */
function enrichTask(task) {
  const iconData = getIconData(task.icon);

  return {
    ...task,
    iconEmoji: iconData?.emoji || null,
    iconColor: iconData?.color || null
  };
}

/**
 * Enrich task with full user details for assigned users
 * @param {Object} task - The task object with assignedUsers as user IDs
 * @returns {Object} Enriched task with user details
 */
function enrichTaskWithUserDetails(task) {
  const enriched = enrichTask(task);

  // Convert assignedUsers from IDs to objects with id and name
  if (enriched.assignedUsers && Array.isArray(enriched.assignedUsers)) {
    enriched.assignedUsers = enriched.assignedUsers.map(userId => {
      const user = User.findById(userId);
      if (user) {
        return { id: user.id, name: user.name };
      }
      return { id: userId, name: null };
    });
  }

  return enriched;
}

/**
 * Validate that all user IDs exist and belong to the same household
 * @param {string[]} userIds - Array of user IDs to validate
 * @param {string} householdId - The household ID to check against
 * @returns {Object} { valid: boolean, invalidIds: string[], wrongHouseholdIds: string[] }
 */
function validateUsers(userIds, householdId) {
  const invalidIds = [];
  const wrongHouseholdIds = [];

  for (const userId of userIds) {
    const user = User.findById(userId);
    if (!user) {
      invalidIds.push(userId);
    } else if (user.householdId !== householdId) {
      wrongHouseholdIds.push(userId);
    }
  }

  return {
    valid: invalidIds.length === 0 && wrongHouseholdIds.length === 0,
    invalidIds,
    wrongHouseholdIds
  };
}

/**
 * POST /api/tasks
 * Create a new task (admin only)
 * Body: { name, description?, icon?, valueCents?, category?, assignedUsers? }
 */
router.post('/api/tasks', requireAuth, requireAdmin, async (req, res) => {
  try {
    const validation = validateTask(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    // Validate assigned users if provided
    if (req.body.assignedUsers && req.body.assignedUsers.length > 0) {
      const userValidation = validateUsers(req.body.assignedUsers, req.user.householdId);
      if (!userValidation.valid) {
        const errors = [];
        if (userValidation.invalidIds.length > 0) {
          errors.push(`Users not found: ${userValidation.invalidIds.join(', ')}`);
        }
        if (userValidation.wrongHouseholdIds.length > 0) {
          errors.push(`Users not in your household: ${userValidation.wrongHouseholdIds.join(', ')}`);
        }
        return res.status(400).json({
          error: 'Invalid assigned users',
          details: errors
        });
      }
    }

    const task = Task.create(req.user.householdId, req.body);
    const enrichedTask = enrichTaskWithUserDetails(task);

    res.status(201).json(enrichedTask);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * GET /api/tasks
 * List all tasks for the household
 * Query params: category?, userId?
 */
router.get('/api/tasks', requireAuth, async (req, res) => {
  try {
    const filters = {};

    if (req.query.category) {
      filters.category = req.query.category;
    }

    if (req.query.userId) {
      filters.userId = req.query.userId;
    }

    const tasks = Task.findAll(req.user.householdId, filters);
    const enrichedTasks = tasks.map(enrichTaskWithUserDetails);

    res.json(enrichedTasks);
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

/**
 * GET /api/tasks/:id
 * Get a single task by ID
 */
router.get('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const task = Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Verify task belongs to user's household
    if (task.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(enrichTaskWithUserDetails(task));
  } catch (err) {
    console.error('Error fetching task:', err);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

/**
 * PUT /api/tasks/:id
 * Update a task (admin only)
 * Body: { name?, description?, icon?, valueCents?, category?, assignedUsers? }
 */
router.put('/api/tasks/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Verify task exists and belongs to user's household
    const existingTask = Task.findById(req.params.id);

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (existingTask.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate update data
    const validation = validateTask(req.body, true);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    // Validate assigned users if provided
    if (req.body.assignedUsers && req.body.assignedUsers.length > 0) {
      const userValidation = validateUsers(req.body.assignedUsers, req.user.householdId);
      if (!userValidation.valid) {
        const errors = [];
        if (userValidation.invalidIds.length > 0) {
          errors.push(`Users not found: ${userValidation.invalidIds.join(', ')}`);
        }
        if (userValidation.wrongHouseholdIds.length > 0) {
          errors.push(`Users not in your household: ${userValidation.wrongHouseholdIds.join(', ')}`);
        }
        return res.status(400).json({
          error: 'Invalid assigned users',
          details: errors
        });
      }
    }

    const task = Task.update(req.params.id, req.body);
    const enrichedTask = enrichTaskWithUserDetails(task);

    res.json(enrichedTask);
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/**
 * DELETE /api/tasks/:id
 * Delete a task (admin only)
 */
router.delete('/api/tasks/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Verify task exists and belongs to user's household
    const householdId = Task.getHouseholdId(req.params.id);

    if (!householdId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    Task.delete(req.params.id);

    res.status(204).send();
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

/**
 * GET /api/tasks/user/:userId
 * Get tasks assigned to a specific user
 */
router.get('/api/tasks/user/:userId', requireAuth, async (req, res) => {
  try {
    const tasks = Task.getTasksForUser(req.params.userId);

    // Filter to only return tasks from user's household
    const filteredTasks = tasks.filter(task => task.householdId === req.user.householdId);
    const enrichedTasks = filteredTasks.map(enrichTaskWithUserDetails);

    res.json(enrichedTasks);
  } catch (err) {
    console.error('Error fetching user tasks:', err);
    res.status(500).json({ error: 'Failed to fetch user tasks' });
  }
});

/**
 * POST /api/tasks/:id/assign
 * Assign users to a task (admin only)
 * Body: { userIds: string[] }
 */
router.post('/api/tasks/:id/assign', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userIds } = req.body;

    // Validate request body
    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ error: 'userIds must be an array' });
    }

    if (userIds.length === 0) {
      return res.status(400).json({ error: 'userIds cannot be empty' });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const invalidFormat = userIds.filter(id => !uuidRegex.test(id));
    if (invalidFormat.length > 0) {
      return res.status(400).json({
        error: 'Invalid UUID format',
        details: invalidFormat
      });
    }

    // Verify task exists and belongs to user's household
    const task = Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate that all users exist and belong to the same household
    const userValidation = validateUsers(userIds, req.user.householdId);
    if (!userValidation.valid) {
      const errors = [];
      if (userValidation.invalidIds.length > 0) {
        errors.push(`Users not found: ${userValidation.invalidIds.join(', ')}`);
      }
      if (userValidation.wrongHouseholdIds.length > 0) {
        errors.push(`Users not in your household: ${userValidation.wrongHouseholdIds.join(', ')}`);
      }
      return res.status(400).json({
        error: 'Invalid users',
        details: errors
      });
    }

    // Get current assigned users and merge with new ones (avoiding duplicates)
    const currentAssigned = Task.getAssignedUsers(req.params.id);
    const allAssigned = [...new Set([...currentAssigned, ...userIds])];

    // Update assignments
    Task.assignUsers(req.params.id, allAssigned);

    // Return updated task
    const updatedTask = Task.findById(req.params.id);
    res.json(enrichTaskWithUserDetails(updatedTask));
  } catch (err) {
    console.error('Error assigning users to task:', err);
    res.status(500).json({ error: 'Failed to assign users to task' });
  }
});

/**
 * DELETE /api/tasks/:id/assign/:userId
 * Unassign a user from a task (admin only)
 */
router.delete('/api/tasks/:id/assign/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id: taskId, userId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    // Verify task exists and belongs to user's household
    const task = Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get current assignments and remove the specified user
    const currentAssigned = Task.getAssignedUsers(taskId);

    if (!currentAssigned.includes(userId)) {
      return res.status(404).json({ error: 'User is not assigned to this task' });
    }

    const newAssigned = currentAssigned.filter(id => id !== userId);

    // Update assignments
    Task.assignUsers(taskId, newAssigned);

    // Return updated task
    const updatedTask = Task.findById(taskId);
    res.json(enrichTaskWithUserDetails(updatedTask));
  } catch (err) {
    console.error('Error unassigning user from task:', err);
    res.status(500).json({ error: 'Failed to unassign user from task' });
  }
});

module.exports = router;
