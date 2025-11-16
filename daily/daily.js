import { format, parse, isValid } from "date-fns";
import db from "./daily_db.js";
import { handleDailyStatus } from "./daily_status.js";
import { handleStatusUpdate } from "./daily_status_update.js";

/**
 * Production-ready handler for daily data entry via WhatsApp (Baileys socket).
 *
 * - Fully commented
 * - Safe wrappers around DB reads/writes and socket send operations
 * - Try/catch blocks to avoid app crashes
 * - Preserves original business logic and field names/behaviour
 *
 * Usage: import { handleIncomingMessageFromDaily } from './this-file.js';
 */

/* -----------------------------
   Helper wrappers & utilities
   ----------------------------- */

/**
 * Safely send a text message via sock.sendMessage — catches and logs send errors.
 * Keeps behaviour consistent with original `sock.sendMessage`.
 */
async function safeSendMessage(sock, jid, message) {
  try {
    await sock.sendMessage(jid, message);
  } catch (err) {
    console.error("❌ Failed to send message to", jid, ":", err);
    // do not rethrow to avoid killing the handler
  }
}

/**
 * Safely call db.read() with error handling.
 * Returns true if read succeeded, false otherwise.
 */
async function safeDbRead() {
  try {
    if (typeof db.read === "function") {
      await db.read();
      db.data = db.data || {};
    } else {
      console.warn("⚠️ db.read() not available on db object");
      db.data = db.data || {};
    }
    return true;
  } catch (err) {
    console.error("❌ DB read error:", err);
    return false;
  }
}

/**
 * Safely call db.write() with error handling.
 * Returns true if write succeeded, false otherwise.
 */
async function safeDbWrite() {
  try {
    if (typeof db.write === "function") {
      await db.write();
    } else {
      console.warn("⚠️ db.write() not available on db object");
    }
    return true;
  } catch (err) {
    console.error("❌ DB write error:", err);
    return false;
  }
}

/**
 * Safely send a simple yes/no reply using a plain text message.
 */
async function sendYesNoReply(sock, jid, text) {
  try {
    await safeSendMessage(sock, jid, { text });
  } catch (err) {
    console.error("❌ sendYesNoReply failed:", err);
  }
}

/* ============================================================
   Helper UI/format functions (kept simple & sync)
   ============================================================ */

function capitalize(str = "") {
  if (!str) return "";
  return String(str).charAt(0).toUpperCase() + String(str).slice(1).toLowerCase();
}

function formatExistingForMessage(existing) {
  if (existing === null || existing === undefined) return "___";
  if (typeof existing === "object") {
    const amt = existing.amount || "___";
    const mode = existing.mode || "cash";
    return `${amt} (${mode})`;
  }
  return String(existing);
}

/* ============================================================
   Core handler
   ============================================================ */

