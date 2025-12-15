/**
 * Booking Helpers Module
 * 
 * This module provides low-level utility functions for the booking feature.
 * It includes safe wrappers for WhatsApp messaging and database operations
 * specific to the booking functionality.
 * 
 * @module features/bookings/utils/helpers
 */

/**
 * Safely sends a WhatsApp message with error handling.
 * Prevents the bot from crashing if message sending fails.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} recipient - Recipient's WhatsApp JID
 * @param {Object} message - Message object to send (e.g., { text: "Hello" })
 * @returns {Promise<boolean>} True if message was sent successfully, false on error
 * 
 * @example
 * const sent = await safeSendMessage(sock, sender, { text: "Booking confirmed!" });
 * if (!sent) {
 *   console.log("Failed to send confirmation");
 * }
 */
export async function safeSendMessage(sock, recipient, message) {
  try {
    // Validate required parameters
    if (!sock || !recipient) {
      console.warn("⚠️ safeSendMessage: Missing sock or recipient");
      return false;
    }
    await sock.sendMessage(recipient, message);
    return true;
  } catch (err) {
    console.error("❌ Failed to send message:", err);
    return false;
  }
}

/**
 * Safely reads data from a lowdb database instance.
 * Returns the database data or an empty object on error.
 * 
 * @param {Object} db - lowdb database instance
 * @returns {Promise<Object>} Database data object, or empty object on error
 * 
 * @example
 * const data = await safeDbRead(bookingsDb);
 * const booking = data["BK001"];
 */
export async function safeDbRead(db) {
  try {
    await db.read();
    return db.data || {};
  } catch (err) {
    console.error("❌ Failed to read database:", err);
    return {};
  }
}

/**
 * Safely writes data to a lowdb database instance.
 * Returns success/failure status without throwing errors.
 * 
 * @param {Object} db - lowdb database instance
 * @returns {Promise<boolean>} True if write was successful, false on error
 * 
 * @example
 * bookingsDb.data["BK001"] = newBooking;
 * const success = await safeDbWrite(bookingsDb);
 * if (!success) {
 *   console.log("Failed to save booking");
 * }
 */
export async function safeDbWrite(db) {
  try {
    await db.write();
    return true;
  } catch (err) {
    console.error("❌ Failed to write database:", err);
    return false;
  }
}
