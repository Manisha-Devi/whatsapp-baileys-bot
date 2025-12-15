/**
 * Fetch Handler Module
 * 
 * This module handles the fetching and loading of existing records from the database.
 * It manages the confirmation flow when a user wants to retrieve an existing record
 * for viewing or updating, and handles the cancel choice after fetching.
 * 
 * Key workflows:
 * 1. Fetch confirmation: When user enters a date with existing data, ask whether to fetch it
 * 2. Cancel choice: After fetching, ask if user wants to discard and start fresh
 * 
 * @module features/daily/handlers/fetch-handler
 */

import db from "../../../utils/db.js";
import { safeSendMessage, safeDbRead } from "../utils/helpers.js";
import { recalculateCashHandover } from "../utils/calculations.js";
import { sendSummary } from "../utils/messages.js";
import { resolveCommand } from "../../../utils/menu-handler.js";
import { getMenuState } from "../../../utils/menu-state.js";

/**
 * Handles the confirmation response when user wants to fetch an existing record.
 * Called when user enters a date that already has data in the database.
 * 
 * Flow:
 * - "yes": Loads the existing record into user session for editing
 * - "no": Starts a fresh entry, ignoring existing data
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} text - User's response text (yes/no)
 * @param {Object} user - User's session data object
 * @returns {Promise<boolean>} True if confirmation was handled, false otherwise
 */
export async function handleFetchConfirmation(sock, sender, text, user) {
  // Only process if user is in the confirming fetch state
  if (!user.confirmingFetch) return false;

  try {
    // Resolve user input to standardized yes/no
    const resolved = resolveCommand(text);
    
    if (resolved === "yes") {
      // User wants to fetch the existing record
      const key = user.pendingPrimaryKey;
      
      // Read the database to get the record
      const ok = await safeDbRead();
      if (!ok) {
        await safeSendMessage(sock, sender, {
          text: "❌ Unable to read DB. Try again later.",
        });
        return true;
      }
      
      const oldRecord = db.data[key];
      if (oldRecord) {
        // Copy all fields from the existing record to user session
        Object.assign(user, oldRecord);
        
        // Ensure required fields are initialized
        if (!user.Remarks) user.Remarks = null;
        if (!user.Status) user.Status = "Initiated";

        // Update state flags
        user.confirmingFetch = false;
        user.waitingForSubmit = false;
        user.editingExisting = true;
        
        // Recalculate cash handover based on loaded data
        recalculateCashHandover(user);
        
        // Show the fetched record and ask if user wants to cancel
        await sendSummary(
          sock,
          sender,
          `📋 Fetched existing record for *${user.busCode || 'Bus'}*.\nYou can now update any field and re-submit.\n\nDo you want to Cancel? (*Yes* or *Y* / *No* or *N*)`,
          user
        );
        user.awaitingCancelChoice = true;
      } else {
        // Record was not found (shouldn't happen normally)
        user.confirmingFetch = false;
        user.pendingPrimaryKey = null;
        await safeSendMessage(sock, sender, {
          text: "⚠️ The requested record was not found in the DB.",
        });
      }
      return true;
    } else if (resolved === "no") {
      // User doesn't want to fetch - start fresh entry
      user.confirmingFetch = false;
      user.pendingPrimaryKey = null;
      user.editingExisting = false;
      await safeSendMessage(sock, sender, {
        text: "🆕 Starting a fresh entry. Please continue entering new data.",
      });
      return true;
    }
    
    // Input wasn't yes or no
    return false;
  } catch (err) {
    console.error("❌ Error while processing confirmingFetch for", sender, ":", err);
    user.confirmingFetch = false;
    user.pendingPrimaryKey = null;
    await safeSendMessage(sock, sender, {
      text: "❌ An error occurred while fetching the record. Please try again.",
    });
    return true;
  }
}

/**
 * Handles the cancel choice after a record has been fetched.
 * Allows user to discard the fetched record and start fresh, or continue editing.
 * 
 * Flow:
 * - "yes": Discards the fetched data and clears user session
 * - "no": Continues with the fetched data for editing
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} text - User's response text (yes/no)
 * @param {Object} user - User's session data object
 * @returns {Promise<boolean>} True if choice was handled, false otherwise
 */
export async function handleCancelChoice(sock, sender, text, user) {
  // Only process if user is awaiting cancel choice
  if (!user.awaitingCancelChoice) return false;

  try {
    // Resolve user input to standardized yes/no
    const resolved = resolveCommand(text);
    
    if (resolved === "yes") {
      // User wants to cancel - discard fetched data
      delete global.userData?.[sender];
      await safeSendMessage(sock, sender, {
        text: "✅ Existing record discarded. Starting fresh entry.",
      });
      return true;
    } else if (resolved === "no") {
      // User wants to continue editing the fetched record
      user.awaitingCancelChoice = false;
      await safeSendMessage(sock, sender, {
        text: "📋 Please start updating by confirming above data.",
      });
      return true;
    }
    
    // Input wasn't yes or no
    return false;
  } catch (err) {
    console.error("❌ Error handling awaitingCancelChoice for", sender, ":", err);
    user.awaitingCancelChoice = false;
    await safeSendMessage(sock, sender, {
      text: "❌ Error while processing your choice. Please continue.",
    });
    return true;
  }
}
