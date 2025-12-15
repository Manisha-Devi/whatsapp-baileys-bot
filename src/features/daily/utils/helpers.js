/**
 * Helpers Module
 * 
 * This module provides low-level utility functions for the daily reports feature.
 * It includes safe wrappers for WhatsApp messaging and database operations
 * to prevent crashes from unhandled errors.
 * 
 * Key principles:
 * - All operations are wrapped in try-catch to prevent application crashes
 * - Functions log errors but continue execution gracefully
 * - Database operations are abstracted for consistent error handling
 * 
 * @module features/daily/utils/helpers
 */

import db from "../../../utils/db.js";

/**
 * Safely sends a WhatsApp message with error handling.
 * Prevents the bot from crashing if message sending fails.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} jid - Recipient's WhatsApp JID (phone number with suffix)
 * @param {Object} message - Message object to send (e.g., { text: "Hello" })
 * @returns {Promise<void>}
 * 
 * @example
 * await safeSendMessage(sock, "1234567890@s.whatsapp.net", { text: "Hello!" });
 */
export async function safeSendMessage(sock, jid, message) {
  try {
    await sock.sendMessage(jid, message);
  } catch (err) {
    console.error("❌ Failed to send message to", jid, ":", err);
  }
}

/**
 * Safely reads data from the JSON database file.
 * Initializes db.data to empty object if not already set.
 * Handles cases where db.read() method might not be available.
 * 
 * @returns {Promise<boolean>} True if read was successful, false on error
 * 
 * @example
 * const success = await safeDbRead();
 * if (success) {
 *   // Access db.data safely
 *   const record = db.data["BUS01_15/12/2025"];
 * }
 */
export async function safeDbRead() {
  try {
    // Check if db.read() method exists before calling
    if (typeof db.read === "function") {
      await db.read();
      db.data = db.data || {};
    } else {
      console.warn("⚠️ db.read() not available on db object");
      db.data = db.data || {};
    }
    return true;
  } catch (err) {
    console.error("❌ DB read error:", err);
    return false;
  }
}

/**
 * Safely writes data to the JSON database file.
 * Handles cases where db.write() method might not be available.
 * 
 * @returns {Promise<boolean>} True if write was successful, false on error
 * 
 * @example
 * db.data["BUS01_15/12/2025"] = { ... };
 * const success = await safeDbWrite();
 * if (!success) {
 *   console.log("Failed to save data");
 * }
 */
export async function safeDbWrite() {
  try {
    // Check if db.write() method exists before calling
    if (typeof db.write === "function") {
      await db.write();
    } else {
      console.warn("⚠️ db.write() not available on db object");
    }
    return true;
  } catch (err) {
    console.error("❌ DB write error:", err);
    return false;
  }
}

/**
 * Convenience function to send a text message that expects a yes/no reply.
 * Just a wrapper around safeSendMessage for semantic clarity.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} jid - Recipient's WhatsApp JID
 * @param {string} text - Message text to send
 * @returns {Promise<void>}
 * 
 * @example
 * await sendYesNoReply(sock, sender, "Do you want to continue? (yes/no)");
 */
export async function sendYesNoReply(sock, jid, text) {
  try {
    await safeSendMessage(sock, jid, { text });
  } catch (err) {
    console.error("❌ sendYesNoReply failed:", err);
  }
}
