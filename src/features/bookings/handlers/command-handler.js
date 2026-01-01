/**
 * Booking Command Handler Module
 * 
 * This module handles special commands for the booking feature:
 * - Clear command to reset the booking session
 * - Booking lookup by ID or date
 * 
 * @module features/bookings/handlers/command-handler
 */

import { safeSendMessage } from "../utils/helpers.js";
import { bookingsDb } from "../../../utils/db.js";
import { format, subDays, startOfWeek, startOfMonth, startOfYear, isWithinInterval, parse, endOfMonth } from "date-fns";

/**
 * Handles the 'clear' command to reset the user's booking session.
 * Removes all entered booking data and allows starting fresh.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} text - Lowercase user input text
 * @returns {Promise<boolean>} True if command was handled, false otherwise
 * 
 * @example
 * // Input: "clear" or "clear booking"
 * // Clears the current booking session
 */
export async function handleClearCommand(sock, sender, text) {
  if (text === "clear" || text === "clear booking") {
    // Check if user has an active booking session
    if (global.bookingData && global.bookingData[sender]) {
      delete global.bookingData[sender];
      await safeSendMessage(sock, sender, {
        text: "✅ Booking session cleared. You can start a new booking.",
      });
      return true;
    }
  }
  return false;
}

/**
 * Handles booking lookup commands by ID or date.
 * 
 * Supported formats:
 * - "today", "yesterday"
 * - "this week", "this month", "this year"
 * - "nov", "nov 2024"
 * - "[DD/MM/YYYY]"
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} normalizedText - Normalized user input text
 * @param {Object} user - User's booking session data
 * @returns {Promise<boolean>} True if command was handled, false otherwise
 */
export async function handleBookingCommand(sock, sender, normalizedText, user) {
  const text = normalizedText.toLowerCase().trim();
  const busCode = user.BusCode;

  if (!busCode) return false;

  let startDate, endDate;
  let periodName = "";
  const now = new Date();

  // Basic period commands
  if (text === 'today') {
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    periodName = "Today";
  } else if (text === 'yesterday') {
    startDate = subDays(now, 1);
    startDate.setHours(0, 0, 0, 0);
    endDate = subDays(now, 1);
    endDate.setHours(23, 59, 59, 999);
    periodName = "Yesterday";
  } else if (text === 'this week') {
    startDate = startOfWeek(now, { weekStartsOn: 1 });
    endDate = now;
    periodName = "This Week";
  } else if (text === 'this month') {
    startDate = startOfMonth(now);
    endDate = now;
    periodName = "This Month";
  } else if (text === 'this year') {
    startDate = startOfYear(now);
    endDate = now;
    periodName = "This Year";
  } else {
    // Check for DD/MM/YYYY
    const dateMatch = text.match(/^(\d{2}\/\d{2}\/\d{4})$/);
    if (dateMatch) {
      try {
        startDate = parse(dateMatch[1], 'dd/MM/yyyy', new Date());
        endDate = startDate;
        periodName = dateMatch[1];
      } catch (e) { return false; }
    } else {
      // Check for Month name or Month Year
      const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const words = text.split(' ');
      const monthIndex = monthNames.indexOf(words[0].substring(0, 3));
      
      if (monthIndex !== -1) {
        let year = now.getFullYear();
        if (words.length >= 2 && /^\d{4}$/.test(words[1])) {
          year = parseInt(words[1]);
        }
        startDate = new Date(year, monthIndex, 1);
        endDate = endOfMonth(startDate);
        periodName = `${words[0].toUpperCase()} ${year}`;
      }
    }
  }

  if (!startDate) return false;

  await bookingsDb.read();
  const bookings = Object.entries(bookingsDb.data || {})
    .filter(([key, record]) => {
      if (!key.startsWith(busCode + "_")) return false;
      const dateStr = key.split('_')[1];
      try {
        const recordDate = parse(dateStr, 'dd/MM/yyyy', new Date());
        return isWithinInterval(recordDate, { start: startDate, end: endDate });
      } catch (e) { return false; }
    });

  if (bookings.length === 0) {
    await safeSendMessage(sock, sender, { text: `🔍 No bookings found for *${periodName}* (Bus: ${busCode})` });
    return true;
  }

  let listMsg = `🔍 *Bookings for ${periodName}* (Bus: ${busCode})\n\n`;
  bookings.forEach(([id, b]) => {
    const amt = b.TotalFare?.Amount || b.TotalFare || 0;
    const bal = b.BalanceAmount?.Amount || b.BalanceAmount || 0;
    listMsg += `📌 *${id}*\n👤 ${b.CustomerName}\n💰 Fare: ₹${amt.toLocaleString()}\n💸 Bal: ₹${bal.toLocaleString()}\n📊 Status: ${b.Status}\n\n`;
  });
  listMsg += `Total: ${bookings.length} bookings found.`;

  await safeSendMessage(sock, sender, { text: listMsg });
  return true;
}
