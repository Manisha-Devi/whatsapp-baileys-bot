import { format, parse, isValid } from "date-fns";
import db from "./daily_db.js";

export async function handleIncomingMessageFromDaily(sock, msg) {
  try {
    const sender = msg.key.remoteJid;
    const messageContent =
      msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!messageContent) return;
    if (msg.key.fromMe) return;

    const text = messageContent.trim().toLowerCase();

    /* ============================================================
       🧹 CLEAR COMMAND — reset local user session
    ============================================================ */
    if (/^clear$/i.test(text)) {
      delete global.userData?.[sender];
      await sock.sendMessage(sender, {
        text: "🧹 Local data cleared successfully! You can start fresh now.",
      });
      return;
    }

   // ✅ Initialize user session (no auto date, wait for user to enter)
if (!global.userData) global.userData = {};
if (!global.userData[sender]) {
  global.userData[sender] = {
    Dated: null,
    Diesel: null,
    Adda: null,
    Union: null,
    TotalCashCollection: null,
    Online: null,
    CashHandover: null,
    ExtraExpenses: [],
    waitingForUpdate: null,
    waitingForSubmit: false,
    editingExisting: false,
    confirmingFetch: false,
    awaitingCancelChoice: false,
    confirmingUpdate: false,
    pendingPrimaryKey: null,
  };

  await sock.sendMessage(sender, {
    text: "👋 Please enter date first in format: Dated DD/MM/YYYY",
  });
}


    const user = global.userData[sender];

    /* ============================================================
       🧠 FETCH EXISTING RECORD CONFIRMATION
    ============================================================ */
    if (user.confirmingFetch) {
      if (text === "yes") {
        const key = user.pendingPrimaryKey;
        await db.read();
        const oldRecord = db.data[key];
        if (oldRecord) {
          Object.assign(user, oldRecord);
          user.confirmingFetch = false;
          user.waitingForSubmit = false;
          user.editingExisting = true;
          recalculateCashHandover(user);
          await sendSummary(
            sock,
            sender,
            "📋 Fetched existing record. You can now update any field and re-submit.\n\nDo you want to Cancel? (yes/no)",
            user
          );
          user.awaitingCancelChoice = true;
        }
        return;
      } else if (text === "no") {
        user.confirmingFetch = false;
        user.pendingPrimaryKey = null;
        user.editingExisting = false;
        await sock.sendMessage(sender, {
          text: "🆕 Starting a fresh entry. Please continue entering new data.",
        });
        return;
      }
    }

    /* ============================================================
       🧠 HANDLE CANCEL CHOICE AFTER FETCH
    ============================================================ */
    if (user.awaitingCancelChoice) {
      if (text === "yes") {
        delete global.userData[sender];
        await sock.sendMessage(sender, {
          text: "✅ Existing record discarded. Starting fresh entry.",
        });
        return;
      } else if (text === "no") {
        user.awaitingCancelChoice = false;
        await sock.sendMessage(sender, {
          text: "📋 Please start updating by confirming above data.",
        });
        return;
      }
    }

    /* ============================================================
       ⚙️ HANDLE EXISTING RECORD UPDATE CONFIRMATION (on Submit)
    ============================================================ */
    if (user.confirmingUpdate) {
      const cleanText = text.trim().toLowerCase();
      if (cleanText === "yes") {
        const key = user.pendingPrimaryKey;
        await db.read();

        // 🧼 Clean temp session fields before saving
        const {
          waitingForUpdate,
          waitingForSubmit,
          editingExisting,
          confirmingFetch,
          awaitingCancelChoice,
          pendingPrimaryKey,
          ...cleanUser
        } = user;

        db.data[key] = {
          sender,
          ...cleanUser,
          submittedAt: new Date().toISOString(),
        };
        await db.write();

        await sock.sendMessage(sender, {
          text: "✅ Existing record updated successfully!",
        });

        delete user.confirmingUpdate;
        delete user.pendingPrimaryKey;
        delete global.userData[sender];
        return;
      } else if (cleanText === "no") {
        await sock.sendMessage(sender, {
          text: "❌ Update cancelled. Old record kept as is.",
        });

        delete user.confirmingUpdate;
        delete user.pendingPrimaryKey;
        delete global.userData[sender];
        return;
      }
    }

   /* ============================================================
   🆕 DAILY COMMAND — Show summary, fetch by date, or recent days
============================================================ */
const dailyPattern = /^daily(?:\s+([\w\/\-]+)(?:\s+(\d+)\s+days)?)?$/i;
const dailyMatch = text.match(dailyPattern);

if (dailyMatch) {
  await db.read();
  const param1 = dailyMatch[1]?.toLowerCase() || "";
  const daysCount = parseInt(dailyMatch[2]) || null;

  // Helper to format and send fetched record
  async function sendFetchedRecord(record, title = "✅ Data Fetched") {
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

    await sock.sendMessage(sender, { text: msg });
  }

  // --- DAILY TODAY ---
  if (param1 === "today") {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const key = `${day}${month}${year}`;
    const record = db.data[key];

    if (!record) {
      await sock.sendMessage(sender, { text: `⚠️ No record found for today.` });
      return;
    }

    await sendFetchedRecord(record, "✅ Today's Data");
    return;
  }

  // --- DAILY LAST N DAYS ---
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
        record,
        i === 0 ? "✅ Today's Data" : i === 1 ? "✅ Yesterday's Data" : `✅ ${i} Days Ago`
      );

      // Simulate typing between messages
      if (i < daysCount - 1) {
        await sock.presenceSubscribe(sender);
        await sock.sendPresenceUpdate("composing", sender);
        await new Promise((r) => setTimeout(r, 2000));
        await sock.sendPresenceUpdate("paused", sender);
      }
    }

    return;
  }

  // --- DAILY DD/MM/YYYY ---
  const dateMatch = param1.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dateMatch) {
    const [_, day, month, year] = dateMatch;
    const key = `${day.padStart(2, "0")}${month.padStart(2, "0")}${year}`;
    const record = db.data[key];

    if (!record) {
      await sock.sendMessage(sender, {
        text: `⚠️ No record found for ${day}/${month}/${year}.`,
      });
      return;
    }

    await sendFetchedRecord(record);
    return;
  }

  // --- DEFAULT "DAILY" (CURRENT SESSION) ---
  if (/^daily$/i.test(text)) {
    recalculateCashHandover(user);
    const completenessMsg = getCompletionMessage(user);
    await sendSummary(
      sock,
      sender,
      `📋 Here's your current entered data:\n${completenessMsg}`,
      user
    );
    return;
  }
}


    /* ============================================================
       🧹 EXPENSE DELETE COMMAND
    ============================================================ */
    const deleteMatch = text.match(/expense\s+delete\s+([a-zA-Z]+)/i);
    if (deleteMatch) {
      const deleteName = deleteMatch[1].trim();
      const index = user.ExtraExpenses.findIndex(
        (e) => e.name.toLowerCase() === deleteName.toLowerCase()
      );
      if (index !== -1) {
        user.ExtraExpenses.splice(index, 1);
        recalculateCashHandover(user);
        const completenessMsg = getCompletionMessage(user);
        await sendSummary(
          sock,
          sender,
          `🗑️ Expense *${capitalize(deleteName)}* deleted successfully!\n${completenessMsg}`,
          user
        );
      } else {
        await sock.sendMessage(sender, {
          text: `⚠️ Expense *${capitalize(deleteName)}* not found in your list.`,
        });
      }
      return;
    }

    /* ============================================================
       🧠 FIELD EXTRACTION (Includes Dated fetch + mode detection)
    ============================================================ */
    const fieldPatterns = {
      Dated: /date(?:d)?\s*[:\-]?\s*([\w\s,\/\-]+)/gi,

      Diesel: /diesel\s*[:\-]?\s*(\d+)(?:\s*(online))?/gi,
      Adda: /adda\s*[:\-]?\s*(\d+)(?:\s*(online))?/gi,
      Union: /union\s*[:\-]?\s*(\d+)(?:\s*(online))?/gi,
      TotalCashCollection: /total\s*cash\s*collection\s*[:\-]?\s*(\d+)/gi,
      Online: /online\s*[:\-]?\s*(\d+)/gi,
    };

    let anyFieldFound = false;
    let pendingUpdates = [];

    for (const [key, regex] of Object.entries(fieldPatterns)) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        anyFieldFound = true;
