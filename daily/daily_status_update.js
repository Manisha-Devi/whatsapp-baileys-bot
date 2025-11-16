// daily_status_update.js
import db from "./daily_db.js";
import { safeSendMessage } from "../helpers.js";
import fs from "fs";
import path from "path";

// Path to files (consistent with server.js)
const logFile = path.join(".", "daily", "data", "daily_status.json");
const dataFileFallback = path.join(".", "daily", "data", "daily_data.json");

// Ensure folder & log file exist
try {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, JSON.stringify([], null, 2));
} catch (err) {
  // ignore here; will surface if writes fail
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

// Main handler
export async function handleStatusUpdate(sock, sender, normalizedText) {
  try {
    // Accepts:
    //   update status 05/11/2025 collected remarks bank
    //   update status 05/11/2025 to 07/11/2025 deposited
    //   update status 05/11/2025,06/11/2025 collected
    const match = normalizedText.match(
      /^update\s+status\s+(.+?)\s+(collected|deposited|[a-zA-Z]+)(?:\s+remarks\s+(.+))?$/i
    );
    if (!match) return false; // not this command

    const datesExpr = match[1].trim();
    const requestedStatusRaw = match[2].trim();
    const remarksRaw = match[3]?.trim() ?? null;

    const requestedStatusLower = requestedStatusRaw.toLowerCase();

    // Validate status: only 'collected' or 'deposited' allowed
    if (!ALLOWED_STATUSES.has(requestedStatusLower)) {
      await safeSendMessage(sock, sender, {
        text:
          "❌ Invalid status. Only the following statuses are allowed:\n• collected\n• deposited\n\nUsage examples:\n`update status 05/11/2025 collected`\n`update status 05/11/2025 to 07/11/2025 deposited remarks bank_deposit`",
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

    // Read status log file to prevent duplicates / contradictory logs
    let logData = [];
    try {
      logData = JSON.parse(fs.readFileSync(logFile, "utf-8"));
      if (!Array.isArray(logData)) logData = [];
    } catch (err) {
      logData = [];
    }

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
        if (typeof db.write === "function") {
          await db.write();
        } else {
          // fallback to direct write if db doesn't expose write()
          fs.writeFileSync(dataFileFallback, JSON.stringify(data, null, 2));
        }
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
      try {
        fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
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

export default handleStatusUpdate;
