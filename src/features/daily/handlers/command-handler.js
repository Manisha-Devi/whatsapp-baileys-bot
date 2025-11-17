import db from "../../../data/db.js";
import { safeSendMessage, safeDbRead } from "../utils/helpers.js";
import { capitalize } from "../utils/formatters.js";
import { recalculateCashHandover, getCompletionMessage } from "../utils/calculations.js";
import { sendSummary } from "../utils/messages.js";

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

async function sendFetchedRecord(sock, sender, record, title = "✅ Data Fetched") {
  try {
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

    const dieselAmt = record.Diesel?.amount || record.Diesel || "0";
    const addaAmt = record.Adda?.amount || record.Adda || "0";
    const unionAmt = record.Union?.amount || record.Union || "0";

    const msg = [
      `${title}`,
      `📅 Dated: ${record.Dated || "___"}`,
      ``,
      `💰 *Expenses (Outflow):*`,
      `⛽ Diesel: ₹${dieselAmt}${record.Diesel?.mode === "online" ? " 💳" : ""}`,
      `🚌 Adda : ₹${addaAmt}${record.Adda?.mode === "online" ? " 💳" : ""}`,
      `🤝 Union Fees: ₹${unionAmt}${record.Union?.mode === "online" ? " 💳" : ""}`,
      extraList ? `${extraList}` : "",
      ``,
      `💵 *Total Collection (Inflow):*`,
      `💸 Total Cash Collection: ₹${record.TotalCashCollection || "0"}`,
      `💳 Online Collection: ₹${record.Online || "0"}`,
      ``,
      `✨ *Total Hand Over:*`,
      `💵 Cash Hand Over: ₹${record.CashHandover || "0"}`,
      ``,
      `✅ Data Fetched successfully!`,
    ].join("\n");

    await safeSendMessage(sock, sender, { text: msg });
  } catch (err) {
    console.error("❌ sendFetchedRecord error for", sender, ":", err);
    await safeSendMessage(sock, sender, {
      text: "❌ Failed to prepare fetched record. Try again.",
    });
  }
}

export async function handleReportsCommand(sock, sender, normalizedText, user) {
  try {
    await safeDbRead();
    const lowerText = normalizedText.toLowerCase().trim();

    if (lowerText === "today") {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, "0");
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const year = now.getFullYear();
      const key = `${day}${month}${year}`;
      const record = db.data[key];

      if (!record) {
        await safeSendMessage(sock, sender, { text: `⚠️ No record found for today.` });
        return true;
      }

      await sendFetchedRecord(sock, sender, record, "✅ Today's Data");
      return true;
    }

    const lastDaysMatch = lowerText.match(/^last\s+(\d+)\s+days?$/i);
    if (lastDaysMatch) {
      const daysCount = parseInt(lastDaysMatch[1]);
      const now = new Date();

      for (let i = 0; i < daysCount; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        const key = `${day}${month}${year}`;
        const record = db.data[key];
        if (!record) continue;

        const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' });
        const monthName = d.toLocaleDateString('en-US', { month: 'long' });
        const formattedDate = `${dayOfWeek}, ${d.getDate()} ${monthName} ${year}`;

        await sendFetchedRecord(
          sock,
          sender,
          record,
          i === 0 ? "✅ Today's Data" : i === 1 ? "✅ Yesterday's Data" : `✅ ${i} Days Ago\n📅 Dated: ${formattedDate}`
        );

        if (i < daysCount - 1) {
          try {
            if (sock.presenceSubscribe) await sock.presenceSubscribe(sender);
            if (sock.sendPresenceUpdate) {
              await sock.sendPresenceUpdate("composing", sender);
              await new Promise((r) => setTimeout(r, 1200));
              await sock.sendPresenceUpdate("paused", sender);
            }
          } catch (err) {
            // Not fatal
          }
        }
      }

      return true;
    }

    const daysAgoMatch = lowerText.match(/^(\d+)\s+days?\s+ago$/i);
    if (daysAgoMatch) {
      const daysAgo = parseInt(daysAgoMatch[1]);
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      const key = `${day}${month}${year}`;
      const record = db.data[key];

      if (!record) {
        await safeSendMessage(sock, sender, {
          text: `⚠️ No record found for ${daysAgo} days ago.`,
        });
        return true;
      }

      const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' });
      const monthName = d.toLocaleDateString('en-US', { month: 'long' });
      const formattedDate = `${dayOfWeek}, ${d.getDate()} ${monthName} ${year}`;

      await sendFetchedRecord(sock, sender, record, `✅ ${daysAgo} Days Ago\n📅 Dated: ${formattedDate}`);
      return true;
    }

    const dateMatch = lowerText.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dateMatch) {
      const [_, day, month, year] = dateMatch;
      const key = `${day.padStart(2, "0")}${month.padStart(2, "0")}${year}`;
      const record = db.data[key];

      if (!record) {
        await safeSendMessage(sock, sender, {
          text: `⚠️ No record found for ${day}/${month}/${year}.`,
        });
        return true;
      }

      await sendFetchedRecord(sock, sender, record);
      return true;
    }

    const dateRangeMatch = lowerText.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+to\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/i);
    if (dateRangeMatch) {
      const [_, startDay, startMonth, startYear, endDay, endMonth, endYear] = dateRangeMatch;
      const startDate = new Date(parseInt(startYear), parseInt(startMonth) - 1, parseInt(startDay));
      const endDate = new Date(parseInt(endYear), parseInt(endMonth) - 1, parseInt(endDay));

      if (startDate > endDate) {
        await safeSendMessage(sock, sender, {
          text: `⚠️ Start date cannot be after end date.`,
        });
        return true;
      }

      let foundCount = 0;
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const day = String(currentDate.getDate()).padStart(2, "0");
        const month = String(currentDate.getMonth() + 1).padStart(2, "0");
        const year = currentDate.getFullYear();
        const key = `${day}${month}${year}`;
        const record = db.data[key];

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

        currentDate.setDate(currentDate.getDate() + 1);
      }

      if (foundCount === 0) {
        await safeSendMessage(sock, sender, {
          text: `⚠️ No records found in the date range ${startDay}/${startMonth}/${startYear} to ${endDay}/${endMonth}/${endYear}.`,
        });
      }

      return true;
    }

    if (lowerText === "this month") {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      let foundCount = 0;

      for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        const day = String(d.getDate()).padStart(2, "0");
        const mon = String(d.getMonth() + 1).padStart(2, "0");
        const yr = d.getFullYear();
        const key = `${day}${mon}${yr}`;
        const record = db.data[key];

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
          text: `⚠️ No records found for this month.`,
        });
      }

      return true;
    }

    if (lowerText === "this week") {
      const now = new Date();
      const firstDayOfWeek = new Date(now);
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      firstDayOfWeek.setDate(now.getDate() - diff);
      firstDayOfWeek.setHours(0, 0, 0, 0);

      const lastDayOfWeek = new Date(firstDayOfWeek);
      lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
      lastDayOfWeek.setHours(23, 59, 59, 999);

      let foundCount = 0;

      for (let d = new Date(firstDayOfWeek); d <= lastDayOfWeek; d.setDate(d.getDate() + 1)) {
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        const key = `${day}${month}${year}`;
        const record = db.data[key];

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
          text: `⚠️ No records found for this week.`,
        });
      }

      return true;
    }

    return false;
  } catch (err) {
    console.error("❌ Error handling reports command for", sender, ":", err);
    return false;
  }
}

