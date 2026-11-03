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
import { sendDailyYesNoQuickReplyMessage } from "../../../utils/menu-handler.js";

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
  const editingLabel = user.editingExisting ? " (JK06C-4907)" : "";
  
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
    if (typeof val === 'object') {
      const amt = val.Amount || val.amount;
      const mode = val.mode === "online" ? " (Online)" : "";
      return `${amt.toLocaleString('en-IN')}${mode}`;
    }
    return val.toLocaleString('en-IN');
  };
  
  // Helper to format expense field with amount and mode indicator
  const formatExpenseField = (field) => {
    if (!field || field.amount === undefined || field.amount === null) return "___";
    const mode = field.mode === "online" ? " (Online)" : "";
    return `${field.amount.toLocaleString('en-IN')}${mode}`;
  };

    // Build base summary
    const msgParts = [
      `📋 *Booking Entry${titleBus}*`,
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
    ];
  
    // Show Received for updates
    if (user.editingExisting) {
      if (user.PaymentHistory && user.PaymentHistory.length > 0) {
        msgParts.push(`💵 Received:`);
        user.PaymentHistory.forEach(p => {
          const pModeIcon = p.mode === "online" ? " (Online)" : "";
          // Date is already stored in "Thursday, 1 January 2026" format
          msgParts.push(`      💰${p.date} : ₹${Number(p.amount).toLocaleString('en-IN')}${pModeIcon}`);
        });
      } else {
        msgParts.push(`💵 Received: ₹0`);
      }
    }
  
    msgParts.push(`💸 Balance: ₹${formatAmount(user.BalanceAmount)}`);
    
    if (user.editingExisting) {
      // Helper to get numeric value
      const getVal = (f) => {
        if (!f) return 0;
        if (typeof f === 'object') return Number(f.amount || f.Amount) || 0;
        return Number(f) || 0;
      };
  
      const fareAmt = getVal(user.TotalFare);
      const advAmt = getVal(user.AdvancePaid);
      const diesel = getVal(user.Diesel);
      const adda = getVal(user.Adda);
      const union = getVal(user.Union);
      const extra = (user.ExtraExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      
      const employ = (user.EmployExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const totalExp = diesel + adda + union + extra + employ;
  
      // Calculation of Online Received and Cash Collection
      let totalOnlinePayments = (user.AdvancePaid?.mode === 'online' ? advAmt : 0);
      let totalCashReceived = (user.AdvancePaid?.mode !== 'online' ? advAmt : 0);

      (user.PaymentHistory || []).forEach(p => { 
        if (p.mode === 'online') totalOnlinePayments += (Number(p.amount) || 0);
        else totalCashReceived += (Number(p.amount) || 0);
      });

      let cashExp = 0;
      if (user.Diesel?.mode !== 'online') cashExp += diesel;
      if (user.Adda?.mode !== 'online') cashExp += adda;
      if (user.Union?.mode !== 'online') cashExp += union;
      (user.ExtraExpenses || []).forEach(e => { if (e.mode !== 'online') cashExp += (Number(e.amount) || 0); });
      (user.EmployExpenses || []).forEach(e => { if (e.mode !== 'online') cashExp += (Number(e.amount) || 0); });
  
      const cashHandover = totalCashReceived - cashExp;
      const bachat = fareAmt - totalExp;

      msgParts.push(``);
      msgParts.push(`💰 *Expenses:*`);
      msgParts.push(`⛽ Diesel: ₹${formatExpenseField(user.Diesel)}`);
      msgParts.push(`🚌 Adda: ₹${formatExpenseField(user.Adda)}`);
      msgParts.push(`🤝 Union: ₹${formatExpenseField(user.Union)}`);
      
      // Add Extra Expenses if any
      if (user.ExtraExpenses && user.ExtraExpenses.length > 0) {
        user.ExtraExpenses.forEach(e => {
          msgParts.push(`🧾 ${e.name.charAt(0).toUpperCase() + e.name.slice(1)}: ₹${formatExpenseField(e)}`);
        });
      }
      
      // Separate Daily Salary and Trip expenses for summary
      const dailySalaryExpenses = (user.EmployExpenses || []).filter(e => !e.type || e.type === "dailySalary");
      const tripExpenses = (user.EmployExpenses || []).filter(e => e.type === "trip");
      
      // Add Daily Salary if any (check if amount > 0 or it's from defaults)
      if (dailySalaryExpenses.length > 0) {
        const hasVisibleSalary = dailySalaryExpenses.some(e => (Number(e.amount) || 0) > 0);
        if (hasVisibleSalary) {
          msgParts.push(``);
          msgParts.push(`👥 *Employee (Daily Salary):*`);
          dailySalaryExpenses.forEach(e => {
            const displayName = e.role || e.name;
            msgParts.push(`👤 ${displayName}: ₹${formatExpenseField(e)}`);
          });
        }
      }
      
      // Add Trip Expenses if any
      if (tripExpenses.length > 0) {
        msgParts.push(``);
        msgParts.push(`🚌 *Employee (Trip):*`);
        tripExpenses.forEach(e => {
          const displayName = e.role || e.name;
          msgParts.push(`👤 ${displayName}: ₹${formatExpenseField(e)}`);
        });
      }
      
      msgParts.push(``);
      msgParts.push(`✨ *Calculation:*`);
      msgParts.push(`💵 Total Cash Collection: ₹${totalCashReceived.toLocaleString('en-IN')}`);
      msgParts.push(`💰 Cash HandOver: ₹${cashHandover.toLocaleString('en-IN')}`);
      msgParts.push(`💳 Online Received: ₹${totalOnlinePayments.toLocaleString('en-IN')}`);
      msgParts.push(`📈 Bachat (Profit): ₹${bachat.toLocaleString('en-IN')}`);
    
    msgParts.push(``);
    msgParts.push(`You can now update any field.`);
    msgParts.push(`Type Yes to save or No to cancel.`);
  } else {
    msgParts.push(``);
    msgParts.push(completenessMsg);
  }

  const summaryText = msgParts.join("\n");
  if (/Do you want to Submit\?|Type Yes to save or No to cancel/i.test(summaryText)) {
    await sendDailyYesNoQuickReplyMessage(sock, sender, summaryText, "Booking Confirmation");
  } else {
    await safeSendMessage(sock, sender, { text: summaryText });
  }
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
  };

  const missingFields = Object.entries(requiredFieldsMap)
    .filter(([key]) => user[key] === undefined || user[key] === null || user[key] === "")
    .map(([, label]) => label);

  if (missingFields.length === 0) {
    user.waitingForSubmit = true;
    // Set Advance to 0 if not provided
    if (user.AdvancePaid === undefined || user.AdvancePaid === null || user.AdvancePaid === "") {
      user.AdvancePaid = { amount: 0, mode: "cash" };
      if (user.TotalFare) {
        user.BalanceAmount = (typeof user.TotalFare === 'object' ? user.TotalFare.Amount : user.TotalFare) - 0;
      }
    }
    return "✅ All fields complete!\nDo you want to Submit? (Yes/Y or No/N)";
  } else {
    user.waitingForSubmit = false;
    return `⚠️ Missing: ${missingFields.join(", ")}`;
  }
}
