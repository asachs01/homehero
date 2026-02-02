/**
 * Admin routes for parent management controls
 * All endpoints require authentication and admin (parent) role
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Task = require('../models/Task');
const Routine = require('../models/Routine');
const { validateTask } = require('../validators/task');
const { validateRoutine } = require('../validators/routine');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// All admin routes require authentication and admin role
router.use(requireAuth);
router.use(requireAdmin);

// ===================
// USER MANAGEMENT
// ===================

/**
 * GET /api/admin/users
 * List all users in the household
 */
router.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.findByHousehold(req.user.householdId);
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * POST /api/admin/users
 * Create a new user in the household
 * Body: { name, role, pin?, avatar? }
 */
router.post('/api/admin/users', async (req, res) => {
  try {
    const { name, role, pin, avatar } = req.body;

    // Validate required fields
    const errors = [];
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      errors.push('name is required');
    } else if (name.length > 255) {
      errors.push('name must be at most 255 characters');
    }

    if (!role || !['parent', 'child'].includes(role)) {
      errors.push('role must be "parent" or "child"');
    }

    if (pin !== undefined && pin !== null) {
      if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
        errors.push('pin must be a 4-6 digit string');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    const user = await User.create(req.user.householdId, {
      name: name.trim(),
      role,
      pin,
      avatar
    });

    res.status(201).json(user);
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * PUT /api/admin/users/:id
 * Update a user
 * Body: { name?, role?, pin?, avatar? }
 */
router.put('/api/admin/users/:id', async (req, res) => {
  try {
    // Verify user exists and belongs to household
    const existingUser = await User.findById(req.params.id);

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (existingUser.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, role, pin, avatar } = req.body;
    const errors = [];

    // Validate fields if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        errors.push('name must be a non-empty string');
      } else if (name.length > 255) {
        errors.push('name must be at most 255 characters');
      }
    }

    if (role !== undefined && !['parent', 'child'].includes(role)) {
      errors.push('role must be "parent" or "child"');
    }

    if (pin !== undefined && pin !== null && pin !== '') {
      if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
        errors.push('pin must be a 4-6 digit string');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (role !== undefined) updateData.role = role;
    if (pin !== undefined) updateData.pin = pin === '' ? null : pin;
    if (avatar !== undefined) updateData.avatar = avatar;

    const user = await User.update(req.params.id, updateData);
    res.json(user);
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user
 */
router.delete('/api/admin/users/:id', async (req, res) => {
  try {
    // Verify user exists and belongs to household
    const existingUser = await User.findById(req.params.id);

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (existingUser.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Prevent deleting yourself
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await User.delete(req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ===================
// TASK MANAGEMENT
// ===================

/**
 * GET /api/admin/tasks
 * List all tasks in the household
 */
router.get('/api/admin/tasks', async (req, res) => {
  try {
    const tasks = await Task.findAll(req.user.householdId);
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

/**
 * POST /api/admin/tasks
 * Create a new task
 * Body: { name, description?, icon?, valueCents?, category?, assignedUsers? }
 */
router.post('/api/admin/tasks', async (req, res) => {
  try {
    const validation = validateTask(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const task = await Task.create(req.user.householdId, req.body);
    res.status(201).json(task);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create task', details: err.message });
  }
});

/**
 * PUT /api/admin/tasks/:id
 * Update a task
 * Body: { name?, description?, icon?, valueCents?, category?, assignedUsers? }
 */
router.put('/api/admin/tasks/:id', async (req, res) => {
  try {
    // Verify task exists and belongs to household
    const existingTask = await Task.findById(req.params.id);

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (existingTask.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const validation = validateTask(req.body, true);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const task = await Task.update(req.params.id, req.body);
    res.json(task);
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(500).json({ error: 'Failed to update task', details: err.message });
  }
});

/**
 * DELETE /api/admin/tasks/:id
 * Delete a task
 */
router.delete('/api/admin/tasks/:id', async (req, res) => {
  try {
    const householdId = await Task.getHouseholdId(req.params.id);

    if (!householdId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await Task.delete(req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// ===================
// ROUTINE MANAGEMENT
// ===================

/**
 * GET /api/admin/routines
 * List all routines in the household
 */
router.get('/api/admin/routines', async (req, res) => {
  try {
    const routines = await Routine.findAll(req.user.householdId);
    res.json(routines);
  } catch (err) {
    console.error('Error fetching routines:', err);
    res.status(500).json({ error: 'Failed to fetch routines' });
  }
});

/**
 * POST /api/admin/routines
 * Create a new routine
 * Body: { name, assignedUserId, tasks?: [{taskId, position}] }
 */
router.post('/api/admin/routines', async (req, res) => {
  try {
    const validation = validateRoutine(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const routine = await Routine.create(req.user.householdId, req.body);
    res.status(201).json(routine);
  } catch (err) {
    console.error('Error creating routine:', err);
    res.status(500).json({ error: 'Failed to create routine' });
  }
});

/**
 * PUT /api/admin/routines/:id
 * Update a routine
 * Body: { name?, assignedUserId? }
 */
router.put('/api/admin/routines/:id', async (req, res) => {
  try {
    const existingRoutine = await Routine.findById(req.params.id);

    if (!existingRoutine) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    if (existingRoutine.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const validation = validateRoutine(req.body, true);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const routine = await Routine.update(req.params.id, req.body);
    res.json(routine);
  } catch (err) {
    console.error('Error updating routine:', err);
    res.status(500).json({ error: 'Failed to update routine' });
  }
});

/**
 * DELETE /api/admin/routines/:id
 * Delete a routine
 */
router.delete('/api/admin/routines/:id', async (req, res) => {
  try {
    const householdId = await Routine.getHouseholdId(req.params.id);

    if (!householdId) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    if (householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await Routine.delete(req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting routine:', err);
    res.status(500).json({ error: 'Failed to delete routine' });
  }
});

/**
 * POST /api/admin/routines/:id/tasks
 * Add a task to a routine
 * Body: { taskId, position? }
 */
router.post('/api/admin/routines/:id/tasks', async (req, res) => {
  try {
    const routine = await Routine.findById(req.params.id);

    if (!routine) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    if (routine.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { taskId, position } = req.body;
    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }

    await Routine.addTask(req.params.id, taskId, position);
    const updatedRoutine = await Routine.findById(req.params.id);
    res.status(201).json(updatedRoutine);
  } catch (err) {
    console.error('Error adding task to routine:', err);
    res.status(500).json({ error: 'Failed to add task to routine' });
  }
});

/**
 * DELETE /api/admin/routines/:id/tasks/:taskId
 * Remove a task from a routine
 */
router.delete('/api/admin/routines/:id/tasks/:taskId', async (req, res) => {
  try {
    const householdId = await Routine.getHouseholdId(req.params.id);

    if (!householdId) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    if (householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const removed = await Routine.removeTask(req.params.id, req.params.taskId);

    if (!removed) {
      return res.status(404).json({ error: 'Task not found in routine' });
    }

    res.status(204).send();
  } catch (err) {
    console.error('Error removing task from routine:', err);
    res.status(500).json({ error: 'Failed to remove task from routine' });
  }
});

/**
 * PUT /api/admin/routines/:id/tasks/reorder
 * Reorder tasks in a routine
 * Body: { taskOrder: [taskId1, taskId2, ...] }
 */
router.put('/api/admin/routines/:id/tasks/reorder', async (req, res) => {
  try {
    const routine = await Routine.findById(req.params.id);

    if (!routine) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    if (routine.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { taskOrder } = req.body;
    if (!Array.isArray(taskOrder)) {
      return res.status(400).json({ error: 'taskOrder must be an array' });
    }

    await Routine.reorderTasks(req.params.id, taskOrder);
    const updatedRoutine = await Routine.findById(req.params.id);
    res.json(updatedRoutine);
  } catch (err) {
    console.error('Error reordering tasks:', err);
    res.status(500).json({ error: 'Failed to reorder tasks' });
  }
});

module.exports = router;
