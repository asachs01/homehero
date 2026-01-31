# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-01-31

### Fixed
- **Improved error handling for save operations** (`src/public/admin.html`)
  - Save operation catch blocks now display actual error messages instead of generic "Failed to save"
  - Added try-catch around error response JSON parsing to handle non-JSON server errors
  - Added session expiry detection with helpful "Session expired" message and automatic redirect
  - Added debug console.log for save operations to help diagnose issues

## [1.2.0] - 2026-01-30

### Added
- **ARIA labels for accessibility** (`src/public/admin.html`, `src/public/dashboard.html`, `src/public/family-dashboard.html`)
  - Added `role="tablist"`, `role="tab"`, and `role="tabpanel"` to admin panel tabs for screen reader navigation
  - Added `aria-selected` state to tab buttons, updated dynamically on tab switch
  - Added `aria-labelledby` to tab panels referencing their corresponding tab buttons
  - Added `aria-controls` to tab buttons referencing their corresponding tab panels
  - Added `aria-label` to all dynamically created edit/delete action buttons with item names (e.g., "Edit John", "Delete Task 1")
  - Added `aria-label` to sick day buttons with context (e.g., "Mark sick day for Emma")
  - Added `aria-hidden="true"` to decorative confetti container in dashboard
  - Added `aria-hidden="true"` to decorative icon spans in admin tabs and family dashboard buttons
  - Added `aria-label="Notifications"`, `aria-haspopup="true"`, and `aria-expanded` state to notification bell button
  - Added `role="menu"` to notification dropdown for screen reader context
  - Dynamic `aria-expanded` state updates on notification dropdown open/close
- **Reduced motion support for accessibility** (`src/public/dashboard.html`, `src/public/admin.html`)
  - Added `prefers-reduced-motion` media queries to respect user accessibility preferences
  - Disables celebration, confetti, bounce-in, and toast slide animations in dashboard
  - Disables modal transitions and button hover transforms in admin panel
  - Loading spinners use slower 3s rotation instead of being fully disabled
  - Provides immediate state changes instead of animated transitions for users who prefer reduced motion

### Changed
- **Improved color contrast for WCAG AA compliance** (`src/public/admin.html`, `src/public/dashboard.html`, `src/public/family-dashboard.html`, `src/public/login.html`, `src/public/onboarding.html`)
  - Changed secondary text color from `#9E9E9E` (2.8:1 ratio) to `#757575` (4.6:1 ratio)
  - Affects `.item-meta`, `.form-hint`, user greeting text, and other secondary/muted text elements
  - Meets WCAG AA minimum contrast requirement of 4.5:1 for normal text

### Added
- **Monthly payout summary view for parents** (`src/public/admin.html`, `src/routes/balance.js`)
  - New "Payouts" tab in admin panel for managing children's earnings
  - Displays each child's current balance, monthly earnings, and spending
  - Month/year selector to view historical earnings data
  - "Mark as Paid" button to record payouts (deducts from balance)
  - Shows recent payout history for each child with expandable list
  - Previous months section showing earnings totals for last 6 months
  - New API endpoint `GET /api/balance/household-payouts` for household-wide payout data
- **Sick day button for parents** (`src/public/admin.html`)
  - Parents can mark a child as having a sick day from the Users tab
  - Sick day completes all remaining tasks for the day without earning money
  - Streaks are protected - sick days count as completed days
  - Visual indicator shows when a child has all tasks done for today
  - Confirmation modal with help text explaining streak protection
- **Daily digest notifications for parents** (`src/jobs/dailyDigest.js`)
  - Cron job runs at 7 AM daily
  - Summarizes previous day's activity for each household
  - Reports total tasks completed and missed across all children
  - Highlights notable streak achievements (7+ day streaks)
  - Sends notification to all parents in household using type 'system'
  - Example message: "Yesterday: 12 tasks completed, 2 missed. Emma is on a 7-day streak!"
