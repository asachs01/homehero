# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
- Refactored `Completion.js` to use Balance model for all balance operations
  - `updateBalance()` now uses `Balance.add()` for consistent transaction recording
  - `undo()` now uses `Balance.reverse()` for consistent reversal handling
  - `getBalance()` now delegates to `Balance.get()`
  - `awardMilestoneBonus()` now uses `Balance.add()` with 'bonus' type
- Updated database schema to include 'bonus' as valid transaction type
