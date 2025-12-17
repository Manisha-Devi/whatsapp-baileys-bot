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
  
  const bookingRecord = {
    BookingDate: new Date().toLocaleDateString('en-IN'),
    CustomerName: user.CustomerName,
    CustomerPhone: user.CustomerPhone,
    PickupLocation: user.PickupLocation,
    DropLocation: user.DropLocation,
    TravelDateFrom: user.TravelDateFrom,
    TravelDateTo: user.TravelDateTo || user.TravelDateFrom,
    BusCode: user.BusCode,
    Capacity: user.Capacity,
    TotalFare: totalFare,
    AdvancePaid: advancePaid,
    BalanceAmount: balanceAmount,
    Status: "Pending",
    Remarks: user.Remarks || "",
    submittedAt: new Date().toISOString(),
    submittedBy: sender,
  };

  await safeDbRead(bookingsDb);
  bookingsDb.data[bookingId] = bookingRecord;
  const saved = await safeDbWrite(bookingsDb);

  if (!saved) {
    await safeSendMessage(sock, sender, {
      text: "⚠️ Error saving booking to database. Please try again.",
    });
    return true;
  }
  
  let summary = `✅ *Booking Confirmed!*\n`;
  summary += `🎫 *${bookingId}*\n\n`;
  summary += `👤 Customer: ${bookingRecord.CustomerName}\n`;
  summary += `📱 Phone: ${bookingRecord.CustomerPhone}\n`;
  summary += `📍 Pickup: ${bookingRecord.PickupLocation} → Drop: ${bookingRecord.DropLocation}\n`;
  
  if (bookingRecord.TravelDateFrom === bookingRecord.TravelDateTo) {
    summary += `📅 Date: ${bookingRecord.TravelDateFrom}\n`;
  } else {
    summary += `📅 Date: ${bookingRecord.TravelDateFrom} to ${bookingRecord.TravelDateTo}\n`;
  }
  
  summary += `🚌 Bus: ${bookingRecord.BusCode} | Capacity: ${bookingRecord.Capacity}\n`;
  summary += `💰 Total Fare: ₹${bookingRecord.TotalFare.toLocaleString('en-IN')}\n`;
  summary += `💵 Advance: ₹${bookingRecord.AdvancePaid.toLocaleString('en-IN')}\n`;
  summary += `💸 Balance: ₹${bookingRecord.BalanceAmount.toLocaleString('en-IN')}\n`;
  summary += `📊 Status: ${bookingRecord.Status}\n`;
  if (bookingRecord.Remarks) summary += `📝 Remarks: ${bookingRecord.Remarks}\n`;

  await safeSendMessage(sock, sender, { text: summary });

  delete global.bookingData[sender];
  return true;
}
