import db from "../../../data/db.js";
import { safeSendMessage, safeDbRead } from "../utils/helpers.js";
import { capitalize } from "../utils/formatters.js";
import { recalculateCashHandover, getCompletionMessage } from "../utils/calculations.js";
import { sendSummary } from "../utils/messages.js";
import { getMenuState } from "../../../utils/menu-state.js";

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
    const totalCashAmt = record.TotalCashCollection?.amount || record.TotalCashCollection || "0";
    const onlineAmt = record.Online?.amount || record.Online || "0";
    const cashHandoverAmt = record.CashHandover?.amount || record.CashHandover || "0";

    const busInfo = record.busCode ? `🚌 Bus: *${record.busCode}*\n` : "";

    const msg = [
      `${title}`,
      busInfo,
      `📅 Dated: ${record.Dated || "___"}`,
      ``,
      `💰 *Expenses (Outflow):*`,
      `⛽ Diesel: ₹${dieselAmt}${record.Diesel?.mode === "online" ? " 💳" : ""}`,
      `🚌 Adda : ₹${addaAmt}${record.Adda?.mode === "online" ? " 💳" : ""}`,
      `🤝 Union Fees: ₹${unionAmt}${record.Union?.mode === "online" ? " 💳" : ""}`,
      extraList ? `${extraList}` : "",
      ``,
      `💵 *Total Collection (Inflow):*`,
      `💸 Total Cash Collection: ₹${totalCashAmt}`,
      `💳 Online Collection: ₹${onlineAmt}`,
      ``,
      `✨ *Total Hand Over:*`,
      `💵 Cash Hand Over: ₹${cashHandoverAmt}`,
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

function getKeyForBusAndDate(busCode, date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${busCode}_${day}/${month}/${year}`;
}

function getRecordForBusAndDate(busCode, date) {
  const key = getKeyForBusAndDate(busCode, date);
  return db.data[key];
}

export async function handleReportsCommand(sock, sender, normalizedText, user) {
  try {
    await safeDbRead();
    const lowerText = normalizedText.toLowerCase().trim();
    
    const menuState = getMenuState(sender);
    const selectedBus = menuState.selectedBus;
    
    if (!selectedBus) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ No bus selected. Please type *Entry* to select a bus first.",
      });
      return true;
    }

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

    const lastDaysMatch = lowerText.match(/^last\s+(\d+)\s+days?$/i);
    if (lastDaysMatch) {
      const daysCount = parseInt(lastDaysMatch[1]);
      const now = new Date();
      let foundCount = 0;

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
        const record = getRecordForBusAndDate(selectedBus, currentDate);

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
          text: `⚠️ No records found for *${selectedBus}* from ${startDay}/${startMonth}/${startYear} to ${endDay}/${endMonth}/${endYear}.`,
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
          text: `⚠️ No records found for *${selectedBus}* this week.`,
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

    const menuState = getMenuState(sender);
    const selectedBus = menuState.selectedBus;

    if (!selectedBus) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ No bus selected. Please type *Entry* to select a bus first.",
      });
      return true;
    }

    if (param1 === "today") {
      const now = new Date();
      const record = getRecordForBusAndDate(selectedBus, now);

      if (!record) {
        await safeSendMessage(sock, sender, { text: `⚠️ No record found for *${selectedBus}* today.` });
        return true;
      }

      await sendFetchedRecord(sock, sender, record, "✅ Today's Data");
      return true;
    }

    if (param1 === "last" && daysCount) {
      const now = new Date();
      let foundCount = 0;

      for (let i = 0; i < daysCount; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const record = getRecordForBusAndDate(selectedBus, d);
        if (!record) continue;

        foundCount++;
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

    const dateMatch = param1.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
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
