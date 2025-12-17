/**
 * Booking Messages Module
 * 
 * This module provides message formatting and sending utilities for bookings.
 * It generates formatted WhatsApp messages for displaying booking summaries
 * and determines data entry completion status.
 * 
 * @module features/bookings/utils/messages
 */

import { safeSendMessage } from "./helpers.js";
import { getMenuState } from "../../../utils/menu-state.js";

/**
 * Capitalize first letter of a string
 */
function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Sends a formatted summary of the user's current booking entry progress.
 * Displays all entered fields with appropriate icons and formatting.
 * Shows ₹___ for empty fields (similar to Daily summary).
 * 
 * For Post-Booking phase (editingExisting = true), shows additional expense fields.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} completenessMsg - Status message about missing/complete fields
 * @param {Object} user - User's booking session data
 * @returns {Promise<void>}
 */
export async function sendSummary(sock, sender, completenessMsg, user) {
  // Get bus info from menu state for header
  const menuState = getMenuState(sender);
  const regNumber = menuState?.selectedBusInfo?.registrationNumber || user.RegistrationNumber || '';
  const titleBus = regNumber ? ` (${regNumber})` : '';
  const editingLabel = user.editingExisting ? " (Post-Booking)" : "";
  
  // Format date range with day name
  const formatDateDisplay = (dateStr) => {
    try {
      const [dd, mm, yyyy] = dateStr.split('/').map(Number);
      const dateObj = new Date(yyyy, mm - 1, dd);
      return dateObj.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric', 
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };
  
  let dateDisplay = "___";
  if (user.TravelDateFrom) {
    if (user.TravelDateFrom === user.TravelDateTo || !user.TravelDateTo) {
      dateDisplay = formatDateDisplay(user.TravelDateFrom);
    } else {
      dateDisplay = `${formatDateDisplay(user.TravelDateFrom)} to ${formatDateDisplay(user.TravelDateTo)}`;
    }
  }
  
  // Format amounts with ₹___ for missing values
  const formatAmount = (val) => {
    if (val === undefined || val === null || val === "") return "___";
    return val.toLocaleString('en-IN');
  };
  
  // Helper to format expense field with amount and mode indicator
  const formatExpenseField = (field) => {
    if (!field || field.amount === undefined || field.amount === null) return "___";
    const mode = field.mode === "online" ? " 💳" : "";
    return `${field.amount.toLocaleString('en-IN')}${mode}`;
  };

  // Build base summary
  const msgParts = [
    `📋 *Booking Entry${titleBus}${editingLabel}*`,
    ``,
    `👤 *Customer Details:*`,
    `👤 Name: ${user.CustomerName || "___"}`,
    `📱 Mobile: ${user.CustomerPhone || "___"}`,
    ``,
    `📍 *Route Details:*`,
    `🚏 Pickup: ${user.PickupLocation || "___"}`,
    `🏁 Drop: ${user.DropLocation || "___"}`,
    `📅 Date: ${dateDisplay}`,
    ``,
    `💰 *Payment Details:*`,
    `💵 Total Fare: ₹${formatAmount(user.TotalFare)}`,
    `💳 Advance: ₹${formatAmount(user.AdvancePaid)}`,
    `💸 Balance: ₹${formatAmount(user.BalanceAmount)}`,
  ];
  
  // Add expense fields for Post-Booking phase
  if (user.editingExisting) {
    msgParts.push(``);
    msgParts.push(`💰 *Expenses (Post-Trip):*`);
    msgParts.push(`⛽ Diesel: ₹${formatExpenseField(user.Diesel)}`);
    msgParts.push(`🚌 Adda: ₹${formatExpenseField(user.Adda)}`);
    
    // Format employee expenses
    if (user.EmployExpenses && user.EmployExpenses.length > 0) {
      msgParts.push(``);
      msgParts.push(`👥 *Employee Expenses:*`);
      user.EmployExpenses.forEach(e => {
        const displayName = e.role || e.name;
        const mode = e.mode === "online" ? " 💳" : "";
        const amount = e.amount !== undefined && e.amount !== null ? e.amount.toLocaleString('en-IN') : "___";
        msgParts.push(`👤 ${capitalize(displayName)}: ₹${amount}${mode}`);
      });
    }
  }
  
  // Add remarks if present
  if (user.Remarks) {
    msgParts.push(``);
    msgParts.push(`📝 *Remarks:* ${user.Remarks}`);
  }
  
  msgParts.push(``);
  msgParts.push(completenessMsg);

  await safeSendMessage(sock, sender, { text: msgParts.join("\n") });
}

/**
 * Determines the booking data entry completion status.
 * Checks if all required fields have been filled and returns
 * an appropriate status message.
 * 
 * Required fields:
 * - CustomerName (Name)
 * - CustomerPhone (Mobile)
 * - PickupLocation (Pickup)
 * - DropLocation (Drop)
 * - TravelDateFrom (Date)
 * - BusCode (Bus)
 * - TotalFare
 * - AdvancePaid (Advance)
 * 
 * @param {Object} user - User's booking session data object
 * @returns {string} Status message indicating completion state or missing fields
 */
export function getCompletionMessage(user) {
  // BusCode is auto-set from selected bus, so not in required fields
  const requiredFieldsMap = {
    "CustomerName": "Name",
    "CustomerPhone": "Mobile",
    "PickupLocation": "Pickup",
    "DropLocation": "Drop",
    "TravelDateFrom": "Date",
    "TotalFare": "Fare",
    "AdvancePaid": "Advance",
  };

  const missingFields = Object.entries(requiredFieldsMap)
    .filter(([key]) => user[key] === undefined || user[key] === null || user[key] === "")
    .map(([, label]) => label);

  if (missingFields.length === 0) {
    user.waitingForSubmit = true;
    return "✅ All fields complete!\nDo you want to Submit? (Yes/Y or No/N)";
  } else {
    user.waitingForSubmit = false;
    return `⚠️ Missing: ${missingFields.join(", ")}`;
  }
}