if (key === "Dated") {
  let value = match[1].trim().toLowerCase();

  // 🧠 Natural word detection (today, yesterday, tomorrow)
  let targetDate;
  const now = new Date();

  if (value === "today") {
    targetDate = now;
  } else if (value === "yesterday") {
    targetDate = new Date(now);
    targetDate.setDate(now.getDate() - 1);
  } else if (value === "tomorrow") {
    targetDate = new Date(now);
    targetDate.setDate(now.getDate() + 1);
  }

  // 📅 If numeric date given, parse it
  if (!targetDate) {
    const dateMatch = value.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dateMatch) {
      const [_, day, month, year] = dateMatch;
      const parsed = parse(`${day}/${month}/${year}`, "dd/MM/yyyy", new Date());
      if (isValid(parsed)) targetDate = parsed;
    }
  }

  // ❌ If still not valid
  if (!targetDate || !isValid(targetDate)) {
    await sock.sendMessage(sender, {
      text: "⚠️ Please enter a valid date (e.g. Dated 30/10/2025, or Dated today).",
    });
    return;
  }

  // ✅ Format date and check DB
  const formatted = format(targetDate, "EEEE, dd MMMM yyyy");
  const day = String(targetDate.getDate()).padStart(2, "0");
  const month = String(targetDate.getMonth() + 1).padStart(2, "0");
  const year = targetDate.getFullYear();
  const primaryKey = `${day}${month}${year}`;

  user.Dated = formatted;
  user.pendingPrimaryKey = primaryKey;

  await db.read();
  if (db.data[primaryKey]) {
    user.confirmingFetch = true;
    await sock.sendMessage(sender, {
      text: `⚠️ Data for ${day}/${month}/${year} already exists.\nDo you want to fetch and update it? (yes/no)`,
    });
    return;
  }

  await sock.sendMessage(sender, {
    text: `📅 Date set to ${formatted}`,
  });
  continue;
}

         else if (["Diesel", "Adda", "Union"].includes(key)) {
          // amount & mode extraction
          const amount = match[1].trim();
          const mode = match[2] ? "online" : "cash";
          const newVal = { amount, mode };

          // if existing and different, push pending update
          const existing = user[key];
          if (
            existing &&
            ((typeof existing === "object" && (existing.amount !== amount || existing.mode !== mode)) ||
              (typeof existing !== "object" && String(existing) !== amount))
          ) {
            const label = key;
            pendingUpdates.push({
              field: key,
              value: newVal,
              message: `⚠️ ${label} already has value *${formatExistingForMessage(existing)}*.\nDo you want to update it to *${amount} (${mode})*? (yes/no)`,
            });
          } else {
            user[key] = newVal;
          }
          continue;
        } else {
          // generic fields (TotalCashCollection, Online)
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
        }
      }
    }

    // 🧾 Extra Expenses
    const expenseMatches = [
      ...text.matchAll(/expense\s+([a-zA-Z]+)\s*[:\-]?\s*(\d+)(?:\s*(online))?/gi),
    ];
    for (const match of expenseMatches) {
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
    }

    if (pendingUpdates.length > 0) {
      const first = pendingUpdates[0];
      user.waitingForUpdate = {
        field: first.field,
        value: first.value,
        type: first.type || "normal",
      };
      await sock.sendMessage(sender, { text: first.message });
      return;
    }

    /* ============================================================
       🟢 HANDLE SUBMISSION CONFIRMATION (YES / NO)
    ============================================================ */
    if (user.waitingForSubmit === true) {
      const cleanText = text.trim().toLowerCase().replace(/[.!?]/g, "");
      if (cleanText === "yes") {
        try {
          recalculateCashHandover(user);
          await sendSubmittedSummary(sock, sender, user);

          const now = new Date();
          const day = String(now.getDate()).padStart(2, "0");
          const month = String(now.getMonth() + 1).padStart(2, "0");
          const year = now.getFullYear();
          const primaryKey = `${day}${month}${year}`;

          await db.read();

          // ✅ Clean temp fields before saving
          const {
            waitingForUpdate,
            waitingForSubmit,
            editingExisting,
            confirmingFetch,
            awaitingCancelChoice,
            pendingPrimaryKey,
            ...cleanUser
          } = user;

          // ✅ If editingExisting → update same record
          if (user.editingExisting === true) {
            db.data[primaryKey] = {
              sender,
              ...cleanUser,
              submittedAt: new Date().toISOString(),
            };
            await db.write();
            await sock.sendMessage(sender, {
              text: "✅ Existing record updated successfully! Thank you.",
            });
            delete global.userData[sender];
            return;
          }

          // ⚠️ If record already exists
          if (db.data[primaryKey] && !user.confirmingUpdate) {
            user.confirmingUpdate = true;
            user.pendingPrimaryKey = primaryKey;
            await sock.sendMessage(sender, {
              text: `⚠️ Data for ${day}/${month}/${year} already exists.\nDo you want to update it? (yes/no)`,
            });
            return;
          }

          // ✅ Save new record
          db.data[primaryKey] = {
            sender,
            ...cleanUser,
            submittedAt: new Date().toISOString(),
          };
          await db.write();

          await sock.sendMessage(sender, {
            text: "✅ Data submitted and saved successfully! Thank you.",
          });

          delete user.confirmingUpdate;
          delete user.pendingPrimaryKey;
          delete global.userData[sender];
          return;
        } catch (err) {
          console.error("❌ Submit error:", err);
          user.waitingForSubmit = false;
          await sock.sendMessage(sender, {
            text: "❌ Failed to submit data due to an error. Please try again.",
          });
          return;
        }
      }
    }

    /* ============================================================
       🟢 HANDLE FIELD UPDATE CONFIRMATION
    ============================================================ */
    if (user.waitingForUpdate) {
      if (/^yes$/i.test(text)) {
        const { field, value, type } = user.waitingForUpdate;

        if (type === "extra") {
          // value may be an object {amount, mode}
          const idx = user.ExtraExpenses.findIndex(
            (e) => e.name.toLowerCase() === field.toLowerCase()
          );
          if (idx >= 0) {
            if (typeof value === "object") {
              user.ExtraExpenses[idx].amount = value.amount;
              user.ExtraExpenses[idx].mode = value.mode;
            } else {
              user.ExtraExpenses[idx].amount = value;
              // keep existing mode
            }
          }
        } else {
          // normal field; value may be object for Diesel/Adda/Union
          if (typeof value === "object") {
            user[field] = value; // assign {amount, mode}
          } else {
            user[field] = value;
          }
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
        return;
      } else if (/^no$/i.test(text)) {
        user.waitingForUpdate = null;
        const completenessMsg = getCompletionMessage(user);
        await sock.sendMessage(sender, {
          text: `❎ Update cancelled.\n${completenessMsg}`,
        });
        return;
      }
    }

    if (!anyFieldFound) return;

    recalculateCashHandover(user);
    const completenessMsg = getCompletionMessage(user);
    await sendSummary(sock, sender, completenessMsg, user);
  } catch (err) {
    console.error("❌ Error in handleIncomingMessageFromDaily:", err);
  }
}

