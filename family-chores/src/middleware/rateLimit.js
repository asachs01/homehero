/**
 * Rate limiting middleware using express-rate-limit
 * Provides protection against brute force attacks and API abuse
 */

const rateLimit = require('express-rate-limit');

/**
 * Check if running in test mode
 * @returns {boolean}
 */
const isTestMode = () => process.env.NODE_ENV === 'test';

/**
 * Get rate limit multiplier for test mode
 * In test mode, limits are increased 100x to allow E2E tests to run without hitting limits
 */
const getTestMultiplier = () => isTestMode() ? 100 : 1;

/**
 * Normalize IP address for rate limiting
 * - Extracts IP from request
 * - Converts IPv4-mapped IPv6 addresses (::ffff:x.x.x.x) to regular IPv4
 * - Provides fallback for undefined IPs
 * @param {Object} req - Express request object
 * @returns {string} Normalized IP address
 */
const normalizeIp = (req) => {
  let ip = req.ip || req.connection?.remoteAddress || 'unknown';
  // Normalize IPv4-mapped IPv6 addresses
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  return ip;
};

/**
 * General API rate limiter
 * Limits: 100 requests per 15 minutes per IP (10000 in test mode)
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100 * getTestMultiplier(),
  standardHeaders: 'draft-7', // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the rate limit. Please try again later.',
    retryAfter: 15 * 60 // seconds
  },
  // Skip rate limiting for health and status endpoints
  skip: (req) => {
    const skipPaths = ['/api/health', '/api/db/status', '/api/cache/status'];
    return skipPaths.includes(req.path);
  },
  // Use normalized IP address as the key
  keyGenerator: (req) => normalizeIp(req),
  // Handler for when rate limit is exceeded
  handler: (req, res, next, options) => {
    console.warn(`Rate limit exceeded for IP: ${req.ip}, path: ${req.path}`);
    res.status(429).json(options.message);
  }
});

/**
 * Strict rate limiter for authentication endpoints
 * Limits: 5 attempts per minute per IP (500 in test mode)
 * Helps prevent brute force PIN attacks
 */
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 5 * getTestMultiplier(),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts',
    message: 'Too many login attempts. Please wait a minute before trying again.',
    retryAfter: 60 // seconds
  },
  keyGenerator: (req) => normalizeIp(req),
  handler: (req, res, next, options) => {
    console.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json(options.message);
  }
});

/**
 * Rate limiter for onboarding endpoints
 * Limits: 10 requests per minute per IP (1000 in test mode)
 * Prevents abuse during household setup
 */
const onboardingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 10 * getTestMultiplier(),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Too many onboarding requests. Please slow down.',
    retryAfter: 60
  },
  keyGenerator: (req) => normalizeIp(req),
  handler: (req, res, next, options) => {
    console.warn(`Onboarding rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json(options.message);
  }
});

/**
 * Rate limiter for write operations (POST, PUT, DELETE)
 * Limits: 30 requests per minute per IP (3000 in test mode)
 */
const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 30 * getTestMultiplier(),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many write operations',
    message: 'You are making too many changes. Please slow down.',
    retryAfter: 60
  },
  // Only apply to write methods
  skip: (req) => {
    return req.method === 'GET';
  },
  keyGenerator: (req) => normalizeIp(req),
  handler: (req, res, next, options) => {
    console.warn(`Write rate limit exceeded for IP: ${req.ip}, method: ${req.method}`);
    res.status(429).json(options.message);
  }
});

module.exports = {
  generalLimiter,
  authLimiter,
  onboardingLimiter,
  writeLimiter
};
