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
    if (typeof val === 'object') {
      const amt = val.Amount || val.amount;
      // Show mode icon ONLY if it's NOT TotalFare (Fare doesn't have mode anymore)
      const mode = val.mode === "online" ? " 💳" : "";
      return `${amt.toLocaleString('en-IN')}${mode}`;
    }
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
  ];

  // Show Payment History in summary if exists
  if (user.PaymentHistory && user.PaymentHistory.length > 0) {
    msgParts.push(``);
    msgParts.push(`💰 *Payment Collected:*`);
    user.PaymentHistory.forEach(p => {
      const mode = p.mode === "online" ? " 💳" : "";
      msgParts.push(`💵 ${p.date}: ₹${p.amount.toLocaleString('en-IN')}${mode}`);
    });
  }

  msgParts.push(`💸 Balance: ₹${formatAmount(user.BalanceAmount)}`);
  msgParts.push(``);
  
  // Add Real-time summary for Post-Booking
  if (user.editingExisting && user.TotalFare && user.AdvancePaid) {
    const getAmtValue = (f) => {
      if (!f) return 0;
      if (typeof f === 'object') return Number(f.amount || f.Amount) || 0;
      return Number(f) || 0;
    };
    
    const fareAmt = getAmtValue(user.TotalFare);
    const advAmt = getAmtValue(user.AdvancePaid);
    
    const diesel = getAmtValue(user.Diesel);
    const adda = getAmtValue(user.Adda);
    const union = getAmtValue(user.Union);
    const extra = (user.ExtraExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const employ = (user.EmployExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const totalExp = diesel + adda + union + extra + employ;
    
    // Calculate total online expenses
    let totalOnline = 0;
    if (user.Diesel?.mode === 'online') totalOnline += diesel;
    if (user.Adda?.mode === 'online') totalOnline += adda;
    if (user.Union?.mode === 'online') totalOnline += union;
    (user.ExtraExpenses || []).forEach(e => { if (e.mode === 'online') totalOnline += (Number(e.amount) || 0); });
    (user.EmployExpenses || []).forEach(e => { if (e.mode === 'online') totalOnline += (Number(e.amount) || 0); });

    const cashExp = totalExp - totalOnline;
    
    // Cash Handover calculation logic:
    // 1. Start with Advance (if Cash)
    // 2. Add all 'Received' payments (if Cash)
    // 3. Subtract all 'Cash' expenses
    
    const getAmtVal = (f) => {
      if (!f) return 0;
      if (typeof f === 'object') return Number(f.amount || f.Amount) || 0;
      return Number(f) || 0;
    };

    let totalCashReceived = 0;
    // Check Advance mode
    if (user.AdvancePaid?.mode !== 'online') {
      totalCashReceived += getAmtVal(user.AdvancePaid);
    }
    // Check all Received payments
    (user.PaymentHistory || []).forEach(p => {
      if (p.mode !== 'online') {
        totalCashReceived += Number(p.amount) || 0;
      }
    });

    const cashHandover = totalCashReceived - cashExp;
    const bachat = fareAmt - totalExp;

    msgParts.push(``);
    msgParts.push(`✨ *Live Calculation:*`);
    msgParts.push(`💰 Cash HandOver: ₹${cashHandover.toLocaleString('en-IN')}`);
    msgParts.push(`📈 Bachat (Profit): ₹${bachat.toLocaleString('en-IN')}`);
  }

  // Add expense fields for Post-Booking phase
  if (user.editingExisting) {
    msgParts.push(``);
    msgParts.push(`💰 *Expenses (Post-Trip):*`);
    msgParts.push(`⛽ Diesel: ₹${formatExpenseField(user.Diesel)}`);
    msgParts.push(`🚌 Adda: ₹${formatExpenseField(user.Adda)}`);
    msgParts.push(`🤝 Union: ₹${formatExpenseField(user.Union)}`);
    
    // Format extra expenses
    if (user.ExtraExpenses && user.ExtraExpenses.length > 0) {
      user.ExtraExpenses.forEach(e => {
        const mode = e.mode === "online" ? " 💳" : "";
        msgParts.push(`🧾 ${capitalize(e.name)}: ₹${e.amount.toLocaleString('en-IN')}${mode}`);
      });
    }
    
    // Format employee expenses - separate dailySalary and trip
    if (user.EmployExpenses && user.EmployExpenses.length > 0) {
      const dailySalaryExpenses = user.EmployExpenses.filter(e => !e.type || e.type === "dailySalary");
      const tripExpenses = user.EmployExpenses.filter(e => e.type === "trip");
      
      if (dailySalaryExpenses.length > 0) {
        msgParts.push(``);
        msgParts.push(`👥 *Employee (Daily Salary):*`);
        dailySalaryExpenses.forEach(e => {
          const displayName = e.role || e.name;
          const mode = e.mode === "online" ? " 💳" : "";
          const amount = e.amount !== undefined && e.amount !== null ? e.amount.toLocaleString('en-IN') : "___";
          msgParts.push(`👤 ${capitalize(displayName)}: ₹${amount}${mode}`);
        });
      }
      
      if (tripExpenses.length > 0) {
        msgParts.push(``);
        msgParts.push(`🚌 *Employee (Trip):*`);
        tripExpenses.forEach(e => {
          const displayName = e.role || e.name;
          const mode = e.mode === "online" ? " 💳" : "";
          const amount = e.amount !== undefined && e.amount !== null ? e.amount.toLocaleString('en-IN') : "___";
          msgParts.push(`👤 ${capitalize(displayName)}: ₹${amount}${mode}`);
        });
      }
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
