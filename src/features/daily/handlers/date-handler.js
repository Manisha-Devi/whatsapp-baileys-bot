/**
 * Date Handler Module
 * 
 * This module provides utility functions for parsing, formatting, and manipulating
 * dates used in daily bus report records. It handles various date input formats
 * and generates database keys based on bus code and date combinations.
 * 
 * Supported input formats:
 * - Keywords: "today", "yesterday", "tomorrow"
 * - Text format: "15 December 2025"
 * - Numeric format: "15/12/2025" or "15-12-2025"
 * 
 * @module features/daily/handlers/date-handler
 */

import { format, parse, isValid } from "date-fns";

/**
 * Parses various date input formats into a JavaScript Date object.
 * Supports natural language (today/yesterday/tomorrow), text dates,
 * and numeric date formats (DD/MM/YYYY or DD-MM-YYYY).
 * 
 * @param {string} value - The date string to parse
 * @returns {Date|null} Parsed Date object, or null if parsing fails
 * 
 * @example
 * parseDate("today")           // Returns current date
 * parseDate("yesterday")       // Returns previous day
 * parseDate("15 December 2025") // Returns Dec 15, 2025
 * parseDate("15/12/2025")      // Returns Dec 15, 2025
 */
export function parseDate(value) {
  try {
    // Remove parentheses, asterisks and normalize whitespace
    let normalizedValue = value.replace(/^\(*|\)*$/g, "").replace(/\*/g, "").trim().toLowerCase();

    const now = new Date();
    let targetDate = null;

    // Handle natural language date keywords
    if (normalizedValue === "today") {
      targetDate = now;
    } else if (normalizedValue === "yesterday") {
      targetDate = new Date(now);
      targetDate.setDate(now.getDate() - 1);
    } else if (normalizedValue === "tomorrow") {
      targetDate = new Date(now);
      targetDate.setDate(now.getDate() + 1);
    }

    // Try parsing text date format: "15 December 2025"
    if (!targetDate) {
      const textDateMatch = normalizedValue.match(/(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/);
      if (textDateMatch) {
        const [_, d, monthName, y] = textDateMatch;
        // Use JavaScript's Date parsing to get month index from name
        const monthIndex = new Date(`${monthName} 1, ${y}`).getMonth();
        if (!isNaN(monthIndex)) {
          targetDate = new Date(y, monthIndex, parseInt(d, 10));
        }
      }
    }

    // Try parsing numeric date format: "DD/MM/YYYY" or "DD-MM-YYYY"
    if (!targetDate) {
      const dateMatch = normalizedValue.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (dateMatch) {
        const [_, dd, mm, yy] = dateMatch;
        const parsed = parse(`${dd}/${mm}/${yy}`, "dd/MM/yyyy", new Date());
        if (isValid(parsed)) targetDate = parsed;
      }
    }

    // Validate the resulting date
    if (!targetDate || !isValid(targetDate)) {
      return null;
    }

    return targetDate;
  } catch (err) {
    console.error("❌ Error parsing date:", err);
    return null;
  }
}

/**
 * Formats a Date object into a human-readable string.
 * Output format: "Wednesday, 15 December 2025"
 * 
 * @param {Date} date - The date to format
 * @returns {string|null} Formatted date string, or null if formatting fails
 * 
 * @example
 * formatDate(new Date(2025, 11, 15)) // Returns "Monday, 15 December 2025"
 */
export function formatDate(date) {
  try {
    return format(date, "EEEE, dd MMMM yyyy");
  } catch (err) {
    console.error("❌ Error formatting date:", err);
    return null;
  }
}

/**
 * Converts a Date object to a date key string.
 * Output format: "DD/MM/YYYY"
 * 
 * @param {Date} date - The date to convert
 * @returns {string|null} Date key string, or null if conversion fails
 * 
 * @example
 * getDateKey(new Date(2025, 11, 15)) // Returns "15/12/2025"
 */
export function getDateKey(date) {
  try {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (err) {
    console.error("❌ Error getting date key:", err);
    return null;
  }
}

/**
 * Generates a primary database key combining bus code and date.
 * Output format: "BUSCODE_DD/MM/YYYY"
 * 
 * @param {string} busCode - The bus identifier code
 * @param {Date} date - The date for the record
 * @returns {string|null} Primary key string, or null if generation fails
 * 
 * @example
 * getPrimaryKey("TN01", new Date(2025, 11, 15)) // Returns "TN01_15/12/2025"
 */
export function getPrimaryKey(busCode, date) {
  try {
    const dateKey = getDateKey(date);
    if (!dateKey) return null;
    return `${busCode}_${dateKey}`;
  } catch (err) {
    console.error("❌ Error getting primary key:", err);
    return null;
  }
}

/**
 * Generates a primary database key from bus code and pre-formatted date string.
 * Useful when the date is already in DD/MM/YYYY format.
 * 
 * @param {string} busCode - The bus identifier code
 * @param {string} dateString - Pre-formatted date string (DD/MM/YYYY)
 * @returns {string|null} Primary key string, or null if generation fails
 * 
 * @example
 * getPrimaryKeyFromDateString("TN01", "15/12/2025") // Returns "TN01_15/12/2025"
 */
export function getPrimaryKeyFromDateString(busCode, dateString) {
  try {
    return `${busCode}_${dateString}`;
  } catch (err) {
    console.error("❌ Error getting primary key from string:", err);
    return null;
  }
}

/**
 * Extracts the bus code portion from a primary key.
 * 
 * @param {string} primaryKey - The primary key (format: BUSCODE_DD/MM/YYYY)
 * @returns {string|null} Bus code, or null if extraction fails
 * 
 * @example
 * extractBusCodeFromKey("TN01_15/12/2025") // Returns "TN01"
 */
export function extractBusCodeFromKey(primaryKey) {
  try {
    const parts = primaryKey.split('_');
    return parts.length >= 2 ? parts[0] : null;
  } catch (err) {
    console.error("❌ Error extracting bus code:", err);
    return null;
  }
}

/**
 * Extracts the date portion from a primary key.
 * 
 * @param {string} primaryKey - The primary key (format: BUSCODE_DD/MM/YYYY)
 * @returns {string|null} Date string (DD/MM/YYYY), or null if extraction fails
 * 
 * @example
 * extractDateFromKey("TN01_15/12/2025") // Returns "15/12/2025"
 */
export function extractDateFromKey(primaryKey) {
  try {
    const parts = primaryKey.split('_');
    return parts.length >= 2 ? parts[1] : null;
  } catch (err) {
    console.error("❌ Error extracting date:", err);
    return null;
  }
}
