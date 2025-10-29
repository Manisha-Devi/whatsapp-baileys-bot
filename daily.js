import { format, parse, isValid } from "date-fns";

export async function handleIncomingMessage(sock, msg) {
  try {
    const sender = msg.key.remoteJid;
    const messageContent =
      msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!messageContent) return;
    if (msg.key.fromMe) return;

    // ✅ Initialize user session
    if (!global.userData) global.userData = {};
    if (!global.userData[sender]) {
      const todayDate = format(new Date(), "EEEE, dd MMMM yyyy");
      global.userData[sender] = {
        Dated: todayDate,
        Diesel: null,
        Adda: null,
        Union: null,
        TotalCashCollection: null,
        Online: null,
        CashHandover: null,
        ExtraExpenses: [],
        waitingForUpdate: null,
        waitingForSubmit: false,
      };
    }

    const user = global.userData[sender];
    const text = messageContent.trim();

    /* ============================================================
       🆕 DAILY COMMAND — Show current summary + completeness check
    ============================================================ */
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

    /* ============================================================
       🧹 EXPENSE DELETE COMMAND — Remove a dynamic expense
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
       🟢 HANDLE SUBMISSION CONFIRMATION (YES / NO)
    ============================================================ */
    if (user.waitingForSubmit === true) {
      const cleanText = text.trim().toLowerCase().replace(/[.!?]/g, "");

      if (cleanText === "yes") {
        try {
          recalculateCashHandover(user);
          await sendSubmittedSummary(sock, sender, user);
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
      } else if (cleanText === "no") {
        user.waitingForSubmit = false;
        await sock.sendMessage(sender, {
          text: "🕓 Submission cancelled. You can review or edit data anytime.",
        });
        return;
      }
    }

    /* ============================================================
       🟢 HANDLE FIELD UPDATE CONFIRMATION
    ============================================================ */
    if (user.waitingForUpdate) {
      if (/^yes$/i.test(text)) {
        const { field, value, type } = user.waitingForUpdate;

        if (type === "extra") {
          const idx = user.ExtraExpenses.findIndex(
            (e) => e.name.toLowerCase() === field.toLowerCase()
          );
          if (idx >= 0) user.ExtraExpenses[idx].amount = value;
        } else {
          user[field] = value;
        }

        user.waitingForUpdate = null;
        recalculateCashHandover(user);
        const completenessMsg = getCompletionMessage(user);
        await sendSummary(
          sock,
          sender,
          `✅ ${field} updated successfully!\n${completenessMsg}`,
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

    /* ============================================================
       🧠 FIELD EXTRACTION (MULTI-FIELD SUPPORT + DATE VALIDATION)
    ============================================================ */
    const fieldPatterns = {
      Dated: /dated\s*[:\-]?\s*([\w\s,\/\-]+)/gi,
      Diesel: /diesel\s*[:\-]?\s*(\d+)/gi,
      Adda: /adda\s*[:\-]?\s*(\d+)/gi,
      Union: /union\s*[:\-]?\s*(\d+)/gi,
      TotalCashCollection: /total\s*cash\s*collection\s*[:\-]?\s*(\d+)/gi,
      Online: /online\s*[:\-]?\s*(\d+)/gi,
      // 🟡 Cash Hand Over removed — now auto-calculated
    };

    let anyFieldFound = false;
    let pendingUpdates = [];

    for (const [key, regex] of Object.entries(fieldPatterns)) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        let value = match[1].trim();
        anyFieldFound = true;

        // 🧠 Handle Dated: convert DD/MM/YYYY → formatted
        if (key === "Dated") {
          const dateMatch = value.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
          if (dateMatch) {
            const [_, day, month, year] = dateMatch;
            const parsed = parse(`${day}/${month}/${year}`, "dd/MM/yyyy", new Date());
            if (isValid(parsed)) {
              value = format(parsed, "EEEE, dd MMMM yyyy");
            } else {
              await sock.sendMessage(sender, {
                text: "⚠️ Invalid date. Please enter a real date (DD/MM/YYYY).",
              });
              return;
            }
          } else {
            await sock.sendMessage(sender, {
              text: "⚠️ Please enter date in DD/MM/YYYY format.",
            });
            return;
          }
        }

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

    // 🧾 Dynamic "Expense <Name>: <Amount>"
    const expenseMatches = [...text.matchAll(/expense\s+([a-zA-Z]+)\s*[:\-]?\s*(\d+)/gi)];
    for (const match of expenseMatches) {
      const expenseName = match[1].trim();
      const amount = match[2].trim();
      anyFieldFound = true;

      const existing = user.ExtraExpenses.find(
        (e) => e.name.toLowerCase() === expenseName.toLowerCase()
      );

      if (existing && existing.amount !== amount) {
        pendingUpdates.push({
          field: expenseName,
          value: amount,
          type: "extra",
          message: `⚠️ Expense *${expenseName}* already has value *${existing.amount}*.\nDo you want to update it to *${amount}*? (yes/no)`,
        });
      } else if (!existing) {
        user.ExtraExpenses.push({ name: expenseName, amount });
      }
    }

    // 🟡 If updates detected, ask first one
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

    if (!anyFieldFound) return;

    // ✅ After all fields processed
    recalculateCashHandover(user);
    const completenessMsg = getCompletionMessage(user);
    await sendSummary(sock, sender, completenessMsg, user);
  } catch (err) {
    console.error("❌ Error in handleIncomingMessage:", err);
  }
}

/* ============================================================
   🧩 SUPPORT FUNCTIONS
============================================================ */

function recalculateCashHandover(user) {
  const diesel = parseFloat(user.Diesel) || 0;
  const adda = parseFloat(user.Adda) || 0;
  const union = parseFloat(user.Union) || 0;
  const totalCollection = parseFloat(user.TotalCashCollection) || 0;
  const extraTotal = (user.ExtraExpenses || []).reduce(
    (sum, e) => sum + (parseFloat(e.amount) || 0),
    0
  );

  const autoHandover = totalCollection - (diesel + adda + union + extraTotal);
  user.CashHandover = autoHandover.toFixed(0);
  return user.CashHandover;
}

function getCompletionMessage(user) {
  const allFields = [
    "Dated",
    "Diesel",
    "Adda",
    "Union",
    "TotalCashCollection",
    "Online",
  ];

  const missing = allFields.filter(
    (f) => user[f] === null || user[f] === undefined || user[f] === ""
  );

  if (missing.length === 0) {
    if (!user.waitingForSubmit) user.waitingForSubmit = true;
    return "⚠️ All Data Entered.\nDo you want to Submit now? (yes/no)";
  } else {
    if (user.waitingForSubmit) user.waitingForSubmit = false;
    return `🟡 Data Entering! Please provide remaining data.\nMissing fields: ${missing.join(
      ", "
    )}`;
  }
}

// 🧾 WhatsApp Summary Message
async function sendSummary(sock, jid, title, userData = {}) {
  const extraList =
    userData.ExtraExpenses && userData.ExtraExpenses.length > 0
      ? userData.ExtraExpenses
          .map((e) => `🧾 ${capitalize(e.name)}: ₹${e.amount}`)
          .join("\n")
      : "";

  const msg = [
    `✅ *Daily Data Entry*`,
    `📅 Dated: ${userData.Dated}`,
    ``,
    `💰 *Expenses (Outflow):*`,
    `⛽ Diesel: ₹${userData.Diesel || "___"}`,
    `🚌 Adda : ₹${userData.Adda || "___"}`,
    `🤝 Union Fees: ₹${userData.Union || "___"}`,
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

// ✅ Final Submitted Summary
async function sendSubmittedSummary(sock, jid, userData = {}) {
  const extraList =
    userData.ExtraExpenses && userData.ExtraExpenses.length > 0
      ? userData.ExtraExpenses
          .map((e) => `🧾 ${capitalize(e.name)}: ₹${e.amount}`)
          .join("\n")
      : "";

  const msg = [
    `✅ *Data Submitted*`,
    `📅 Dated: ${userData.Dated}`,
    ``,
    `💰 *Expenses (Outflow):*`,
    `⛽ Diesel: ₹${userData.Diesel}`,
    `🚌 Adda : ₹${userData.Adda}`,
    `🤝 Union Fees: ₹${userData.Union}`,
    extraList ? `${extraList}` : "",
    ``,
    `💵 *Total Collection (Inflow):*`,
    `💸 Total Cash Collection: ₹${userData.TotalCashCollection}`,
    `💳 Online Collection: ₹${userData.Online}`,
    ``,
    `✨ *Total Hand Over:*`,
    `💵 Cash Hand Over: ₹${userData.CashHandover}`,
    ``,
    `✅ Data Submitted successfully!`,
  ].join("\n");

  await sock.sendMessage(jid, { text: msg });
}

function capitalize(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
