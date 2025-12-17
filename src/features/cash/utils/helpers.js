import { parse, isValid, isBefore, isEqual, startOfDay } from "date-fns";
import db, { bookingsDb, cashDb } from "../../../utils/db.js";
import { getMenuState } from "../../../utils/menu-state.js";

export async function safeSendMessage(sock, jid, content) {
  try {
    await sock.sendMessage(jid, content);
  } catch (err) {
    console.error("❌ safeSendMessage error:", err);
  }
}

export function generateDepositId(busCode, dateStr) {
  const existingIds = Object.keys(cashDb.data || {}).filter(
    (id) => id.startsWith(`DEP_${busCode}_${dateStr}_`)
  );
  const sequence = String(existingIds.length + 1).padStart(3, "0");
  return `DEP_${busCode}_${dateStr}_${sequence}`;
}

export async function getInitiatedDailyEntries(busCode) {
  await db.read();
  const entries = [];
  
  for (const [key, data] of Object.entries(db.data || {})) {
    if (key.startsWith(`${busCode}_`) && data.Status === "Initiated") {
      const cashHandover = data.CashHandover?.amount || data.CashHandover || 0;
      if (Number(cashHandover) > 0) {
        entries.push({
          id: key,
          amount: Number(cashHandover),
          date: data.Dated,
          parsedDate: parseEntryDate(data.Dated)
        });
      }
    }
  }
  
  entries.sort((a, b) => a.parsedDate - b.parsedDate);
  
  return entries;
}

export async function getInitiatedBookingEntries(busCode) {
  await bookingsDb.read();
  const entries = [];
  
  for (const [key, data] of Object.entries(bookingsDb.data || {})) {
    if (key.startsWith(`${busCode}_`) && data.Status === "Initiated") {
      const cashHandOver = data.CashHandOver?.Amount || 0;
      if (Number(cashHandOver) > 0) {
        const entryDate = data.TripDate || data.EndDate || data.StartDate;
        entries.push({
          id: key,
          amount: Number(cashHandOver),
          date: entryDate,
          parsedDate: parseEntryDate(entryDate)
        });
      }
    }
  }
  
  entries.sort((a, b) => a.parsedDate - b.parsedDate);
  
  return entries;
}

export async function getPreviousBalance(busCode) {
  await cashDb.read();
  
  let latestDeposit = null;
  let latestTime = 0;
  
  for (const [key, data] of Object.entries(cashDb.data || {})) {
    if (data.busCode === busCode && data.depositedAt) {
      const depositTime = new Date(data.depositedAt).getTime();
      if (depositTime > latestTime) {
        latestTime = depositTime;
        latestDeposit = data;
      }
    }
  }
  
  return latestDeposit?.balance?.Amount || 0;
}

export function filterEntriesByDate(entries, targetDate) {
  const target = startOfDay(targetDate);
  
  return entries.filter(entry => {
    if (!entry.parsedDate || !isValid(entry.parsedDate)) return false;
    const entryDay = startOfDay(entry.parsedDate);
    return isBefore(entryDay, target) || isEqual(entryDay, target);
  });
}

function parseEntryDate(dateStr) {
  if (!dateStr) return new Date(0);
  
  const ddmmyyyy = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ddmmyyyy) {
    return new Date(ddmmyyyy[3], ddmmyyyy[2] - 1, ddmmyyyy[1]);
  }
  
  const longFormat = dateStr.match(/\w+,\s*(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (longFormat) {
    const months = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
    };
    const month = months[longFormat[2].toLowerCase()];
    if (month !== undefined) {
      return new Date(longFormat[3], month, longFormat[1]);
    }
  }
  
  return new Date(0);
}

export function parseEntryDateExport(dateStr) {
  return parseEntryDate(dateStr);
}

export async function updateEntryStatus(entryId, isBooking = false) {
  const targetDb = isBooking ? bookingsDb : db;
  await targetDb.read();
  
  if (targetDb.data[entryId]) {
    targetDb.data[entryId].Status = "Deposited";
    targetDb.data[entryId].submittedAt = new Date().toISOString();
    await targetDb.write();
    return true;
  }
  return false;
}

export async function saveDeposit(depositData) {
  await cashDb.read();
  if (!cashDb.data) cashDb.data = {};
  cashDb.data[depositData.depositId] = depositData;
  await cashDb.write();
  return true;
}

export function formatCurrency(amount) {
  return Number(amount).toLocaleString('en-IN');
}
