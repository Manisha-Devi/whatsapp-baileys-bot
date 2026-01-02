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
  
  let senderName = sender;
  try {
    const usersPath = join(__dirname, "../../..", "data", "users.json");
    const usersData = JSON.parse(readFileSync(usersPath, "utf-8"));
    const phoneNumber = sender.replace('@s.whatsapp.net', '').replace(/^\+/, '');
    const foundUser = usersData.users?.find(u => u.phone === phoneNumber || u.phone === `+${phoneNumber}`);
    if (foundUser) {
      senderName = foundUser.name;
    }
  } catch (err) {}
  
  const getAmtValue = (f) => {
    if (!f) return 0;
    if (typeof f === 'object') return Number(f.amount || f.Amount) || 0;
    return Number(f) || 0;
  };
  
  const totalReceivedFromHistory = (user.PaymentHistory || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const fareAmtValue = getAmtValue(user.TotalFare);
  const advAmtValue = getAmtValue(user.AdvancePaid);
  const calculatedBalance = fareAmtValue - advAmtValue - totalReceivedFromHistory;

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
      ? { Amount: calculatedBalance }
      : { Amount: calculatedBalance },
    Online: { amount: 0 },
    TotalCashCollection: { amount: 0 },
    CashHandover: { amount: 0 },
    Diesel: user.Diesel || null,
    Adda: user.Adda || null,
    Union: user.Union || null,
    EmployExpenses: (user.EmployExpenses || []).map(e => {
      const isTrip = e.type === "trip";
      return {
        role: e.role || e.name,
        name: e.name,
        [isTrip ? "trip" : "salary"]: String(e.amount || 0),
        mode: e.mode || "cash"
      };
    }),
    ExtraExpenses: user.ExtraExpenses || [],
    PaymentHistory: user.PaymentHistory || [],
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
  const actionText = isUpdate ? "Updated" : "Taken";
  let summary = `✅ *Booking ${actionText}!* (${regNumber})\n\n`;
  summary += `👤 Customer: ${bookingRecord.CustomerName}\n`;
  summary += `📱 Phone: ${bookingRecord.CustomerPhone}\n`;
  summary += `📍 Pickup: ${bookingRecord.Location.Pickup} → Drop: ${bookingRecord.Location.Drop}\n`;
  
  if (bookingRecord.Date.Start === bookingRecord.Date.End) {
    summary += `📅 Date: ${formatDateDisplay(startDate)}\n`;
  } else {
    summary += `📅 Date: ${formatDateDisplay(startDate)} to ${formatDateDisplay(endDate)} (${bookingRecord.Date.NoOfDays} days)\n`;
  }
  
  const fareAmt = fareAmtValue;
  const advAmt = advAmtValue;
  const advMode = bookingRecord.AdvancePaid?.mode === 'online' ? ' 💳' : '';

  summary += `🚌 Bus: ${bookingRecord.BusCode} | Capacity: ${bookingRecord.Capacity}\n`;
  summary += `💰 Total Fare: ₹${fareAmt.toLocaleString('en-IN')}\n`;
  summary += `💳 Advance: ₹${advAmt.toLocaleString('en-IN')}${advMode}\n`;

  if (bookingRecord.PaymentHistory && bookingRecord.PaymentHistory.length > 0) {
    summary += `💰 *Payment Collected:*\n`;
    bookingRecord.PaymentHistory.forEach(p => {
      const mode = p.mode === "online" ? " 💳" : "";
      summary += `💵 ${p.date}: ₹${p.amount.toLocaleString('en-IN')}${mode}\n`;
    });
  }

  summary += `💸 Balance: ₹${bookingRecord.BalanceAmount.Amount.toLocaleString('en-IN')}\n`;
  
  if (isUpdate) {
    const getExpenseAmount = (field) => {
      if (!field || field.amount === undefined || field.amount === null) return 0;
      return Number(field.amount) || 0;
    };
    
    let totalCashExpense = 0;
    let totalOnlineExpense = 0;
    
    const dieselAmt = getExpenseAmount(bookingRecord.Diesel);
    const addaAmt = getExpenseAmount(bookingRecord.Adda);
    const unionAmt = getExpenseAmount(bookingRecord.Union);
    
    if (bookingRecord.Diesel?.mode === "online") totalOnlineExpense += dieselAmt;
    else totalCashExpense += dieselAmt;
    
    if (bookingRecord.Adda?.mode === "online") totalOnlineExpense += addaAmt;
    else totalCashExpense += addaAmt;
    
    if (bookingRecord.Union?.mode === "online") totalOnlineExpense += unionAmt;
    else totalCashExpense += unionAmt;
    
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
    let totalCashReceived = (bookingRecord.AdvancePaid?.mode !== 'online' ? advAmt : 0);
    let totalOnlinePayments = (bookingRecord.AdvancePaid?.mode === 'online' ? advAmt : 0);

    (bookingRecord.PaymentHistory || []).forEach(p => {
      if (p.mode !== 'online') totalCashReceived += Number(p.amount) || 0;
      else totalOnlinePayments += Number(p.amount) || 0;
    });

    const cashHandover = totalCashReceived - totalCashExpense;
    const bachat = totalFare - totalExpense;
    
    bookingRecord.Online = { amount: totalOnlinePayments };
    bookingRecord.TotalCashCollection = { amount: totalCashReceived };
    bookingRecord.CashHandover = { amount: cashHandover };
    
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
    summary += `💵 Total Cash Collection: ₹${totalCashReceived.toLocaleString('en-IN')}\n`;
    summary += `💰 Cash HandOver: ₹${cashHandover.toLocaleString('en-IN')}\n`;
    summary += `💳 Online Received: ₹${totalOnlinePayments.toLocaleString('en-IN')}\n`;
    summary += `📈 Bachat (Profit): ₹${bachat.toLocaleString('en-IN')}\n`;
  }
  
  summary += `📊 Status: ${bookingRecord.Status}\n`;
  if (bookingRecord.Remarks) summary += `📝 Remarks: ${bookingRecord.Remarks}\n`;

  await safeSendMessage(sock, sender, { text: summary });

  delete global.bookingData[sender];
  return true;
}
