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
 * - TravelDate
 * - VehicleType
 * - NumberOfPassengers
 * - TotalFare
 * - AdvancePaid
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} text - Lowercase user input text
 * @param {Object} user - User's booking session data object
 * @returns {Promise<boolean>} True if submission was handled, false otherwise
 * 
 * @example
 * // When user types "submit" and all fields are complete
 * // Creates booking with ID like "BK123456" and saves to database
 */
export async function handleSubmit(sock, sender, text, user) {
  // Only process if user typed "submit" and is ready for submission
  if (text === "submit" && user.waitingForSubmit) {
    // Define required fields for a complete booking
    const requiredFields = [
      "CustomerName",
      "CustomerPhone",
      "PickupLocation",
      "DropLocation",
      "TravelDate",
      "VehicleType",
      "NumberOfPassengers",
      "TotalFare",
      "AdvancePaid",
    ];

    // Check for missing required fields
    const missingFields = requiredFields.filter((field) => !user[field]);

    if (missingFields.length > 0) {
      await safeSendMessage(sock, sender, {
        text: `⚠️ Cannot submit. Missing fields: ${missingFields.join(", ")}`,
      });
      return true;
    }

    // Parse and validate numeric fields (remove commas if present)
    const totalFare = Number(String(user.TotalFare).replace(/,/g, ''));
    const advancePaid = Number(String(user.AdvancePaid).replace(/,/g, ''));
    const numPassengers = Number(user.NumberOfPassengers);

    // Validate total fare
    if (isNaN(totalFare) || totalFare <= 0) {
      await safeSendMessage(sock, sender, {
        text: `⚠️ Invalid Total Fare. Please enter a valid number.`,
      });
      return true;
    }

    // Validate advance paid
    if (isNaN(advancePaid) || advancePaid < 0) {
      await safeSendMessage(sock, sender, {
        text: `⚠️ Invalid Advance Paid. Please enter a valid number.`,
      });
      return true;
    }

    // Validate number of passengers
    if (isNaN(numPassengers) || numPassengers <= 0) {
      await safeSendMessage(sock, sender, {
        text: `⚠️ Invalid Number of Passengers. Please enter a valid number.`,
      });
      return true;
    }

    // Calculate balance amount
    const balanceAmount = totalFare - advancePaid;

    // Validate that advance doesn't exceed total fare
    if (balanceAmount < 0) {
      await safeSendMessage(sock, sender, {
        text: `⚠️ Advance Paid (₹${advancePaid}) cannot be greater than Total Fare (₹${totalFare}).`,
      });
      return true;
    }

    // Generate unique booking ID using timestamp
    const bookingId = `BK${Date.now().toString().slice(-6)}`;
    
    // Prepare booking record for database
    const bookingRecord = {
      BookingId: bookingId,
      BookingDate: user.BookingDate,
      CustomerName: user.CustomerName,
      CustomerPhone: user.CustomerPhone,
      PickupLocation: user.PickupLocation,
      DropLocation: user.DropLocation,
      TravelDate: user.TravelDate,
      VehicleType: user.VehicleType,
      NumberOfPassengers: numPassengers,
      TotalFare: totalFare,
      AdvancePaid: advancePaid,
      BalanceAmount: balanceAmount,
      Status: user.Status || "Pending",
      Remarks: user.Remarks || "",
      submittedAt: new Date().toISOString(),
      submittedBy: sender,
    };

    // Save booking to database
    await safeDbRead(bookingsDb);
    bookingsDb.data[bookingId] = bookingRecord;
    const saved = await safeDbWrite(bookingsDb);

    if (!saved) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ Error saving booking to database. Please try again.",
      });
      return true;
    }
    
    // Build and send confirmation summary
    let summary = `✅ *Booking Submitted - ${bookingId}*\n\n`;
    summary += `👤 Customer: ${bookingRecord.CustomerName}\n`;
    summary += `📱 Phone: ${bookingRecord.CustomerPhone}\n`;
    summary += `📍 Route: ${bookingRecord.PickupLocation} → ${bookingRecord.DropLocation}\n`;
    summary += `📅 Travel Date: ${bookingRecord.TravelDate}\n`;
    summary += `🚐 Vehicle: ${bookingRecord.VehicleType}\n`;
    summary += `👥 Passengers: ${bookingRecord.NumberOfPassengers}\n`;
    summary += `💰 Total Fare: ₹${bookingRecord.TotalFare}\n`;
    summary += `💵 Advance: ₹${bookingRecord.AdvancePaid}\n`;
    summary += `💸 Balance: ₹${bookingRecord.BalanceAmount}\n`;
    summary += `📊 Status: ${bookingRecord.Status}\n`;
    if (bookingRecord.Remarks) summary += `📝 Remarks: ${bookingRecord.Remarks}\n`;

    await safeSendMessage(sock, sender, { text: summary });

    // Clear user's booking session after successful submission
    delete global.bookingData[sender];
    return true;
  }
  return false;
}
