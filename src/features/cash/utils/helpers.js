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
          date: data.Dated
        });
      }
    }
  }
  
  entries.sort((a, b) => {
    const dateA = parseDate(a.date);
    const dateB = parseDate(b.date);
    return dateA - dateB;
  });
  
  return entries;
}

export async function getInitiatedBookingEntries(busCode) {
  await bookingsDb.read();
  const entries = [];
  
  for (const [key, data] of Object.entries(bookingsDb.data || {})) {
    if (key.startsWith(`${busCode}_`) && data.Status === "Initiated") {
      const cashHandOver = data.CashHandOver?.Amount || 0;
      if (Number(cashHandOver) > 0) {
        entries.push({
          id: key,
          amount: Number(cashHandOver),
          date: data.TripDate || data.StartDate
        });
      }
    }
  }
  
  entries.sort((a, b) => {
    const dateA = parseDate(a.date);
    const dateB = parseDate(b.date);
    return dateA - dateB;
  });
  
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

function parseDate(dateStr) {
  if (!dateStr) return new Date(0);
  
  const formats = [
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    /\w+,\s*(\d{1,2})\s+(\w+)\s+(\d{4})/
  ];
  
  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format === formats[0]) {
        return new Date(match[3], match[2] - 1, match[1]);
      } else {
        const months = {
          january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
          july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
        };
        const month = months[match[2].toLowerCase()];
        return new Date(match[3], month, match[1]);
      }
    }
  }
  
  return new Date(0);
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
