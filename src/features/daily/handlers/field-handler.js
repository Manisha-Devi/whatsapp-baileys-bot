/**
 * Field Handler Module
 * 
 * This module handles the extraction and processing of various data fields
 * from user messages for daily bus report entries. It supports multi-line
 * input parsing and handles field update confirmations.
 * 
 * Supported fields:
 * - Dated: Date of the report
 * - Diesel: Fuel expense
 * - Adda: Bus stand fee
 * - Union: Union fees
 * - TotalCashCollection: Cash received
 * - Online: Online payment collection
 * - Extra expenses: Custom expense categories
 * - Remarks: Additional notes
 * 
 * @module features/daily/handlers/field-handler
 */

import db from "../../../utils/db.js";
import { safeSendMessage, safeDbRead } from "../utils/helpers.js";
import { formatExistingForMessage, capitalize } from "../utils/formatters.js";
import { parseDate, formatDate, getPrimaryKey } from "./date-handler.js";
import { recalculateCashHandover, getCompletionMessage } from "../utils/calculations.js";
import { sendSummary } from "../utils/messages.js";
import { getMenuState } from "../../../utils/menu-state.js";
import { getEmployExpensesForBus } from "../../../utils/employees.js";

/**
 * Extracts and processes multiple data fields from user input text.
 * Supports parsing various field formats and handles existing value conflicts.
 * 
 * Field patterns supported:
 * - "dated: DD/MM/YYYY" or "dated today"
 * - "diesel: 500" or "diesel 500 online"
 * - "adda: 100" or "union: 50"
 * - "cash collection: 5000" or "online: 2000"
 * - "expense food 200"
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} normalizedText - Normalized user input text (may be multi-line)
 * @param {Object} user - User's session data object
 * @returns {Promise<{handled: boolean, anyFieldFound: boolean}>} Processing result
 */
