const express = require('express');
const cors = require('cors');
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
const { startStreakCalculator } = require('./jobs/streakCalculator');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS middleware configured for Home Assistant integration
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// JSON body parser
app.use(express.json());

// Static file serving for frontend
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Initialize database and start server
async function start() {
  try {
    const dbInitialized = await initialize();
    if (!dbInitialized) {
      console.warn('Warning: Database initialization failed, starting without database');
    }

    // Start the streak calculator cron job (runs daily at midnight)
    if (dbInitialized) {
      startStreakCalculator();
      console.log('Streak calculator job scheduled');
    }

    app.listen(PORT, () => {
      console.log(`Family Household Manager running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
