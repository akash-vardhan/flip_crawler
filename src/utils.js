const crypto = require('crypto');

class Utils {
  /**
   * Generate unique ID from URL
   */
  static generateId(url) {
    return crypto.createHash('md5').update(url).digest('hex').substring(0, 16);
  }

  /**
   * Sleep for specified milliseconds
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate URL
   */
  static isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Get domain from URL
   */
  static getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch (_) {
      return null;
    }
  }

  /**
   * Truncate text to specified length
   */
  static truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * Clean and normalize text
   */
  static cleanText(text) {
    return text.replace(/\s+/g, ' ').trim();
  }
}

module.exports = Utils;
