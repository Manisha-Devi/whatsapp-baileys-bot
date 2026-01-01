/**
 * Booking Submit Handler Module
 * 
 * This module handles the submission of completed booking entries.
 * It validates all required fields, generates a unique booking ID,
 * and saves the booking to the database.
 * 
 * @module features/bookings/handlers/submit-handler
 */

import { safeSendMessage, safeDbRead, safeDbWrite } from "../utils/helpers.js";
import { bookingsDb } from "../../../utils/db.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Handles the submission of a booking entry.
 * Validates all required fields, generates a unique booking ID,
 * calculates balance amount, and saves to the database.
 * 
 * Required fields for submission:
 * - CustomerName
 * - CustomerPhone
 * - PickupLocation
 * - DropLocation
 * - TravelDateFrom
 * - BusCode
 * - TotalFare
 * - AdvancePaid
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} text - Lowercase user input text
 * @param {Object} user - User's booking session data object
 * @returns {Promise<boolean>} True if submission was handled, false otherwise
 */
export async function handleSubmit(sock, sender, text, user) {
  if (!user.waitingForSubmit) return false;
  
  const isYes = /^(yes|y)$/i.test(text);
  const isNo = /^(no|n)$/i.test(text);
  
  if (!isYes && !isNo) return false;
  
  if (isNo) {
    user.waitingForSubmit = false;
    await safeSendMessage(sock, sender, {
      text: "❌ Booking submission cancelled.\nYou can continue editing or type *Clear* to start over."
    });
    return true;
  }
  
  const requiredFields = [
    "CustomerName",
    "CustomerPhone",
    "PickupLocation",
    "DropLocation",
    "TravelDateFrom",
    "BusCode",
    "TotalFare",
  ];

  const missingFields = requiredFields.filter((field) => 
    user[field] === undefined || user[field] === null || user[field] === ""
  );

  if (missingFields.length > 0) {
    await safeSendMessage(sock, sender, {
      text: `⚠️ Cannot submit. Missing fields: ${missingFields.join(", ")}`,
    });
    return true;
  }

  // Set default Advance if missing
  if (user.AdvancePaid === undefined || user.AdvancePaid === null || user.AdvancePaid === "") {
    user.AdvancePaid = { amount: 0, mode: "cash" };
  }

  const totalFare = Number(String(user.TotalFare || 0).replace(/,/g, ''));
    
  const advancePaid = typeof user.AdvancePaid === 'object'
    ? Number(user.AdvancePaid.amount)
    : Number(String(user.AdvancePaid || 0).replace(/,/g, ''));

  if (isNaN(totalFare) || totalFare <= 0) {
    await safeSendMessage(sock, sender, {
      text: `⚠️ Invalid Total Fare. Please enter a valid number.`,
    });
    return true;
  }

  if (isNaN(advancePaid) || advancePaid < 0) {
    await safeSendMessage(sock, sender, {
      text: `⚠️ Invalid Advance. Please enter a valid number.`,
    });
    return true;
  }

  const balanceAmount = totalFare - advancePaid;

  if (balanceAmount < 0) {
    await safeSendMessage(sock, sender, {
      text: `⚠️ Advance (₹${advancePaid}) cannot be greater than Total Fare (₹${totalFare}).`,
    });
    return true;
  }

  // Calculate number of days between start and end dates
  const startDate = user.TravelDateFrom;
  const endDate = user.TravelDateTo || user.TravelDateFrom;
  
  if (!startDate) {
    await safeSendMessage(sock, sender, {
      text: "⚠️ Start date is missing. Please enter a valid date.",
    });
    return true;
  }
  
  // Format booking date as "Day, DD Month YYYY"
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const formattedBookingDate = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  
  // Helper to format date from DD/MM/YYYY to "Sunday, 15 March 2026"
  const formatDateForJson = (dateStr) => {
    if (!dateStr) return "___";
    try {
      const parts = dateStr.split('/');
      if (parts.length !== 3) return dateStr;
      const [dd, mm, yyyy] = parts.map(Number);
      const dateObj = new Date(yyyy, mm - 1, dd);
      if (isNaN(dateObj.getTime())) return dateStr;
      return `${days[dateObj.getDay()]}, ${dd} ${months[mm - 1]} ${yyyy}`;
    } catch {
      return dateStr;
    }
  };

  const startFormatted = formatDateForJson(startDate);
  const endFormatted = formatDateForJson(endDate);

  // BookingId format: 
  // Single day: BUS102_14/11/2025
  // Multi-day: BUS102_15/11/2025_TO_17/11/2025
  const bookingId = (startDate === endDate) 
    ? `${user.BusCode}_${startDate}`
    : `${user.BusCode}_${startDate}_TO_${endDate}`;
  
  let numberOfDays = 1;
  try {
    const [startDay, startMonth, startYear] = startDate.split('/').map(Number);
    const [endDay, endMonth, endYear] = endDate.split('/').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);
    numberOfDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (isNaN(numberOfDays)) numberOfDays = 1;
  } catch (err) {
    numberOfDays = 1;
  }
  
  // Get sender name from users.json
  let senderName = sender;
  try {
    const usersPath = join(__dirname, "../../..", "data", "users.json");
    const usersData = JSON.parse(readFileSync(usersPath, "utf-8"));
    const phoneNumber = sender.replace('@s.whatsapp.net', '').replace(/^\+/, '');
    const foundUser = usersData.users?.find(u => u.phone === phoneNumber || u.phone === `+${phoneNumber}`);
    if (foundUser) {
      senderName = foundUser.name;
    }
  } catch (err) {
    // Keep sender as is if users.json read fails
  }
  
  const bookingRecord = {
    Sender: senderName,
    BookingDate: formattedBookingDate,
    BusCode: user.BusCode,
    CustomerName: user.CustomerName,
    CustomerPhone: user.CustomerPhone,
    Location: {
      Pickup: user.PickupLocation,
      Drop: user.DropLocation
    },
    Date: {
      NoOfDays: numberOfDays,
      Start: startFormatted,
      End: endFormatted
    },
    Capacity: user.Capacity,
    TotalFare: {
      Amount: totalFare
    },
    AdvancePaid: typeof user.AdvancePaid === 'object' ? user.AdvancePaid : {
      Amount: advancePaid,
      mode: 'cash'
    },
    BalanceAmount: user.editingExisting 
      ? { Amount: balanceAmount, Date: new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }
      : { Amount: balanceAmount },
    // Post-Booking expense fields (always included, empty by default)
    Diesel: user.Diesel || null,
    Adda: user.Adda || null,
    Union: user.Union || null,
    EmployExpenses: user.EmployExpenses || [],
    ExtraExpenses: user.ExtraExpenses || [],
    PaymentHistory: user.PaymentHistory || [],
    // Status and metadata at the end
    Status: user.Status || (user.editingExisting ? "Initiated" : "Pending"),
    Remarks: user.Remarks || "",
    submittedAt: new Date().toISOString(),
  };

  const isUpdate = user.editingExisting;
  
  await safeDbRead(bookingsDb);
  bookingsDb.data[bookingId] = bookingRecord;
  const saved = await safeDbWrite(bookingsDb);

  if (!saved) {
    await safeSendMessage(sock, sender, {
      text: "⚠️ Error saving booking to database. Please try again.",
    });
    return true;
  }
  
  // Format date as "Friday, 12 December 2025"
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
  
  const regNumber = user.RegistrationNumber || bookingRecord.BusCode;
  const actionText = isUpdate ? "Taken" : "Taken";
  let summary = `✅ *Booking ${actionText}!* (${regNumber})\n\n`;
  summary += `👤 Customer: ${bookingRecord.CustomerName}\n`;
  summary += `📱 Phone: ${bookingRecord.CustomerPhone}\n`;
  summary += `📍 Pickup: ${bookingRecord.Location.Pickup} → Drop: ${bookingRecord.Location.Drop}\n`;
  
  if (bookingRecord.Date.Start === bookingRecord.Date.End) {
    summary += `📅 Date: ${formatDateDisplay(bookingRecord.Date.Start)}\n`;
  } else {
    summary += `📅 Date: ${formatDateDisplay(bookingRecord.Date.Start)} to ${formatDateDisplay(bookingRecord.Date.End)} (${bookingRecord.Date.NoOfDays} days)\n`;
  }
  
  const fareAmt = typeof bookingRecord.TotalFare === 'object' ? (bookingRecord.TotalFare.Amount || bookingRecord.TotalFare.amount) : bookingRecord.TotalFare;
  const advAmt = typeof bookingRecord.AdvancePaid === 'object' ? (bookingRecord.AdvancePaid.Amount || bookingRecord.AdvancePaid.amount) : bookingRecord.AdvancePaid.Amount;
  const advMode = bookingRecord.AdvancePaid?.mode === 'online' ? ' 💳' : '';

  summary += `🚌 Bus: ${bookingRecord.BusCode} | Capacity: ${bookingRecord.Capacity}\n`;
  summary += `💰 Total Fare: ₹${fareAmt.toLocaleString('en-IN')}\n`;
  summary += `💳 Advance: ₹${advAmt.toLocaleString('en-IN')}${advMode}\n`;

  // Show Payment History if exists
  if (bookingRecord.PaymentHistory && bookingRecord.PaymentHistory.length > 0) {
    summary += `💰 *Payment Collected:*\n`;
    bookingRecord.PaymentHistory.forEach(p => {
      const mode = p.mode === "online" ? " 💳" : "";
      summary += `💵 ${p.date}: ₹${p.amount.toLocaleString('en-IN')}${mode}\n`;
    });
  }

  summary += `💸 Balance: ₹${bookingRecord.BalanceAmount.Amount.toLocaleString('en-IN')}\n`;
  
  // For Post-Booking updates, show full expense details
  if (isUpdate) {
    // Helper to get expense amount
    const getExpenseAmount = (field) => {
      if (!field || field.amount === undefined || field.amount === null) return 0;
      return Number(field.amount) || 0;
    };
    
    // Calculate total expenses (cash and online separately)
    let totalCashExpense = 0;
    let totalOnlineExpense = 0;
    
    // Diesel, Adda, Union expenses
    const dieselAmt = getExpenseAmount(bookingRecord.Diesel);
    const addaAmt = getExpenseAmount(bookingRecord.Adda);
    const unionAmt = getExpenseAmount(bookingRecord.Union);
    
    if (bookingRecord.Diesel?.mode === "online") totalOnlineExpense += dieselAmt;
    else totalCashExpense += dieselAmt;
    
    if (bookingRecord.Adda?.mode === "online") totalOnlineExpense += addaAmt;
    else totalCashExpense += addaAmt;
    
    if (bookingRecord.Union?.mode === "online") totalOnlineExpense += unionAmt;
    else totalCashExpense += unionAmt;
    
    // Extra expenses
    let extraExpensesText = "";
    if (bookingRecord.ExtraExpenses && bookingRecord.ExtraExpenses.length > 0) {
      bookingRecord.ExtraExpenses.forEach(e => {
        const amt = Number(e.amount) || 0;
        if (e.mode === "online") totalOnlineExpense += amt;
        else totalCashExpense += amt;
        const mode = e.mode === "online" ? " 💳" : "";
        extraExpensesText += `🧾 ${e.name.charAt(0).toUpperCase() + e.name.slice(1)}: ₹${amt.toLocaleString('en-IN')}${mode}\n`;
      });
    }
    
    // Employee expenses
    let dailySalaryText = "";
    let tripText = "";
    if (bookingRecord.EmployExpenses && bookingRecord.EmployExpenses.length > 0) {
      const dailySalaryExpenses = bookingRecord.EmployExpenses.filter(e => !e.type || e.type === "dailySalary");
      const tripExpenses = bookingRecord.EmployExpenses.filter(e => e.type === "trip");
      
      dailySalaryExpenses.forEach(e => {
        const amt = Number(e.amount) || 0;
        if (e.mode === "online") totalOnlineExpense += amt;
        else totalCashExpense += amt;
        const displayName = e.role || e.name;
        const mode = e.mode === "online" ? " 💳" : "";
        dailySalaryText += `👤 ${displayName}: ₹${amt.toLocaleString('en-IN')}${mode}\n`;
      });
      
      tripExpenses.forEach(e => {
        const amt = Number(e.amount) || 0;
        if (e.mode === "online") totalOnlineExpense += amt;
        else totalCashExpense += amt;
        const displayName = e.role || e.name;
        const mode = e.mode === "online" ? " 💳" : "";
        tripText += `👤 ${displayName}: ₹${amt.toLocaleString('en-IN')}${mode}\n`;
      });
    }
    
    const totalExpense = totalCashExpense + totalOnlineExpense;
    
    // Calculate total cash received (Advance + Payments)
    let totalCashReceived = 0;
    if (bookingRecord.AdvancePaid?.mode !== 'online') {
      totalCashReceived += advAmt;
    }
    (bookingRecord.PaymentHistory || []).forEach(p => {
      if (p.mode !== 'online') {
        totalCashReceived += Number(p.amount) || 0;
      }
    });

    const cashHandover = totalCashReceived - totalCashExpense;
    const bachat = totalFare - totalExpense;
    
    summary += `\n💰 *Expenses (Post-Trip):*\n`;
    summary += `⛽ Diesel: ₹${dieselAmt.toLocaleString('en-IN')}${bookingRecord.Diesel?.mode === "online" ? " 💳" : ""}\n`;
    summary += `🚌 Adda: ₹${addaAmt.toLocaleString('en-IN')}${bookingRecord.Adda?.mode === "online" ? " 💳" : ""}\n`;
    summary += `🤝 Union: ₹${unionAmt.toLocaleString('en-IN')}${bookingRecord.Union?.mode === "online" ? " 💳" : ""}\n`;
    if (extraExpensesText) summary += extraExpensesText;
    
    if (dailySalaryText) {
      summary += `\n👥 *Employee (Daily Salary):*\n`;
      summary += dailySalaryText;
    }
    
    if (tripText) {
      summary += `\n🚌 *Employee (Trip):*\n`;
      summary += tripText;
    }
    
    summary += `\n✨ *Summary:*\n`;
    summary += `💵 Total Cash Expense: ₹${totalCashExpense.toLocaleString('en-IN')}\n`;
    summary += `💳 Total Online Expense: ₹${totalOnlineExpense.toLocaleString('en-IN')}\n`;
    summary += `💰 Cash HandOver: ₹${cashHandover.toLocaleString('en-IN')}\n`;
    summary += `📈 Bachat (Profit): ₹${bachat.toLocaleString('en-IN')}\n`;
  }
  
  summary += `📊 Status: ${bookingRecord.Status}\n`;
  if (bookingRecord.Remarks) summary += `📝 Remarks: ${bookingRecord.Remarks}\n`;

  await safeSendMessage(sock, sender, { text: summary });

  delete global.bookingData[sender];
  return true;
}