export async function handleDailyCommand(sock, sender, normalizedText, user) {
  const dailyPattern = /^daily(?:\s+([\w\/\-]+)(?:\s+(\d+)\s+days)?)?$/i;
  const dailyMatch = normalizedText.match(dailyPattern);

  if (!dailyMatch) return false;

  try {
    await safeDbRead();
    const param1 = dailyMatch[1]?.toLowerCase() || "";
    const daysCount = parseInt(dailyMatch[2]) || null;

    if (param1 === "today") {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, "0");
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const year = now.getFullYear();
      const key = `${day}${month}${year}`;
      const record = db.data[key];

      if (!record) {
        await safeSendMessage(sock, sender, { text: `⚠️ No record found for today.` });
        return true;
      }

      await sendFetchedRecord(sock, sender, record, "✅ Today's Data");
      return true;
    }

    if (param1 === "last" && daysCount) {
      const now = new Date();

      for (let i = 0; i < daysCount; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        const key = `${day}${month}${year}`;
        const record = db.data[key];
        if (!record) continue;

        await sendFetchedRecord(
          sock,
          sender,
          record,
          i === 0 ? "✅ Today's Data" : i === 1 ? "✅ Yesterday's Data" : `✅ ${i} Days Ago`
        );

        if (i < daysCount - 1) {
          try {
            if (sock.presenceSubscribe) await sock.presenceSubscribe(sender);
            if (sock.sendPresenceUpdate) {
              await sock.sendPresenceUpdate("composing", sender);
              await new Promise((r) => setTimeout(r, 1200));
              await sock.sendPresenceUpdate("paused", sender);
            }
          } catch (err) {
            // Not fatal
          }
        }
      }

      return true;
    }

    const dateMatch = param1.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dateMatch) {
      const [_, day, month, year] = dateMatch;
      const key = `${day.padStart(2, "0")}${month.padStart(2, "0")}${year}`;
      const record = db.data[key];

      if (!record) {
        await safeSendMessage(sock, sender, {
          text: `⚠️ No record found for ${day}/${month}/${year}.`,
        });
        return true;
      }

      await sendFetchedRecord(sock, sender, record);
      return true;
    }

    if (/^daily$/i.test(normalizedText)) {
      recalculateCashHandover(user);
      const completenessMsg = getCompletionMessage(user);
      await sendSummary(
        sock,
        sender,
        `📋 Here's your current entered data:\n${completenessMsg}`,
        user
      );
      return true;
    }

    return false;
  } catch (err) {
    console.error("❌ Error handling daily command for", sender, ":", err);
    return false;
  }
}
