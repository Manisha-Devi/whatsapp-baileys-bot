/**
 * Booking Command Handler Module
 * 
 * This module handles special commands for the booking feature:
 * - Clear command to reset the booking session
 * - Booking lookup by ID or date
 * 
 * @module features/bookings/handlers/command-handler
 */

import { safeSendMessage } from "../utils/helpers.js";

/**
 * Handles the 'clear' command to reset the user's booking session.
 * Removes all entered booking data and allows starting fresh.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} text - Lowercase user input text
 * @returns {Promise<boolean>} True if command was handled, false otherwise
 * 
 * @example
 * // Input: "clear" or "clear booking"
 * // Clears the current booking session
 */
export async function handleClearCommand(sock, sender, text) {
  if (text === "clear" || text === "clear booking") {
    // Check if user has an active booking session
    if (global.bookingData && global.bookingData[sender]) {
      delete global.bookingData[sender];
      await safeSendMessage(sock, sender, {
        text: "✅ Booking session cleared. You can start a new booking.",
      });
      return true;
    }
  }
  return false;
}

/**
 * Handles booking lookup commands by ID or date.
 * Currently shows placeholder message as feature is under development.
 * 
 * Supported formats:
 * - "booking [BOOKING_ID]" - Fetch by booking ID (e.g., "booking BK001")
 * - "booking [DD/MM/YYYY]" - Fetch by travel date (e.g., "booking 20/11/2025")
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} normalizedText - Normalized user input text
 * @param {Object} user - User's booking session data
 * @returns {Promise<boolean>} True if command was handled, false otherwise
 */
export async function handleBookingCommand(sock, sender, normalizedText, user) {
  // Match booking ID lookup pattern (e.g., "booking BK001")
  const bookingIdMatch = normalizedText.match(/^booking\s+([A-Z0-9]+)$/i);
  if (bookingIdMatch) {
    const bookingId = bookingIdMatch[1].toUpperCase();
    await safeSendMessage(sock, sender, {
      text: `🔍 Fetching booking ${bookingId}...\n\n⚠️ Feature under development`,
    });
    return true;
  }

  // Match date lookup pattern (e.g., "booking 20/11/2025")
  const dateMatch = normalizedText.match(/^booking\s+(\d{2}\/\d{2}\/\d{4})$/);
  if (dateMatch) {
    await safeSendMessage(sock, sender, {
      text: `🔍 Fetching bookings for ${dateMatch[1]}...\n\n⚠️ Feature under development`,
    });
    return true;
  }

  return false;
}
