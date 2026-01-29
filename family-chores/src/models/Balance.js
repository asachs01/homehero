/**
 * Balance model for database operations
 * Manages user balances and transaction history
 */

const crypto = require('crypto');
const { getDb } = require('../db/pool');

class Balance {
  /**
   * Get the current balance for a user
   * Creates a balance record if it doesn't exist
   * @param {string} userId - The user UUID
   * @returns {Object} Balance object { userId, currentBalance }
   */
  static get(userId) {
    const db = getDb();

    // Ensure balance record exists
    const existing = db.prepare('SELECT user_id FROM balances WHERE user_id = ?').get(userId);
    if (!existing) {
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO balances (id, user_id, current_balance) VALUES (?, ?, 0)').run(id, userId);
    }

    const row = db.prepare('SELECT user_id, current_balance FROM balances WHERE user_id = ?').get(userId);

    return {
      userId: row.user_id,
      currentBalance: parseFloat(row.current_balance) || 0
    };
  }

  /**
   * Add funds to a user's balance
   * @param {string} userId - The user UUID
   * @param {number} amount - The amount to add (must be positive)
   * @param {string} type - Transaction type (earned, adjustment, bonus)
   * @param {string} description - Description of the transaction
   * @returns {Object} Transaction record and updated balance
   */
  static add(userId, amount, type, description) {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    if (!['earned', 'adjustment', 'bonus'].includes(type)) {
      throw new Error('Invalid transaction type for add operation');
    }

    const db = getDb();

    // Ensure balance record exists
    const existing = db.prepare('SELECT user_id FROM balances WHERE user_id = ?').get(userId);
    if (!existing) {
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO balances (id, user_id, current_balance) VALUES (?, ?, 0)').run(id, userId);
    }

    // Update balance
    db.prepare('UPDATE balances SET current_balance = current_balance + ? WHERE user_id = ?').run(amount, userId);

    // Record transaction
    const transactionId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO balance_transactions (id, user_id, amount, type, description, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(transactionId, userId, amount, type, description, now);

    const transactionRow = db.prepare('SELECT * FROM balance_transactions WHERE id = ?').get(transactionId);

    // Get updated balance
    const balance = Balance.get(userId);

    return {
      transaction: Balance.formatTransaction(transactionRow),
      balance: balance.currentBalance
    };
  }

  /**
   * Deduct funds from a user's balance
   * @param {string} userId - The user UUID
   * @param {number} amount - The amount to deduct (must be positive)
   * @param {string} type - Transaction type (spent, payout, adjustment)
   * @param {string} description - Description of the transaction
   * @returns {Object} Transaction record and updated balance
   */
  static deduct(userId, amount, type, description) {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    if (!['spent', 'payout', 'adjustment'].includes(type)) {
      throw new Error('Invalid transaction type for deduct operation');
    }

    const db = getDb();

    // Check current balance
    const currentBalance = Balance.get(userId);
    if (currentBalance.currentBalance < amount) {
      throw new Error('Insufficient balance');
    }

    // Update balance
    db.prepare('UPDATE balances SET current_balance = current_balance - ? WHERE user_id = ?').run(amount, userId);

    // Record transaction with negative amount
    const transactionId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO balance_transactions (id, user_id, amount, type, description, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(transactionId, userId, -amount, type, description, now);

    const transactionRow = db.prepare('SELECT * FROM balance_transactions WHERE id = ?').get(transactionId);

    // Get updated balance
    const balance = Balance.get(userId);

    return {
      transaction: Balance.formatTransaction(transactionRow),
      balance: balance.currentBalance
    };
  }

  /**
   * Get transaction history for a user with pagination
   * @param {string} userId - The user UUID
   * @param {Object} options - Query options
   * @param {number} options.limit - Max results (default 50)
   * @param {number} options.offset - Results to skip (default 0)
   * @param {string} options.type - Filter by transaction type
   * @param {Date} options.startDate - Filter by start date
   * @param {Date} options.endDate - Filter by end date
   * @returns {Object} { transactions, total, limit, offset }
   */
  static getTransactions(userId, options = {}) {
    const db = getDb();
    const limit = Math.min(options.limit || 50, 100);
    const offset = options.offset || 0;

    // Build WHERE clause
    const conditions = ['user_id = ?'];
    const params = [userId];

    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }

    if (options.startDate) {
      conditions.push('created_at >= ?');
      params.push(options.startDate instanceof Date ? options.startDate.toISOString() : options.startDate);
    }

    if (options.endDate) {
      conditions.push('created_at <= ?');
      params.push(options.endDate instanceof Date ? options.endDate.toISOString() : options.endDate);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countRow = db.prepare(`SELECT COUNT(*) as count FROM balance_transactions WHERE ${whereClause}`).get(...params);
    const total = parseInt(countRow.count);

    // Get transactions
    const rows = db.prepare(
      `SELECT * FROM balance_transactions
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return {
      transactions: rows.map(row => Balance.formatTransaction(row)),
      total,
      limit,
      offset
    };
  }

  /**
   * Get monthly earnings total for a user
   * @param {string} userId - The user UUID
   * @param {number} month - Month (1-12)
   * @param {number} year - Year (4 digits)
   * @returns {Object} Monthly summary { month, year, earned, spent, net }
   */
  static getMonthlyTotal(userId, month, year) {
    const db = getDb();

    // Calculate date range for the month
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59, 999).toISOString();

    // Get earnings (positive amounts with type 'earned')
    const earnedRow = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM balance_transactions
       WHERE user_id = ?
       AND type = 'earned'
       AND created_at >= ?
       AND created_at <= ?`
    ).get(userId, startDate, endDate);

    // Get spending (negative amounts or type 'spent', 'payout')
    const spentRow = db.prepare(
      `SELECT COALESCE(SUM(ABS(amount)), 0) as total
       FROM balance_transactions
       WHERE user_id = ?
       AND type IN ('spent', 'payout')
       AND created_at >= ?
       AND created_at <= ?`
    ).get(userId, startDate, endDate);

    // Get adjustments (can be positive or negative)
    const adjustmentRow = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM balance_transactions
       WHERE user_id = ?
       AND type = 'adjustment'
       AND created_at >= ?
       AND created_at <= ?`
    ).get(userId, startDate, endDate);

    const earned = parseFloat(earnedRow.total) || 0;
    const spent = parseFloat(spentRow.total) || 0;
    const adjustments = parseFloat(adjustmentRow.total) || 0;

    return {
      month,
      year,
      earned,
      spent,
      adjustments,
      net: earned - spent + adjustments
    };
  }

  /**
   * Get earnings summary for a date range
   * @param {string} userId - The user UUID
   * @param {Date} startDate - Start of range
   * @param {Date} endDate - End of range
   * @returns {Object} Summary with breakdown by type
   */
  static getSummary(userId, startDate, endDate) {
    const db = getDb();
    const startStr = startDate instanceof Date ? startDate.toISOString() : startDate;
    const endStr = endDate instanceof Date ? endDate.toISOString() : endDate;

    const rows = db.prepare(
      `SELECT type, SUM(amount) as total, COUNT(*) as count
       FROM balance_transactions
       WHERE user_id = ?
       AND created_at >= ?
       AND created_at <= ?
       GROUP BY type`
    ).all(userId, startStr, endStr);

    const summary = {
      earned: { total: 0, count: 0 },
      spent: { total: 0, count: 0 },
      adjustment: { total: 0, count: 0 },
      payout: { total: 0, count: 0 },
      bonus: { total: 0, count: 0 }
    };

    for (const row of rows) {
      summary[row.type] = {
        total: parseFloat(row.total) || 0,
        count: parseInt(row.count)
      };
    }

    return summary;
  }

  /**
   * Record a payout (parent marks funds as paid out)
   * @param {string} userId - The user UUID
   * @param {number} amount - The amount to pay out
   * @param {string} description - Optional description
   * @returns {Object} Transaction record and updated balance
   */
  static recordPayout(userId, amount, description = 'Payout') {
    return Balance.deduct(userId, amount, 'payout', description);
  }

  /**
   * Reverse a transaction (for undo operations)
   * @param {string} userId - The user UUID
   * @param {number} amount - The amount to reverse (positive = was added, so we subtract)
   * @param {string} description - Description of the reversal
   * @returns {Object} Transaction record and updated balance
   */
  static reverse(userId, amount, description) {
    const db = getDb();

    if (amount > 0) {
      // Original was an addition, so we subtract
      db.prepare('UPDATE balances SET current_balance = current_balance - ? WHERE user_id = ?').run(amount, userId);
    } else {
      // Original was a deduction, so we add back
      db.prepare('UPDATE balances SET current_balance = current_balance + ? WHERE user_id = ?').run(Math.abs(amount), userId);
    }

    // Record reversal transaction
    const transactionId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO balance_transactions (id, user_id, amount, type, description, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(transactionId, userId, -amount, 'adjustment', description, now);

    const transactionRow = db.prepare('SELECT * FROM balance_transactions WHERE id = ?').get(transactionId);
    const balance = Balance.get(userId);

    return {
      transaction: Balance.formatTransaction(transactionRow),
      balance: balance.currentBalance
    };
  }

  /**
   * Format a database row to a transaction object
   * @param {Object} row - Database row
   * @returns {Object} Formatted transaction object
   */
  static formatTransaction(row) {
    return {
      id: row.id,
      userId: row.user_id,
      amount: parseFloat(row.amount),
      type: row.type,
      description: row.description,
      createdAt: row.created_at
    };
  }
}

module.exports = Balance;
