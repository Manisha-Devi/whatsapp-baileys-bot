/**
 * Command Handler Module
 * 
 * This module handles various report and data retrieval commands for daily bus records.
 * It provides functionality to:
 * - Clear local user session data
 * - Fetch records for specific dates (today, yesterday, specific date)
 * - Fetch records for date ranges (last N days, date range, this week/month/year)
 * - Calculate and display average profit reports
 * 
 * @module features/daily/handlers/command-handler
 */

import db from "../../../utils/db.js";
import { safeSendMessage, safeDbRead } from "../utils/helpers.js";
import { capitalize } from "../utils/formatters.js";
import { recalculateCashHandover, getCompletionMessage } from "../utils/calculations.js";
import { sendSummary } from "../utils/messages.js";
import { getMenuState } from "../../../utils/menu-state.js";
import { format, startOfWeek, startOfMonth, startOfYear, endOfMonth, isWithinInterval, parse } from "date-fns";

/**
 * Handles the 'clear' command to reset user's local session data.
 * Allows users to start fresh without any previously entered data.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} text - User's input text
 * @returns {Promise<boolean>} True if command was handled, false otherwise
 */
export async function handleClearCommand(sock, sender, text) {
  if (!/^clear$/i.test(text)) return false;

  try {
    delete global.userData?.[sender];
    await safeSendMessage(sock, sender, {
      text: "🧹 Local data cleared successfully! You can start fresh now.",
    });
    return true;
  } catch (err) {
    console.error("❌ Error in clear command:", err);
    return true;
  }
}

/**
 * Sends a formatted message displaying a fetched record's details.
 * Includes all expense categories, collections, and cash handover information.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {Object} record - The database record to display
 * @param {string} title - Title/header for the message (default: "✅ Data Fetched")
 * @returns {Promise<void>}
 */
async function sendFetchedRecord(sock, sender, record, title = "✅ Data Fetched") {
  try {
    // Format extra expenses list with amounts and payment mode indicators
    const extraList =
      record.ExtraExpenses && record.ExtraExpenses.length > 0
        ? record.ExtraExpenses
            .map(
              (e) =>
                `🧾 ${capitalize(e.name)}: ₹${e.amount}${
                  e.mode === "online" ? " 💳" : ""
                }`
            )
            .join("\n")
        : "";

    // Format employee expenses list with amounts and payment mode indicators
    const employList =
      record.EmployExpenses && record.EmployExpenses.length > 0
        ? record.EmployExpenses
            .map(
              (e) =>
                `👤 ${capitalize(e.name)}: ₹${e.amount}${
                  e.mode === "online" ? " 💳" : ""
                }`
            )
            .join("\n")
        : "";

    // Helper to format field with amount, mode and remarks
    const formatField = (field, defaultVal = "0") => {
      if (!field) return { amt: defaultVal, mode: "", remarks: "" };
      const amt = field.amount || field || defaultVal;
      const mode = field.mode === "online" ? " 💳" : "";
      const remarks = field.remarks ? ` ${field.remarks}` : "";
      return { amt, mode, remarks };
    };

    // Extract amounts from record (handles both object and primitive formats)
    const diesel = formatField(record.Diesel);
    const adda = formatField(record.Adda);
    const union = formatField(record.Union);
    const totalCash = formatField(record.TotalCashCollection);
    const online = formatField(record.Online);
    const cashHandover = formatField(record.CashHandover);

    // Include bus code if available
    const busInfo = record.busCode ? `🚌 Bus: *${record.busCode}*\n` : "";

    // Build the complete summary message
    const msg = [
      `${title}`,
      busInfo,
      `📅 Dated: ${record.Dated || "___"}`,
      ``,
      `💰 *Expenses (Outflow):*`,
      `⛽ Diesel: ₹${diesel.amt}${diesel.mode}${diesel.remarks}`,
      `🚌 Adda : ₹${adda.amt}${adda.mode}${adda.remarks}`,
      `🤝 Union: ₹${union.amt}${union.mode}${union.remarks}`,
      extraList ? `${extraList}` : "",
      ``,
      ...(employList ? [`👥 *Employ (Outflow):*`, employList, ``] : []),
      `💵 *Total Collection (Inflow):*`,
      `💸 Total Cash Collection: ₹${totalCash.amt}${totalCash.remarks}`,
      `💳 Online Collection: ₹${online.amt}${online.remarks}`,
      ``,
      `✨ *Total Hand Over:*`,
      `💵 Cash Hand Over: ₹${cashHandover.amt}`,
      ``,
      `✅ Data Fetched successfully!`,
    ].filter(line => line !== "").join("\n");

    await safeSendMessage(sock, sender, { text: msg });
  } catch (err) {
    console.error("❌ sendFetchedRecord error for", sender, ":", err);
    await safeSendMessage(sock, sender, {
      text: "❌ Failed to prepare fetched record. Try again.",
    });
  }
}

