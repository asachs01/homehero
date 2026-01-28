/**
 * Balance model for database operations
 * Manages user balances and transaction history
 */

const { query } = require('../db/pool');

class Balance {
  /**
   * Get the current balance for a user
   * Creates a balance record if it doesn't exist
   * @param {string} userId - The user UUID
   * @returns {Promise<Object>} Balance object { userId, currentBalance }
   */
  static async get(userId) {
    // Ensure balance record exists
    await query(
      `INSERT INTO balances (user_id, current_balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    const result = await query(
      'SELECT user_id, current_balance FROM balances WHERE user_id = $1',
      [userId]
    );

    const row = result.rows[0];
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
   * @returns {Promise<Object>} Transaction record and updated balance
   */
  static async add(userId, amount, type, description) {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    if (!['earned', 'adjustment', 'bonus'].includes(type)) {
      throw new Error('Invalid transaction type for add operation');
    }

    // Ensure balance record exists
    await query(
      `INSERT INTO balances (user_id, current_balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    // Update balance
    await query(
      `UPDATE balances SET current_balance = current_balance + $1 WHERE user_id = $2`,
      [amount, userId]
    );

    // Record transaction
    const transactionResult = await query(
      `INSERT INTO balance_transactions (user_id, amount, type, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, amount, type, description]
    );

    // Get updated balance
    const balance = await Balance.get(userId);

    return {
      transaction: Balance.formatTransaction(transactionResult.rows[0]),
      balance: balance.currentBalance
    };
  }

  /**
   * Deduct funds from a user's balance
   * @param {string} userId - The user UUID
   * @param {number} amount - The amount to deduct (must be positive)
   * @param {string} type - Transaction type (spent, payout, adjustment)
   * @param {string} description - Description of the transaction
   * @returns {Promise<Object>} Transaction record and updated balance
   */
  static async deduct(userId, amount, type, description) {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    if (!['spent', 'payout', 'adjustment'].includes(type)) {
      throw new Error('Invalid transaction type for deduct operation');
    }

    // Check current balance
    const currentBalance = await Balance.get(userId);
    if (currentBalance.currentBalance < amount) {
      throw new Error('Insufficient balance');
    }

    // Update balance
    await query(
      `UPDATE balances SET current_balance = current_balance - $1 WHERE user_id = $2`,
      [amount, userId]
    );

    // Record transaction with negative amount
    const transactionResult = await query(
      `INSERT INTO balance_transactions (user_id, amount, type, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, -amount, type, description]
    );

    // Get updated balance
    const balance = await Balance.get(userId);

    return {
      transaction: Balance.formatTransaction(transactionResult.rows[0]),
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
   * @returns {Promise<Object>} { transactions, total, limit, offset }
   */
  static async getTransactions(userId, options = {}) {
    const limit = Math.min(options.limit || 50, 100);
    const offset = options.offset || 0;

    // Build WHERE clause
    const conditions = ['user_id = $1'];
    const params = [userId];
    let paramIndex = 2;

    if (options.type) {
      conditions.push(`type = $${paramIndex}`);
      params.push(options.type);
      paramIndex++;
    }

    if (options.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(options.startDate);
      paramIndex++;
    }

    if (options.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(options.endDate);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM balance_transactions WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get transactions
    const result = await query(
      `SELECT * FROM balance_transactions
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return {
      transactions: result.rows.map(row => Balance.formatTransaction(row)),
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
   * @returns {Promise<Object>} Monthly summary { month, year, earned, spent, net }
   */
  static async getMonthlyTotal(userId, month, year) {
    // Calculate date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // Get earnings (positive amounts with type 'earned')
    const earnedResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM balance_transactions
       WHERE user_id = $1
       AND type = 'earned'
       AND created_at >= $2
       AND created_at <= $3`,
      [userId, startDate, endDate]
    );

    // Get spending (negative amounts or type 'spent', 'payout')
    const spentResult = await query(
      `SELECT COALESCE(SUM(ABS(amount)), 0) as total
       FROM balance_transactions
       WHERE user_id = $1
       AND type IN ('spent', 'payout')
       AND created_at >= $2
       AND created_at <= $3`,
      [userId, startDate, endDate]
    );

    // Get adjustments (can be positive or negative)
    const adjustmentResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM balance_transactions
       WHERE user_id = $1
       AND type = 'adjustment'
       AND created_at >= $2
       AND created_at <= $3`,
      [userId, startDate, endDate]
    );

    const earned = parseFloat(earnedResult.rows[0].total) || 0;
    const spent = parseFloat(spentResult.rows[0].total) || 0;
    const adjustments = parseFloat(adjustmentResult.rows[0].total) || 0;

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
   * @returns {Promise<Object>} Summary with breakdown by type
   */
  static async getSummary(userId, startDate, endDate) {
    const result = await query(
      `SELECT type, SUM(amount) as total, COUNT(*) as count
       FROM balance_transactions
       WHERE user_id = $1
       AND created_at >= $2
       AND created_at <= $3
       GROUP BY type`,
      [userId, startDate, endDate]
    );

    const summary = {
      earned: { total: 0, count: 0 },
      spent: { total: 0, count: 0 },
      adjustment: { total: 0, count: 0 },
      payout: { total: 0, count: 0 },
      bonus: { total: 0, count: 0 }
    };

    for (const row of result.rows) {
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
   * @returns {Promise<Object>} Transaction record and updated balance
   */
  static async recordPayout(userId, amount, description = 'Payout') {
    return Balance.deduct(userId, amount, 'payout', description);
  }

  /**
   * Reverse a transaction (for undo operations)
   * @param {string} userId - The user UUID
   * @param {number} amount - The amount to reverse (positive = was added, so we subtract)
   * @param {string} description - Description of the reversal
   * @returns {Promise<Object>} Transaction record and updated balance
   */
  static async reverse(userId, amount, description) {
    if (amount > 0) {
      // Original was an addition, so we subtract
      await query(
        `UPDATE balances SET current_balance = current_balance - $1 WHERE user_id = $2`,
        [amount, userId]
      );
    } else {
      // Original was a deduction, so we add back
      await query(
        `UPDATE balances SET current_balance = current_balance + $1 WHERE user_id = $2`,
        [Math.abs(amount), userId]
      );
    }

    // Record reversal transaction
    const transactionResult = await query(
      `INSERT INTO balance_transactions (user_id, amount, type, description)
       VALUES ($1, $2, 'adjustment', $3)
       RETURNING *`,
      [userId, -amount, description]
    );

    const balance = await Balance.get(userId);

    return {
      transaction: Balance.formatTransaction(transactionResult.rows[0]),
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