/* ============================================================
   🧩 SUPPORT FUNCTIONS
============================================================ */

function recalculateCashHandover(user) {
  const diesel = user.Diesel?.mode === "cash" ? parseFloat(user.Diesel?.amount || 0) : 0;
  const adda = user.Adda?.mode === "cash" ? parseFloat(user.Adda?.amount || 0) : 0;
  const union = user.Union?.mode === "cash" ? parseFloat(user.Union?.amount || 0) : 0;

  const totalCollection = parseFloat(user.TotalCashCollection) || 0;

  const extraTotal = (user.ExtraExpenses || []).reduce(
    (sum, e) => sum + (e.mode === "cash" ? parseFloat(e.amount) || 0 : 0),
    0
  );

  const autoHandover = totalCollection - (diesel + adda + union + extraTotal);
  user.CashHandover = autoHandover.toFixed(0);
  return user.CashHandover;
}


function getCompletionMessage(user) {
  const allFields = ["Dated", "Diesel", "Adda", "Union", "TotalCashCollection", "Online"];
  const missing = allFields.filter((f) => {
    const v = user[f];
    if (v === null || v === undefined || v === "") return true;
    // if it's object ensure amount present
    if (typeof v === "object") {
      return !v.amount || String(v.amount).trim() === "";
    }
    return false;
  });

  if (missing.length === 0) {
    if (!user.waitingForSubmit) user.waitingForSubmit = true;
    return "⚠️ All Data Entered.\nDo you want to Submit now? (yes/no)";
  } else {
    if (user.waitingForSubmit) user.waitingForSubmit = false;
    return `🟡 Data Entering! Please provide remaining data.\nMissing fields: ${missing.join(", ")}`;
  }
}

