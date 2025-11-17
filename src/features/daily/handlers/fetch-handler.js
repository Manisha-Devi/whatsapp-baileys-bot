import db from "../../../data/db.js";
import { safeSendMessage, safeDbRead } from "../utils/helpers.js";
import { recalculateCashHandover } from "../utils/calculations.js";
import { sendSummary } from "../utils/messages.js";
import { resolveCommand } from "../../../utils/menu-handler.js";

export async function handleFetchConfirmation(sock, sender, text, user) {
  if (!user.confirmingFetch) return false;

  try {
    const resolved = resolveCommand(text);
    if (resolved === "yes") {
      const key = user.pendingPrimaryKey;
      const ok = await safeDbRead();
      if (!ok) {
        await safeSendMessage(sock, sender, {
          text: "❌ Unable to read DB. Try again later.",
        });
        return true;
      }
      
      const oldRecord = db.data[key];
      if (oldRecord) {
        Object.assign(user, oldRecord);
        if (!user.Remarks) user.Remarks = null;
        if (!user.Status) user.Status = "Initiated";

        user.confirmingFetch = false;
        user.waitingForSubmit = false;
        user.editingExisting = true;
        
        recalculateCashHandover(user);
        await sendSummary(
          sock,
          sender,
          "📋 Fetched existing record. You can now update any field and re-submit.\n\nDo you want to Cancel? (*Yes* or *Y* / *No* or *N*)",
          user
        );
        user.awaitingCancelChoice = true;
      } else {
        user.confirmingFetch = false;
        user.pendingPrimaryKey = null;
        await safeSendMessage(sock, sender, {
          text: "⚠️ The requested record was not found in the DB.",
        });
      }
      return true;
    } else if (resolved === "no") {
      user.confirmingFetch = false;
      user.pendingPrimaryKey = null;
      user.editingExisting = false;
      await safeSendMessage(sock, sender, {
        text: "🆕 Starting a fresh entry. Please continue entering new data.",
      });
      return true;
    }
    return false;
  } catch (err) {
    console.error("❌ Error while processing confirmingFetch for", sender, ":", err);
    user.confirmingFetch = false;
    user.pendingPrimaryKey = null;
    await safeSendMessage(sock, sender, {
      text: "❌ An error occurred while fetching the record. Please try again.",
    });
    return true;
  }
}

export async function handleCancelChoice(sock, sender, text, user) {
  if (!user.awaitingCancelChoice) return false;

  try {
    const resolved = resolveCommand(text);
    if (resolved === "yes") {
      delete global.userData?.[sender];
      await safeSendMessage(sock, sender, {
        text: "✅ Existing record discarded. Starting fresh entry.",
      });
      return true;
    } else if (resolved === "no") {
      user.awaitingCancelChoice = false;
      await safeSendMessage(sock, sender, {
        text: "📋 Please start updating by confirming above data.",
      });
      return true;
    }
    return false;
  } catch (err) {
    console.error("❌ Error handling awaitingCancelChoice for", sender, ":", err);
    user.awaitingCancelChoice = false;
    await safeSendMessage(sock, sender, {
      text: "❌ Error while processing your choice. Please continue.",
    });
    return true;
  }
}
