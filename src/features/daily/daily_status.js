// daily_status.js
import db, { statusDb } from "../../data/db.js";
import { safeSendMessage } from "./utils/helpers.js";

// 🧮 Convert safely to number
function toNum(value) {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

// 📅 Format date like: "Friday, 07 November 2025"
function formatFullDate(dateInput) {
  try {
    if (!dateInput) return "Unknown Date";

    // If already formatted, return as is
    if (dateInput.includes(",") && dateInput.includes(" ")) return dateInput;

    let dateObj;
    if (dateInput.includes("/")) {
      const [day, month, year] = dateInput.split("/");
      dateObj = new Date(`${year}-${month}-${day}`);
    } else {
      dateObj = new Date(dateInput);
    }

    if (isNaN(dateObj.getTime())) return dateInput;

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

// 📊 Handle "Daily Status" command
export async function handleDailyStatus(sock, sender, normalizedText) {
  try {
    // Match messages like: "status initiated", "initiated", "i", "c", "d" (prefix already stripped)
    const match = normalizedText.match(/^(?:status\s+)?(initiated|collected|deposited|i|c|d)$/i);
    if (!match) return false; // not a status command

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

    await db.read();
    const data = db.data || {};

    // Filter records by status
    const filtered = Object.entries(data)
      .filter(([_, entry]) => entry.Status === statusQuery)
      .map(([key, entry]) => ({ key, ...entry }));

    if (filtered.length === 0) {
      await safeSendMessage(sock, sender, {
        text: `✅ No entries found with status: *${statusQuery}*`,
      });
      return true;
    }

    // Sort by date descending (latest first)
    filtered.sort((a, b) => {
      const dateA = new Date(a.Dated || a.key);
      const dateB = new Date(b.Dated || b.key);
      return dateB - dateA;
    });

    // Start message
    let msg = `📊 *Status: ${statusQuery}*\n\n`;

    let totalCash = 0;
    let totalCount = 0;

    for (const entry of filtered) {
      const dateFormatted = formatFullDate(entry.Dated || entry.key);
      msg += `📅 ${dateFormatted}\n`;

      // Show only one important value (Cash Handover or Total Collection)
      // Handle both old format (string) and new format (object)
      const cashHandover = typeof entry.CashHandover === 'object' 
        ? entry.CashHandover?.amount 
        : entry.CashHandover;
      const totalCollection = typeof entry.TotalCashCollection === 'object'
        ? entry.TotalCashCollection?.amount
        : entry.TotalCashCollection;
        
      if (cashHandover && cashHandover !== "0") {
        msg += `💵 Cash Handover: ₹${cashHandover}\n\n`;
        totalCash += toNum(cashHandover);
      } else {
        msg += `💸 Total Collection: ₹${totalCollection || 0}\n\n`;
        totalCash += toNum(totalCollection);
      }

      totalCount++;
    }

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

// Helper: parse date string "DD/MM/YYYY" -> Date object
function parseDateStr(s) {
  const parts = String(s).trim().split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const dt = new Date(iso);
  return isNaN(dt.getTime()) ? null : dt;
}

// Normalize date-key into ddmmyyyy string (and pad 7-digit to 8)
function normalizeKey(raw) {
  let k = String(raw).replace(/\//g, "").trim();
  if (/^\d{7}$/.test(k)) k = k.padStart(8, "0");
  return k;
}

// Parse incoming "dates expression" into an array of normalized keys.
// Accepts single dd/mm/yyyy, comma list, or range using 'to'
function parseDatesExpression(expr) {
  expr = String(expr).trim();
  // Range with 'to' (case-insensitive)
  const rangeMatch = expr.match(/^(.+?)\s+to\s+(.+)$/i);
  if (rangeMatch) {
    const s = parseDateStr(rangeMatch[1].trim());
    const e = parseDateStr(rangeMatch[2].trim());
    if (!s || !e) return [];
    const keys = [];
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      keys.push(normalizeKey(`${day}/${month}/${year}`));
    }
    return keys;
  }

  // Comma separated
  if (expr.includes(",")) {
    return expr
      .split(",")
      .map((x) => normalizeKey(x.trim()))
      .filter(Boolean);
  }

  // Single
  return [normalizeKey(expr)];
}

// Allowed statuses (lowercase)
const ALLOWED_STATUSES = new Set(["collected", "deposited"]);

// 📝 Handle "update status" command
export async function handleStatusUpdate(sock, sender, normalizedText) {
  try {
    // Accepts:
    //   update 05/11/2025 collected remark bank
    //   update 05/11/2025 to 07/11/2025 deposited
    //   update 05/11/2025,06/11/2025 collected
    const match = normalizedText.match(
      /^update\s+(.+?)\s+(collected|deposited|c|d)(?:\s+remark\s+(.+))?$/i
    );
    if (!match) return false; // not this command

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
    
    if (!requestedStatusLower) {
      await safeSendMessage(sock, sender, {
        text:
          "❌ Invalid status. Only the following statuses are allowed:\n• Collected or C\n• Deposited or D\n\nUsage examples:\n`Update 05/11/2025 Collected`\n`Update 05/11/2025 to 07/11/2025 Deposited Remark bank_deposit`",
      });
      return true;
    }

    // Normalize status to Title case for storing/display
    const newStatus = requestedStatusLower.charAt(0).toUpperCase() + requestedStatusLower.slice(1);

    // parse requested keys
    const normalizedKeys = parseDatesExpression(datesExpr);
    if (!normalizedKeys || normalizedKeys.length === 0) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ Unable to parse dates. Use format: DD/MM/YYYY or a range using 'to', or a comma-separated list.",
      });
      return true;
    }

    // Read main DB via db helper
    await db.read();
    const data = db.data || {};

    // Read status log via statusDb
    await statusDb.read();
    let logData = statusDb.data || [];
    if (!Array.isArray(logData)) logData = [];

    // Build set of already-logged keys (normalize to 8-digit)
    const alreadyLogged = new Set();
    for (const lg of logData) {
      if (Array.isArray(lg.updatedKeys)) {
        for (const k of lg.updatedKeys) {
          alreadyLogged.add(String(k).padStart(8, "0"));
        }
      }
    }

    const actuallyUpdated = [];
    const actuallySkipped = [];

    // For each requested key decide action
    for (const rawKey of normalizedKeys) {
      const key = String(rawKey).padStart(8, "0"); // normalized
      const entry = data[key];

      if (!entry) {
        actuallySkipped.push(`${key} (no record found)`);
        continue;
      }

      // If already logged in daily_status.json => skip
      if (alreadyLogged.has(key)) {
        actuallySkipped.push(`${key} (already logged earlier)`);
        continue;
      }

      // If entry already has that status => skip
      if (entry.Status === newStatus) {
        actuallySkipped.push(`${key} (already ${newStatus})`);
        continue;
      }

      // Otherwise update the status in main DB
      entry.Status = newStatus;
      actuallyUpdated.push(key);
    }

    // Persist main DB only if updates occurred
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

    // Append a log entry only for the keys actually updated (do not log skipped)
    if (actuallyUpdated.length > 0) {
      const newLog = {
        updatedOn: new Date().toISOString(),
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

    // Build reply for user
    const replyParts = [];
    if (actuallyUpdated.length > 0) {
      replyParts.push(
        `✅ Updated ${actuallyUpdated.length} record${actuallyUpdated.length > 1 ? "s" : ""} to *${newStatus}*.\nKeys: ${actuallyUpdated.join(
          ", "
        )}`
      );
    }
    if (actuallySkipped.length > 0) {
      replyParts.push(`⚠️ Skipped: ${actuallySkipped.join(", ")}`);
    }
    if (remarksRaw) replyParts.push(`📝 Remarks: ${remarksRaw}`);

    if (replyParts.length === 0) {
      replyParts.push(`⚠️ No matching entries updated for: ${normalizedKeys.join(", ")}`);
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