async function sendSummary(sock, jid, title, userData = {}) {
  const extraList =
    userData.ExtraExpenses && userData.ExtraExpenses.length > 0
      ? userData.ExtraExpenses
          .map(
            (e) =>
              `🧾 ${capitalize(e.name)}: ₹${e.amount}${e.mode === "online" ? " 💳" : ""}`
          )
          .join("\n")
      : "";

  const dieselAmt = userData.Diesel?.amount || userData.Diesel || "___";
  const addaAmt = userData.Adda?.amount || userData.Adda || "___";
  const unionAmt = userData.Union?.amount || userData.Union || "___";

  const msg = [
    `✅ *Daily Data Entry*${userData.editingExisting ? " (Editing Existing Record)" : ""}`,
    `📅 Dated: ${userData.Dated || "___"}`,
    ``,
    `💰 *Expenses (Outflow):*`,
    `⛽ Diesel: ₹${dieselAmt}${userData.Diesel?.mode === "online" ? " 💳" : ""}`,
    `🚌 Adda : ₹${addaAmt}${userData.Adda?.mode === "online" ? " 💳" : ""}`,
    `🤝 Union Fees: ₹${unionAmt}${userData.Union?.mode === "online" ? " 💳" : ""}`,
    extraList ? `${extraList}` : "",
    ``,
    `💵 *Total Collection (Inflow):*`,
    `💸 Total Cash Collection: ₹${userData.TotalCashCollection || "___"}`,
    `💳 Online Collection: ₹${userData.Online || "___"}`,
    ``,
    `✨ *Total Hand Over:*`,
    `💵 Cash Hand Over: ₹${userData.CashHandover || "___"}`,
    ``,
    title ? `\n${title}` : "",
  ].join("\n");
  await sock.sendMessage(jid, { text: msg });
}

