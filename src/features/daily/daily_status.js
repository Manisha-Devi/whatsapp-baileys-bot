/**
 * daily_status.js - Daily Report Status Management
 * 
 * This module handles viewing and updating the status of daily reports.
 * Reports go through three statuses:
 * - Initiated: Report has been created/submitted
 * - Collected: Cash has been collected from the driver/conductor
 * - Deposited: Cash has been deposited to the bank/owner
 * 
 * Provides commands to:
 * - View all reports with a specific status
 * - Update status for single date or date range
 * - Add remarks when updating status
 */

import db, { statusDb } from "../../utils/db.js";
import { safeSendMessage } from "./utils/helpers.js";
import { getMenuState } from "../../utils/menu-state.js";

/**
 * Convert a value to a number, returning 0 if invalid
 * 
 * @param {any} value - Value to convert
 * @returns {number} The numeric value or 0
 */
function toNum(value) {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

/**
 * Format a date string into a human-readable format
 * Converts "15/11/2025" to "Saturday, 15 November 2025"
 * 
 * @param {string} dateInput - Date string in various formats
 * @returns {string} Formatted date string or original if parsing fails
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
      // Try parsing other formats
      dateObj = new Date(dateInput);
    }

    // Return original if parsing failed
    if (isNaN(dateObj.getTime())) return dateInput;

    // Format as full date with weekday
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
 * Handle commands to view daily reports by status
 * Matches patterns like: "initiated", "i", "status collected", "c", "deposited"
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} sender - The WhatsApp sender ID
 * @param {string} normalizedText - The user's message text
 * @returns {Promise<boolean>} True if command was handled, false otherwise
 */
export async function handleDailyStatus(sock, sender, normalizedText) {
  try {
    // Match status view commands with shortcuts
    // Examples: "initiated", "i", "status collected", "c", "deposited", "d"
    const match = normalizedText.match(/^(?:status\s+)?(initiated|collected|deposited|i|c|d)$/i);
    if (!match) return false;

    const rawStatus = match[1].toLowerCase();
    
    // Map shortcuts to full status names
    const statusMap = {
      'i': 'Initiated',
      'c': 'Collected',
      'd': 'Deposited',
      'initiated': 'Initiated',
      'collected': 'Collected',
      'deposited': 'Deposited'
    };
    
    const statusQuery = statusMap[rawStatus];

    // Get selected bus from menu state
    const menuState = getMenuState(sender);
    const selectedBus = menuState.selectedBus;

    if (!selectedBus) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ No bus selected. Please type *Entry* to select a bus first.",
      });
      return true;
    }

    // Read all daily data from database
    await db.read();
    const data = db.data || {};

    // Filter entries for this bus and status
    const filtered = Object.entries(data)
      .filter(([key, entry]) => {
        const keyBus = key.split('_')[0];  // Key format: BUSXXX_DD/MM/YYYY
        return keyBus === selectedBus && entry.Status === statusQuery;
      })
      .map(([key, entry]) => ({ key, ...entry }));

    // Handle case when no entries found
    if (filtered.length === 0) {
      await safeSendMessage(sock, sender, {
        text: `✅ No entries found for *${selectedBus}* with status: *${statusQuery}*`,
      });
      return true;
    }

    // Sort entries by date (newest first)
    filtered.sort((a, b) => {
      const dateA = new Date(a.Dated || a.key.split('_')[1]);
      const dateB = new Date(b.Dated || b.key.split('_')[1]);
      return dateB - dateA;
    });

    // Build response message
    let msg = `📊 *Status: ${statusQuery}*\n🚌 Bus: *${selectedBus}*\n\n`;

    let totalCash = 0;
    let totalCount = 0;

    // Add each entry to the message
    for (const entry of filtered) {
      const dateFormatted = formatFullDate(entry.Dated || entry.key.split('_')[1]);
      msg += `📅 ${dateFormatted}\n`;

      // Get cash amounts from entry (handle both object and direct value formats)
      const cashHandoverAmt = entry.CashHandover?.amount || entry.CashHandover || "0";
      const totalCollectionAmt = entry.TotalCashCollection?.amount || entry.TotalCashCollection || "0";

      // Show cash handover if available, otherwise show total collection
      if (cashHandoverAmt && cashHandoverAmt !== "0") {
        msg += `💵 Cash Handover: ₹${cashHandoverAmt}\n\n`;
        totalCash += toNum(cashHandoverAmt);
      } else {
        msg += `💸 Total Collection: ₹${totalCollectionAmt}\n\n`;
        totalCash += toNum(totalCollectionAmt);
      }

      totalCount++;
    }

    // Add summary totals
    msg += `📊 *Total Entries:* ${totalCount}\n`;
    msg += `💰 *Total Cash Handover:* ₹${totalCash}`;

    await safeSendMessage(sock, sender, { text: msg });
    return true;
  } catch (err) {
    console.error("❌ Error in handleDailyStatus:", err);
    await safeSendMessage(sock, sender, {
      text: "⚠️ Error retrieving daily status.",
    });
    return true;
  }
}

