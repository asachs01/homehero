/**
 * JWT utilities for token generation and verification
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Secret management: use env var, or generate and persist a random secret
function getJwtSecret() {
  // 1. Check environment variable first
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  // 2. For development/testing, use a consistent dev secret
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    console.warn('JWT: Using development secret. Set JWT_SECRET in production.');
    return 'dev-secret-for-testing-only';
  }

  // 3. In production, generate and persist a random secret
  const dataDir = process.env.DATA_DIR || '/data';
  const secretPath = path.join(dataDir, '.jwt-secret');

  try {
    // Try to read existing secret
    if (fs.existsSync(secretPath)) {
      const secret = fs.readFileSync(secretPath, 'utf8').trim();
      if (secret.length >= 32) {
        return secret;
      }
    }

    // Generate new secret
    const newSecret = crypto.randomBytes(64).toString('hex');

    // Ensure directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Save secret (readable only by owner)
    fs.writeFileSync(secretPath, newSecret, { mode: 0o600 });
    console.log('JWT: Generated and persisted new secret');
    return newSecret;
  } catch (err) {
    // Fallback for environments without persistent storage
    console.warn('JWT: Could not persist secret, generating ephemeral one');
    return crypto.randomBytes(64).toString('hex');
  }
}

const JWT_SECRET = getJwtSecret();
const TOKEN_EXPIRY = '24h';

/**
 * Generate a JWT token for a user
 * @param {Object} user - User object with id, role, and household_id
 * @returns {string} JWT token
 */
function generateToken(user) {
  const payload = {
    userId: user.id,
    role: user.role,
    householdId: user.household_id
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded payload or null if invalid
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = {
  generateToken,
  verifyToken
};
