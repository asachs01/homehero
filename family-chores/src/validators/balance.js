/**
 * Balance validation utilities
 */

const VALID_TRANSACTION_TYPES = ['earned', 'spent', 'adjustment', 'payout', 'bonus'];

/**
 * Validate redemption/payout request data
 *
 * Rules:
 * - amount: required, must be positive number
 * - description: optional, max 500 chars
 *
 * @param {Object} data - The redemption data to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateRedemption(data) {
  const errors = [];

  // Amount validation
  if (data.amount === undefined || data.amount === null) {
    errors.push('amount is required');
  } else {
    const amount = parseFloat(data.amount);
    if (isNaN(amount)) {
      errors.push('amount must be a number');
    } else if (amount <= 0) {
      errors.push('amount must be greater than 0');
    } else if (amount > 10000) {
      errors.push('amount exceeds maximum allowed (10000)');
    }
  }

  // Description validation (optional)
  if (data.description !== undefined && data.description !== null) {
    if (typeof data.description !== 'string') {
      errors.push('description must be a string');
    } else if (data.description.length > 500) {
      errors.push('description must be at most 500 characters');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate transaction query parameters
 *
 * @param {Object} params - Query parameters
 * @returns {Object} { valid: boolean, errors: string[], sanitized: Object }
 */
function validateTransactionQuery(params) {
  const errors = [];
  const sanitized = {};

  // Limit validation
  if (params.limit !== undefined) {
    const limit = parseInt(params.limit);
    if (isNaN(limit) || limit < 1) {
      errors.push('limit must be a positive integer');
    } else {
      sanitized.limit = Math.min(limit, 100);
    }
  }

  // Offset validation
  if (params.offset !== undefined) {
    const offset = parseInt(params.offset);
    if (isNaN(offset) || offset < 0) {
      errors.push('offset must be a non-negative integer');
    } else {
      sanitized.offset = offset;
    }
  }

  // Type validation
  if (params.type !== undefined) {
    if (!VALID_TRANSACTION_TYPES.includes(params.type)) {
      errors.push(`type must be one of: ${VALID_TRANSACTION_TYPES.join(', ')}`);
    } else {
      sanitized.type = params.type;
    }
  }

  // Start date validation
  if (params.startDate !== undefined) {
    const date = new Date(params.startDate);
    if (isNaN(date.getTime())) {
      errors.push('startDate must be a valid date');
    } else {
      sanitized.startDate = date;
    }
  }

  // End date validation
  if (params.endDate !== undefined) {
    const date = new Date(params.endDate);
    if (isNaN(date.getTime())) {
      errors.push('endDate must be a valid date');
    } else {
      sanitized.endDate = date;
    }
  }

  // Validate date range
  if (sanitized.startDate && sanitized.endDate && sanitized.startDate > sanitized.endDate) {
    errors.push('startDate must be before endDate');
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Validate monthly query parameters
 *
 * @param {Object} params - Query parameters
 * @returns {Object} { valid: boolean, errors: string[], sanitized: Object }
 */
function validateMonthlyQuery(params) {
  const errors = [];
  const sanitized = {};
  const now = new Date();

  // Month validation
  if (params.month !== undefined) {
    const month = parseInt(params.month);
    if (isNaN(month) || month < 1 || month > 12) {
      errors.push('month must be between 1 and 12');
    } else {
      sanitized.month = month;
    }
  } else {
    sanitized.month = now.getMonth() + 1;
  }

  // Year validation
  if (params.year !== undefined) {
    const year = parseInt(params.year);
    if (isNaN(year) || year < 2000 || year > 2100) {
      errors.push('year must be between 2000 and 2100');
    } else {
      sanitized.year = year;
    }
  } else {
    sanitized.year = now.getFullYear();
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}

module.exports = {
  validateRedemption,
  validateTransactionQuery,
  validateMonthlyQuery,
  VALID_TRANSACTION_TYPES
};
