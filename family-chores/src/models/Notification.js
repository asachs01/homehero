/**
 * Notification model for database operations
 * Manages in-app notifications for users
 */

const crypto = require('crypto');
const { getDb } = require('../db/pool');

class Notification {
  /**
   * Create a new notification
   * @param {string} userId - The user UUID
   * @param {string} type - Notification type (task_complete, streak_milestone, streak_broken, balance_update, system)
   * @param {string} message - The notification message
   * @returns {Object} The created notification
   */
  static create(userId, type, message) {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO notifications (id, user_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, userId, type, message, now);

    const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    return Notification.formatNotification(row);
  }

  /**
   * Find notifications by user with pagination
   * @param {string} userId - The user UUID
   * @param {Object} options - Pagination options { limit, offset, unreadOnly }
   * @returns {Object} Notifications and pagination info
   */
  static findByUser(userId, options = {}) {
    const db = getDb();
    const { limit = 20, offset = 0, unreadOnly = false } = options;

    let sql = 'SELECT * FROM notifications WHERE user_id = ?';
    const params = [userId];

    if (unreadOnly) {
      sql += ' AND read = 0';
    }

    // Get total count for pagination
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countRow = db.prepare(countSql).get(...params);
    const total = parseInt(countRow.count) || 0;

    // Add ordering and pagination
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params);

    return {
      notifications: rows.map(row => Notification.formatNotification(row)),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total
      }
    };
  }

  /**
   * Mark a notification as read
   * @param {string} id - The notification UUID
   * @returns {Object|null} The updated notification or null
   */
  static markAsRead(id) {
    const db = getDb();
    const info = db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);

    if (info.changes === 0) {
      return null;
    }

    const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    return Notification.formatNotification(row);
  }

  /**
   * Mark all notifications as read for a user
   * @param {string} userId - The user UUID
   * @returns {number} Number of notifications marked as read
   */
  static markAllAsRead(userId) {
    const db = getDb();
    const info = db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(userId);
    return info.changes;
  }

  /**
   * Get unread notification count for a user
   * @param {string} userId - The user UUID
   * @returns {number} Unread count
   */
  static getUnreadCount(userId) {
    const db = getDb();
    const row = db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0'
    ).get(userId);
    return parseInt(row.count) || 0;
  }

  /**
   * Find a notification by ID
   * @param {string} id - The notification UUID
   * @returns {Object|null} The notification or null
   */
  static findById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);

    if (!row) {
      return null;
    }

    return Notification.formatNotification(row);
  }

  /**
   * Delete old notifications (cleanup job)
   * @param {number} daysOld - Delete notifications older than this many days
   * @returns {number} Number of deleted notifications
   */
  static deleteOld(daysOld = 30) {
    const db = getDb();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffStr = cutoffDate.toISOString();

    const info = db.prepare('DELETE FROM notifications WHERE created_at < ?').run(cutoffStr);
    return info.changes;
  }

  /**
   * Format a database row to a notification object
   * @param {Object} row - Database row
   * @returns {Object} Formatted notification object
   */
  static formatNotification(row) {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      message: row.message,
      read: row.read === 1,
      createdAt: row.created_at
    };
  }
}

module.exports = Notification;
