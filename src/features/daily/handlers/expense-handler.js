/**
 * Expense Handler Module
 * 
 * This module handles expense-related commands for daily bus reports.
 * It manages two types of expenses:
 * 1. Employee expenses (Driver, Conductor salaries)
 * 2. Extra/miscellaneous expenses (custom expense categories)
 * 
 * Features:
 * - Add new expenses with amount and payment mode (cash/online)
 * - Update existing expense values with confirmation
 * - Delete expenses from the record
 * 
 * @module features/daily/handlers/expense-handler
 */

import { safeSendMessage } from "../utils/helpers.js";
import { capitalize } from "../utils/formatters.js";
import { recalculateCashHandover, getCompletionMessage } from "../utils/calculations.js";
import { sendSummary } from "../utils/messages.js";

/**
 * Handles employee expense commands for Driver and Conductor.
 * Format: "driver 500" or "conductor 400 online"
 * 
 * If the employee already has an expense value, prompts for confirmation
 * before updating to the new value.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} normalizedText - Normalized user input text
 * @param {Object} user - User's session data object
 * @returns {Promise<boolean>} True if command was handled, false otherwise
 * 
 * @example
 * // Input: "driver 500" - Sets driver expense to Rs.500 (cash)
 * // Input: "conductor 400 online" - Sets conductor expense to Rs.400 (online)
 */
export async function handleEmployeeExpenseCommand(sock, sender, normalizedText, user) {
  // Pattern for driver expense: "driver [amount] [optional: online]"
  const driverPattern = /^driver\s+(\d+)(?:\s+(online))?$/i;
  // Pattern for conductor expense: "conductor [amount] [optional: online]"
  const conductorPattern = /^conductor\s+(\d+)(?:\s+(online))?$/i;
  
  let match = normalizedText.match(driverPattern);
  let role = "Driver";
  
  // Check if it's a conductor command if driver pattern didn't match
  if (!match) {
    match = normalizedText.match(conductorPattern);
    role = "Conductor";
  }
  
  if (!match) return false;

  try {
    const amount = parseFloat(match[1]);
    const mode = match[2]?.toLowerCase() === "online" ? "online" : "cash";

    // Initialize employee expenses array if not exists
    if (!user.EmployExpenses) user.EmployExpenses = [];

    // Find existing entry by ROLE AND mode (allows separate cash/online entries)
    // Use role field if available, fallback to name for backward compatibility
    const existingIndex = user.EmployExpenses.findIndex(
      (e) => (e.role || e.name)?.toLowerCase() === role.toLowerCase() && e.mode === mode
    );

    const oldValue = existingIndex !== -1 ? user.EmployExpenses[existingIndex] : null;

    // If value exists for same role+mode and amount is different, ask for confirmation
    if (oldValue && oldValue.amount !== amount) {
      user.waitingForUpdate = {
        field: `${role} (${mode})`,
        value: { amount, mode, role },
        type: "employee",
        employeeRole: role,
      };
      
      const oldRemarks = oldValue.remarks || "";
      let msg = `⚠️ *${role}*\nAlready Have:\nAmount: ₹${oldValue.amount}\nMode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
      if (oldRemarks) msg += `\nRemark: ${oldRemarks}`;
      msg += `\n\nDo you want to update it to:\nAmount: ₹${amount}\nMode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
      msg += `\n\n(Yes or Y / No or N)`;
      
      await safeSendMessage(sock, sender, { text: msg });
      return true;
    }

    // Add or update the employee expense
    if (existingIndex !== -1) {
      // Update existing entry (same role + same mode) - preserve the full name
      user.EmployExpenses[existingIndex].amount = amount;
      user.EmployExpenses[existingIndex].mode = mode;
      if (!user.EmployExpenses[existingIndex].role) {
        user.EmployExpenses[existingIndex].role = role;
      }
    } else {
      // Add new entry (different mode or new employee)
      user.EmployExpenses.push({
        name: role,
        role: role,
        amount: amount,
        mode,
      });
    }

    // Recalculate cash handover after expense change
    recalculateCashHandover(user);
    const completenessMsg = getCompletionMessage(user);
    
    const actionMsg = `✅ *${role} (${mode})* added: ₹${amount}!`;
    
    await sendSummary(sock, sender, `${actionMsg}\n${completenessMsg}`, user);
    return true;
  } catch (err) {
    console.error("❌ Error handling employee expense command:", err);
    await safeSendMessage(sock, sender, {
      text: `❌ Error setting ${role}. Please try again with format: ${role.toLowerCase()} [amount]`,
    });
    return true;
  }
}

/**
 * Handles custom/extra expense commands.
 * Format: "expense [name] [amount]" or "ex [name] [amount] online"
 * 
 * Allows adding any custom expense category with amount and optional
 * payment mode specification.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} normalizedText - Normalized user input text
 * @param {Object} user - User's session data object
 * @returns {Promise<boolean>} True if command was handled, false otherwise
 * 
 * @example
 * // Input: "expense food 200" - Adds food expense of Rs.200 (cash)
 * // Input: "ex repair 1500 online" - Adds repair expense of Rs.1500 (online)
 */
