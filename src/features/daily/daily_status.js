// daily_status.js
import db from "../../data/db.js";
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
    // Match messages like: "Daily Status Initiated"
    const match = normalizedText.match(/^daily\s+status\s+(initiated|collected|deposited)$/i);
    if (!match) return false; // not a status command

    const statusQuery = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();

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
    let msg = `📊 *Pending Daily Entries (Status: ${statusQuery})*\n\n`;

    let totalCash = 0;
    let totalCount = 0;

    for (const entry of filtered) {
      const dateFormatted = formatFullDate(entry.Dated || entry.key);
      msg += `📅 ${dateFormatted}\n`;

      // Show only one important value (Cash Handover or Total Collection)
      if (entry.CashHandover && entry.CashHandover !== "0") {
        msg += `💵 Cash Handover: ₹${entry.CashHandover}\n\n`;
        totalCash += toNum(entry.CashHandover);
      } else {
        msg += `💸 Total Collection: ₹${entry.TotalCashCollection || 0}\n\n`;
        totalCash += toNum(entry.TotalCashCollection);
      }

      totalCount++;
    }

    msg += `📊 *Total Pending Entries:* ${totalCount}\n`;
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
