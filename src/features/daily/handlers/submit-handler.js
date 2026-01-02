/**
 * Submit Handler Module
 * 
 * This module handles the submission and saving of daily bus report records
 * to the database. It manages the confirmation flow for both new submissions
 * and updates to existing records.
 * 
 * Key workflows:
 * 1. Submit confirmation: When user types "done" or "submit", confirm before saving
 * 2. Update confirmation: When submitting overwrites existing data, ask for confirmation
 * 
 * @module features/daily/handlers/submit-handler
 */

import db from "../../../utils/db.js";
import { safeSendMessage, safeDbRead, safeDbWrite } from "../utils/helpers.js";
import { sendSubmittedSummary } from "../utils/messages.js";
import { resolveCommand } from "../../../utils/menu-handler.js";
import { getMenuState } from "../../../utils/menu-state.js";
import { getUserNameByPhone } from "../../../utils/employees.js";

/**
 * Handles the submit confirmation flow for saving a daily record.
 * Called when user confirms they want to submit the entered data.
 * 
 * Flow:
 * - "yes": Saves the record to database, handles conflicts with existing records
 * - "no": Cancels submission and allows continued editing
 * 
 * If a record already exists for the same date/bus and user isn't in edit mode,
 * it will trigger the update confirmation flow.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} text - User's response text (yes/no)
 * @param {Object} user - User's session data object
 * @returns {Promise<boolean>} True if submission was handled, false otherwise
 */
export async function handleSubmit(sock, sender, text, user) {
  // Only process if user is waiting for submit confirmation
  if (!user.waitingForSubmit) return false;

  try {
    // Resolve user input to standardized yes/no
    const resolved = resolveCommand(text);
    
    if (resolved === "yes") {
      // Read database to check for existing records
      const ok = await safeDbRead();
      if (!ok) {
        await safeSendMessage(sock, sender, {
          text: "❌ Unable to read DB. Try again later.",
        });
        return true;
      }

      const primaryKey = user.pendingPrimaryKey;
      const existingRecord = db.data[primaryKey];

      // If record exists and user didn't fetch it (not in edit mode), ask for update confirmation
      if (existingRecord && !user.editingExisting) {
        user.pendingPrimaryKey = primaryKey;
        user.waitingForSubmit = false;
        user.confirmingUpdate = true;
        await safeSendMessage(sock, sender, {
          text: `⚠️ A record for ${user.busCode || 'Unknown Bus'} on ${user.Dated} already exists.\nDo you want to update it? (*Yes* or *Y* / *No* or *N*)`,
        });
        return true;
      }

      // Remove internal state flags from the data before saving
      const {
        waitingForUpdate,
        waitingForSubmit,
        editingExisting,
        confirmingFetch,
        awaitingCancelChoice,
        pendingPrimaryKey,
        confirmingUpdate,
        pendingUpdates,
        ...cleanUser
      } = user;

      // Filter out any empty keys from the record
      const filteredUser = Object.fromEntries(
        Object.entries(cleanUser).filter(([key]) => key !== '')
      );
      
      // Save the record to database with sender name and timestamp
      const senderName = getUserNameByPhone(sender) || sender;
      db.data[primaryKey] = {
        sender: senderName,
        ...filteredUser,
        employees: (user.EmployExpenses || []).map(e => ({
          role: e.role,
          name: e.name,
          salary: Number(e.amount) || 0,
          mode: e.mode || "cash"
        })),
        submittedAt: new Date().toISOString(),
      };

      // Write to database file
      const w = await safeDbWrite();
      if (!w) {
        await safeSendMessage(sock, sender, {
          text: "❌ Failed to save data. Try again later.",
        });
        return true;
      }

      // Send success summary and clear user session
      await sendSubmittedSummary(sock, sender, cleanUser);
      delete global.userData[sender];
      return true;
    } else if (resolved === "no") {
      // User cancelled submission - allow continued editing
      await safeSendMessage(sock, sender, {
        text: "❌ Submission cancelled. You can continue editing.",
      });
      user.waitingForSubmit = false;
      return true;
    }
    
    // Input wasn't yes or no
    return false;
  } catch (err) {
    console.error("❌ Error handling submit for", sender, ":", err);
    await safeSendMessage(sock, sender, {
      text: "❌ Error processing submission. Please try again.",
    });
    return true;
  }
}

/**
 * Handles the update confirmation flow when submitting would overwrite existing data.
 * Called when user tries to submit data for a date that already has a record,
 * and they didn't fetch the existing record first.
 * 
 * Flow:
 * - "yes": Overwrites the existing record with new data
 * - "no": Cancels the update and keeps the old record unchanged
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} text - User's response text (yes/no)
 * @param {Object} user - User's session data object
 * @returns {Promise<boolean>} True if confirmation was handled, false otherwise
 */
export async function handleUpdateConfirmation(sock, sender, text, user) {
  // Only process if user is confirming an update
  if (!user.confirmingUpdate) return false;

  try {
    // Resolve user input to standardized yes/no
    const resolved = resolveCommand(text);
    
    if (resolved === "yes") {
      // User confirmed the update - proceed with saving
      const key = user.pendingPrimaryKey;
      
      // Read database before writing
      const ok = await safeDbRead();
      if (!ok) {
        await safeSendMessage(sock, sender, {
          text: "❌ Unable to read DB. Try again later.",
        });
        return true;
      }

      // Remove internal state flags from the data before saving
      const {
        waitingForUpdate,
        waitingForSubmit,
        editingExisting,
        confirmingFetch,
        awaitingCancelChoice,
        pendingPrimaryKey,
        confirmingUpdate,
        pendingUpdates,
        ...cleanUser
      } = user;

      // Filter out any empty keys from the record
      const filteredUser = Object.fromEntries(
        Object.entries(cleanUser).filter(([key]) => key !== '')
      );
      
      // Overwrite the existing record with new data
      const senderName = getUserNameByPhone(sender) || sender;
      db.data[key] = {
        sender: senderName,
        ...filteredUser,
        submittedAt: new Date().toISOString(),
      };

      // Write to database file
      const w = await safeDbWrite();
      if (!w) {
        await safeSendMessage(sock, sender, {
          text: "❌ Failed to save updated record. Try again later.",
        });
        return true;
      }

      // Send success message and clear user session
      await safeSendMessage(sock, sender, {
        text: `✅ Record for *${user.busCode || 'Bus'}* on ${user.Dated} updated successfully!`,
      });

      // Clean up user session
      delete user.confirmingUpdate;
      delete user.pendingPrimaryKey;
      delete global.userData[sender];
      return true;
    } else if (resolved === "no") {
      // User cancelled the update - keep old record
      await safeSendMessage(sock, sender, {
        text: "❌ Update cancelled. Old record kept as is.",
      });

      // Clean up state and session
      delete user.confirmingUpdate;
      delete user.pendingPrimaryKey;
      delete global.userData[sender];
      return true;
    }
    
    // Input wasn't yes or no
    return false;
  } catch (err) {
    console.error("❌ Error handling confirmingUpdate for", sender, ":", err);
    delete user.confirmingUpdate;
    delete user.pendingPrimaryKey;
    await safeSendMessage(sock, sender, {
      text: "❌ Error processing update confirmation. Please try again.",
    });
    return true;
  }
}
