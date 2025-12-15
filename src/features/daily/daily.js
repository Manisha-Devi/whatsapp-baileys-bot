/**
 * daily.js - Main Daily Report Handler
 * 
 * This is the central entry point for all daily report functionality.
 * It routes incoming WhatsApp messages to the appropriate handlers for:
 * - Daily data entry (diesel, adda, union, collections, expenses)
 * - Status management (initiated/collected/deposited)
 * - Report generation and queries
 * - Expense management
 * - Data submission and updates
 * 
 * The module uses a chain-of-responsibility pattern where each handler
 * checks if it can process the message, and if so, handles it and returns.
 */

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

/**
 * Main handler for incoming daily-related messages
 * Routes messages to appropriate sub-handlers based on content
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {Object} msg - The incoming WhatsApp message object
 * @param {boolean} skipPrefixStripping - If true, don't strip "daily" prefix (menu mode)
 */
export async function handleIncomingMessageFromDaily(sock, msg, skipPrefixStripping = false) {
  try {
    // Validate message structure
    if (!msg || !msg.key) {
      console.warn("⚠️ Received malformed or empty msg:", msg);
      return;
    }

    const sender = msg.key.remoteJid;
    
    // Ignore group messages - only process direct messages
    if (sender && sender.endsWith("@g.us")) {
      console.log("🚫 Ignored group message from:", sender);
      return;
    }

    // Extract message text content
    const messageContent =
      msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!messageContent) return;
    
    // Ignore messages sent by the bot itself
    if (msg.key.fromMe) return;

    // Normalize the input text
    const textRaw = String(messageContent);
    let normalizedText = textRaw.trim();
    let text = normalizedText.toLowerCase();
    
    // Strip "daily" prefix if present (unless in menu mode)
    // This allows commands like "daily diesel 5000" to work outside menu mode
    if (!skipPrefixStripping) {
      const dailyPrefixMatch = normalizedText.match(/^daily[\s\-:]*/i);
      if (dailyPrefixMatch) {
        const prefixLength = dailyPrefixMatch[0].length;
        normalizedText = normalizedText.substring(prefixLength).trim();
        text = text.substring(prefixLength).trim();
      }
    }

    // Get the currently selected bus from menu state
    const menuState = getMenuState(sender);
    const selectedBus = menuState.selectedBus;

    // Require a bus to be selected before processing daily commands
    if (!selectedBus) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ No bus selected. Please type *Entry* to select a bus first.",
      });
      return;
    }
    
    // Handle empty command - show help based on mode
    if (text === '') {
      if (skipPrefixStripping) {
        // Menu mode - show simplified help without "daily" prefix requirement
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
        // Direct mode - show full help with "daily" prefix requirement
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

    // Try each handler in order - first one to handle returns true
    
    // Handle status view commands (initiated/collected/deposited)
    const handledDailyStatus = await handleDailyStatus(sock, sender, normalizedText);
    if (handledDailyStatus) return;

    // Handle status update commands (update [date] collected)
    const handledStatusUpdate = await handleStatusUpdate(sock, sender, normalizedText);
    if (handledStatusUpdate) return;

    // Handle "clear" command to reset session
    const handledClear = await handleClearCommand(sock, sender, text);
    if (handledClear) return;

    // Handle report commands (today, yesterday, last N days, date range)
    const handledReports = await handleReportsCommand(sock, sender, normalizedText, null);
    if (handledReports) return;

    // Initialize user session data if not exists
    // This stores all the data being entered for a daily report
    if (!global.userData) global.userData = {};
    if (!global.userData[sender]) {
      global.userData[sender] = {
        busCode: selectedBus,          // The bus this report is for
        Dated: null,                   // Report date (DD/MM/YYYY)
        Diesel: null,                  // Diesel expense object {amount, mode}
        Adda: null,                    // Adda fee object {amount, mode}
        Union: null,                   // Union fee object {amount, mode}
        TotalCashCollection: null,     // Total cash collected
        Online: null,                  // Total online collection
        CashHandover: null,            // Calculated cash to hand over
        EmployExpenses: [],            // Array of employee expenses
        ExtraExpenses: [],             // Array of additional expenses
        Remarks: null,                 // Optional remarks/notes
        Status: "Initiated",           // Current status of the report
        waitingForUpdate: null,        // Field waiting to be updated
        waitingForSubmit: false,       // Waiting for submit confirmation
        editingExisting: false,        // Editing an existing record
        confirmingFetch: false,        // Waiting for fetch confirmation
        awaitingCancelChoice: false,   // Waiting for cancel choice
        confirmingUpdate: false,       // Waiting for update confirmation
        pendingPrimaryKey: null,       // Key for pending update
      };

      // Show welcome message only in direct mode (with daily prefix)
      if (!skipPrefixStripping) {
        await safeSendMessage(sock, sender, {
          text: `👋 Welcome to Daily Reports!\n🚌 Bus: *${selectedBus}*\n\n📝 Start your message with *daily*\n\nExample:\ndaily\nDated 15/11/2025\nDiesel 5000\nAdda 200\n...\n\nType *daily help* for all commands.`,
        });
      }
    }

    // Get the user's session data
    const user = global.userData[sender];
    user.busCode = selectedBus;  // Ensure bus code is current

    // Handle confirmation responses for various prompts
    
    // Handle "yes/no" response for fetch confirmation (load existing record)
    const handledFetchConfirmation = await handleFetchConfirmation(sock, sender, text, user);
    if (handledFetchConfirmation) return;

    // Handle "yes/no" response for cancel choice
    const handledCancelChoice = await handleCancelChoice(sock, sender, text, user);
    if (handledCancelChoice) return;

    // Handle "yes/no" response for update confirmation
    const handledUpdateConfirmation = await handleUpdateConfirmation(sock, sender, text, user);
    if (handledUpdateConfirmation) return;

    // Handle special daily commands (fetch by date, etc.)
    const handledDailyCmd = await handleDailyCommand(sock, sender, normalizedText, user);
    if (handledDailyCmd) return;

    // Handle expense deletion (expense delete [name])
    const handledExpenseDelete = await handleExpenseDelete(sock, sender, normalizedText, user);
    if (handledExpenseDelete) return;

    // Handle remarks entry (remarks [text])
    const handledRemarks = await handleRemarksCommand(sock, sender, normalizedText, user);
    if (handledRemarks) return;

    // Handle employee expense entry (driver 250, conductor 150)
    const handledEmployeeExpense = await handleEmployeeExpenseCommand(sock, sender, normalizedText, user);
    if (handledEmployeeExpense) return;

    // Handle generic expense commands (diesel, adda, union)
    const handledExpenseCmd = await handleExpenseCommand(sock, sender, normalizedText, user);
    if (handledExpenseCmd) return;

    // Handle field extraction from multi-line input
    // Extracts fields like "Dated 15/11/2025", "Diesel 5000", etc.
    const fieldResult = await handleFieldExtraction(sock, sender, normalizedText, user);
    if (fieldResult.handled) return;

    // Handle submit command
    const handledSubmit = await handleSubmit(sock, sender, text, user);
    if (handledSubmit) return;

    // Handle field update confirmation
    const handledFieldUpdate = await handleFieldUpdateConfirmation(sock, sender, text, user);
    if (handledFieldUpdate) return;

    // If no fields were found in the message, exit
    if (!fieldResult.anyFieldFound) return;

    // Fields were extracted - recalculate cash handover and show summary
    recalculateCashHandover(user);
    const completenessMsg = getCompletionMessage(user);
    await sendSummary(sock, sender, completenessMsg, user);
  } catch (err) {
    console.error("❌ Error in handleIncomingMessageFromDaily:", err);
  }
}
