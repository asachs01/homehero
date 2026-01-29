/**
 * Onboarding routes for family setup
 */

const express = require('express');
const router = express.Router();
const Household = require('../models/Household');
const User = require('../models/User');
const avatars = require('../data/avatars.json');
const { invalidateUserList } = require('../middleware/cache');

/**
 * POST /api/onboarding/household
 * Create a new household
 * Body: { name }
 */
router.post('/api/onboarding/household', async (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Household name is required' });
  }

  if (name.trim().length > 255) {
    return res.status(400).json({ error: 'Household name must be 255 characters or less' });
  }

  try {
    const household = await Household.create(name.trim());
    res.status(201).json(household);
  } catch (err) {
    console.error('Error creating household:', err);
    res.status(500).json({ error: 'Failed to create household' });
  }
});

/**
 * POST /api/onboarding/user
 * Add a user to a household
 * Body: { householdId, name, role, pin, avatar }
 */
router.post('/api/onboarding/user', async (req, res) => {
  const { householdId, name, role, pin, avatar } = req.body;

  // Validate required fields
  if (!householdId) {
    return res.status(400).json({ error: 'Household ID is required' });
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'User name is required' });
  }

  if (name.trim().length > 255) {
    return res.status(400).json({ error: 'User name must be 255 characters or less' });
  }

  if (!role || !['parent', 'child'].includes(role)) {
    return res.status(400).json({ error: 'Role must be "parent" or "child"' });
  }

  // PIN validation - required for parents, optional for children
  if (role === 'parent') {
    if (!pin || typeof pin !== 'string' || pin.length < 4 || pin.length > 6) {
      return res.status(400).json({ error: 'Parents require a PIN of 4-6 digits' });
    }
    if (!/^\d+$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must contain only digits' });
    }
  } else if (pin) {
    // Child has optional PIN
    if (typeof pin !== 'string' || pin.length < 4 || pin.length > 6) {
      return res.status(400).json({ error: 'PIN must be 4-6 digits' });
    }
    if (!/^\d+$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must contain only digits' });
    }
  }

  // Validate avatar if provided
  if (avatar && !avatars.find(a => a.id === avatar)) {
    return res.status(400).json({ error: 'Invalid avatar ID' });
  }

  try {
    // Verify household exists
    const household = await Household.findById(householdId);
    if (!household) {
      return res.status(404).json({ error: 'Household not found' });
    }

    const user = await User.create(householdId, {
      name: name.trim(),
      role,
      pin: pin || null,
      avatar: avatar || null
    });

    // Invalidate user list cache since a new user was added
    invalidateUserList();

    // Enrich with avatar data
    const avatarData = avatars.find(a => a.id === user.avatar) || null;

    res.status(201).json({
      ...user,
      avatarEmoji: avatarData?.emoji || null,
      avatarColor: avatarData?.color || null
    });
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * GET /api/onboarding/status
 * Check if onboarding is complete
 * Query: householdId (optional - uses first household if not provided)
 */
router.get('/api/onboarding/status', async (req, res) => {
  try {
    let householdId = req.query.householdId;

    // If no householdId provided, try to find the first household
    if (!householdId) {
      const household = await Household.findFirst();
      if (!household) {
        return res.json({
          hasHousehold: false,
          complete: false,
          hasAdmin: false,
          userCount: 0
        });
      }
      householdId = household.id;
    }

    const status = await Household.isOnboardingComplete(householdId);

    res.json({
      hasHousehold: true,
      householdId,
      ...status
    });
  } catch (err) {
    console.error('Error checking onboarding status:', err);
    res.status(500).json({ error: 'Failed to check onboarding status' });
  }
});

/**
 * GET /api/onboarding/household
 * Get the current household (first one for single-household setup)
 */
router.get('/api/onboarding/household', async (req, res) => {
  try {
    const household = await Household.findFirst();

    if (!household) {
      return res.status(404).json({ error: 'No household found' });
    }

    res.json(household);
  } catch (err) {
    console.error('Error fetching household:', err);
    res.status(500).json({ error: 'Failed to fetch household' });
  }
});

module.exports = router;
