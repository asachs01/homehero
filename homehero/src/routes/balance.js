/**
 * Balance routes
 * All endpoints require authentication
 * Redemptions require admin (parent) role
 */

const express = require('express');
const router = express.Router();
const Balance = require('../models/Balance');
const User = require('../models/User');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  validateRedemption,
  validateTransactionQuery,
  validateMonthlyQuery
} = require('../validators/balance');

/**
 * GET /api/balance
 * Get current user's balance
 */
router.get('/api/balance', requireAuth, async (req, res) => {
  try {
    const userId = req.query.userId || req.user.userId;

    // Non-admins can only view their own balance
    if (userId !== req.user.userId && req.user.role !== 'parent') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const balance = await Balance.get(userId);

    res.json({
      userId: balance.userId,
      currentBalance: balance.currentBalance,
      formatted: `$${balance.currentBalance.toFixed(2)}`
    });
  } catch (err) {
    console.error('Error fetching balance:', err);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

/**
 * GET /api/balance/transactions
 * Get transaction history for current user
 * Query params: limit, offset, type, startDate, endDate
 */
router.get('/api/balance/transactions', requireAuth, async (req, res) => {
  try {
    const userId = req.query.userId || req.user.userId;

    // Non-admins can only view their own transactions
    if (userId !== req.user.userId && req.user.role !== 'parent') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate query parameters
    const validation = validateTransactionQuery(req.query);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const result = await Balance.getTransactions(userId, validation.sanitized);

    res.json({
      transactions: result.transactions,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.offset + result.limit < result.total
      }
    });
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * GET /api/balance/monthly
 * Get monthly earnings summary
 * Query params: month (1-12), year (YYYY), userId (admin only)
 */
router.get('/api/balance/monthly', requireAuth, async (req, res) => {
  try {
    const userId = req.query.userId || req.user.userId;

    // Non-admins can only view their own monthly summary
    if (userId !== req.user.userId && req.user.role !== 'parent') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate query parameters
    const validation = validateMonthlyQuery(req.query);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const { month, year } = validation.sanitized;
    const summary = await Balance.getMonthlyTotal(userId, month, year);

    res.json({
      userId,
      month: summary.month,
      year: summary.year,
      earned: summary.earned,
      spent: summary.spent,
      adjustments: summary.adjustments,
      net: summary.net,
      formatted: {
        earned: `$${summary.earned.toFixed(2)}`,
        spent: `$${summary.spent.toFixed(2)}`,
        adjustments: `$${summary.adjustments.toFixed(2)}`,
        net: `$${summary.net.toFixed(2)}`
      }
    });
  } catch (err) {
    console.error('Error fetching monthly summary:', err);
    res.status(500).json({ error: 'Failed to fetch monthly summary' });
  }
});

/**
 * POST /api/balance/redeem
 * Mark funds as redeemed/paid out (admin only)
 * Body: { userId, amount, description? }
 */
router.post('/api/balance/redeem', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId, amount, description } = req.body;

    // Validate user ID
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Validate redemption data
    const validation = validateRedemption({ amount, description });
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    // Record payout
    const result = await Balance.recordPayout(
      userId,
      parseFloat(amount),
      description || 'Funds redeemed'
    );

    res.status(201).json({
      success: true,
      transaction: result.transaction,
      balance: {
        current: result.balance,
        formatted: `$${result.balance.toFixed(2)}`
      }
    });
  } catch (err) {
    if (err.message === 'Insufficient balance') {
      return res.status(400).json({ error: 'Insufficient balance for redemption' });
    }
    console.error('Error processing redemption:', err);
    res.status(500).json({ error: 'Failed to process redemption' });
  }
});

/**
 * GET /api/balance/summary
 * Get earnings summary for a date range (admin only - can view any user)
 * Query params: userId, startDate, endDate
 */
router.get('/api/balance/summary', requireAuth, async (req, res) => {
  try {
    const userId = req.query.userId || req.user.userId;

    // Non-admins can only view their own summary
    if (userId !== req.user.userId && req.user.role !== 'parent') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Default to current month
    const now = new Date();
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = req.query.endDate
      ? new Date(req.query.endDate)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const summary = await Balance.getSummary(userId, startDate, endDate);

    res.json({
      userId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      summary
    });
  } catch (err) {
    console.error('Error fetching summary:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

/**
 * GET /api/balance/household-payouts
 * Get monthly payout summary for all children in household (admin only)
 * Query params: month (1-12), year (YYYY)
 * Returns current month and previous months' data
 */
router.get('/api/balance/household-payouts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month) : now.getMonth() + 1;
    const year = req.query.year ? parseInt(req.query.year) : now.getFullYear();

    // Validate month and year
    if (month < 1 || month > 12) {
      return res.status(400).json({ error: 'Month must be between 1 and 12' });
    }
    if (year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Invalid year' });
    }

    // Get all users in household
    const users = await User.findByHousehold(req.user.householdId);
    const children = users.filter(u => u.role === 'child');

    // Get monthly summary and current balance for each child
    const childSummaries = await Promise.all(children.map(async (child) => {
      const monthlySummary = await Balance.getMonthlyTotal(child.id, month, year);
      const currentBalance = await Balance.get(child.id);

      // Get recent payout transactions for this child
      const payoutTransactions = await Balance.getTransactions(child.id, {
        type: 'payout',
        limit: 10
      });

      return {
        userId: child.id,
        name: child.name,
        avatar: child.avatar,
        currentBalance: currentBalance.currentBalance,
        monthly: {
          earned: monthlySummary.earned,
          spent: monthlySummary.spent,
          adjustments: monthlySummary.adjustments,
          net: monthlySummary.net
        },
        recentPayouts: payoutTransactions.transactions
      };
    }));

    // Get previous months data (last 6 months)
    const previousMonths = [];
    for (let i = 1; i <= 6; i++) {
      let prevMonth = month - i;
      let prevYear = year;
      if (prevMonth < 1) {
        prevMonth += 12;
        prevYear -= 1;
      }

      const monthData = await Promise.all(children.map(async (child) => {
        const summary = await Balance.getMonthlyTotal(child.id, prevMonth, prevYear);
        return {
          userId: child.id,
          name: child.name,
          earned: summary.earned,
          net: summary.net
        };
      }));

      // Only include months that have data
      const hasData = monthData.some(m => m.earned > 0 || m.net !== 0);
      if (hasData) {
        previousMonths.push({
          month: prevMonth,
          year: prevYear,
          children: monthData
        });
      }
    }

    res.json({
      currentMonth: {
        month,
        year,
        children: childSummaries
      },
      previousMonths,
      monthNames: ['', 'January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December']
    });
  } catch (err) {
    console.error('Error fetching household payouts:', err);
    res.status(500).json({ error: 'Failed to fetch household payouts' });
  }
});

module.exports = router;
