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
