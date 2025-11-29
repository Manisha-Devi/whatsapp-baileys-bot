import db from "../../../data/db.js";
import { safeSendMessage, safeDbRead } from "../utils/helpers.js";
import { formatExistingForMessage, capitalize } from "../utils/formatters.js";
import { parseDate, formatDate, getDateKey, getPrimaryKey } from "./date-handler.js";
import { recalculateCashHandover, getCompletionMessage } from "../utils/calculations.js";
import { sendSummary } from "../utils/messages.js";
import { getMenuState } from "../../../utils/menu-state.js";

export async function handleFieldExtraction(sock, sender, normalizedText, user) {
  const fieldPatterns = {
    Dated: /date(?:d)?\s*[:\-]?\s*([\w\s,\/\-\(\)\*]+)/gi,
    Diesel: /diesel\s*[:\-]?\s*\*?(\d+)\*?(?:\s*(online))?/gi,
    Adda: /adda\s*[:\-]?\s*\*?(\d+)\*?(?:\s*(online))?/gi,
    Union: /union\s*[:\-]?\s*\*?(\d+)\*?(?:\s*(online))?/gi,
    TotalCashCollection: /(?:total\s*cash\s*collection|cash\s*collection|cash|total\s*collection)\s*[:\-]?\s*\*?(\d+)\*?/gi,
    Online: /(?:online\s*collection|total\s*online|online)\s*[:\-]?\s*\*?(\d+)\*?/gi,
  };

  let anyFieldFound = false;
  let pendingUpdates = [];

  const menuState = getMenuState(sender);
  const selectedBus = menuState.selectedBus;

  if (!selectedBus) {
    await safeSendMessage(sock, sender, {
      text: "⚠️ No bus selected. Please type *Entry* to select a bus first.",
    });
    return { handled: true, anyFieldFound: false };
  }

  user.busCode = selectedBus;

  try {
    for (const [key, regex] of Object.entries(fieldPatterns)) {
      let match;
      while ((match = regex.exec(normalizedText)) !== null) {
        anyFieldFound = true;

        if (key === "Dated") {
          try {
            let value = match[1].trim();
            const targetDate = parseDate(value);

            if (!targetDate) {
              await safeSendMessage(sock, sender, {
                text: "⚠️ Please enter a valid date (e.g. Dated 30/10/2025, or Dated today).",
              });
              return { handled: true, anyFieldFound };
            }

            const formatted = formatDate(targetDate);
            const dateKey = getDateKey(targetDate);
            const primaryKey = getPrimaryKey(selectedBus, targetDate);

            user.Dated = formatted;
            user.DateKey = dateKey;
            user.pendingPrimaryKey = primaryKey;

            const ok = await safeDbRead();
            if (!ok) {
              await safeSendMessage(sock, sender, {
                text: "❌ Unable to read DB to check existing date. Try again later.",
              });
              return { handled: true, anyFieldFound };
            }

            if (db.data[primaryKey]) {
              user.confirmingFetch = true;
              const day = String(targetDate.getDate()).padStart(2, "0");
              const month = String(targetDate.getMonth() + 1).padStart(2, "0");
              const year = targetDate.getFullYear();
              await safeSendMessage(sock, sender, {
                text: `⚠️ Data for *${selectedBus}* on ${day}/${month}/${year} already exists.\nDo you want to fetch and update it? (yes/no)`,
              });
              return { handled: true, anyFieldFound };
            }
          } catch (err) {
            console.error("❌ Error parsing/storing Dated field for", sender, ":", err);
            await safeSendMessage(sock, sender, {
              text: "❌ Failed to parse date. Please use format: Dated DD/MM/YYYY or 'Dated today'.",
            });
            return { handled: true, anyFieldFound };
          }
          continue;
        }

        if (["Diesel", "Adda", "Union"].includes(key)) {
          try {
            const amount = match[1].trim();
            const mode = match[2] ? "online" : "cash";
            const newVal = { amount, mode };

            const existing = user[key];
            const isDifferent =
              existing &&
              ((typeof existing === "object" &&
                (existing.amount !== amount || existing.mode !== mode)) ||
                (typeof existing !== "object" && String(existing) !== amount));

            if (isDifferent) {
              pendingUpdates.push({
                field: key,
                value: newVal,
                message: `⚠️ ${key} already has value *${formatExistingForMessage(existing)}*.\nDo you want to update it to *${amount} (${mode})*? (yes/no)`,
              });
            } else {
              user[key] = newVal;
            }
          } catch (err) {
            console.error(`❌ Error parsing ${key} for ${sender}:`, err);
          }
          continue;
        }

        try {
          const value = match[1].trim();
          if (user[key] && user[key] !== value) {
            const label = key.replace(/([A-Z])/g, " $1").trim();
            pendingUpdates.push({
              field: key,
              value,
              message: `⚠️ ${label} already has value *${user[key]}*.\nDo you want to update it to *${value}*? (yes/no)`,
            });
          } else {
            user[key] = value;
          }
        } catch (err) {
          console.error(`❌ Error parsing generic field ${key} for ${sender}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("❌ Error during field extraction for", sender, ":", err);
  }

  try {
    const expenseMatches = [
      ...normalizedText.matchAll(/expense\s+([a-zA-Z]+)\s*[:\-]?\s*(\d+)(?:\s*(online))?/gi),
    ];
    for (const match of expenseMatches) {
      try {
        const expenseName = match[1].trim();
        const amount = match[2].trim();
        const mode = match[3] ? "online" : "cash";
        anyFieldFound = true;

        const existing = user.ExtraExpenses.find(
          (e) => e.name.toLowerCase() === expenseName.toLowerCase()
        );

        if (existing && (existing.amount !== amount || existing.mode !== mode)) {
          pendingUpdates.push({
            field: expenseName,
            value: { amount, mode },
            type: "extra",
            message: `⚠️ Expense *${expenseName}* already has *${existing.amount} (${existing.mode})*.\nUpdate to *${amount} (${mode})*? (yes/no)`,
          });
        } else if (!existing) {
          user.ExtraExpenses.push({ name: expenseName, amount, mode });
        }
      } catch (err) {
        console.error("❌ Error parsing an expense match for", sender, ":", err);
      }
    }
  } catch (err) {
    console.error("❌ Expense parsing error for", sender, ":", err);
  }

  if (pendingUpdates.length > 0) {
    const first = pendingUpdates[0];
    user.waitingForUpdate = {
      field: first.field,
      value: first.value,
      type: first.type || "normal",
    };
    await safeSendMessage(sock, sender, { text: first.message });
    return { handled: true, anyFieldFound };
  }

  return { handled: false, anyFieldFound };
}

export async function handleFieldUpdateConfirmation(sock, sender, text, user) {
  if (!user.waitingForUpdate) return false;

  try {
    if (/^yes$/i.test(text)) {
      const { field, value, type } = user.waitingForUpdate;

      if (type === "extra") {
        const idx = user.ExtraExpenses.findIndex(
          (e) => e.name.toLowerCase() === field.toLowerCase()
        );
        if (idx >= 0) {
          if (typeof value === "object") {
            user.ExtraExpenses[idx].amount = value.amount;
            user.ExtraExpenses[idx].mode = value.mode;
          } else {
            user.ExtraExpenses[idx].amount = value;
          }
        } else {
          user.ExtraExpenses.push({ name: field, amount: value.amount || value, mode: value.mode || "cash" });
        }
      } else {
        user[field] = value;
      }

      user.waitingForUpdate = null;
      recalculateCashHandover(user);
      const completenessMsg = getCompletionMessage(user);
      await sendSummary(
        sock,
        sender,
        `✅ ${capitalize(field)} updated successfully!\n${completenessMsg}`,
        user
      );
      return true;
    } else if (/^no$/i.test(text)) {
      user.waitingForUpdate = null;
      const completenessMsg = getCompletionMessage(user);
      await safeSendMessage(sock, sender, {
        text: `❎ Update cancelled.\n${completenessMsg}`,
      });
      return true;
    }
    
    return false;
  } catch (err) {
    console.error("❌ Error handling waitingForUpdate for", sender, ":", err);
    user.waitingForUpdate = null;
    await safeSendMessage(sock, sender, {
      text: "❌ Error processing your update response. Please re-enter the value.",
    });
    return true;
  }
}

export async function handleRemarksCommand(sock, sender, normalizedText, user) {
  const remarksMatch = normalizedText.match(/^remarks\s*(.*)$/i);
  if (!remarksMatch) return false;

  try {
    const remarkText = remarksMatch[1].trim();
    user.Remarks = remarkText || null;

    await safeSendMessage(sock, sender, {
      text: remarkText
        ? `📝 Remark added: "${remarkText}"`
        : `🧹 Remarks cleared.`,
    });

    const completenessMsg = getCompletionMessage(user);
    await sendSummary(
      sock,
      sender,
      `📋 Here's your current entered data:\n${completenessMsg}`,
      user
    );
    return true;
  } catch (err) {
    console.error("❌ Error handling remarks for", sender, ":", err);
    return true;
  }
}
