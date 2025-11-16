import { handleDailyStatus, handleStatusUpdate } from "./daily_status.js";
import { safeSendMessage } from "./utils/helpers.js";
import { handleClearCommand, handleDailyCommand } from "./handlers/command-handler.js";
import { handleExpenseCommand, handleExpenseDelete } from "./handlers/expense-handler.js";
import { handleFetchConfirmation, handleCancelChoice } from "./handlers/fetch-handler.js";
import { handleSubmit, handleUpdateConfirmation } from "./handlers/submit-handler.js";
import { handleFieldExtraction, handleFieldUpdateConfirmation, handleRemarksCommand } from "./handlers/field-handler.js";
import { recalculateCashHandover, getCompletionMessage } from "./utils/calculations.js";
import { sendSummary } from "./utils/messages.js";

export async function handleIncomingMessageFromDaily(sock, msg) {
  try {
    if (!msg || !msg.key) {
      console.warn("⚠️ Received malformed or empty msg:", msg);
      return;
    }

    const sender = msg.key.remoteJid;
    
    if (sender && sender.endsWith("@g.us")) {
      console.log("🚫 Ignored group message from:", sender);
      return;
    }

    const messageContent =
      msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!messageContent) return;
    if (msg.key.fromMe) return;

    const textRaw = String(messageContent);
    const normalizedText = textRaw.trim();
    const text = normalizedText.toLowerCase();

    const handledDailyStatus = await handleDailyStatus(sock, sender, normalizedText);
    if (handledDailyStatus) return;

    const handledStatusUpdate = await handleStatusUpdate(sock, sender, normalizedText);
    if (handledStatusUpdate) return;

    const handledClear = await handleClearCommand(sock, sender, text);
    if (handledClear) return;

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
        Remarks: null,
        Status: "Initiated",
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

    const user = global.userData[sender];

    const handledFetchConfirmation = await handleFetchConfirmation(sock, sender, text, user);
    if (handledFetchConfirmation) return;

    const handledCancelChoice = await handleCancelChoice(sock, sender, text, user);
    if (handledCancelChoice) return;

    const handledUpdateConfirmation = await handleUpdateConfirmation(sock, sender, text, user);
    if (handledUpdateConfirmation) return;

    const handledDailyCmd = await handleDailyCommand(sock, sender, normalizedText, user);
    if (handledDailyCmd) return;

    const handledExpenseDelete = await handleExpenseDelete(sock, sender, normalizedText, user);
    if (handledExpenseDelete) return;

    const handledRemarks = await handleRemarksCommand(sock, sender, normalizedText, user);
    if (handledRemarks) return;

    const handledExpenseCmd = await handleExpenseCommand(sock, sender, normalizedText, user);
    if (handledExpenseCmd) return;

    const fieldResult = await handleFieldExtraction(sock, sender, normalizedText, user);
    if (fieldResult.handled) return;

    const handledSubmit = await handleSubmit(sock, sender, text, user);
    if (handledSubmit) return;

    const handledFieldUpdate = await handleFieldUpdateConfirmation(sock, sender, text, user);
    if (handledFieldUpdate) return;

    if (!fieldResult.anyFieldFound) return;

    recalculateCashHandover(user);
    const completenessMsg = getCompletionMessage(user);
    await sendSummary(sock, sender, completenessMsg, user);
  } catch (err) {
    console.error("❌ Error in handleIncomingMessageFromDaily:", err);
  }
}