export async function handleIncomingMessageFromDaily(sock, msg) {
  try {
    // Validate message shape
    if (!msg || !msg.key) {
      console.warn("⚠️ Received malformed or empty msg:", msg);
      return;
    }

    const sender = msg.key.remoteJid;
// 🛑 Ignore group messages
  if (sender && sender.endsWith("@g.us")) {
    console.log("🚫 Ignored group message from:", sender);
    return;
  }

    const messageContent =
      msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!messageContent) return; // nothing to do
    if (msg.key.fromMe) return; // ignore messages sent by the bot itself

    const textRaw = String(messageContent);
    const normalizedText = textRaw.trim();
    const text = normalizedText.toLowerCase();
// ============================================================
// 🟩 DAILY STATUS COMMAND HANDLER
// ============================================================
    const handled = await handleDailyStatus(sock, sender, normalizedText);
    if (handled) return; // stop here if it's a "Daily Status" command
    const statusUpdated = await handleStatusUpdate(sock, sender, normalizedText);
    if (statusUpdated) return;

    /* ============================================================
       🧹 CLEAR COMMAND — reset local user session
    ============================================================ */
    if (/^clear$/i.test(text)) {
      try {
        delete global.userData?.[sender];
        await safeSendMessage(sock, sender, {
          text: "🧹 Local data cleared successfully! You can start fresh now.",
        });
      } catch (err) {
        console.error("❌ Error in clear command:", err);
      }
      return;
    }

    /* ============================================================
       ✅ Initialize user session (no auto date; wait for user to enter)
       - global.userData keeps per-sender session in memory
    ============================================================ */
    try {
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
          Remarks: null,             // ✅ new
          Status: "Initiated",       // ✅ new
          waitingForUpdate: null,
          waitingForSubmit: false,
          editingExisting: false,
          confirmingFetch: false,
          awaitingCancelChoice: false,
          confirmingUpdate: false,
          pendingPrimaryKey: null,
        };

        await safeSendMessage(sock, sender, {
          text: "👋 Please enter date first in format: Dated DD/MM/YYYY",
        });
      }
    } catch (err) {
      console.error("❌ Session initialization error for", sender, ":", err);
      return;
    }

    const user = global.userData[sender];

    /* ============================================================
       🧠 FETCH EXISTING RECORD CONFIRMATION
       - If user.confirmingFetch === true, they previously asked to fetch an existing record
    ============================================================ */
    if (user.confirmingFetch) {
      try {
        if (text === "yes") {
          const key = user.pendingPrimaryKey;
          const ok = await safeDbRead();
          if (!ok) {
            await safeSendMessage(sock, sender, {
              text: "❌ Unable to read DB. Try again later.",
            });
            return;
          }
          const oldRecord = db.data[key];
          if (oldRecord) {
            // Merge the stored record into the session user object
            Object.assign(user, oldRecord);
            if (!user.Remarks) user.Remarks = null;
            if (!user.Status) user.Status = "Initiated";

            user.confirmingFetch = false;
            user.waitingForSubmit = false;
            user.editingExisting = true;
            // recalc, then show summary with Cancel prompt
            recalculateCashHandover(user);
            await sendSummary(
              sock,
              sender,
              "📋 Fetched existing record. You can now update any field and re-submit.\n\nDo you want to Cancel? (yes/no)",
              user
            );
            user.awaitingCancelChoice = true;
          } else {
            // No record found (race condition)
            user.confirmingFetch = false;
            user.pendingPrimaryKey = null;
            await safeSendMessage(sock, sender, {
              text: "⚠️ The requested record was not found in the DB.",
            });
          }
          return;
        } else if (text === "no") {
          // User chose not to fetch — start fresh
          user.confirmingFetch = false;
          user.pendingPrimaryKey = null;
          user.editingExisting = false;
          await safeSendMessage(sock, sender, {
            text: "🆕 Starting a fresh entry. Please continue entering new data.",
          });
          return;
        }
      } catch (err) {
        console.error("❌ Error while processing confirmingFetch for", sender, ":", err);
        // Reset flags safely to avoid stuck state
        user.confirmingFetch = false;
        user.pendingPrimaryKey = null;
        await safeSendMessage(sock, sender, {
          text: "❌ An error occurred while fetching the record. Please try again.",
        });
        return;
      }
    }

    /* ============================================================
       🧠 HANDLE CANCEL CHOICE AFTER FETCH
       - After fetching an existing record, user is asked if they want to cancel editing it.
    ============================================================ */
    if (user.awaitingCancelChoice) {
      try {
        if (text === "yes") {
          // User wants to discard fetched record and start fresh
          delete global.userData[sender];
          await safeSendMessage(sock, sender, {
            text: "✅ Existing record discarded. Starting fresh entry.",
          });
          return;
        } else if (text === "no") {
          user.awaitingCancelChoice = false;
          await safeSendMessage(sock, sender, {
            text: "📋 Please start updating by confirming above data.",
          });
          return;
        }
      } catch (err) {
        console.error("❌ Error handling awaitingCancelChoice for", sender, ":", err);
        user.awaitingCancelChoice = false;
        await safeSendMessage(sock, sender, {
          text: "❌ Error while processing your choice. Please continue.",
        });
        return;
      }
    }

    /* ============================================================
       ⚙️ HANDLE EXISTING RECORD UPDATE CONFIRMATION (on Submit)
       - If user.confirmingUpdate === true they responded to "do you want to update it?"
    ============================================================ */
    if (user.confirmingUpdate) {
      try {
        const cleanText = text.trim().toLowerCase();
        if (cleanText === "yes") {
          const key = user.pendingPrimaryKey;
          const ok = await safeDbRead();
          if (!ok) {
            await safeSendMessage(sock, sender, {
              text: "❌ Unable to read DB. Try again later.",
            });
            return;
          }

          // Remove transient session fields and persist
          const {
            waitingForUpdate,
            waitingForSubmit,
            editingExisting,
            confirmingFetch,
            awaitingCancelChoice,
            pendingPrimaryKey,
            confirmingUpdate,
            ...cleanUser
          } = user;

          db.data[key] = {
            sender,
            ...cleanUser,
            submittedAt: new Date().toISOString(),
          };

          const w = await safeDbWrite();
          if (!w) {
            await safeSendMessage(sock, sender, {
              text: "❌ Failed to save updated record. Try again later.",
            });
            return;
          }

          await safeSendMessage(sender ? sock : sock, sender, {
            text: "✅ Existing record updated successfully!",
          });

          // Cleanup session
          delete user.confirmingUpdate;
          delete user.pendingPrimaryKey;
          delete global.userData[sender];
          return;
        } else if (cleanText === "no") {
          await safeSendMessage(sock, sender, {
            text: "❌ Update cancelled. Old record kept as is.",
          });

          delete user.confirmingUpdate;
          delete user.pendingPrimaryKey;
          delete global.userData[sender];
          return;
        }
      } catch (err) {
        console.error("❌ Error handling confirmingUpdate for", sender, ":", err);
        // Recover: clear flags to avoid stuck state
        delete user.confirmingUpdate;
        delete user.pendingPrimaryKey;
        await safeSendMessage(sock, sender, {
          text: "❌ Error processing update confirmation. Please try again.",
        });
        return;
      }
    }

    /* ============================================================
       🆕 DAILY COMMAND — Show summary, fetch by date, or recent days
       Syntax accepted:
         - daily
         - daily today
         - daily last 3 days
         - daily DD/MM/YYYY
    ============================================================ */
    try {
      const dailyPattern = /^daily(?:\s+([\w\/\-]+)(?:\s+(\d+)\s+days)?)?$/i;
      const dailyMatch = normalizedText.match(dailyPattern);

      if (dailyMatch) {
        await safeDbRead();
        const param1 = dailyMatch[1]?.toLowerCase() || "";
        const daysCount = parseInt(dailyMatch[2]) || null;

        /* Helper: format and send a fetched record to user */
        async function sendFetchedRecord(record, title = "✅ Data Fetched") {
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

        // DAILY TODAY
        if (param1 === "today") {
          const now = new Date();
          const day = String(now.getDate()).padStart(2, "0");
          const month = String(now.getMonth() + 1).padStart(2, "0");
          const year = now.getFullYear();
          const key = `${day}${month}${year}`;
          const record = db.data[key];

          if (!record) {
            await safeSendMessage(sock, sender, { text: `⚠️ No record found for today.` });
            return;
          }

          await sendFetchedRecord(record, "✅ Today's Data");
          return;
        }

        // DAILY LAST N DAYS
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

            // Simulate typing between messages (safe; failures ignored)
            if (i < daysCount - 1) {
              try {
                if (sock.presenceSubscribe) await sock.presenceSubscribe(sender);
                if (sock.sendPresenceUpdate) {
                  await sock.sendPresenceUpdate("composing", sender);
                  await new Promise((r) => setTimeout(r, 1200));
                  await sock.sendPresenceUpdate("paused", sender);
                }
              } catch (err) {
                // Not fatal — ignore presence errors
              }
            }
          }

          return;
        }

        // DAILY DD/MM/YYYY
        const dateMatch = param1.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (dateMatch) {
          const [_, day, month, year] = dateMatch;
          const key = `${day.padStart(2, "0")}${month.padStart(2, "0")}${year}`;
          const record = db.data[key];

          if (!record) {
            await safeSendMessage(sock, sender, {
              text: `⚠️ No record found for ${day}/${month}/${year}.`,
            });
            return;
          }

          await sendFetchedRecord(record);
          return;
        }

        // DEFAULT "DAILY" — show current session summary
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
    } catch (err) {
      console.error("❌ Error handling daily command for", sender, ":", err);
      // continue-processing; not fatal
    }

    /* ============================================================
       🧹 EXPENSE DELETE COMMAND
       - Syntax: expense delete <name>
    ============================================================ */
    try {
      const deleteMatch = normalizedText.match(/expense\s+delete\s+([a-zA-Z]+)/i);
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
          await safeSendMessage(sock, sender, {
            text: `⚠️ Expense *${capitalize(deleteName)}* not found in your list.`,
          });
        }
        return;
      }
    } catch (err) {
      console.error("❌ Error handling expense delete for", sender, ":", err);
    }

    /* ============================================================
       🧠 FIELD EXTRACTION (Dated, Diesel, Adda, Union, TotalCashCollection, Online)
       - Uses regex patterns and supports modes (online vs cash)
       - When existing values differ, asks for confirmation (pendingUpdates)
    ============================================================ */
    const fieldPatterns = {
      // Date — accept textual months, brackets, star-wrapped numbers, etc.
      Dated: /date(?:d)?\s*[:\-]?\s*([\w\s,\/\-\(\)\*]+)/gi,

      // Expenses — allow *2300* and optional 'online' word to mark mode
      Diesel: /diesel\s*[:\-]?\s*\*?(\d+)\*?(?:\s*(online))?/gi,
      Adda: /adda\s*[:\-]?\s*\*?(\d+)\*?(?:\s*(online))?/gi,
      Union: /union\s*[:\-]?\s*\*?(\d+)\*?(?:\s*(online))?/gi,

      // Total Cash Collection synonyms
      TotalCashCollection: /(?:total\s*cash\s*collection|cash\s*collection|cash|total\s*collection)\s*[:\-]?\s*\*?(\d+)\*?/gi,

      // Online collection synonyms
      Online: /(?:online\s*collection|total\s*online|online)\s*[:\-]?\s*\*?(\d+)\*?/gi,
    };

    let anyFieldFound = false;
    let pendingUpdates = [];

    try {
      for (const [key, regex] of Object.entries(fieldPatterns)) {
        let match;
        while ((match = regex.exec(normalizedText)) !== null) {
          anyFieldFound = true;

          // Dated special handling
          if (key === "Dated") {
            try {
              let value = match[1].trim();
              // normalize interior whitespace & remove surrounding punctuation like parentheses or stars
              value = value.replace(/^\(*|\)*$/g, "").replace(/\*/g, "").trim().toLowerCase();

              // Natural words: today/yesterday/tomorrow
              let targetDate = null;
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

              // Try textual date: "29 October 2025 (Wednesday)" or "29 Oct 2025"
              if (!targetDate) {
                const textDateMatch = value.match(/(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/);
                if (textDateMatch) {
                  const [_, d, monthName, y] = textDateMatch;
                  const monthIndex = new Date(`${monthName} 1, ${y}`).getMonth();
                  if (!isNaN(monthIndex)) {
                    targetDate = new Date(y, monthIndex, parseInt(d, 10));
                  }
                }
              }

              // Numeric date dd/mm/yyyy or dd-mm-yyyy
              if (!targetDate) {
                const dateMatch = value.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
                if (dateMatch) {
                  const [_, dd, mm, yy] = dateMatch;
                  const parsed = parse(`${dd}/${mm}/${yy}`, "dd/MM/yyyy", new Date());
                  if (isValid(parsed)) targetDate = parsed;
                }
              }

              if (!targetDate || !isValid(targetDate)) {
                await safeSendMessage(sock, sender, {
                  text: "⚠️ Please enter a valid date (e.g. Dated 30/10/2025, or Dated today).",
                });
                return; // stop processing this message — invalid date
              }

              // Format and store session primary key
              const formatted = format(targetDate, "EEEE, dd MMMM yyyy");
              const day = String(targetDate.getDate()).padStart(2, "0");
              const month = String(targetDate.getMonth() + 1).padStart(2, "0");
              const year = targetDate.getFullYear();
              const primaryKey = `${day}${month}${year}`;

              user.Dated = formatted;
              user.pendingPrimaryKey = primaryKey;

              // Check DB for existing record with that key
              const ok = await safeDbRead();
              if (!ok) {
                await safeSendMessage(sock, sender, {
                  text: "❌ Unable to read DB to check existing date. Try again later.",
                });
                return;
              }

              if (db.data[primaryKey]) {
                user.confirmingFetch = true;
                await safeSendMessage(sock, sender, {
                  text: `⚠️ Data for ${day}/${month}/${year} already exists.\nDo you want to fetch and update it? (yes/no)`,
                });
                return;
              }

              await safeSendMessage(sock, sender, {
                text: `📅 Date set to ${formatted}`,
              });
            } catch (err) {
              console.error("❌ Error parsing/storing Dated field for", sender, ":", err);
              await safeSendMessage(sock, sender, {
                text: "❌ Failed to parse date. Please use format: Dated DD/MM/YYYY or 'Dated today'.",
              });
              return;
            }

            // move to next regex match
            continue;
          }

          // Diesel/Adda/Union — extract amount and mode
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
                const label = key;
                pendingUpdates.push({
                  field: key,
                  value: newVal,
                  message: `⚠️ ${label} already has value *${formatExistingForMessage(existing)}*.\nDo you want to update it to *${amount} (${mode})*? (yes/no)`,
                });
              } else {
                user[key] = newVal;
              }
            } catch (err) {
              console.error(`❌ Error parsing ${key} for ${sender}:`, err);
            }
            continue;
          }

          // Generic fields (TotalCashCollection, Online)
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
        } // end while match
      } // end for each field pattern
    } catch (err) {
      console.error("❌ Error during field extraction for", sender, ":", err);
    }
