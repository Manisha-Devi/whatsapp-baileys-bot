import db from "../../../utils/db.js";
import { safeSendMessage, safeDbRead, safeDbWrite } from "../utils/helpers.js";
import { sendSubmittedSummary } from "../utils/messages.js";
import { resolveCommand } from "../../../utils/menu-handler.js";
import { getMenuState } from "../../../utils/menu-state.js";

export async function handleSubmit(sock, sender, text, user) {
  if (!user.waitingForSubmit) return false;

  try {
    const resolved = resolveCommand(text);
    
    if (resolved === "yes") {
      const ok = await safeDbRead();
      if (!ok) {
        await safeSendMessage(sock, sender, {
          text: "❌ Unable to read DB. Try again later.",
        });
        return true;
      }

      const primaryKey = user.pendingPrimaryKey;
      const existingRecord = db.data[primaryKey];

      if (existingRecord && !user.editingExisting) {
        user.pendingPrimaryKey = primaryKey;
        user.waitingForSubmit = false;
        user.confirmingUpdate = true;
        await safeSendMessage(sock, sender, {
          text: `⚠️ A record for ${user.busCode || 'Unknown Bus'} on ${user.Dated} already exists.\nDo you want to update it? (*Yes* or *Y* / *No* or *N*)`,
        });
        return true;
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

      db.data[primaryKey] = {
        sender,
        ...cleanUser,
        submittedAt: new Date().toISOString(),
      };

      const w = await safeDbWrite();
      if (!w) {
        await safeSendMessage(sock, sender, {
          text: "❌ Failed to save data. Try again later.",
        });
        return true;
      }

      await sendSubmittedSummary(sock, sender, cleanUser);
      delete global.userData[sender];
      return true;
    } else if (resolved === "no") {
      await safeSendMessage(sock, sender, {
        text: "❌ Submission cancelled. You can continue editing.",
      });
      user.waitingForSubmit = false;
      return true;
    }
    
    return false;
  } catch (err) {
    console.error("❌ Error handling submit for", sender, ":", err);
    await safeSendMessage(sock, sender, {
      text: "❌ Error processing submission. Please try again.",
    });
    return true;
  }
}

export async function handleUpdateConfirmation(sock, sender, text, user) {
  if (!user.confirmingUpdate) return false;

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
        return true;
      }

      await safeSendMessage(sock, sender, {
        text: `✅ Record for *${user.busCode || 'Bus'}* on ${user.Dated} updated successfully!`,
      });

      delete user.confirmingUpdate;
      delete user.pendingPrimaryKey;
      delete global.userData[sender];
      return true;
    } else if (resolved === "no") {
      await safeSendMessage(sock, sender, {
        text: "❌ Update cancelled. Old record kept as is.",
      });

      delete user.confirmingUpdate;
      delete user.pendingPrimaryKey;
      delete global.userData[sender];
      return true;
    }
    
    return false;
  } catch (err) {
    console.error("❌ Error handling confirmingUpdate for", sender, ":", err);
    delete user.confirmingUpdate;
    delete user.pendingPrimaryKey;
    await safeSendMessage(sock, sender, {
      text: "❌ Error processing update confirmation. Please try again.",
    });
    return true;
  }
}
