# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-01-29

### Changed
- **Rebranded to HomeHero** - New name, new icon (trophy), catchier identity
- Add Home Assistant ingress support for sidebar integration
- Smart index page that redirects based on auth/onboarding status

### Fixed
- Fix s6-overlay initialization error by using plain bash shebang instead of with-contenv bashio (config has `init: false` which disables s6-overlay)
- Remove explicit ENTRYPOINT from Dockerfile

### Added
- Added build.yaml for Home Assistant local add-on builds
- Added icon.svg, icon.png, and logo.png for add-on branding
- Performance optimizations for improved response times and reduced database load
  - In-memory cache middleware (`src/middleware/cache.js`)
    - Simple TTL-based cache with automatic expiration
    - Dashboard data cached for 30 seconds per user
    - Family dashboard cached for 30 seconds per household
    - User list cached globally for 60 seconds
    - Automatic cache invalidation on mutations (complete task, undo, vacation mode, sick day)
    - Cache statistics endpoint at `GET /api/cache/status`
    - Periodic cleanup of expired entries (every 5 minutes)
  - Response compression middleware using `compression` package
    - Compresses all API responses larger than 1KB
    - Supports gzip and deflate encoding
  - Additional database performance indexes in schema
    - `idx_tasks_household_type` - composite index for bonus tasks query
    - `idx_completions_task_date` - composite index for task completion checks
    - `idx_routines_household_user` - composite index for routine lookups
    - `idx_streaks_user_routine` - composite index for streak data retrieval
    - `idx_users_name` - index for user list ordering
    - `idx_balance_transactions_user_created` - composite index for transaction pagination
  - Frontend performance optimizations in all HTML files
    - Added `preconnect` and `dns-prefetch` hints for API endpoints
    - Minified inline CSS in index.html and login.html
- In-app notification system for user engagement and feedback
  - Notification model (`src/models/Notification.js`) with full CRUD operations
    - `Notification.create(userId, type, message)` - create new notification
    - `Notification.findByUser(userId, options)` - paginated notification list
    - `Notification.markAsRead(id)` - mark single notification as read
    - `Notification.markAllAsRead(userId)` - mark all user notifications as read
    - `Notification.getUnreadCount(userId)` - get unread notification count
    - `Notification.deleteOld(daysOld)` - cleanup old notifications
  - Notification routes (`src/routes/notifications.js`) with authentication
    - `GET /api/notifications` - list notifications with pagination
    - `POST /api/notifications/:id/read` - mark notification as read
    - `POST /api/notifications/read-all` - mark all notifications as read
    - `GET /api/notifications/unread-count` - get unread count
  - Notification types: task_complete, streak_milestone, streak_broken, balance_update, system
  - Automatic notification triggers on task completion and streak milestones
  - Dashboard notification UI components
    - Notification bell icon with unread count badge
    - Dropdown list of notifications with read/unread styling
    - Toast notifications for new items with auto-dismiss
    - Mobile-responsive design
  - Background polling for new notifications (30-second interval)
- Database schema update for notifications table with indexes
- Balance model (`src/models/Balance.js`) for comprehensive balance and earnings management
  - `Balance.get(userId)` - retrieve current balance for a user
  - `Balance.add(userId, amount, type, description)` - add transaction (earned, adjustment, bonus)
  - `Balance.deduct(userId, amount, type, description)` - deduct funds (spent, payout, adjustment)
  - `Balance.getTransactions(userId, options)` - list transactions with pagination and filtering
  - `Balance.getMonthlyTotal(userId, month, year)` - monthly earnings summary
  - `Balance.getSummary(userId, startDate, endDate)` - earnings summary for date range
  - `Balance.recordPayout(userId, amount, description)` - convenience method for payouts
  - `Balance.reverse(userId, amount, description)` - reverse transactions for undo operations
- Balance routes (`src/routes/balance.js`) with full authentication
  - `GET /api/balance` - get current user's balance
  - `GET /api/balance/transactions` - transaction history with pagination
  - `GET /api/balance/monthly` - monthly earnings summary
  - `GET /api/balance/summary` - earnings summary for date range
  - `POST /api/balance/redeem` - mark funds as redeemed (parent only)
- Balance validator (`src/validators/balance.js`) for input validation
  - Redemption validation
  - Transaction query validation
  - Monthly query validation
- Added 'bonus' transaction type to database schema for streak milestone bonuses
- Streak calculation logic with consecutive day tracking in `src/models/Completion.js`
  - `calculateStreak(userId, routineId)` - counts consecutive days of task completions
  - `checkMilestone(streak)` - returns milestone object if streak count matches a threshold
  - `isMilestoneReached(streak)` - checks if streak is at a milestone threshold
  - `awardMilestoneBonus(userId, milestone, routineId)` - awards bonus to user balance
  - `getAllStreaksForUser(userId)` - retrieves all streaks for a user
  - `getAllUserRoutinePairs()` - gets all user-routine pairs for batch processing
  - `recalculateStreak(userId, routineId)` - full recalculation with milestone detection
- Milestone configuration in `src/config/milestones.js`
  - 7 days: $1.00 bonus
  - 14 days: $2.50 bonus
  - 30 days: $5.00 bonus
  - 60 days: $10.00 bonus
  - 90 days: $20.00 bonus
- Daily streak calculator cron job in `src/jobs/streakCalculator.js`
  - Runs at midnight daily using node-cron
  - Processes all user-routine pairs
  - Handles missed days (resets streaks)
  - Awards milestone bonuses automatically
  - Comprehensive logging for streak updates
- Added `node-cron` dependency for scheduled jobs

### Changed
- Migrated database from PostgreSQL to SQLite for self-contained operation
  - Replaced `pg` library with `better-sqlite3` for synchronous, embedded database
  - Database stored at `/data/homehero.db` in Home Assistant, with fallback to `./data/` for development
  - Enabled WAL mode for better concurrency
  - All models updated to use SQLite syntax (? placeholders instead of $1, $2, etc.)
  - UUID generation using `crypto.randomUUID()` instead of PostgreSQL's gen_random_uuid()
- Updated Dockerfile to build better-sqlite3 from source (added python3, make, g++, sqlite)
- Updated config.yaml to remove PostgreSQL configuration options
- Updated run.sh to remove PostgreSQL environment variables
- Updated API routes to use caching middleware
  - `GET /api/dashboard` - cached per user for 30 seconds
  - `GET /api/family/dashboard` - cached per household for 30 seconds
  - `GET /api/users` - cached globally for 60 seconds
- Added cache invalidation to mutation endpoints
  - `POST /api/dashboard/complete/:taskId` - invalidates user cache
  - `POST /api/dashboard/undo/:completionId` - invalidates user cache
  - `POST /api/family/vacation-mode` - invalidates household cache
  - `POST /api/family/sick-day/:userId` - invalidates household cache
- Added `compression` dependency to package.json for response compression
- Refactored `Completion.js` to use Balance model for all balance operations
  - `updateBalance()` now uses `Balance.add()` for consistent transaction recording
  - `undo()` now uses `Balance.reverse()` for consistent reversal handling
  - `getBalance()` now delegates to `Balance.get()`
  - `awardMilestoneBonus()` now uses `Balance.add()` with 'bonus' type
- Updated database schema to include 'bonus' as valid transaction type

### Removed
- PostgreSQL database dependency and configuration
  - Removed postgres_host, postgres_port, postgres_db, postgres_user, postgres_password config options
  - Removed pg library from package.json
