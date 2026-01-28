/**
 * Routine routes
 * All endpoints require authentication. Non-GET require admin role.
 */

const express = require('express');
const router = express.Router();
const Routine = require('../models/Routine');
const { validateRoutine, validateTaskOrder, validateAddTask } = require('../validators/routine');
const { requireAuth, requireAdmin } = require('../middleware/auth');

/**
 * POST /api/routines
 * Create a new routine (admin only)
 * Body: { name, assignedUserId, tasks?: [{taskId, position}] }
 */
router.post('/api/routines', requireAuth, requireAdmin, async (req, res) => {
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
 * GET /api/routines
 * List all routines for the household
 * Query params: userId?
 */
router.get('/api/routines', requireAuth, async (req, res) => {
  try {
    const userId = req.query.userId || null;
    const routines = await Routine.findAll(req.user.householdId, userId);

    res.json(routines);
  } catch (err) {
    console.error('Error fetching routines:', err);
    res.status(500).json({ error: 'Failed to fetch routines' });
  }
});

/**
 * GET /api/routines/:id
 * Get a single routine by ID with its tasks
 */
router.get('/api/routines/:id', requireAuth, async (req, res) => {
  try {
    const routine = await Routine.findById(req.params.id);

    if (!routine) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    // Verify routine belongs to user's household
    if (routine.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(routine);
  } catch (err) {
    console.error('Error fetching routine:', err);
    res.status(500).json({ error: 'Failed to fetch routine' });
  }
});

/**
 * PUT /api/routines/:id
 * Update a routine (admin only)
 * Body: { name?, assignedUserId? }
 */
router.put('/api/routines/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Verify routine exists and belongs to user's household
    const existingRoutine = await Routine.findById(req.params.id);

    if (!existingRoutine) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    if (existingRoutine.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate update data
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
 * DELETE /api/routines/:id
 * Delete a routine (admin only)
 */
router.delete('/api/routines/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Verify routine exists and belongs to user's household
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
 * POST /api/routines/:id/tasks
 * Add a task to a routine
 * Body: { taskId, position? }
 */
router.post('/api/routines/:id/tasks', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Verify routine exists and belongs to user's household
    const routine = await Routine.findById(req.params.id);

    if (!routine) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    if (routine.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate request body
    const validation = validateAddTask(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    await Routine.addTask(req.params.id, req.body.taskId, req.body.position);

    // Return updated routine with tasks
    const updatedRoutine = await Routine.findById(req.params.id);
    res.status(201).json(updatedRoutine);
  } catch (err) {
    console.error('Error adding task to routine:', err);
    res.status(500).json({ error: 'Failed to add task to routine' });
  }
});

/**
 * DELETE /api/routines/:id/tasks/:taskId
 * Remove a task from a routine
 */
router.delete('/api/routines/:id/tasks/:taskId', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Verify routine exists and belongs to user's household
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
 * PUT /api/routines/:id/tasks/reorder
 * Reorder tasks in a routine
 * Body: { taskOrder: [taskId1, taskId2, ...] }
 */
router.put('/api/routines/:id/tasks/reorder', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Verify routine exists and belongs to user's household
    const routine = await Routine.findById(req.params.id);

    if (!routine) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    if (routine.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate task order
    const { taskOrder } = req.body;
    const validation = validateTaskOrder(taskOrder);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    await Routine.reorderTasks(req.params.id, taskOrder);

    // Return updated routine with tasks
    const updatedRoutine = await Routine.findById(req.params.id);
    res.json(updatedRoutine);
  } catch (err) {
    console.error('Error reordering tasks:', err);
    res.status(500).json({ error: 'Failed to reorder tasks' });
  }
});

module.exports = router;
