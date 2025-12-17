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
    "AdvancePaid",
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

  const totalFare = Number(String(user.TotalFare).replace(/,/g, ''));
  const advancePaid = Number(String(user.AdvancePaid).replace(/,/g, ''));

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

  // BookingId format: BusCode_TravelDateFrom (e.g., BUS101_17/12/2025)
  const bookingId = `${user.BusCode}_${user.TravelDateFrom}`;
  
  // Calculate number of days between start and end dates
  const startDate = user.TravelDateFrom;
  const endDate = user.TravelDateTo || user.TravelDateFrom;
  
  let numberOfDays = 1;
  try {
    const [startDay, startMonth, startYear] = startDate.split('/').map(Number);
    const [endDay, endMonth, endYear] = endDate.split('/').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);
    numberOfDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  } catch (err) {
    numberOfDays = 1;
  }
  
  // Format booking date as "Day, DD Month YYYY"
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const formattedBookingDate = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  
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
      Start: startDate,
      End: endDate
    },
    Capacity: user.Capacity,
    TotalFare: {
      Amount: totalFare
    },
    AdvancePaid: {
      Amount: advancePaid
    },
    BalanceAmount: {
      Amount: balanceAmount
    },
    Status: user.editingExisting ? (user.Status || "Pending") : "Pending",
    Remarks: user.Remarks || "",
    submittedAt: new Date().toISOString(),
    // Post-Booking expense fields (only when editing existing)
    ...(user.editingExisting && {
      Diesel: user.Diesel || null,
      Adda: user.Adda || null,
      EmployExpenses: user.EmployExpenses || [],
    }),
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
  const actionText = isUpdate ? "Updated" : "Confirmed";
  let summary = `✅ *Booking ${actionText}!* (${regNumber})\n\n`;
  summary += `👤 Customer: ${bookingRecord.CustomerName}\n`;
  summary += `📱 Phone: ${bookingRecord.CustomerPhone}\n`;
  summary += `📍 Pickup: ${bookingRecord.Location.Pickup} → Drop: ${bookingRecord.Location.Drop}\n`;
  
  if (bookingRecord.Date.Start === bookingRecord.Date.End) {
    summary += `📅 Date: ${formatDateDisplay(bookingRecord.Date.Start)}\n`;
  } else {
    summary += `📅 Date: ${formatDateDisplay(bookingRecord.Date.Start)} to ${formatDateDisplay(bookingRecord.Date.End)} (${bookingRecord.Date.NoOfDays} days)\n`;
  }
  
  summary += `🚌 Bus: ${bookingRecord.BusCode} | Capacity: ${bookingRecord.Capacity}\n`;
  summary += `💰 Total Fare: ₹${bookingRecord.TotalFare.Amount.toLocaleString('en-IN')}\n`;
  summary += `💵 Advance: ₹${bookingRecord.AdvancePaid.Amount.toLocaleString('en-IN')}\n`;
  summary += `💸 Balance: ₹${bookingRecord.BalanceAmount.Amount.toLocaleString('en-IN')}\n`;
  summary += `📊 Status: ${bookingRecord.Status}\n`;
  if (bookingRecord.Remarks) summary += `📝 Remarks: ${bookingRecord.Remarks}\n`;

  await safeSendMessage(sock, sender, { text: summary });

  delete global.bookingData[sender];
  return true;
}
