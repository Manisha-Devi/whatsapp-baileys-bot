/**
 * Messages Module
 * 
 * This module provides message formatting and sending utilities for daily reports.
 * It generates formatted WhatsApp messages for displaying data summaries,
 * both during data entry and after successful submission.
 * 
 * Message types:
 * - Summary: Shows current data entry progress with all fields
 * - Submitted Summary: Final confirmation after data is saved
 * 
 * @module features/daily/utils/messages
 */

import { safeSendMessage } from "./helpers.js";
import { capitalize } from "./formatters.js";

import { getMenuState } from "../../../utils/menu-state.js";

/**
 * Sends a formatted summary of the user's current data entry progress.
 * Displays all expense categories, collections, and calculated cash handover.
 * Used during the data entry process to show what's been entered so far.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} jid - Recipient's WhatsApp JID
 * @param {string} title - Additional title/message to append at the end
 * @param {Object} userData - User's session data with entered values
 * @param {string} userData.Dated - Date of the report
 * @param {Object} userData.Diesel - Diesel expense {amount, mode}
 * @param {Object} userData.Adda - Adda expense {amount, mode}
 * @param {Object} userData.Union - Union expense {amount, mode}
 * @param {Object} userData.TotalCashCollection - Cash collection {amount}
 * @param {Object} userData.Online - Online collection {amount}
 * @param {Object} userData.CashHandover - Calculated cash handover {amount}
 * @param {Array} userData.ExtraExpenses - Extra expenses array
 * @param {Array} userData.EmployExpenses - Employee expenses array
 * @param {string} userData.Remarks - Optional remarks
 * @param {boolean} userData.editingExisting - Whether editing an existing record
 * @returns {Promise<void>}
 * 
 * @example
 * await sendSummary(sock, sender, "Please confirm the data", userData);
 */
export async function sendSummary(sock, jid, title, userData = {}) {
  try {
    // Format extra expenses list with emoji indicators
    const extraList =
      userData.ExtraExpenses && userData.ExtraExpenses.length > 0
        ? userData.ExtraExpenses
            .map(
              (e) =>
                `🧾 ${capitalize(e.name)}: ₹${e.amount}${e.mode === "online" ? " 💳" : ""}`
            )
            .join("\n")
        : "";

    // Format employee expenses list - show name, role, and 💳 indicator for online
    const employList =
      userData.EmployExpenses && userData.EmployExpenses.length > 0
        ? userData.EmployExpenses
            .map(
              (e) => {
                const roleLabel = e.role ? ` (${e.role})` : "";
                return `👤 ${capitalize(e.name)}${roleLabel}: ₹${e.amount}${e.mode === "online" ? " 💳" : ""}`;
              }
            )
            .join("\n")
        : "";

    // Extract amounts, handling both object and primitive formats
    // Show "___" placeholder for missing values
    const dieselAmt = userData.Diesel?.amount || userData.Diesel || "___";
    const addaAmt = userData.Adda?.amount || userData.Adda || "___";
    const unionAmt = userData.Union?.amount || userData.Union || "___";
    const totalCashAmt = userData.TotalCashCollection?.amount || userData.TotalCashCollection || "___";
    const onlineAmt = userData.Online?.amount || userData.Online || "___";
    const cashHandoverAmt = userData.CashHandover?.amount || userData.CashHandover || "___";

    // Get bus information from menu state for display
    const menuState = getMenuState(jid);
    const regNumber = menuState?.selectedBusInfo?.registrationNumber;
    const busInfo = regNumber || userData.busCode || "";
    
    // Add labels for context (editing vs new entry)
    const editingLabel = userData.editingExisting ? " (Editing)" : "";
    const titleBus = busInfo ? ` (${busInfo})` : "";

    // Build the complete message with sections
    const msg = [
      `✅ *Daily Data Entry${titleBus}${editingLabel}*`,
      `📅 Dated: ${userData.Dated || "___"}`,
      ``,
      `💰 *Expenses (Outflow):*`,
      `⛽ Diesel: ₹${dieselAmt}${userData.Diesel?.mode === "online" ? " 💳" : ""}`,
      `🚌 Adda : ₹${addaAmt}${userData.Adda?.mode === "online" ? " 💳" : ""}`,
      `🤝 Union Fees: ₹${unionAmt}${userData.Union?.mode === "online" ? " 💳" : ""}`,
      extraList ? `${extraList}` : "",
      ``,
      ...(employList ? [`👥 *Employ (Outflow):*`, employList, ``] : []),
      `💵 *Total Collection (Inflow):*`,
      `💸 Total Cash Collection: ₹${totalCashAmt}`,
      `💳 Online Collection: ₹${onlineAmt}`,
      ``,
      `✨ *Total Hand Over:*`,
      `💵 Cash Hand Over: ₹${cashHandoverAmt}`,
      ...(userData.Remarks ? [`📝 *Remarks:* ${userData.Remarks}`] : []),
      ``,
      title ? `\n${title}` : "",
    ].filter(line => line !== "").join("\n");

    await safeSendMessage(sock, jid, { text: msg });
  } catch (err) {
    console.error("❌ sendSummary error:", err);
    await safeSendMessage(sock, jid, { text: "❌ Failed to send summary. Try again." });
  }
}

