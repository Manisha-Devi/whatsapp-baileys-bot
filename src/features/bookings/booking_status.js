/**
 * Booking Status Module
 * 
 * This module handles booking status-related operations:
 * - Querying bookings by their status (pending, confirmed, completed, cancelled)
 * - Updating the status of existing bookings
 * - Logging status changes for audit purposes
 * 
 * @module features/bookings/booking_status
 */

import { safeSendMessage, safeDbRead, safeDbWrite } from "./utils/helpers.js";
import { bookingsDb, bookingsStatusDb } from "../../utils/db.js";

/**
 * Converts a value to a number, returning 0 if conversion fails.
 * Utility function for safely summing monetary values.
 * 
 * @param {*} value - Value to convert to number
 * @returns {number} Numeric value or 0 if invalid
 */
function toNum(value) {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

/**
 * Formats a date input to a full readable date string.
 * Handles various input formats including DD/MM/YYYY and ISO strings.
 * 
 * @param {string} dateInput - Date string to format
 * @returns {string} Formatted date string (e.g., "Monday, 15 December 2025")
 * 
 * @example
 * formatFullDate("15/12/2025")  // Returns "Monday, 15 December 2025"
 * formatFullDate("2025-12-15")  // Returns "Monday, 15 December 2025"
 */
function formatFullDate(dateInput) {
  try {
    if (!dateInput) return "Unknown Date";

    // If already in full format, return as-is
    if (dateInput.includes(",") && dateInput.includes(" ")) return dateInput;

    let dateObj;
    
    // Parse DD/MM/YYYY format
    if (dateInput.includes("/")) {
      const [day, month, year] = dateInput.split("/");
      dateObj = new Date(`${year}-${month}-${day}`);
    } else {
      // Try ISO format or other standard formats
      dateObj = new Date(dateInput);
    }

    // Return original if parsing failed
    if (isNaN(dateObj.getTime())) return dateInput;

    // Format to readable string
    return dateObj.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateInput;
  }
}

/**
 * Handles booking status query commands.
 * Retrieves and displays all bookings matching the requested status.
 * 
 * Command format: "status [pending|confirmed|completed|cancelled]"
 * 
 * Response includes:
 * - List of matching bookings with details
 * - Total count of matching bookings
 * - Total balance amount across all matching bookings
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} normalizedText - Normalized user input text
 * @returns {Promise<boolean>} True if command was handled, false otherwise
 * 
 * @example
 * // Input: "status pending"
 * // Shows all bookings with pending status
 */
export async function handleBookingStatus(sock, sender, normalizedText) {
  try {
    // Match status query pattern
    const match = normalizedText.match(/^status\s+(pending|confirmed|completed|cancelled)$/i);
    if (!match) return false;

    // Normalize status to title case
    const statusQuery = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();

    // Read bookings database
    await safeDbRead(bookingsDb);
    const allBookings = bookingsDb.data || {};

    // Filter bookings by the requested status
    const matchingBookings = Object.values(allBookings).filter(
      (booking) => booking.Status?.toLowerCase() === statusQuery.toLowerCase()
    );

    // Handle case when no bookings found
    if (matchingBookings.length === 0) {
      await safeSendMessage(sock, sender, {
        text: `📊 *Bookings with Status: ${statusQuery}*\n\nNo bookings found with this status.`,
      });
      return true;
    }

    // Build response message with booking details
    let response = `📊 *Bookings with Status: ${statusQuery}*\n\n`;
    let totalBalance = 0;

    // Add each booking's details to the response
    matchingBookings.forEach((booking, index) => {
      response += `${index + 1}. *${booking.BookingId}*\n`;
      response += `📅 ${booking.TravelDate}\n`;
      response += `👤 ${booking.CustomerName} (${booking.CustomerPhone})\n`;
      response += `📍 ${booking.PickupLocation} → ${booking.DropLocation}\n`;
      response += `🚐 ${booking.VehicleType} (${booking.NumberOfPassengers} passengers)\n`;
      response += `💰 Total: ₹${booking.TotalFare} | Paid: ₹${booking.AdvancePaid} | Balance: ₹${booking.BalanceAmount}\n`;
      if (booking.Remarks) response += `📝 ${booking.Remarks}\n`;
      response += `\n`;
      totalBalance += toNum(booking.BalanceAmount);
    });

    // Add summary totals
    response += `📊 *Total ${statusQuery} Bookings:* ${matchingBookings.length}\n`;
    response += `💵 *Total Balance Amount:* ₹${totalBalance}`;

    await safeSendMessage(sock, sender, { text: response });
    return true;
  } catch (err) {
    console.error("❌ Error in handleBookingStatus:", err);
    await safeSendMessage(sock, sender, {
      text: "⚠️ Error retrieving booking status.",
    });
    return true;
  }
}

/**
 * Handles booking status update commands.
 * Updates the status of an existing booking and logs the change.
 * 
 * Command format: "update status [BookingID] [new_status] [optional: remarks ...]"
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} normalizedText - Normalized user input text
 * @returns {Promise<boolean>} True if command was handled, false otherwise
 * 
 * @example
 * // Input: "update status BK001 confirmed remarks Customer verified"
 * // Updates BK001 status to Confirmed with the given remarks
 */
export async function handleBookingStatusUpdate(sock, sender, normalizedText) {
  try {
    // Match update status pattern with optional remarks
    const match = normalizedText.match(
      /^update\s+status\s+(.+?)\s+(pending|confirmed|completed|cancelled)(?:\s+remarks\s+(.+))?$/i
    );
    if (!match) return false;

    const bookingId = match[1].trim().toUpperCase();
    const requestedStatusRaw = match[2].trim();
    const remarksRaw = match[3]?.trim() ?? null;

    // Normalize status to title case
    const newStatus = requestedStatusRaw.charAt(0).toUpperCase() + requestedStatusRaw.slice(1);

    // Read bookings database
    await safeDbRead(bookingsDb);
    
    // Check if the booking exists
    if (!bookingsDb.data[bookingId]) {
      await safeSendMessage(sock, sender, {
        text: `❌ Booking ${bookingId} not found in database.`,
      });
      return true;
    }

    // Store old status for logging
    const oldStatus = bookingsDb.data[bookingId].Status;

    // Update booking status in main database
    bookingsDb.data[bookingId].Status = newStatus;
    if (remarksRaw) {
      bookingsDb.data[bookingId].StatusRemarks = remarksRaw;
    }
    bookingsDb.data[bookingId].lastUpdated = new Date().toISOString();

    // Save changes to database
    const saved = await safeDbWrite(bookingsDb);

    if (!saved) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ Error updating booking status in database.",
      });
      return true;
    }

    // Log the status change in the status history database
    await safeDbRead(bookingsStatusDb);
    bookingsStatusDb.data.push({
      bookingId: bookingId,
      oldStatus: oldStatus,
      newStatus: newStatus,
      remarks: remarksRaw || "",
      updatedBy: sender,
      updatedAt: new Date().toISOString(),
    });
    await safeDbWrite(bookingsStatusDb);

    // Build and send confirmation message
    let response = `✅ *Booking Status Updated*\n\n`;
    response += `🎫 Booking ID: ${bookingId}\n`;
    response += `📊 Status: ${oldStatus} → ${newStatus}\n`;
    if (remarksRaw) response += `📝 Remarks: ${remarksRaw}\n`;

    await safeSendMessage(sock, sender, { text: response });
    return true;
  } catch (err) {
    console.error("❌ Error in handleBookingStatusUpdate:", err);
    await safeSendMessage(sock, sender, {
      text: "⚠️ Error updating booking status.",
    });
    return true;
  }
}