// ============================================================
// 📝 REMARKS COMMAND (optional field)
// ============================================================
  try {
    const remarksMatch = normalizedText.match(/^remarks\s*(.*)$/i);
    if (remarksMatch) {
      const remarkText = remarksMatch[1].trim();

      // ✅ Store remark locally (null if empty)
      user.Remarks = remarkText || null;

      // ✅ Send confirmation first
      await safeSendMessage(sock, sender, {
        text: remarkText
          ? `📝 Remark added: "${remarkText}"`
          : `🧹 Remarks cleared.`,
      });

      // ✅ Immediately show updated summary
    const completenessMsg = getCompletionMessage(user);
    await sendSummary(
                sock,
                sender,
                `📋 Here's your current entered data:\n${completenessMsg}`,
                user
              );
      return; // stop further processing
    }
  } catch (err) {
    console.error("❌ Error handling remarks for", sender, ":", err);
  }


    // Extra expenses parsing: "expense <name> : <amount> [online]"
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

    // If there are pending updates, prompt user with the first one
    try {
      if (pendingUpdates.length > 0) {
        const first = pendingUpdates[0];
        user.waitingForUpdate = {
          field: first.field,
          value: first.value,
          type: first.type || "normal",
        };
        await safeSendMessage(sock, sender, { text: first.message });
        return;
      }
    } catch (err) {
      console.error("❌ Error prompting pending update for", sender, ":", err);
    }

    /* ============================================================
       🟢 HANDLE SUBMISSION CONFIRMATION (YES / NO)
       - When user.waitingForSubmit === true and they answer "yes"
    ============================================================ */
    try {
      if (user.waitingForSubmit === true) {
        const cleanText = text.replace(/[.!?]/g, "").trim().toLowerCase();
        if (cleanText === "yes") {
          try {
            recalculateCashHandover(user);
            await sendSubmittedSummary(sock, sender, user);

            const primaryKey = user.pendingPrimaryKey;
            if (!primaryKey) {
              await safeSendMessage(sock, sender, {
                text: "⚠️ Please enter a valid date before submitting. (e.g., Dated 30/10/2025)",
              });
              return;
            }

            const ok = await safeDbRead();
            if (!ok) {
              await safeSendMessage(sock, sender, {
                text: "❌ Unable to read DB. Try again later.",
              });
              return;
            }

            const {
              waitingForUpdate,
              waitingForSubmit,
              editingExisting,
              confirmingFetch,
              awaitingCancelChoice,
              pendingPrimaryKey,
              confirmingUpdate,
              ...cleanUser
            } = user;

            // If editing existing record
            if (user.editingExisting === true) {
              db.data[primaryKey] = {
                sender,
                ...cleanUser,
                Status: cleanUser.Status || db.data[primaryKey]?.Status || "Initiated", // ✅ ensures consistency
                Remarks: cleanUser.Remarks ?? null,
                submittedAt: new Date().toISOString(),
              };
              const w = await safeDbWrite();
              if (!w) {
                await safeSendMessage(sock, sender, {
                  text: "❌ Failed to save updated record. Try again later.",
                });
                return;
              }
              await safeSendMessage(sock, sender, {
                text: `✅ Existing record for ${user.Dated} updated successfully!`,
              });
              delete global.userData[sender];
              return;
            }

            // If record exists and user hasn't yet confirmed update
            if (db.data[primaryKey] && !user.confirmingUpdate) {
              user.confirmingUpdate = true;
              user.pendingPrimaryKey = primaryKey;
              await sendYesNoReply(
                sock,
                sender,
                `⚠️ Data for ${user.Dated} already exists.\nDo you want to update it?`
              );
              return;
            }

            // Save as new record
            db.data[primaryKey] = {
              sender,
              ...cleanUser,
              Status: cleanUser.Status || db.data[primaryKey]?.Status || "Initiated", // ✅ ensures consistency
              Remarks: cleanUser.Remarks ?? null,
              submittedAt: new Date().toISOString(),
            };
            const w2 = await safeDbWrite();
            if (!w2) {
              await safeSendMessage(sock, sender, {
                text: "❌ Failed to save data. Try again later.",
              });
              return;
            }

            await safeSendMessage(sock, sender, {
              text: `✅ Data for ${user.Dated} saved successfully! Thank you.`,
            });

            delete user.confirmingUpdate;
            delete user.pendingPrimaryKey;
            delete global.userData[sender];
            return;
          } catch (err) {
            console.error("❌ Submit error for", sender, ":", err);
            user.waitingForSubmit = false;
            await safeSendMessage(sock, sender, {
              text: "❌ Failed to submit data due to an error. Please try again.",
            });
            return;
          }
        }
      }
    } catch (err) {
      console.error("❌ Error handling submission confirmation for", sender, ":", err);
    }

    /* ============================================================
       🟢 HANDLE FIELD UPDATE CONFIRMATION (YES/NO to pending update)
    ============================================================ */
    if (user.waitingForUpdate) {
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
              // If not found, add it
              user.ExtraExpenses.push({ name: field, amount: value.amount || value, mode: value.mode || "cash" });
            }
          } else {
            // normal fields (Diesel/Adda/Union or generic)
            if (typeof value === "object") {
              user[field] = value;
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
          await safeSendMessage(sock, sender, {
            text: `❎ Update cancelled.\n${completenessMsg}`,
          });
          return;
        }
      } catch (err) {
        console.error("❌ Error handling waitingForUpdate for", sender, ":", err);
        user.waitingForUpdate = null;
        await safeSendMessage(sock, sender, {
          text: "❌ Error processing your update response. Please re-enter the value.",
        });
        return;
      }
    }

    // If no fields found in this message, nothing more to do
    if (!anyFieldFound) return;

    // Final: recalc and send current session summary / prompt for submit if complete
    try {
      recalculateCashHandover(user);
      const completenessMsg = getCompletionMessage(user);
      await sendSummary(sock, sender, completenessMsg, user);
    } catch (err) {
      console.error("❌ Error preparing final summary for", sender, ":", err);
    }
  } catch (err) {
    // Top-level catch: protect application from crashing due to unexpected errors
    console.error("❌ Error in handleIncomingMessageFromDaily:", err);
  }
}