/**
 * Generates a database key for a specific bus and date combination.
 * Format: BUSCODE_DD/MM/YYYY
 * 
 * @param {string} busCode - The bus identifier code
 * @param {Date} date - The date object
 * @returns {string} The formatted database key
 */
function getKeyForBusAndDate(busCode, date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${busCode}_${day}/${month}/${year}`;
}

/**
 * Retrieves a record from the database for a specific bus and date.
 * 
 * @param {string} busCode - The bus identifier code
 * @param {Date} date - The date to fetch record for
 * @returns {Object|undefined} The record if found, undefined otherwise
 */
function getRecordForBusAndDate(busCode, date) {
  const key = getKeyForBusAndDate(busCode, date);
  return db.data[key];
}

/**
 * Handles various report commands for fetching daily records.
 * Supports multiple query formats:
 * - "today" / "yesterday" - Fetch single day records
 * - "last N days" - Fetch records for past N days
 * - "N days ago" - Fetch record from N days ago
 * - "DD/MM/YYYY" - Fetch record for specific date
 * - "DD/MM/YYYY to DD/MM/YYYY" - Fetch records for date range
 * - "this week/month/year" - Fetch records for current period
 * - "average [period]" - Calculate average profit for period
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} normalizedText - Normalized user input text
 * @param {Object} user - User's session data object
 * @returns {Promise<boolean>} True if command was handled, false otherwise
 */
export async function handleReportsCommand(sock, sender, normalizedText, user) {
  try {
    await safeDbRead();
    const lowerText = normalizedText.toLowerCase().trim();
    
    // Get the currently selected bus from menu state
    const menuState = getMenuState(sender);
    const selectedBus = menuState.selectedBus;
    
    // Require a bus to be selected before fetching reports
    if (!selectedBus) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ No bus selected. Please type *Entry* to select a bus first.",
      });
      return true;
    }

    // Handle "today" command - fetch today's record
    if (lowerText === "today") {
      const now = new Date();
      const record = getRecordForBusAndDate(selectedBus, now);

      if (!record) {
        await safeSendMessage(sock, sender, { text: `⚠️ No record found for *${selectedBus}* today.` });
        return true;
      }

      await sendFetchedRecord(sock, sender, record, "✅ Today's Data");
      return true;
    }

    // Handle "yesterday" command - fetch yesterday's record
    if (lowerText === "yesterday") {
      const now = new Date();
      now.setDate(now.getDate() - 1);
      const record = getRecordForBusAndDate(selectedBus, now);

      if (!record) {
        await safeSendMessage(sock, sender, { text: `⚠️ No record found for *${selectedBus}* yesterday.` });
        return true;
      }

      await sendFetchedRecord(sock, sender, record, "✅ Yesterday's Data");
      return true;
    }

    // Handle "last N days" command - fetch records for past N days
    const lastDaysMatch = lowerText.match(/^last\s+(\d+)\s+days?$/i);
    if (lastDaysMatch) {
      const daysCount = parseInt(lastDaysMatch[1]);
      const now = new Date();
      let foundCount = 0;

      // Iterate through each day and fetch available records
      for (let i = 0; i < daysCount; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const record = getRecordForBusAndDate(selectedBus, d);
        if (!record) continue;

        foundCount++;
        const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' });
        const monthName = d.toLocaleDateString('en-US', { month: 'long' });
        const formattedDate = `${dayOfWeek}, ${d.getDate()} ${monthName} ${d.getFullYear()}`;

        await sendFetchedRecord(
          sock,
          sender,
          record,
          i === 0 ? "✅ Today's Data" : i === 1 ? "✅ Yesterday's Data" : `✅ ${i} Days Ago\n📅 Dated: ${formattedDate}`
        );

        // Add typing indicator delay between messages for better UX
        if (i < daysCount - 1) {
          try {
            if (sock.presenceSubscribe) await sock.presenceSubscribe(sender);
            if (sock.sendPresenceUpdate) {
              await sock.sendPresenceUpdate("composing", sender);
              await new Promise((r) => setTimeout(r, 1200));
              await sock.sendPresenceUpdate("paused", sender);
            }
          } catch (err) {}
        }
      }

      if (foundCount === 0) {
        await safeSendMessage(sock, sender, {
          text: `⚠️ No records found for *${selectedBus}* in the last ${daysCount} days.`,
        });
      }

      return true;
    }

    // Handle "N days ago" command - fetch record from N days ago
    const daysAgoMatch = lowerText.match(/^(\d+)\s+days?\s+ago$/i);
    if (daysAgoMatch) {
      const daysAgo = parseInt(daysAgoMatch[1]);
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      const record = getRecordForBusAndDate(selectedBus, d);

      if (!record) {
        await safeSendMessage(sock, sender, {
          text: `⚠️ No record found for *${selectedBus}* ${daysAgo} days ago.`,
        });
        return true;
      }

      const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' });
      const monthName = d.toLocaleDateString('en-US', { month: 'long' });
      const formattedDate = `${dayOfWeek}, ${d.getDate()} ${monthName} ${d.getFullYear()}`;

      await sendFetchedRecord(sock, sender, record, `✅ ${daysAgo} Days Ago\n📅 Dated: ${formattedDate}`);
      return true;
    }

    // Handle specific date format "DD/MM/YYYY" or "DD-MM-YYYY"
    const dateMatch = lowerText.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dateMatch) {
      const [_, day, month, year] = dateMatch;
      const key = `${selectedBus}_${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
      const record = db.data[key];

      if (!record) {
        await safeSendMessage(sock, sender, {
          text: `⚠️ No record found for *${selectedBus}* on ${day}/${month}/${year}.`,
        });
        return true;
      }

      await sendFetchedRecord(sock, sender, record);
      return true;
    }

    // Handle date range format "DD/MM/YYYY to DD/MM/YYYY"
    const dateRangeMatch = lowerText.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+to\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/i);
    if (dateRangeMatch) {
      const [_, startDay, startMonth, startYear, endDay, endMonth, endYear] = dateRangeMatch;
      const startDate = new Date(parseInt(startYear), parseInt(startMonth) - 1, parseInt(startDay));
      const endDate = new Date(parseInt(endYear), parseInt(endMonth) - 1, parseInt(endDay));

      // Validate date range
      if (startDate > endDate) {
        await safeSendMessage(sock, sender, {
          text: `⚠️ Start date cannot be after end date.`,
        });
        return true;
      }

      let foundCount = 0;
      const currentDate = new Date(startDate);

      // Iterate through date range and fetch records
      while (currentDate <= endDate) {
        const record = getRecordForBusAndDate(selectedBus, currentDate);

        if (record) {
          foundCount++;
          await sendFetchedRecord(sock, sender, record);
          
          // Add typing indicator delay between messages
          if (sock.presenceSubscribe) await sock.presenceSubscribe(sender);
          if (sock.sendPresenceUpdate) {
            await sock.sendPresenceUpdate("composing", sender);
            await new Promise((r) => setTimeout(r, 1200));
            await sock.sendPresenceUpdate("paused", sender);
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      if (foundCount === 0) {
        await safeSendMessage(sock, sender, {
          text: `⚠️ No records found for *${selectedBus}* from ${startDay}/${startMonth}/${startYear} to ${endDay}/${endMonth}/${endYear}.`,
        });
      }

      return true;
    }

    // Handle "this month" command - fetch all records for current month
    if (lowerText === "this month") {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      let foundCount = 0;

      for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        const record = getRecordForBusAndDate(selectedBus, d);

        if (record) {
          foundCount++;
          await sendFetchedRecord(sock, sender, record);
          
          if (sock.presenceSubscribe) await sock.presenceSubscribe(sender);
          if (sock.sendPresenceUpdate) {
            await sock.sendPresenceUpdate("composing", sender);
            await new Promise((r) => setTimeout(r, 1200));
            await sock.sendPresenceUpdate("paused", sender);
          }
        }
      }

      if (foundCount === 0) {
        await safeSendMessage(sock, sender, {
          text: `⚠️ No records found for *${selectedBus}* this month.`,
        });
      }

      return true;
    }

    // Handle Average Command (Refined Version)
    if (lowerText.startsWith("average") || lowerText.startsWith("a ")) {
        const query = lowerText.replace(/^average\s*/, '').replace(/^a\s+/, '').trim();
        const ranges = [];
        const now = new Date();

        if (query === 'today' || query === '') {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            ranges.push({ start, end: new Date(), name: "Today" });
        } else if (query === 'this week') {
            ranges.push({ start: startOfWeek(now, { weekStartsOn: 1 }), end: now, name: "This Week" });
        } else if (query === 'this month') {
            ranges.push({ start: startOfMonth(now), end: now, name: "This Month" });
        } else if (query === 'this year') {
            ranges.push({ start: startOfYear(now), end: now, name: "This Year" });
        } else {
            const parts = query.split(',').map(p => p.trim());
            for (const part of parts) {
                const match = part.match(/^(\w+)(?:\s+(\d{4}))?$/);
                if (match) {
                    const monthStr = match[1];
                    const yearStr = match[2] || now.getFullYear().toString();
                    try {
                        const start = parse(`${monthStr} ${yearStr}`, 'MMM yyyy', new Date());
                        if (!isNaN(start.getTime())) {
                            ranges.push({ start, end: endOfMonth(start), name: format(start, 'MMM yyyy') });
                        } else {
                            const startFull = parse(`${monthStr} ${yearStr}`, 'MMMM yyyy', new Date());
                            if (!isNaN(startFull.getTime())) {
                                ranges.push({ start: startFull, end: endOfMonth(startFull), name: format(startFull, 'MMM yyyy') });
                            }
                        }
                    } catch (e) {}
                }
            }
        }

        if (ranges.length === 0) return false;

        const checkInterval = (date) => ranges.some(r => isWithinInterval(date, { start: r.start, end: r.end }));

        let totalProfit = 0, totalCollection = 0, totalExpenses = 0, recordCount = 0;

        for (const [key, record] of Object.entries(db.data || {})) {
            if (key.startsWith(selectedBus + "_")) {
                const dateStr = key.split('_')[1];
                try {
                    const recordDate = parse(dateStr, 'dd/MM/yyyy', new Date());
                    if (checkInterval(recordDate)) {
                        recordCount++;
                        const cash = parseFloat(record.TotalCashCollection?.amount || record.TotalCashCollection || 0);
                        const online = parseFloat(record.Online?.amount || record.Online || 0);
                        const diesel = parseFloat(record.Diesel?.amount || record.Diesel || 0);
                        const adda = parseFloat(record.Adda?.amount || record.Adda || 0);
                        const union = parseFloat(record.Union?.amount || record.Union || 0);
                        const extra = (record.ExtraExpenses || []).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
                        const employ = (record.EmployExpenses || []).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

                        const dayInflow = cash + online;
                        const dayOutflow = diesel + adda + union + extra + employ;
                        totalCollection += dayInflow;
                        totalExpenses += dayOutflow;
                        totalProfit += (dayInflow - dayOutflow);
                    }
                } catch(e) {}
            }
        }

        if (recordCount === 0) {
            await safeSendMessage(sock, sender, { text: `⚠️ No records found for *${selectedBus}* in specified periods.` });
            return true;
        }

        const avgProfit = (totalProfit / recordCount).toFixed(0);
        const periodName = ranges.map(r => r.name).join(", ");
        const msg = [
            `📊 *Average Profit Report - ${periodName}*`,
            `🚌 Bus: *${selectedBus}*`,
            ``,
            `📈 Total Days with Data: ${recordCount}`,
            ``,
            `💰 *Breakdown:*`,
            `📥 Total Collection: ₹${totalCollection.toLocaleString('en-IN')}`,
            `📤 Total Expenses: ₹${totalExpenses.toLocaleString('en-IN')}`,
            `💵 Net Profit: ₹${totalProfit.toLocaleString('en-IN')}`,
            ``,
            `✨ *Average Profit/Day: ₹${parseInt(avgProfit).toLocaleString('en-IN')}*`,
        ].join("\n");

        await safeSendMessage(sock, sender, { text: msg });
        return true;
    }

    return false;
  } catch (err) {
    console.error("❌ Error in handleReportsCommand:", err);
    return true;
  }
}