/**
 * Sends a formatted summary after successful data submission.
 * Similar to sendSummary but includes confirmation message and
 * shows "0" instead of "___" for missing values since data is final.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} jid - Recipient's WhatsApp JID
 * @param {Object} userData - User's submitted data with all values
 * @returns {Promise<void>}
 * 
 * @example
 * await sendSubmittedSummary(sock, sender, submittedData);
 */
export async function sendSubmittedSummary(sock, jid, userData = {}) {
  try {
    // Format extra expenses list
    const extraList =
      userData.ExtraExpenses && userData.ExtraExpenses.length > 0
        ? userData.ExtraExpenses
            .map(
              (e) =>
                `🧾 ${capitalize(e.name)}: ₹${e.amount}${e.mode === "online" ? " 💳" : ""}`
            )
            .join("\n")
        : "";

    // Format employee expenses list - show name, role, and 💳 indicator for online
    const employList =
      userData.EmployExpenses && userData.EmployExpenses.length > 0
        ? userData.EmployExpenses
            .map(
              (e) => {
                const roleLabel = e.role ? ` (${e.role})` : "";
                return `👤 ${capitalize(e.name)}${roleLabel}: ₹${e.amount}${e.mode === "online" ? " 💳" : ""}`;
              }
            )
            .join("\n")
        : "";

    // Extract amounts, using "0" for missing values (submitted data should be complete)
    const dieselAmt = userData.Diesel?.amount || userData.Diesel || "0";
    const addaAmt = userData.Adda?.amount || userData.Adda || "0";
    const unionAmt = userData.Union?.amount || userData.Union || "0";
    const totalCashAmt = userData.TotalCashCollection?.amount || userData.TotalCashCollection || "0";
    const onlineAmt = userData.Online?.amount || userData.Online || "0";
    const cashHandoverAmt = userData.CashHandover?.amount || userData.CashHandover || "0";

    // Get bus information for display
    const menuState = getMenuState(jid);
    const regNumber = menuState?.selectedBusInfo?.registrationNumber;
    const busInfo = regNumber || userData.busCode || "";
    
    // Add update label if this was an edit
    const updateLabel = userData.editingExisting ? " (Updated)" : "";
    const titleBus = busInfo ? ` (${busInfo})` : "";

    // Build the complete submitted summary message
    const msg = [
      `✅ *Data Submitted${titleBus}${updateLabel}*`,
      `📅 Dated: ${userData.Dated || "___"}`,
      ``,
      `💰 *Expenses (Outflow):*`,
      `⛽ Diesel: ₹${dieselAmt}${userData.Diesel?.mode === "online" ? " 💳" : ""}`,
      `🚌 Adda : ₹${addaAmt}${userData.Adda?.mode === "online" ? " 💳" : ""}`,
      `🤝 Union Fees: ₹${unionAmt}${userData.Union?.mode === "online" ? " 💳" : ""}`,
      extraList ? `${extraList}` : "",
      ``,
      ...(employList ? [`👥 *Employ (Outflow):*`, employList, ``] : []),
      `💵 *Total Collection (Inflow):*`,
      `💸 Total Cash Collection: ₹${totalCashAmt}`,
      `💳 Online Collection: ₹${onlineAmt}`,
      ``,
      `✨ *Total Hand Over:*`,
      `💵 Cash Hand Over: ₹${cashHandoverAmt}`,
      ...(userData.Remarks ? [`📝 *Remarks: ${userData.Remarks}*`] : []),
      ``,
      `✅ Data Submitted successfully!`,
    ].filter(line => line !== "").join("\n");

    await safeSendMessage(sock, jid, { text: msg });
  } catch (err) {
    console.error("❌ sendSubmittedSummary error:", err);
    await safeSendMessage(sock, jid, { text: "❌ Failed to send submitted summary." });
  }
}
