-- HomeHero Database Schema (SQLite)
-- Version: 1.0.0

-- Households table
CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    vacation_mode INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_households_created_at ON households(created_at);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('parent', 'child')),
    pin_hash TEXT,
    avatar TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_household_id ON users(household_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    type TEXT NOT NULL CHECK (type IN ('daily', 'weekly', 'one-time')),
    dollar_value REAL DEFAULT 0.00,
    schedule TEXT,
    time_window TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_household_id ON tasks(household_id);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);

-- Task assignments (many-to-many relationship between tasks and users)
CREATE TABLE IF NOT EXISTS task_assignments (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignments_user_id ON task_assignments(user_id);

-- Routines table
CREATE TABLE IF NOT EXISTS routines (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_routines_household_id ON routines(household_id);
CREATE INDEX IF NOT EXISTS idx_routines_assigned_user_id ON routines(assigned_user_id);

-- Routine tasks (ordered list of tasks in a routine)
CREATE TABLE IF NOT EXISTS routine_tasks (
    routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (routine_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_routine_tasks_position ON routine_tasks(routine_id, position);

-- Completions table (tracks task completions)
CREATE TABLE IF NOT EXISTS completions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    completed_at TEXT DEFAULT (datetime('now')),
    completion_date TEXT DEFAULT (date('now'))
);

CREATE INDEX IF NOT EXISTS idx_completions_task_id ON completions(task_id);
CREATE INDEX IF NOT EXISTS idx_completions_user_id ON completions(user_id);
CREATE INDEX IF NOT EXISTS idx_completions_completion_date ON completions(completion_date);
CREATE INDEX IF NOT EXISTS idx_completions_user_date ON completions(user_id, completion_date);

-- Streaks table (tracks user streaks for routines)
CREATE TABLE IF NOT EXISTS streaks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    current_count INTEGER DEFAULT 0,
    best_count INTEGER DEFAULT 0,
    last_completion_date TEXT,
    UNIQUE (user_id, routine_id)
);

CREATE INDEX IF NOT EXISTS idx_streaks_user_id ON streaks(user_id);
CREATE INDEX IF NOT EXISTS idx_streaks_routine_id ON streaks(routine_id);

-- Balances table (tracks user monetary balances)
CREATE TABLE IF NOT EXISTS balances (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    current_balance REAL DEFAULT 0.00
);

CREATE INDEX IF NOT EXISTS idx_balances_user_id ON balances(user_id);

-- Balance transactions table (tracks all balance changes)
CREATE TABLE IF NOT EXISTS balance_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('earned', 'spent', 'adjustment', 'payout', 'bonus')),
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_balance_transactions_user_id ON balance_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_type ON balance_transactions(type);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_created_at ON balance_transactions(created_at);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('task_complete', 'streak_milestone', 'streak_broken', 'balance_update', 'system')),
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- =============================================================================
-- Additional Performance Indexes
-- =============================================================================

-- Composite index for task lookups by household and type (used in bonus tasks query)
CREATE INDEX IF NOT EXISTS idx_tasks_household_type ON tasks(household_id, type);

-- Composite index for completions lookup by task and date (used to check if task already claimed)
CREATE INDEX IF NOT EXISTS idx_completions_task_date ON completions(task_id, completion_date);

-- Composite index for routines lookup by household and assigned user
CREATE INDEX IF NOT EXISTS idx_routines_household_user ON routines(household_id, assigned_user_id);

-- Composite index for streaks lookup (used in streak data retrieval)
CREATE INDEX IF NOT EXISTS idx_streaks_user_routine ON streaks(user_id, routine_id);

-- Index for users ordered by name (used in login screen user list)
CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);

-- Composite index for balance transactions by user and creation time
CREATE INDEX IF NOT EXISTS idx_balance_transactions_user_created ON balance_transactions(user_id, created_at DESC);