/* ============================================================
   🧩 SUPPORT FUNCTIONS (calculations, messages)
   ============================================================ */

/**
 * Recalculate CashHandover automatically from session fields.
 * - Diesel/Adda/Union counted only if mode === "cash"
 * - ExtraExpenses included only if mode === "cash"
 * - TotalCashCollection used as inflow
 *
 * Stores result back on user.CashHandover (rounded to 0 decimals)
 */
function recalculateCashHandover(user) {
  try {
    const diesel = user.Diesel?.mode === "cash" ? parseFloat(user.Diesel?.amount || 0) : 0;
    const adda = user.Adda?.mode === "cash" ? parseFloat(user.Adda?.amount || 0) : 0;
    const union = user.Union?.mode === "cash" ? parseFloat(user.Union?.amount || 0) : 0;

    const totalCollection = parseFloat(user.TotalCashCollection) || 0;

    const extraTotal = (user.ExtraExpenses || []).reduce(
      (sum, e) => sum + (e.mode === "cash" ? parseFloat(e.amount) || 0 : 0),
      0
    );

    const autoHandover = totalCollection - (diesel + adda + union + extraTotal);
    // store as integer-like string (like original .toFixed(0))
    user.CashHandover = isFinite(autoHandover) ? autoHandover.toFixed(0) : "0";
    return user.CashHandover;
  } catch (err) {
    console.error("❌ Error recalculating CashHandover:", err);
    user.CashHandover = user.CashHandover || "0";
    return user.CashHandover;
  }
}