async function sendSubmittedSummary(sock, jid, userData = {}) {
  const extraList =
    userData.ExtraExpenses && userData.ExtraExpenses.length > 0
      ? userData.ExtraExpenses
          .map(
            (e) =>
              `🧾 ${capitalize(e.name)}: ₹${e.amount}${e.mode === "online" ? " 💳" : ""}`
          )
          .join("\n")
      : "";

  const dieselAmt = userData.Diesel?.amount || userData.Diesel || "0";
  const addaAmt = userData.Adda?.amount || userData.Adda || "0";
  const unionAmt = userData.Union?.amount || userData.Union || "0";

  const msg = [
    `✅ *Data Submitted*${userData.editingExisting ? " (Updated Existing Record)" : ""}`,
    `📅 Dated: ${userData.Dated || "___"}`,
    ``,
    `💰 *Expenses (Outflow):*`,
    `⛽ Diesel: ₹${dieselAmt}${userData.Diesel?.mode === "online" ? " 💳" : ""}`,
    `🚌 Adda : ₹${addaAmt}${userData.Adda?.mode === "online" ? " 💳" : ""}`,
    `🤝 Union Fees: ₹${unionAmt}${userData.Union?.mode === "online" ? " 💳" : ""}`,
    extraList ? `${extraList}` : "",
    ``,
    `💵 *Total Collection (Inflow):*`,
    `💸 Total Cash Collection: ₹${userData.TotalCashCollection || "0"}`,
    `💳 Online Collection: ₹${userData.Online || "0"}`,
    ``,
    `✨ *Total Hand Over:*`,
    `💵 Cash Hand Over: ₹${userData.CashHandover || "0"}`,
    ``,
    `✅ Data Submitted successfully!`,
  ].join("\n");

  await sock.sendMessage(jid, { text: msg });
}

function capitalize(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function formatExistingForMessage(existing) {
  if (!existing && existing !== 0) return "___";
  if (typeof existing === "object") {
    const amt = existing.amount || "___";
    const mode = existing.mode || "cash";
    return `${amt} (${mode})`;
  }
  return String(existing);
}
