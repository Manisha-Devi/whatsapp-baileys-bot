/**
 * Formatters Module
 * 
 * This module provides text formatting utilities for displaying data
 * in WhatsApp messages. It handles string capitalization and formatting
 * of expense/collection values for user-friendly display.
 * 
 * @module features/daily/utils/formatters
 */

/**
 * Capitalizes the first letter of a string and lowercases the rest.
 * Useful for formatting expense names and field labels consistently.
 * 
 * @param {string} str - The string to capitalize
 * @returns {string} Capitalized string, or empty string if input is falsy
 * 
 * @example
 * capitalize("DIESEL")     // Returns "Diesel"
 * capitalize("driver")     // Returns "Driver"
 * capitalize("")           // Returns ""
 * capitalize(null)         // Returns ""
 */
export function capitalize(str = "") {
  if (!str) return "";
  return String(str).charAt(0).toUpperCase() + String(str).slice(1).toLowerCase();
}

/**
 * Formats an existing field value for display in confirmation messages.
 * Handles both object format {amount, mode} and primitive values.
 * 
 * @param {Object|string|number|null} existing - The existing field value to format
 * @param {string} existing.amount - Amount value (if object)
 * @param {string} existing.mode - Payment mode "cash" or "online" (if object)
 * @returns {string} Formatted string representation of the value
 * 
 * @example
 * formatExistingForMessage({ amount: "500", mode: "cash" })
 * // Returns "500 (cash)"
 * 
 * formatExistingForMessage({ amount: "200", mode: "online" })
 * // Returns "200 (online)"
 * 
 * formatExistingForMessage("500")
 * // Returns "500"
 * 
 * formatExistingForMessage(null)
 * // Returns "___"
 */
export function formatExistingForMessage(existing) {
  // Handle null/undefined values
  if (existing === null || existing === undefined) return "___";
  
  // Handle object format with amount and mode
  if (typeof existing === "object") {
    const amt = existing.amount || "___";
    const mode = existing.mode || "cash";
    return `${amt} (${mode})`;
  }
  
  // Handle primitive values (string, number)
  return String(existing);
}
