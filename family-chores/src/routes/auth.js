/**
 * Authentication routes
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/pool');
const { verifyPin } = require('../utils/pin');
const { generateToken } = require('../auth/jwt');
const { requireAuth } = require('../middleware/auth');
const { cacheUserList } = require('../middleware/cache');
const avatars = require('../data/avatars.json');

/**
 * GET /api/users
 * List all users (id, name, avatar only) for login screen
 * Cached globally for 60 seconds
 */
router.get('/api/users', cacheUserList, async (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT id, name, avatar FROM users ORDER BY name').all();

    // Enrich with avatar data
    const users = rows.map(user => {
      const avatarData = avatars.find(a => a.id === user.avatar) || null;
      return {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        avatarEmoji: avatarData?.emoji || null,
        avatarColor: avatarData?.color || null
      };
    });

    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * GET /api/avatars
 * List all available avatars
 */
router.get('/api/avatars', (req, res) => {
  res.json(avatars);
});

/**
 * POST /api/auth/login
 * Authenticate user with PIN
 * Body: { userId, pin }
 * Returns: { token, user }
 */
router.post('/api/auth/login', async (req, res) => {
  const { userId, pin } = req.body;

  if (!userId || !pin) {
    return res.status(400).json({ error: 'User ID and PIN are required' });
  }

  try {
    const db = getDb();
    // Fetch user with PIN hash
    const user = db.prepare(
      'SELECT id, household_id, name, role, pin_hash, avatar FROM users WHERE id = ?'
    ).get(userId);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // If user has no PIN set, deny login
    if (!user.pin_hash) {
      return res.status(401).json({ error: 'PIN not set for this user' });
    }

    // Verify PIN
    const isValid = await verifyPin(pin, user.pin_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user);

    // Get avatar data
    const avatarData = avatars.find(a => a.id === user.avatar) || null;

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        householdId: user.household_id,
        avatar: user.avatar,
        avatarEmoji: avatarData?.emoji || null,
        avatarColor: avatarData?.color || null
      }
    });
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 * Requires: Authorization header with JWT
 */
router.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare(
      'SELECT id, household_id, name, role, avatar FROM users WHERE id = ?'
    ).get(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const avatarData = avatars.find(a => a.id === user.avatar) || null;

    res.json({
      id: user.id,
      name: user.name,
      role: user.role,
      householdId: user.household_id,
      avatar: user.avatar,
      avatarEmoji: avatarData?.emoji || null,
      avatarColor: avatarData?.color || null
    });
  } catch (err) {
    console.error('Error fetching current user:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

module.exports = router;