export async function handleExpenseCommand(sock, sender, normalizedText, user) {
  // Pattern: "expense [name] [amount] [optional: online]" or "ex [name] [amount] [optional: online]"
  const expensePattern = /(?:expense|ex)\s+([a-zA-Z]+)\s+(\d+)(?:\s+(online))?/i;
  const match = normalizedText.match(expensePattern);
  
  if (!match) return false;

  try {
    const [_, expenseName, amount, onlineFlag] = match;
    const mode = onlineFlag?.toLowerCase() === "online" ? "online" : "cash";

    // Initialize extra expenses array if not exists
    if (!user.ExtraExpenses) user.ExtraExpenses = [];

    // Check if this expense name already exists (case-insensitive)
    const existingIndex = user.ExtraExpenses.findIndex(
      (e) => e.name.toLowerCase() === expenseName.toLowerCase()
    );

    // Update existing expense or add new one
    if (existingIndex !== -1) {
      user.ExtraExpenses[existingIndex] = {
        name: expenseName,
        amount: parseFloat(amount),
        mode,
      };
    } else {
      user.ExtraExpenses.push({
        name: expenseName,
        amount: parseFloat(amount),
        mode,
      });
    }

    // Recalculate cash handover and show updated summary
    recalculateCashHandover(user);
    const completenessMsg = getCompletionMessage(user);
    await sendSummary(
      sock,
      sender,
      `✅ Expense *${capitalize(expenseName)}* added!\n${completenessMsg}`,
      user
    );
    return true;
  } catch (err) {
    console.error("❌ Error handling expense command:", err);
    await safeSendMessage(sock, sender, {
      text: "❌ Error adding expense. Please try again.",
    });
    return true;
  }
}

/**
 * Handles expense deletion commands.
 * Format: "expense delete [name]"
 * 
 * Removes an extra expense entry from the user's session data.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} normalizedText - Normalized user input text
 * @param {Object} user - User's session data object
 * @returns {Promise<boolean>} True if command was handled, false otherwise
 * 
 * @example
 * // Input: "expense delete food" - Removes the food expense entry
 */
export async function handleExpenseDelete(sock, sender, normalizedText, user) {
  // Pattern: "expense delete [name]"
  const deleteMatch = normalizedText.match(/expense\s+delete\s+([a-zA-Z]+)/i);
  if (!deleteMatch) return false;

  try {
    const deleteName = deleteMatch[1].trim();
    
    // Find the expense to delete (case-insensitive search)
    const index = user.ExtraExpenses.findIndex(
      (e) => e.name.toLowerCase() === deleteName.toLowerCase()
    );
    
    if (index !== -1) {
      // Remove the expense and recalculate totals
      user.ExtraExpenses.splice(index, 1);
      recalculateCashHandover(user);
      const completenessMsg = getCompletionMessage(user);
      await sendSummary(
        sock,
        sender,
        `🗑️ Expense *${capitalize(deleteName)}* deleted successfully!\n${completenessMsg}`,
        user
      );
    } else {
      // Expense not found in the list
      await safeSendMessage(sock, sender, {
        text: `⚠️ Expense *${capitalize(deleteName)}* not found in your list.`,
      });
    }
    return true;
  } catch (err) {
    console.error("❌ Error handling expense delete:", err);
    return true;
  }
}

/**
 * Handles employee expense deletion commands.
 * Format: "delete driver", "delete trip driver", "delete conductor", "delete trip conductor"
 * Also supports: "driver delete", "trip driver delete", etc.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} normalizedText - Normalized user input text
 * @param {Object} user - User's session data object
 * @returns {Promise<boolean>} True if command was handled, false otherwise
 */
export async function handleEmployeeExpenseDelete(sock, sender, normalizedText, user) {
  // Patterns for delete commands
  // "delete driver", "driver delete", "delete trip driver", "trip driver delete"
  const deleteDriverPattern = /^(?:delete\s+driver|driver\s+delete)$/i;
  const deleteTripDriverPattern = /^(?:delete\s+trip\s+driver|trip\s+driver\s+delete)$/i;
  const deleteConductorPattern = /^(?:delete\s+conductor|conductor\s+delete)$/i;
  const deleteTripConductorPattern = /^(?:delete\s+trip\s+conductor|trip\s+conductor\s+delete)$/i;

  let role = null;
  let type = null;

  if (deleteTripDriverPattern.test(normalizedText)) {
    role = "Driver";
    type = "trip";
  } else if (deleteDriverPattern.test(normalizedText)) {
    role = "Driver";
    type = "dailySalary";
  } else if (deleteTripConductorPattern.test(normalizedText)) {
    role = "Conductor";
    type = "trip";
  } else if (deleteConductorPattern.test(normalizedText)) {
    role = "Conductor";
    type = "dailySalary";
  }

  if (!role) return false;

  try {
    if (!user.EmployExpenses || user.EmployExpenses.length === 0) {
      await safeSendMessage(sock, sender, {
        text: `⚠️ No ${type === "trip" ? "Trip " : ""}${role} expense found to delete.`,
      });
      return true;
    }

    // Find the expense to delete (match role and type)
    const index = user.EmployExpenses.findIndex(
      (e) => e.role.toLowerCase() === role.toLowerCase() && 
             (e.type || "dailySalary") === type
    );

    if (index !== -1) {
      const deletedExpense = user.EmployExpenses[index];
      user.EmployExpenses.splice(index, 1);
      recalculateCashHandover(user);
      const completenessMsg = getCompletionMessage(user);
      const typeLabel = type === "trip" ? "Trip " : "";
      await sendSummary(
        sock,
        sender,
        `🗑️ ${typeLabel}${role} (₹${deletedExpense.amount}) deleted successfully!\n${completenessMsg}`,
        user
      );
    } else {
      const typeLabel = type === "trip" ? "Trip " : "";
      await safeSendMessage(sock, sender, {
        text: `⚠️ ${typeLabel}${role} expense not found in your list.`,
      });
    }
    return true;
  } catch (err) {
    console.error("❌ Error handling employee expense delete:", err);
    return true;
  }
}