export async function handleFieldExtraction(sock, sender, normalizedText, user) {
  // Define regex patterns for each supported field type
  const fieldPatterns = {
    Dated: /date(?:d)?\s*[:\-]?\s*([\w\s,\/\-\(\)\*]+)/gi,
    Diesel: /diesel\s*[:\-]?\s*\*?(\d+)\*?(?:\s*(online))?/gi,
    Adda: /adda\s*[:\-]?\s*\*?(\d+)\*?(?:\s*(online))?/gi,
    Union: /union\s*[:\-]?\s*\*?(\d+)\*?(?:\s*(online))?/gi,
    TotalCashCollection: /(?:total\s*cash\s*collection|cash\s*collection|cash|total\s*collection)\s*[:\-]?\s*\*?(\d+)\*?/gi,
    Online: /(?:online\s*collection|total\s*online|online)\s*[:\-]?\s*\*?(\d+)\*?/gi,
    Driver: /driver\s*[:\-]?\s*\*?(\d+)\*?(?:\s*(online))?/gi,
    Conductor: /conductor\s*[:\-]?\s*\*?(\d+)\*?(?:\s*(online))?/gi,
  };

  let anyFieldFound = false;
  let pendingUpdates = [];

  // Get currently selected bus from menu state
  const menuState = getMenuState(sender);
  const selectedBus = menuState.selectedBus;

  // Require a bus to be selected before entering data
  if (!selectedBus) {
    await safeSendMessage(sock, sender, {
      text: "⚠️ No bus selected. Please type *Entry* to select a bus first.",
    });
    return { handled: true, anyFieldFound: false };
  }

  user.busCode = selectedBus;

  try {
    // Process each field pattern against the input text
    for (const [key, regex] of Object.entries(fieldPatterns)) {
      let match;
      while ((match = regex.exec(normalizedText)) !== null) {
        anyFieldFound = true;

        // Special handling for date field
        if (key === "Dated") {
          try {
            let value = match[1].trim();
            const targetDate = parseDate(value);

            if (!targetDate) {
              await safeSendMessage(sock, sender, {
                text: "⚠️ Please enter a valid date (e.g. Dated 30/10/2025, or Dated today).",
              });
              return { handled: true, anyFieldFound };
            }

            // Format date and generate primary key for database lookup
            const formatted = formatDate(targetDate);
            const primaryKey = getPrimaryKey(selectedBus, targetDate);

            user.Dated = formatted;
            user.pendingPrimaryKey = primaryKey;

            // Initialize employee expenses if not set
            if (!user.EmployExpenses || user.EmployExpenses.length === 0) {
              user.EmployExpenses = getEmployExpensesForBus(selectedBus);
            }

            // Check if record already exists for this date
            const ok = await safeDbRead();
            if (!ok) {
              await safeSendMessage(sock, sender, {
                text: "❌ Unable to read DB to check existing date. Try again later.",
              });
              return { handled: true, anyFieldFound };
            }

            // If record exists, ask user whether to fetch and update it
            if (db.data[primaryKey]) {
              user.confirmingFetch = true;
              const day = String(targetDate.getDate()).padStart(2, "0");
              const month = String(targetDate.getMonth() + 1).padStart(2, "0");
              const year = targetDate.getFullYear();
              await safeSendMessage(sock, sender, {
                text: `⚠️ Data for *${selectedBus}* on ${day}/${month}/${year} already exists.\nDo you want to fetch and update it? (yes/no)`,
              });
              return { handled: true, anyFieldFound };
            }
          } catch (err) {
            console.error("❌ Error parsing/storing Dated field for", sender, ":", err);
            await safeSendMessage(sock, sender, {
              text: "❌ Failed to parse date. Please use format: Dated DD/MM/YYYY or 'Dated today'.",
            });
            return { handled: true, anyFieldFound };
          }
          continue;
        }

        // Handle expense fields (Diesel, Adda, Union) with amount and optional mode
        if (["Diesel", "Adda", "Union"].includes(key)) {
          try {
            const amount = match[1].trim();
            const mode = match[2] ? "online" : "cash";
            const newVal = { amount, mode };

            const existing = user[key];
            
            // Check if value is different from existing
            const isDifferent =
              existing &&
              ((typeof existing === "object" &&
                (existing.amount !== amount || existing.mode !== mode)) ||
                (typeof existing !== "object" && String(existing) !== amount));

            // Queue update confirmation if value differs
            if (isDifferent) {
              pendingUpdates.push({
                field: key,
                value: newVal,
                message: `⚠️ ${key} already has value *${formatExistingForMessage(existing)}*.\nDo you want to update it to *${amount} (${mode})*? (yes/no)`,
              });
            } else {
              user[key] = newVal;
            }
          } catch (err) {
            console.error(`❌ Error parsing ${key} for ${sender}:`, err);
          }
          continue;
        }

        // Handle employee expense fields (Driver, Conductor) - stored in EmployExpenses array
        if (["Driver", "Conductor"].includes(key)) {
          try {
            const amount = parseFloat(match[1].trim());
            const mode = match[2] ? "online" : "cash";
            const newVal = { amount, mode };

            // Initialize employee expenses with bus defaults if not exists or empty
            if (!user.EmployExpenses || user.EmployExpenses.length === 0) {
              user.EmployExpenses = getEmployExpensesForBus(selectedBus) || [];
            }

            // Check if this employee already has an expense entry
            const existingIndex = user.EmployExpenses.findIndex(
              (e) => e.name.toLowerCase() === key.toLowerCase()
            );

            const oldValue = existingIndex !== -1 ? user.EmployExpenses[existingIndex] : null;

            // Check if value is different from existing
            if (oldValue && (oldValue.amount !== amount || oldValue.mode !== mode)) {
              pendingUpdates.push({
                field: key,
                value: newVal,
                type: "employee",
                message: `⚠️ *${key}* already has value *₹${oldValue.amount} (${oldValue.mode})*.\nDo you want to update it to *₹${amount} (${mode})*? (yes/no)`,
              });
            } else if (existingIndex !== -1) {
              // Update existing
              user.EmployExpenses[existingIndex] = { name: key, amount, mode };
            } else {
              // Add new
              user.EmployExpenses.push({ name: key, amount, mode });
            }
          } catch (err) {
            console.error(`❌ Error parsing ${key} for ${sender}:`, err);
          }
          continue;
        }

        // Handle collection fields (TotalCashCollection, Online)
        try {
          const value = match[1].trim();
          const newVal = { amount: value };
          
          const existingAmount = user[key]?.amount || user[key];
          
          // Queue update confirmation if value differs
          if (existingAmount && existingAmount !== value) {
            const label = key.replace(/([A-Z])/g, " $1").trim();
            pendingUpdates.push({
              field: key,
              value: newVal,
              message: `⚠️ ${label} already has value *${existingAmount}*.\nDo you want to update it to *${value}*? (yes/no)`,
            });
          } else {
            user[key] = newVal;
          }
        } catch (err) {
          console.error(`❌ Error parsing generic field ${key} for ${sender}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("❌ Error during field extraction for", sender, ":", err);
  }

  // Process inline expense entries (expense [name] [amount] [optional: online])
  try {
    // Initialize ExtraExpenses array if not exists
    if (!user.ExtraExpenses) user.ExtraExpenses = [];
    
    const expenseMatches = [
      ...normalizedText.matchAll(/expense\s+([a-zA-Z]+)\s*[:\-]?\s*(\d+)(?:\s*(online))?/gi),
    ];
    for (const match of expenseMatches) {
      try {
        const expenseName = match[1].trim();
        const amount = match[2].trim();
        const mode = match[3] ? "online" : "cash";
        anyFieldFound = true;

        // Check if this expense already exists
        const existing = user.ExtraExpenses.find(
          (e) => e.name.toLowerCase() === expenseName.toLowerCase()
        );

        // Queue update confirmation if value differs
        if (existing && (existing.amount !== amount || existing.mode !== mode)) {
          pendingUpdates.push({
            field: expenseName,
            value: { amount, mode },
            type: "extra",
            message: `⚠️ Expense *${expenseName}* already has *${existing.amount} (${existing.mode})*.\nUpdate to *${amount} (${mode})*? (yes/no)`,
          });
        } else if (!existing) {
          user.ExtraExpenses.push({ name: expenseName, amount, mode });
        }
      } catch (err) {
        console.error("❌ Error parsing an expense match for", sender, ":", err);
      }
    }
  } catch (err) {
    console.error("❌ Expense parsing error for", sender, ":", err);
  }

  // If there are pending updates, store all and ask for confirmation on the first one
  if (pendingUpdates.length > 0) {
    const first = pendingUpdates.shift();
    user.pendingUpdates = pendingUpdates;
    user.waitingForUpdate = {
      field: first.field,
      value: first.value,
      type: first.type || "normal",
    };
    
    // Recalculate totals for fields that were applied without confirmation
    recalculateCashHandover(user);
    const completenessMsg = getCompletionMessage(user);
    
    // Send summary with the update prompt combined
    await sendSummary(sock, sender, `${completenessMsg}\n\n${first.message}`, user);
    return { handled: true, anyFieldFound };
  }

  return { handled: false, anyFieldFound };
}

/**
 * Handles user's confirmation response for field update requests.
 * Processes "yes" to apply the update or "no" to cancel.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} text - User's response text (yes/no)
 * @param {Object} user - User's session data object
 * @returns {Promise<boolean>} True if confirmation was handled, false otherwise
 */
export async function handleFieldUpdateConfirmation(sock, sender, text, user) {
  if (!user.waitingForUpdate) return false;

  try {
    if (/^yes$/i.test(text)) {
      const { field, value, type } = user.waitingForUpdate;

      // Handle employee expense update (Driver/Conductor)
      if (type === "employee") {
        const idx = user.EmployExpenses.findIndex(
          (e) => e.name.toLowerCase() === field.toLowerCase()
        );
        if (idx >= 0) {
          user.EmployExpenses[idx].amount = value.amount;
          user.EmployExpenses[idx].mode = value.mode;
        } else {
          user.EmployExpenses.push({ name: field, amount: value.amount, mode: value.mode });
        }
      } 
      // Handle extra expense update
      else if (type === "extra") {
        const idx = user.ExtraExpenses.findIndex(
          (e) => e.name.toLowerCase() === field.toLowerCase()
        );
        if (idx >= 0) {
          if (typeof value === "object") {
            user.ExtraExpenses[idx].amount = value.amount;
            user.ExtraExpenses[idx].mode = value.mode;
          } else {
            user.ExtraExpenses[idx].amount = value;
          }
        } else {
          user.ExtraExpenses.push({ name: field, amount: value.amount || value, mode: value.mode || "cash" });
        }
      } 
      // Handle normal field update (Diesel, Adda, Union, etc.)
      else {
        user[field] = value;
      }

      // Clear pending update and recalculate totals
      user.waitingForUpdate = null;
      recalculateCashHandover(user);
      
      await safeSendMessage(sock, sender, {
        text: `✅ ${capitalize(field)} updated successfully!`,
      });
      
      // Check if there are more pending updates
      if (user.pendingUpdates && user.pendingUpdates.length > 0) {
        const next = user.pendingUpdates.shift();
        user.waitingForUpdate = {
          field: next.field,
          value: next.value,
          type: next.type || "normal",
        };
        await safeSendMessage(sock, sender, { text: next.message });
      } else {
        user.pendingUpdates = null;
        const completenessMsg = getCompletionMessage(user);
        await sendSummary(sock, sender, completenessMsg, user);
      }
      return true;
    } else if (/^no$/i.test(text)) {
      // Cancel this update
      user.waitingForUpdate = null;
      
      await safeSendMessage(sock, sender, {
        text: `❎ Update cancelled.`,
      });
      
      // Check if there are more pending updates
      if (user.pendingUpdates && user.pendingUpdates.length > 0) {
        const next = user.pendingUpdates.shift();
        user.waitingForUpdate = {
          field: next.field,
          value: next.value,
          type: next.type || "normal",
        };
        await safeSendMessage(sock, sender, { text: next.message });
      } else {
        user.pendingUpdates = null;
        const completenessMsg = getCompletionMessage(user);
        await safeSendMessage(sock, sender, { text: completenessMsg });
      }
      return true;
    }
    
    return false;
  } catch (err) {
    console.error("❌ Error handling waitingForUpdate for", sender, ":", err);
    user.waitingForUpdate = null;
    await safeSendMessage(sock, sender, {
      text: "❌ Error processing your update response. Please re-enter the value.",
    });
    return true;
  }
}

/**
 * Handles the remarks command to add or clear notes on a record.
 * Format: "remarks [text]" to add, or "remarks" alone to clear.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} normalizedText - Normalized user input text
 * @param {Object} user - User's session data object
 * @returns {Promise<boolean>} True if command was handled, false otherwise
 * 
 * @example
 * // Input: "remarks Bus was late due to traffic" - Adds the remark
 * // Input: "remarks" - Clears existing remarks
 */
export async function handleRemarksCommand(sock, sender, normalizedText, user) {
  const remarksMatch = normalizedText.match(/^remarks\s*(.*)$/i);
  if (!remarksMatch) return false;

  try {
    const remarkText = remarksMatch[1].trim();
    user.Remarks = remarkText || null;

    await safeSendMessage(sock, sender, {
      text: remarkText
        ? `📝 Remark added: "${remarkText}"`
        : `🧹 Remarks cleared.`,
    });

    // Show current data summary after updating remarks
    const completenessMsg = getCompletionMessage(user);
    await sendSummary(
      sock,
      sender,
      `📋 Here's your current entered data:\n${completenessMsg}`,
      user
    );
    return true;
  } catch (err) {
    console.error("❌ Error handling remarks for", sender, ":", err);
    return true;
  }
}
