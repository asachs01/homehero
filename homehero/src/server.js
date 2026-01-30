const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const { initialize } = require('./db/init');
const { testConnection, getPoolStatus } = require('./db/pool');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const routineRoutes = require('./routes/routines');
const onboardingRoutes = require('./routes/onboarding');
const dashboardRoutes = require('./routes/dashboard');
const balanceRoutes = require('./routes/balance');
const familyRoutes = require('./routes/family');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const { startStreakCalculator } = require('./jobs/streakCalculator');
const { startMissedTaskChecker } = require('./jobs/missedTaskChecker');
const { getStats: getCacheStats } = require('./middleware/cache');
const { generalLimiter, authLimiter, onboardingLimiter } = require('./middleware/rateLimit');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Home Assistant Ingress support
// Detect and store the ingress base path for frontend redirects
app.use((req, res, next) => {
  // X-Ingress-Path header is set by Home Assistant's ingress proxy
  const ingressPath = req.headers['x-ingress-path'] || '';
  req.ingressPath = ingressPath;
  // Make it available to templates/responses
  res.locals.ingressPath = ingressPath;
  next();
});

// CORS middleware configured for Home Assistant integration
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Response compression - compress all responses > 1KB
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    // Don't compress if client doesn't support it
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use default compression filter
    return compression.filter(req, res);
  }
}));

// JSON body parser
app.use(express.json());

// Trust proxy for accurate IP addresses (needed for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Request logging for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// General rate limiting for all API routes
app.use('/api/', generalLimiter);

// Stricter rate limiting for authentication endpoints
app.use('/api/auth/login', authLimiter);

// Rate limiting for onboarding endpoints
app.use('/api/onboarding/', onboardingLimiter);

// Static file serving for frontend
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Ingress info endpoint - returns the base path for frontend redirects
app.get('/api/ingress-info', (req, res) => {
  res.json({
    ingressPath: req.ingressPath || '',
    isIngress: !!req.headers['x-ingress-path']
  });
});

// Database status endpoint
app.get('/api/db/status', async (req, res) => {
  const connected = await testConnection();
  const poolStatus = getPoolStatus();

  res.json({
    connected,
    pool: poolStatus,
    timestamp: new Date().toISOString()
  });
});

// Cache status endpoint
app.get('/api/cache/status', (req, res) => {
  res.json({
    cache: getCacheStats(),
    timestamp: new Date().toISOString()
  });
});

// Auth routes
app.use(authRoutes);

// Task routes
app.use(taskRoutes);

// Routine routes
app.use(routineRoutes);

// Onboarding routes
app.use(onboardingRoutes);

// Dashboard routes
app.use(dashboardRoutes);

// Balance routes
app.use(balanceRoutes);

// Family dashboard routes
app.use(familyRoutes);

// Notification routes
app.use(notificationRoutes);

// Admin routes
app.use(adminRoutes);

// 404 handler for API routes (must be before error handler)
app.use('/api/*', notFoundHandler);

// Global error handling middleware (must be last)
app.use(errorHandler);

// Initialize database and start server
async function start() {
  try {
    const dbInitialized = await initialize();
    if (!dbInitialized) {
      console.warn('Warning: Database initialization failed, starting without database');
    }

    // Start cron jobs (only if database is initialized)
    if (dbInitialized) {
      // Streak calculator runs daily at midnight
      startStreakCalculator();
      console.log('Streak calculator job scheduled');

      // Missed task checker runs daily at 00:05 (after streak calculator)
      startMissedTaskChecker();
      console.log('Missed task checker job scheduled');
    }

    app.listen(PORT, () => {
      console.log(`HomeHero running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