- **Streak milestone display on child dashboard** (`src/public/dashboard.html`)
  - Shows "Next Milestone" indicator below streak count
  - Displays days remaining until next milestone reward
  - Shows reward amount (e.g., "2 more days for $1.00 bonus!")
  - Milestone thresholds: 7 days ($1), 14 days ($2.50), 30 days ($5), 60 days ($10), 90 days ($20)
  - Special "All milestones reached!" message when child completes all milestones
- **Parent notifications on task completion** (`src/routes/dashboard.js`)
  - When a child completes a task, all parents in the household receive a notification
  - Message format: "Emma completed 'Make Bed' ✓"
  - Uses existing notification infrastructure (type: 'task_complete')
- **Missed task detection with parent alerts** (`src/jobs/missedTaskChecker.js`)
  - Daily cron job runs at 00:05 (after streak calculator)
  - Detects incomplete routine tasks from previous day
  - Respects routine schedules (daily/weekly)
  - Creates notifications for all parents in household
  - Message format: "Emma missed 2 tasks in Morning Routine yesterday"
  - Only tracks children's missed tasks (skips parent users)
- **Visual icon picker for task creation**
  - 57 icons organized by category (cleaning, bedroom, bathroom, kitchen, outdoor, homework, pets, misc)
  - Click-to-select icon picker modal in admin panel
  - Icons display with emoji preview in task list
- **Routine scheduling UI**
  - Daily/Weekly schedule type selector
  - Day-of-week checkboxes for weekly schedules (Sun-Sat)
  - Schedule displays in routine list ("Daily" or "Weekly: Mon, Wed, Fri")
- **Database migration support**
  - Automatic migration from v1.1.0 to v1.2.0 schema
  - Migrates dollar_value → value_cents, type → category
  - Adds schedule columns to routines table

### Changed
- **Database schema refactor for tasks and routines**
  - Tasks table simplified: removed `type`, `schedule`, `time_window` columns; added `value_cents` (integer) and `category` columns
  - Routines table enhanced: added `schedule_type` (daily/weekly) and `schedule_days` (JSON array) for scheduling
  - Routine tasks table: added `id` column, renamed `position` to `sort_order`
  - Task model updated to use `valueCents` instead of `dollarValue`
  - Routine model updated to support schedule configuration
  - All related routes, validators, and models updated to use new schema
- Scheduling logic moved from tasks to routines for cleaner architecture

## [1.1.0] - 2026-01-29

### Changed
- **Rebranded to HomeHero** - New name, new icon (trophy), catchier identity
- Add Home Assistant ingress support for sidebar integration
- Smart index page that redirects based on auth/onboarding status

### Fixed
- Fix s6-overlay initialization error by using plain bash shebang instead of with-contenv bashio (config has `init: false` which disables s6-overlay)
- Remove explicit ENTRYPOINT from Dockerfile

### Added
- Task/chore icon library with 57 emoji icons organized by category
  - New data file `src/data/task-icons.json` with icons for:
    - cleaning: broom, mop, vacuum, sponge, spray bottle, trash, soap, sparkles
    - bedroom: bed, clothes, closet, hanger, lamp
    - bathroom: toilet, shower, toothbrush, bathtub, towel, mirror
    - kitchen: dishes, cooking, trash, refrigerator, groceries, utensils, countertop
    - outdoor: lawn, garden, car, leaves, snow, watering, bicycle
    - homework: books, pencil, computer, backpack, notebook, reading
    - pets: dog bowl, cat food, fish, pet walk, bird, hamster
    - misc: laundry, mail, recycling, keys, phone, calendar, clock, money, gift, star, heart, check
  - Each icon includes: id, name, emoji, category, color
  - New API endpoint `GET /api/task-icons` returns all icons
  - Optional category filter: `GET /api/task-icons?category=cleaning`
  - New API endpoint `GET /api/task-icons/categories` returns list of categories
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
