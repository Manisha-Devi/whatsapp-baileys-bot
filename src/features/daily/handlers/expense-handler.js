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

    // Check if this employee already has an expense entry
    const existingIndex = user.EmployExpenses.findIndex(
      (e) => e.name.toLowerCase() === role.toLowerCase()
    );

    const oldValue = existingIndex !== -1 ? user.EmployExpenses[existingIndex] : null;

    // If value exists and is different, ask for confirmation before updating
    if (oldValue && (oldValue.amount !== amount || oldValue.mode !== mode)) {
      user.waitingForUpdate = {
        field: role,
        value: { amount, mode },
        type: "employee",
      };
      await safeSendMessage(sock, sender, {
        text: `⚠️ *${role}* already has value *₹${oldValue.amount} (${oldValue.mode})*.\nDo you want to update it to *₹${amount} (${mode})*? (yes/no)`,
      });
      return true;
    }

    // Add or update the employee expense
    if (existingIndex !== -1) {
      user.EmployExpenses[existingIndex] = {
        name: role,
        amount: amount,
        mode,
      };
    } else {
      user.EmployExpenses.push({
        name: role,
        amount: amount,
        mode,
      });
    }

    // Recalculate cash handover after expense change
    recalculateCashHandover(user);
    const completenessMsg = getCompletionMessage(user);
    
    const actionMsg = `✅ *${role}* added: ₹${amount}${mode === "online" ? " (online)" : " (cash)"}!`;
    
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
