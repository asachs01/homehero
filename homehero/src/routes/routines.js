/**
 * Routine routes
 * All endpoints require authentication. Non-GET require admin role.
 */

const express = require('express');
const router = express.Router();
const Routine = require('../models/Routine');
const Task = require('../models/Task');
const User = require('../models/User');
const Household = require('../models/Household');
const { validateRoutine, validateTaskOrder, validateAddTask } = require('../validators/routine');
const { requireAuth, requireAdmin } = require('../middleware/auth');

/**
 * Enrich a routine with assigned user info
 * @param {Object} routine - The routine object
 * @returns {Object} Routine with assignedUser info
 */
function enrichRoutineWithUser(routine) {
  if (!routine) return routine;

  const enriched = { ...routine };

  if (routine.assignedUserId) {
    const user = User.findById(routine.assignedUserId);
    if (user) {
      enriched.assignedUser = {
        id: user.id,
        name: user.name
      };
    } else {
      enriched.assignedUser = null;
    }
  } else {
    enriched.assignedUser = null;
  }

  return enriched;
}

/**
 * POST /api/routines
 * Create a new routine (admin only)
 * Body: { name, scheduleType, scheduleDays?, assignedUserId?, tasks?: [{taskId, sortOrder}] }
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

    // Verify household exists (should always exist since we got householdId from auth)
    const household = Household.findById(req.user.householdId);
    if (!household) {
      return res.status(404).json({ error: 'Household not found' });
    }

    // Validate assigned user exists if provided
    if (req.body.assignedUserId) {
      const assignedUser = User.findById(req.body.assignedUserId);
      if (!assignedUser) {
        return res.status(400).json({ error: 'Assigned user not found' });
      }
      // Verify user belongs to the same household
      if (assignedUser.householdId !== req.user.householdId) {
        return res.status(400).json({ error: 'Assigned user must belong to the same household' });
      }
    }

    // Validate all tasks exist if provided
    if (req.body.tasks && req.body.tasks.length > 0) {
      for (const taskRef of req.body.tasks) {
        const task = Task.findById(taskRef.taskId);
        if (!task) {
          return res.status(400).json({ error: `Task not found: ${taskRef.taskId}` });
        }
        // Verify task belongs to the same household
        if (task.householdId !== req.user.householdId) {
          return res.status(400).json({ error: `Task ${taskRef.taskId} must belong to the same household` });
        }
      }
    }

    const routine = Routine.create(req.user.householdId, req.body);

    res.status(201).json(enrichRoutineWithUser(routine));
  } catch (err) {
    console.error('Error creating routine:', err);
    res.status(500).json({ error: 'Failed to create routine' });
  }
});

/**
 * GET /api/routines
 * List all routines for the household
 * Query params: userId? (filter by assigned_user_id)
 */
router.get('/api/routines', requireAuth, async (req, res) => {
  try {
    const userId = req.query.userId || req.query.assigned_user_id || null;
    const routines = Routine.findAll(req.user.householdId, userId);

    // Enrich each routine with assigned user info
    const enrichedRoutines = routines.map(routine => enrichRoutineWithUser(routine));

    res.json(enrichedRoutines);
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
    const routine = Routine.findById(req.params.id);

    if (!routine) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    // Verify routine belongs to user's household
    if (routine.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(enrichRoutineWithUser(routine));
  } catch (err) {
    console.error('Error fetching routine:', err);
    res.status(500).json({ error: 'Failed to fetch routine' });
  }
});

/**
 * PUT /api/routines/:id
 * Update a routine (admin only)
 * Body: { name?, scheduleType?, scheduleDays?, assignedUserId? }
 */
router.put('/api/routines/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Verify routine exists and belongs to user's household
    const existingRoutine = Routine.findById(req.params.id);

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

    // Validate assigned user exists if provided
    if (req.body.assignedUserId !== undefined && req.body.assignedUserId !== null) {
      const assignedUser = User.findById(req.body.assignedUserId);
      if (!assignedUser) {
        return res.status(400).json({ error: 'Assigned user not found' });
      }
      // Verify user belongs to the same household
      if (assignedUser.householdId !== req.user.householdId) {
        return res.status(400).json({ error: 'Assigned user must belong to the same household' });
      }
    }

    const routine = Routine.update(req.params.id, req.body);

    res.json(enrichRoutineWithUser(routine));
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
    const householdId = Routine.getHouseholdId(req.params.id);

    if (!householdId) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    if (householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    Routine.delete(req.params.id);

    res.status(204).send();
  } catch (err) {
    console.error('Error deleting routine:', err);
    res.status(500).json({ error: 'Failed to delete routine' });
  }
});

/**
 * POST /api/routines/:id/tasks
 * Add a task to a routine
 * Body: { taskId, sortOrder? }
 */
router.post('/api/routines/:id/tasks', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Verify routine exists and belongs to user's household
    const routine = Routine.findById(req.params.id);

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

    // Validate that the task exists
    const task = Task.findById(req.body.taskId);
    if (!task) {
      return res.status(400).json({ error: 'Task not found' });
    }

    // Verify task belongs to the same household
    if (task.householdId !== req.user.householdId) {
      return res.status(400).json({ error: 'Task must belong to the same household' });
    }

    // Use sortOrder from body (supports both sortOrder and position for backwards compatibility)
    const sortOrder = req.body.sortOrder !== undefined ? req.body.sortOrder : req.body.position;
    Routine.addTask(req.params.id, req.body.taskId, sortOrder);

    // Return updated routine with tasks
    const updatedRoutine = Routine.findById(req.params.id);
    res.status(201).json(enrichRoutineWithUser(updatedRoutine));
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
    const householdId = Routine.getHouseholdId(req.params.id);

    if (!householdId) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    if (householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const removed = Routine.removeTask(req.params.id, req.params.taskId);

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
 * Body: { taskIds: [taskId1, taskId2, ...] } or { taskOrder: [taskId1, taskId2, ...] }
 */
router.put('/api/routines/:id/tasks/reorder', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Verify routine exists and belongs to user's household
    const routine = Routine.findById(req.params.id);

    if (!routine) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    if (routine.householdId !== req.user.householdId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Support both taskIds and taskOrder for backwards compatibility
    const taskOrder = req.body.taskIds || req.body.taskOrder;

    // Validate task order
    const validation = validateTaskOrder(taskOrder);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    Routine.reorderTasks(req.params.id, taskOrder);

    // Return updated routine with tasks
    const updatedRoutine = Routine.findById(req.params.id);
    res.json(enrichRoutineWithUser(updatedRoutine));
  } catch (err) {
    console.error('Error reordering tasks:', err);
    res.status(500).json({ error: 'Failed to reorder tasks' });
  }
});

module.exports = router;
