import db, { statusDb } from "../../data/db.js";
import { safeSendMessage } from "./utils/helpers.js";
import { getMenuState } from "../../utils/menu-state.js";

function toNum(value) {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function formatFullDate(dateInput) {
  try {
    if (!dateInput) return "Unknown Date";

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

export async function handleDailyStatus(sock, sender, normalizedText) {
  try {
    const match = normalizedText.match(/^(?:status\s+)?(initiated|collected|deposited|i|c|d)$/i);
    if (!match) return false;

    const rawStatus = match[1].toLowerCase();
    
    const statusMap = {
      'i': 'Initiated',
      'c': 'Collected',
      'd': 'Deposited',
      'initiated': 'Initiated',
      'collected': 'Collected',
      'deposited': 'Deposited'
    };
    
    const statusQuery = statusMap[rawStatus];

    const menuState = getMenuState(sender);
    const selectedBus = menuState.selectedBus;

    if (!selectedBus) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ No bus selected. Please type *Entry* to select a bus first.",
      });
      return true;
    }

    await db.read();
    const data = db.data || {};

    const filtered = Object.entries(data)
      .filter(([key, entry]) => {
        const keyBus = key.split('_')[0];
        return keyBus === selectedBus && entry.Status === statusQuery;
      })
      .map(([key, entry]) => ({ key, ...entry }));

    if (filtered.length === 0) {
      await safeSendMessage(sock, sender, {
        text: `✅ No entries found for *${selectedBus}* with status: *${statusQuery}*`,
      });
      return true;
    }

    filtered.sort((a, b) => {
      const dateA = new Date(a.Dated || a.key.split('_')[1]);
      const dateB = new Date(b.Dated || b.key.split('_')[1]);
      return dateB - dateA;
    });

    let msg = `📊 *Status: ${statusQuery}*\n🚌 Bus: *${selectedBus}*\n\n`;

    let totalCash = 0;
    let totalCount = 0;

    for (const entry of filtered) {
      const dateFormatted = formatFullDate(entry.Dated || entry.key.split('_')[1]);
      msg += `📅 ${dateFormatted}\n`;

      const cashHandoverAmt = entry.CashHandover?.amount || entry.CashHandover || "0";
      const totalCollectionAmt = entry.TotalCashCollection?.amount || entry.TotalCashCollection || "0";

      if (cashHandoverAmt && cashHandoverAmt !== "0") {
        msg += `💵 Cash Handover: ₹${cashHandoverAmt}\n\n`;
        totalCash += toNum(cashHandoverAmt);
      } else {
        msg += `💸 Total Collection: ₹${totalCollectionAmt}\n\n`;
        totalCash += toNum(totalCollectionAmt);
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

function parseDateStr(s) {
  const parts = String(s).trim().split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const dt = new Date(iso);
  return isNaN(dt.getTime()) ? null : dt;
}

function normalizeKey(raw) {
  let k = String(raw).replace(/\//g, "/").trim();
  return k;
}

function parseDatesExpression(expr) {
  expr = String(expr).trim();
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
      keys.push(`${day}/${month}/${year}`);
    }
    return keys;
  }

  if (expr.includes(",")) {
    return expr
      .split(",")
      .map((x) => normalizeKey(x.trim()))
      .filter(Boolean);
  }

  return [normalizeKey(expr)];
}

const ALLOWED_STATUSES = new Set(["collected", "deposited"]);

export async function handleStatusUpdate(sock, sender, normalizedText) {
  try {
    const match = normalizedText.match(
      /^update\s+(.+?)\s+(collected|deposited|c|d)(?:\s+remark\s+(.+))?$/i
    );
    if (!match) return false;

    const datesExpr = match[1].trim();
    const requestedStatusRaw = match[2].trim().toLowerCase();
    const remarksRaw = match[3]?.trim() ?? null;

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

    const menuState = getMenuState(sender);
    const selectedBus = menuState.selectedBus;

    if (!selectedBus) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ No bus selected. Please type *Entry* to select a bus first.",
      });
      return true;
    }

    const newStatus = requestedStatusLower.charAt(0).toUpperCase() + requestedStatusLower.slice(1);

    const normalizedDates = parseDatesExpression(datesExpr);
    if (!normalizedDates || normalizedDates.length === 0) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ Unable to parse dates. Use format: DD/MM/YYYY or a range using 'to', or a comma-separated list.",
      });
      return true;
    }

    await db.read();
    const data = db.data || {};

    await statusDb.read();
    let logData = statusDb.data || [];
    if (!Array.isArray(logData)) logData = [];

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

    for (const dateKey of normalizedDates) {
      const key = `${selectedBus}_${dateKey}`;
      const entry = data[key];

      if (!entry) {
        actuallySkipped.push(`${dateKey} (no record found)`);
        continue;
      }

      if (alreadyLogged.has(key)) {
        actuallySkipped.push(`${dateKey} (already logged earlier)`);
        continue;
      }

      if (entry.Status === newStatus) {
        actuallySkipped.push(`${dateKey} (already ${newStatus})`);
        continue;
      }

      entry.Status = newStatus;
      actuallyUpdated.push(key);
    }

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
