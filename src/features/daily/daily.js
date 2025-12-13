import { handleDailyStatus, handleStatusUpdate } from "./daily_status.js";
import { safeSendMessage } from "./utils/helpers.js";
import { handleClearCommand, handleDailyCommand, handleReportsCommand } from "./handlers/command-handler.js";
import { handleExpenseCommand, handleExpenseDelete, handleEmployeeExpenseCommand } from "./handlers/expense-handler.js";
import { handleFetchConfirmation, handleCancelChoice } from "./handlers/fetch-handler.js";
import { handleSubmit, handleUpdateConfirmation } from "./handlers/submit-handler.js";
import { handleFieldExtraction, handleFieldUpdateConfirmation, handleRemarksCommand } from "./handlers/field-handler.js";
import { recalculateCashHandover, getCompletionMessage } from "./utils/calculations.js";
import { sendSummary } from "./utils/messages.js";
import { getMenuState, getSelectedBus } from "../../utils/menu-state.js";

export async function handleIncomingMessageFromDaily(sock, msg, skipPrefixStripping = false) {
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
    let normalizedText = textRaw.trim();
    let text = normalizedText.toLowerCase();
    
    if (!skipPrefixStripping) {
      const dailyPrefixMatch = normalizedText.match(/^daily[\s\-:]*/i);
      if (dailyPrefixMatch) {
        const prefixLength = dailyPrefixMatch[0].length;
        normalizedText = normalizedText.substring(prefixLength).trim();
        text = text.substring(prefixLength).trim();
      }
    }

    const menuState = getMenuState(sender);
    const selectedBus = menuState.selectedBus;

    if (!selectedBus) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ No bus selected. Please type *Entry* to select a bus first.",
      });
      return;
    }
    
    if (text === 'help' || text === '') {
      if (skipPrefixStripping) {
        await safeSendMessage(sock, sender, {
          text: `📊 *DAILY COMMANDS (Menu Mode)*\n🚌 Bus: *${selectedBus}*\n\n` +
                `📝 *Data Entry:*\n` +
                `Dated 15/11/2025\n` +
                `Diesel 5000\n` +
                `Adda 200\n` +
                `Union 150\n` +
                `Total Cash Collection 25000\n` +
                `Online 3000\n` +
                `Remarks All ok\n` +
                `Submit\n\n` +
                `👥 *Employee (Manual):*\n` +
                `• driver 250\n` +
                `• conductor 150\n` +
                `• driver 200 online\n\n` +
                `📋 *Status Commands:*\n` +
                `• status initiated\n` +
                `• status collected\n` +
                `• update status 15/11/2025 collected\n\n` +
                `🔍 *Fetch Records:*\n` +
                `• today\n` +
                `• yesterday\n` +
                `• [DD/MM/YYYY]\n\n` +
                `📊 *Average Reports:*\n` +
                `• average today\n` +
                `• average this week\n` +
                `• average this month\n` +
                `• average this year\n` +
                `• average [MonthName]\n` +
                `• average [MonthName] [Year]\n\n` +
                `⚙️ *Other:*\n` +
                `• clear - clear session\n` +
                `• exit - back to menu\n\n` +
                `No "daily" prefix needed in menu mode!`
        });
      } else {
        await safeSendMessage(sock, sender, {
          text: `📊 *DAILY FEATURE COMMANDS*\n🚌 Bus: *${selectedBus}*\n\n` +
                `1️⃣ *Submit Daily Report*\n` +
                `daily\n` +
                `Dated 15/11/2025\n` +
                `Diesel 5000\n` +
                `Adda 200\n` +
                `Union 150\n` +
                `Total Cash Collection 25000\n` +
                `Online 3000\n` +
                `Remarks All ok\n` +
                `Submit\n\n` +
                `2️⃣ *Fetch Records*\n` +
                `• daily today\n` +
                `• daily yesterday\n` +
                `• daily last [N]\n` +
                `• daily [DD/MM/YYYY]\n\n` +
                `3️⃣ *Average Reports*\n` +
                `• daily average today\n` +
                `• daily average this week\n` +
                `• daily average this month\n` +
                `• daily average this year\n` +
                `• daily average [MonthName]\n` +
                `• daily average [MonthName] [Year]\n\n` +
                `4️⃣ *Check Status*\n` +
                `• daily status initiated\n` +
                `• daily status collected\n` +
                `• daily status deposited\n\n` +
                `5️⃣ *Update Status*\n` +
                `• daily update status [DD/MM/YYYY] [status]\n` +
                `• daily update status [start] to [end] [status]\n\n` +
                `6️⃣ *Employee (Manual Entry)*\n` +
                `• daily driver [amount]\n` +
                `• daily conductor [amount]\n` +
                `• daily driver [amount] online\n\n` +
                `7️⃣ *Other Commands*\n` +
                `• daily clear - clear session\n` +
                `• daily expense delete [name] - delete expense\n\n` +
                `For detailed guide, see documentation.`
        });
      }
      return;
    }

    const handledDailyStatus = await handleDailyStatus(sock, sender, normalizedText);
    if (handledDailyStatus) return;

    const handledStatusUpdate = await handleStatusUpdate(sock, sender, normalizedText);
    if (handledStatusUpdate) return;

    const handledClear = await handleClearCommand(sock, sender, text);
    if (handledClear) return;

    if (menuState.mode === 'daily' && menuState.submode === 'reports') {
      const handledReports = await handleReportsCommand(sock, sender, normalizedText, null);
      if (handledReports) return;
    }

    if (!global.userData) global.userData = {};
    if (!global.userData[sender]) {
      global.userData[sender] = {
        busCode: selectedBus,
        Dated: null,
        Diesel: null,
        Adda: null,
        Union: null,
        TotalCashCollection: null,
        Online: null,
        CashHandover: null,
        EmployExpenses: [],
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

      if (!skipPrefixStripping) {
        await safeSendMessage(sock, sender, {
          text: `👋 Welcome to Daily Reports!\n🚌 Bus: *${selectedBus}*\n\n📝 Start your message with *daily*\n\nExample:\ndaily\nDated 15/11/2025\nDiesel 5000\nAdda 200\n...\n\nType *daily help* for all commands.`,
        });
      }
    }

    const user = global.userData[sender];
    user.busCode = selectedBus;

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

    const handledEmployeeExpense = await handleEmployeeExpenseCommand(sock, sender, normalizedText, user);
    if (handledEmployeeExpense) return;

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
