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
    return false;
  }

  // If "this month" or "nov" format, list all bookings one by one
  const isPeriodSearch = text === 'this month' || text === 'this year' || text === 'this week' || 
                        (text.split(' ').length <= 2 && ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].includes(text.split(' ')[0].substring(0, 3)));

  if (isPeriodSearch) {
    let listMsg = `📋 *Bookings for ${periodName}* (${busCode})\n\n`;
    
    // Sort bookings by start date
    const sortedBookings = bookings.sort((a, b) => {
      const dateA = parse(a[1].Date?.Start.split(', ')[1] || a[0].split('_')[1], 'dd MMMM yyyy', new Date());
      const dateB = parse(b[1].Date?.Start.split(', ')[1] || b[0].split('_')[1], 'dd MMMM yyyy', new Date());
      return dateA - dateB;
    });

    sortedBookings.forEach(([id, b], index) => {
      const dateDisplay = b.Date?.Start === b.Date?.End ? b.Date?.Start : `${b.Date?.Start} to ${b.Date?.End}`;
      listMsg += `${index + 1}. 📅 ${dateDisplay}\n`;
      listMsg += `👤 ${b.CustomerName} | 📱 ${b.CustomerPhone}\n`;
      listMsg += `📊 Status: ${b.Status}\n`;
      listMsg += `------------------\n`;
    });
    
    listMsg += `\nType the *Date* or *BusCode_Date* to open a booking.`;
    
    await safeSendMessage(sock, sender, { text: listMsg });
    return true;
  }

  const [id, foundBooking] = bookings[0]; // Default behavior for single date lookup

  // Status-specific warnings
  let warningPrefix = "⚠️ Booking";
  if (foundBooking.Status === "Pending") warningPrefix = "⚠️ Pre Booking";
  else if (foundBooking.Status === "Completed") warningPrefix = "⚠️ Post Booking";
  else if (foundBooking.Status === "Initiated") warningPrefix = "⚠️ Booking";

  // Per user request: If status is Initiated, let it be updated normally
  user.confirmingFetch = true;
  user.pendingBookingId = id;
  user.pendingStartDate = format(startDate, 'dd/MM/yyyy');
  user.pendingEndDate = format(endDate, 'dd/MM/yyyy');

  // Format date display
  const formatDisplay = foundBooking.Date?.Start === foundBooking.Date?.End 
    ? foundBooking.Date?.Start 
    : `${foundBooking.Date?.Start} to ${foundBooking.Date?.End}`;

  await safeSendMessage(sock, sender, {
    text: `${warningPrefix} for *${busCode}* found!\n\n` +
          `📅 Date: ${formatDisplay}\n` +
          `👤 Customer: ${foundBooking.CustomerName}\n` +
          `📱 Phone: ${foundBooking.CustomerPhone}\n` +
          `📊 Status: ${foundBooking.Status}\n\n` +
          `Do you want to open this booking for updates? (*Yes* or *No*)`
  });
  return true;
}