/**
 * Parse a date string in DD/MM/YYYY format to a Date object
 * 
 * @param {string} s - Date string to parse
 * @returns {Date|null} Parsed Date object or null if invalid
 */
function parseDateStr(s) {
  const parts = String(s).trim().split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const dt = new Date(iso);
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Normalize a date key string (trim whitespace)
 * 
 * @param {string} raw - Raw date string
 * @returns {string} Normalized date string
 */
function normalizeKey(raw) {
  let k = String(raw).replace(/\//g, "/").trim();
  return k;
}

/**
 * Parse a date expression into an array of date keys
 * Handles:
 * - Single date: "15/11/2025"
 * - Date range: "10/11/2025 to 15/11/2025"
 * - Comma-separated: "10/11/2025, 12/11/2025, 15/11/2025"
 * 
 * @param {string} expr - Date expression to parse
 * @returns {Array<string>} Array of date keys in DD/MM/YYYY format
 */
function parseDatesExpression(expr) {
  expr = String(expr).trim();
  
  // Check for date range (e.g., "10/11/2025 to 15/11/2025")
  const rangeMatch = expr.match(/^(.+?)\s+to\s+(.+)$/i);
  if (rangeMatch) {
    const s = parseDateStr(rangeMatch[1].trim());
    const e = parseDateStr(rangeMatch[2].trim());
    if (!s || !e) return [];
    
    // Generate all dates in the range
    const keys = [];
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      keys.push(`${day}/${month}/${year}`);
    }
    return keys;
  }

  // Check for comma-separated dates
  if (expr.includes(",")) {
    return expr
      .split(",")
      .map((x) => normalizeKey(x.trim()))
      .filter(Boolean);
  }

  // Single date
  return [normalizeKey(expr)];
}

// Only these statuses can be set via update command
const ALLOWED_STATUSES = new Set(["collected", "deposited"]);

/**
 * Handle commands to update the status of daily reports
 * Matches patterns like:
 * - "update 15/11/2025 collected"
 * - "update 10/11/2025 to 15/11/2025 deposited"
 * - "update 15/11/2025 collected remark all done"
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} sender - The WhatsApp sender ID
 * @param {string} normalizedText - The user's message text
 * @returns {Promise<boolean>} True if command was handled, false otherwise
 */
export async function handleStatusUpdate(sock, sender, normalizedText) {
  try {
    // Match update command pattern with optional remark
    const match = normalizedText.match(
      /^update\s+(.+?)\s+(collected|deposited|c|d)(?:\s+remark\s+(.+))?$/i
    );
    if (!match) return false;

    const datesExpr = match[1].trim();
    const requestedStatusRaw = match[2].trim().toLowerCase();
    const remarksRaw = match[3]?.trim() ?? null;

    // Map shortcuts to full status names
    const statusShortcuts = {
      'c': 'collected',
      'd': 'deposited',
      'collected': 'collected',
      'deposited': 'deposited'
    };
    
    const requestedStatusLower = statusShortcuts[requestedStatusRaw];
    
    // Validate status
    if (!requestedStatusLower) {
      await safeSendMessage(sock, sender, {
        text:
          "❌ Invalid status. Only the following statuses are allowed:\n• Collected or C\n• Deposited or D\n\nUsage examples:\n`Update 05/11/2025 Collected`\n`Update 05/11/2025 to 07/11/2025 Deposited Remark bank_deposit`",
      });
      return true;
    }

    // Get selected bus from menu state
    const menuState = getMenuState(sender);
    const selectedBus = menuState.selectedBus;

    if (!selectedBus) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ No bus selected. Please type *Entry* to select a bus first.",
      });
      return true;
    }

    // Capitalize first letter for storage
    const newStatus = requestedStatusLower.charAt(0).toUpperCase() + requestedStatusLower.slice(1);

    // Parse the date expression into individual dates
    const normalizedDates = parseDatesExpression(datesExpr);
    if (!normalizedDates || normalizedDates.length === 0) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ Unable to parse dates. Use format: DD/MM/YYYY or a range using 'to', or a comma-separated list.",
      });
      return true;
    }

    // Read current data from databases
    await db.read();
    const data = db.data || {};

    await statusDb.read();
    let logData = statusDb.data || [];
    if (!Array.isArray(logData)) logData = [];

    // Build set of already logged entries to prevent duplicate updates
    const alreadyLogged = new Set();
    for (const lg of logData) {
      if (lg.busCode === selectedBus && Array.isArray(lg.updatedKeys)) {
        for (const k of lg.updatedKeys) {
          alreadyLogged.add(k);
        }
      }
    }

    const actuallyUpdated = [];
    const actuallySkipped = [];

    // Process each date
    for (const dateKey of normalizedDates) {
      const key = `${selectedBus}_${dateKey}`;  // Key format: BUSXXX_DD/MM/YYYY
      const entry = data[key];

      // Skip if no record exists for this date
      if (!entry) {
        actuallySkipped.push(`${dateKey} (no record found)`);
        continue;
      }

      // Skip if already logged in status history
      if (alreadyLogged.has(key)) {
        actuallySkipped.push(`${dateKey} (already logged earlier)`);
        continue;
      }

      // Skip if already at the requested status
      if (entry.Status === newStatus) {
        actuallySkipped.push(`${dateKey} (already ${newStatus})`);
        continue;
      }

      // Update the status and submittedAt timestamp
      entry.Status = newStatus;
      entry.submittedAt = new Date().toISOString();
      actuallyUpdated.push(key);
    }

    // Persist updates to daily data database
    if (actuallyUpdated.length > 0) {
      try {
        await db.write();
      } catch (err) {
        console.error("Failed to write DB:", err);
        await safeSendMessage(sock, sender, {
          text: "❌ Failed to persist updates to the DB. Check server permissions.",
        });
        return true;
      }
    }

    // Log the status update to status history
    if (actuallyUpdated.length > 0) {
      const newLog = {
        updatedOn: new Date().toISOString(),
        busCode: selectedBus,
        updatedKeys: actuallyUpdated,
        statusChangedTo: newStatus,
        remarks: remarksRaw || null,
      };
      logData.push(newLog);
      statusDb.data = logData;
      try {
        await statusDb.write();
      } catch (err) {
        console.error("Failed to write status log:", err);
        await safeSendMessage(sock, sender, {
          text: "❌ Updated records but failed to write status log. Check filesystem permissions.",
        });
        return true;
      }
    }

    // Build response message
    const replyParts = [];
    if (actuallyUpdated.length > 0) {
      const datesList = actuallyUpdated.map(k => k.split('_')[1]).join(", ");
      replyParts.push(
        `✅ Updated ${actuallyUpdated.length} record${actuallyUpdated.length > 1 ? "s" : ""} for *${selectedBus}* to *${newStatus}*.\nDates: ${datesList}`
      );
    }
    if (actuallySkipped.length > 0) {
      replyParts.push(`⚠️ Skipped: ${actuallySkipped.join(", ")}`);
    }
    if (remarksRaw) replyParts.push(`📝 Remarks: ${remarksRaw}`);

    // Handle case where nothing was updated
    if (replyParts.length === 0) {
      replyParts.push(`⚠️ No matching entries updated for *${selectedBus}*: ${normalizedDates.join(", ")}`);
    }

    await safeSendMessage(sock, sender, { text: replyParts.join("\n\n") });
    return true;
  } catch (err) {
    console.error("❌ Error in handleStatusUpdate:", err);
    await safeSendMessage(sock, sender, {
      text: "⚠️ Error updating status. Please check your command format and try again.",
    });
    return true;
  }
}