/**
 * Return a completion message based on which fields are missing.
 * - When all required fields are present, sets user.waitingForSubmit = true
 * - Otherwise clears it
 */
function getCompletionMessage(user) {
  try {
    const allFields = ["Dated", "Diesel", "Adda", "Union", "TotalCashCollection", "Online"];
    const missing = allFields.filter((f) => {
      const v = user[f];
      if (v === null || v === undefined || v === "") return true;
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
  } catch (err) {
    console.error("❌ Error computing completion message:", err);
    return "⚠️ Unable to determine completion state. Please continue entering data.";
  }
}

/**
 * Send a session summary to the user (current values, prompt text)
 * - title parameter is appended at the end (can be prompt text)
 */
async function sendSummary(sock, jid, title, userData = {}) {
  try {
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
      // ✅ Add remarks only if not null
      ...(userData.Remarks ? [`📝 *Remarks:* ${userData.Remarks}`] : []),
      ``,
      title ? `\n${title}` : "",
    ].join("\n");

    await safeSendMessage(sock, jid, { text: msg });
  } catch (err) {
    console.error("❌ sendSummary error:", err);
    await safeSendMessage(sock, jid, { text: "❌ Failed to send summary. Try again." });
  }
}

/**
 * Send the final submitted summary (slightly different messaging)
 */
async function sendSubmittedSummary(sock, jid, userData = {}) {
  try {
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
      // ✅ Add remarks only if not null
      ...(userData.Remarks ? [`📝 *Remarks: ${userData.Remarks}*`] : []),
      ``,
      `✅ Data Submitted successfully!`,
    ].join("\n");
    

    await safeSendMessage(sock, jid, { text: msg });
  } catch (err) {
    console.error("❌ sendSubmittedSummary error:", err);
    await safeSendMessage(sock, jid, { text: "❌ Failed to send submitted summary." });
  }
}
