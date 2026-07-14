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
  let statusFilter = null;
  let balanceFilter = false; // true = show only bookings with balance > 0
  const now = new Date();
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const validStatuses = ["pending", "completed", "deposited"];

  // Check for "bal" or "balance" prefix
  const balMatch = text.match(/^(?:bal|balance)\s*(.*)$/i);
  if (balMatch) {
    balanceFilter = true;
    const balPeriod = balMatch[1].trim();
    // Parse the period part
    const parsePeriod = (p) => {
      if (!p || p === '') {
        // No period = all time
        return { start: new Date(2000, 0, 1), end: new Date(2099, 11, 31), name: "All Time" };
      }
      if (p === 'this month') return { start: startOfMonth(now), end: now, name: "This Month" };
      if (p === 'this week') return { start: startOfWeek(now, { weekStartsOn: 1 }), end: now, name: "This Week" };
      if (p === 'this year') return { start: startOfYear(now), end: now, name: "This Year" };
      if (p === 'today') { const d = new Date(now); d.setHours(0,0,0,0); const e = new Date(now); e.setHours(23,59,59,999); return { start: d, end: e, name: "Today" }; }
      const yearOnly = p.match(/^(\d{4})$/);
      if (yearOnly) {
        const y = parseInt(yearOnly[1]);
        return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59), name: `Year ${y}` };
      }
      const mWords = p.split(' ');
      const mIdx = monthNames.indexOf(mWords[0].substring(0, 3));
      if (mIdx !== -1) {
        let y = now.getFullYear();
        if (mWords[1] && /^\d{4}$/.test(mWords[1])) y = parseInt(mWords[1]);
        const s = new Date(y, mIdx, 1);
        return { start: s, end: endOfMonth(s), name: `${mWords[0].toUpperCase()} ${y}` };
      }
      return null;
    };

    const parsed = parsePeriod(balPeriod);
    if (!parsed) return false;

    await bookingsDb.read();
    const allBookings = Object.entries(bookingsDb.data || {})
      .filter(([key, record]) => {
        if (!key.startsWith(busCode + "_")) return false;
        const dateStr = key.split('_')[1];
        try {
          const recordDate = parse(dateStr, 'dd/MM/yyyy', new Date());
          if (!isWithinInterval(recordDate, { start: parsed.start, end: parsed.end })) return false;
        } catch { return false; }
        const bal = Number(record.BalanceAmount?.Amount || record.BalanceAmount || 0);
        return bal > 0;
      });

    if (allBookings.length === 0) {
      await safeSendMessage(sock, sender, {
        text: `✅ No pending balances for ${parsed.name} (${busCode}).`
      });
      return true;
    }

    const sorted = allBookings.sort((a, b) => {
      const dA = parse(a[0].split('_')[1], 'dd/MM/yyyy', new Date());
      const dB = parse(b[0].split('_')[1], 'dd/MM/yyyy', new Date());
      return dA - dB;
    });

    let totalBalance = 0;
    let listMsg = `📋 *Balance Pending — ${parsed.name}* (${busCode})\n\n`;

    sorted.forEach(([id, b], index) => {
      const dateDisplay = b.Date?.Start === b.Date?.End ? b.Date?.Start : `${b.Date?.Start} to ${b.Date?.End}`;
      const totalFare = Number(b.TotalFare?.Amount || b.TotalFare || 0);
      const balance = Number(b.BalanceAmount?.Amount || b.BalanceAmount || 0);
      const pickup = b.Location?.Pickup || b.PickupLocation || "";
      const drop = b.Location?.Drop || b.DropLocation || "";
      totalBalance += balance;
      listMsg += `${index + 1}. 📅 ${dateDisplay}\n`;
      listMsg += `👤 ${b.CustomerName} | 📱 ${b.CustomerPhone}\n`;
      if (pickup && drop) listMsg += `🚏 ${pickup} → ${drop}\n`;
      listMsg += `💵 Fare: ₹${totalFare.toLocaleString('en-IN')} | 💸 Balance: ₹${balance.toLocaleString('en-IN')}\n`;
      listMsg += `📊 Status: ${b.Status}\n`;
      listMsg += `------------------\n`;
    });

    listMsg += `\n💰 *Total Balance Due: ₹${totalBalance.toLocaleString('en-IN')}*`;
    listMsg += `\n\nType the *Date* to open a booking.`;

    await safeSendMessage(sock, sender, { text: listMsg });
    return true;
  }

  // Parse status filter from end of text
  // e.g. "jul 2026 pending" → period="jul 2026", status="pending"
  // e.g. "2026 completed" → period="2026", status="completed"
  const words = text.split(' ');
  const lastWord = words[words.length - 1];
  let baseText = text;
  if (validStatuses.includes(lastWord)) {
    statusFilter = lastWord.charAt(0).toUpperCase() + lastWord.slice(1); // "Pending"/"Completed"/"Deposited"
    baseText = words.slice(0, -1).join(' ').trim();
  }

  // Basic period commands
  if (baseText === 'today') {
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    periodName = "Today";
  } else if (baseText === 'yesterday') {
    startDate = subDays(now, 1);
    startDate.setHours(0, 0, 0, 0);
    endDate = subDays(now, 1);
    endDate.setHours(23, 59, 59, 999);
    periodName = "Yesterday";
  } else if (baseText === 'this week') {
    startDate = startOfWeek(now, { weekStartsOn: 1 });
    endDate = now;
    periodName = "This Week";
  } else if (baseText === 'this month') {
    startDate = startOfMonth(now);
    endDate = now;
    periodName = "This Month";
  } else if (baseText === 'this year') {
    startDate = startOfYear(now);
    endDate = now;
    periodName = "This Year";
  } else {
    // Check for DD/MM/YYYY (single date — no status filter for single date lookup)
    const dateMatch = baseText.match(/^(\d{2}\/\d{2}\/\d{4})$/);
    if (dateMatch) {
      try {
        startDate = parse(dateMatch[1], 'dd/MM/yyyy', new Date());
        endDate = startDate;
        periodName = dateMatch[1];
      } catch (e) { return false; }
    } else {
      // Check for year only: "2026" or "2025"
      const yearOnlyMatch = baseText.match(/^(\d{4})$/);
      if (yearOnlyMatch) {
        const year = parseInt(yearOnlyMatch[1]);
        startDate = new Date(year, 0, 1);
        endDate = new Date(year, 11, 31, 23, 59, 59);
        periodName = `Year ${year}`;
      } else {
        // Check for Month name or Month Year: "jul", "jul 2026"
        const baseWords = baseText.split(' ');
        const monthIndex = monthNames.indexOf(baseWords[0].substring(0, 3));
        if (monthIndex !== -1) {
          let year = now.getFullYear();
          if (baseWords.length >= 2 && /^\d{4}$/.test(baseWords[1])) {
            year = parseInt(baseWords[1]);
          }
          startDate = new Date(year, monthIndex, 1);
          endDate = endOfMonth(startDate);
          periodName = `${baseWords[0].toUpperCase()} ${year}`;
        }
      }
    }
  }

  if (!startDate) return false;

  await bookingsDb.read();
  let bookings = Object.entries(bookingsDb.data || {})
    .filter(([key, record]) => {
      if (!key.startsWith(busCode + "_")) return false;
      const dateStr = key.split('_')[1];
      try {
        const recordDate = parse(dateStr, 'dd/MM/yyyy', new Date());
        return isWithinInterval(recordDate, { start: startDate, end: endDate });
      } catch (e) { return false; }
    });

  // Apply status filter if provided
  if (statusFilter) {
    bookings = bookings.filter(([, record]) => record.Status === statusFilter);
  }

  if (bookings.length === 0) {
    if (statusFilter) {
      await safeSendMessage(sock, sender, {
        text: `📋 No *${statusFilter}* bookings found for ${periodName} (${busCode}).`
      });
      return true;
    }
    return false;
  }

  // If period search (not single date)
  const isPeriodSearch = baseText !== periodName || // year/month/week/etc
                        baseText === 'this month' || baseText === 'this year' || baseText === 'this week' ||
                        /^\d{4}$/.test(baseText) ||
                        (baseText.split(' ').length <= 2 && monthNames.includes(baseText.split(' ')[0].substring(0, 3)));

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
      const totalFare = b.TotalFare?.Amount || b.TotalFare || 0;
      const balance = b.BalanceAmount?.Amount || b.BalanceAmount || 0;
      listMsg += `${index + 1}. 📅 ${dateDisplay}\n`;
      listMsg += `👤 ${b.CustomerName} | 📱 ${b.CustomerPhone}\n`;
      listMsg += `💵 Fare: ₹${Number(totalFare).toLocaleString('en-IN')} | 💸 Balance: ₹${Number(balance).toLocaleString('en-IN')}\n`;
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
  if (foundBooking.Status === "Completed") warningPrefix = "⚠️ Post Booking";

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
