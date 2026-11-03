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
import { sendDailyQuickReplyMessage } from "../../../utils/menu-handler.js";
import { generateWAMessageFromContent } from "@whiskeysockets/baileys";
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
                `🧾 ${capitalize(e.name)}: ₹${e.amount}${e.mode === "online" ? " (Online)" : ""}`
            )
            .join("\n")
        : "";

    // Format employee expenses list - separate dailySalary and trip types
    let dailySalaryList = "";
    let tripList = "";
    
    if (userData.EmployExpenses && userData.EmployExpenses.length > 0) {
      const dailySalaryExpenses = userData.EmployExpenses.filter(e => !e.type || e.type === "dailySalary");
      const tripExpenses = userData.EmployExpenses.filter(e => e.type === "trip");
      
      if (dailySalaryExpenses.length > 0) {
        dailySalaryList = dailySalaryExpenses
          .map(e => {
            const displayName = e.role || e.name;
            return `👤 ${capitalize(displayName)}: ₹${e.amount}${e.mode === "online" ? " (Online)" : ""}`;
          })
          .join("\n");
      }
      
      if (tripExpenses.length > 0) {
        tripList = tripExpenses
          .map(e => {
            const displayName = e.role || e.name;
            return `👤 ${capitalize(displayName)}: ₹${e.amount}${e.mode === "online" ? " (Online)" : ""}`;
          })
          .join("\n");
      }
    }
    
    // Keep employList for backward compatibility (dailySalary only)
    const employList = dailySalaryList;

    // Helper to format field with amount, mode and remarks
    const formatField = (field) => {
      if (!field) return null;
      const amt = field.amount || field;
      if (amt === undefined || amt === null || amt === "") return null;
      const mode = field.mode === "online" ? " (Online)" : "";
      const remarks = field.remarks ? ` ${field.remarks}` : "";
      return { amt, mode, remarks };
    };

    // Extract amounts, handling both object and primitive formats
    // Show "___" placeholder for missing values
    const diesel = formatField(userData.Diesel);
    const adda = formatField(userData.Adda);
    const union = formatField(userData.Union);
    const totalCash = formatField(userData.TotalCashCollection);
    const online = formatField(userData.Online);
    const cashHandover = formatField(userData.CashHandover);

    // Calculate Bachat (Profit) = Total Collection - Total Expenses
    const getNumericValue = (field) => {
      if (!field) return 0;
      const amt = field.amount || field;
      return Number(amt) || 0;
    };
    
    const totalCollection = getNumericValue(userData.TotalCashCollection) + getNumericValue(userData.Online);
    
    let totalExpenses = getNumericValue(userData.Diesel) + getNumericValue(userData.Adda) + getNumericValue(userData.Union);
    
    // Add extra expenses
    if (userData.ExtraExpenses && userData.ExtraExpenses.length > 0) {
      totalExpenses += userData.ExtraExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    }
    
    // Add employee expenses
    if (userData.EmployExpenses && userData.EmployExpenses.length > 0) {
      totalExpenses += userData.EmployExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    }
    
    const bachat = totalCollection - totalExpenses;

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
      `⛽ Diesel: ₹${diesel?.amt || "___"}${diesel?.mode || ""}${diesel?.remarks || ""}`,
      `🚌 Adda : ₹${adda?.amt || "___"}${adda?.mode || ""}${adda?.remarks || ""}`,
      `🤝 Union: ₹${union?.amt || "___"}${union?.mode || ""}${union?.remarks || ""}`,
      extraList ? `${extraList}` : "",
      ``,
      ...(dailySalaryList ? [`👥 *Employee (Daily Salary):*`, dailySalaryList, ``] : []),
      ...(tripList ? [`🚌 *Employee (Trip):*`, tripList, ``] : []),
      `💵 *Total Collection (Inflow):*`,
      `💸 Total Cash Collection: ₹${totalCash?.amt || "___"}${totalCash?.remarks || ""}`,
      `💳 Online Collection: ₹${online?.amt || "___"}${online?.remarks || ""}`,
      ``,
      `✨ *Total Hand Over:*`,
      `💵 Cash Hand Over: ₹${cashHandover?.amt || "___"}`,
      `📈 Bachat (Profit): ₹${totalCollection > 0 ? bachat.toLocaleString('en-IN') : "___"}`,
      ...(userData.Remarks ? [`📝 *Remarks:* ${userData.Remarks}`] : []),
      ``,
      title ? `\n${title}` : "",
    ].filter(line => line !== "").join("\n");

    if (/All Data Entered|Do you want to Cancel/i.test(title || "")) {
      await sendDailyQuickReplyMessage(sock, jid, msg, "Daily Entry Confirmation", [
        { display_text: "Yes", id: "yes" },
        { display_text: "No", id: "no" }
      ]);
    } else {
      // Incomplete-entry summaries remain plain text with no action buttons.
      await safeSendMessage(sock, jid, { text: msg });
    }
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
                `🧾 ${capitalize(e.name)}: ₹${e.amount}${e.mode === "online" ? " (Online)" : ""}`
            )
            .join("\n")
        : "";

    // Format employee expenses list - separate dailySalary and trip types
    let dailySalaryList = "";
    let tripList = "";
    
    if (userData.EmployExpenses && userData.EmployExpenses.length > 0) {
      const dailySalaryExpenses = userData.EmployExpenses.filter(e => !e.type || e.type === "dailySalary");
      const tripExpenses = userData.EmployExpenses.filter(e => e.type === "trip");
      
      if (dailySalaryExpenses.length > 0) {
        dailySalaryList = dailySalaryExpenses
          .map(e => {
            const displayName = e.role || e.name;
            return `👤 ${capitalize(displayName)}: ₹${e.amount}${e.mode === "online" ? " (Online)" : ""}`;
          })
          .join("\n");
      }
      
      if (tripExpenses.length > 0) {
        tripList = tripExpenses
          .map(e => {
            const displayName = e.role || e.name;
            return `👤 ${capitalize(displayName)}: ₹${e.amount}${e.mode === "online" ? " (Online)" : ""}`;
          })
          .join("\n");
      }
    }

    // Helper to format field with amount, mode and remarks
    const formatField = (field, defaultVal = "0") => {
      if (!field) return { amt: defaultVal, mode: "", remarks: "" };
      const amt = field.amount || field || defaultVal;
      const mode = field.mode === "online" ? " (Online)" : "";
      const remarks = field.remarks ? ` ${field.remarks}` : "";
      return { amt, mode, remarks };
    };

    // Extract amounts, using "0" for missing values (submitted data should be complete)
    const diesel = formatField(userData.Diesel);
    const adda = formatField(userData.Adda);
    const union = formatField(userData.Union);
    const totalCash = formatField(userData.TotalCashCollection);
    const online = formatField(userData.Online);
    const cashHandover = formatField(userData.CashHandover);

    // Calculate Bachat (Profit) = Total Collection - Total Expenses
    const getNumericValue = (field) => {
      if (!field) return 0;
      const amt = field.amount || field;
      return Number(amt) || 0;
    };
    
    const totalCollection = getNumericValue(userData.TotalCashCollection) + getNumericValue(userData.Online);
    
    let totalExpenses = getNumericValue(userData.Diesel) + getNumericValue(userData.Adda) + getNumericValue(userData.Union);
    
    // Add extra expenses
    if (userData.ExtraExpenses && userData.ExtraExpenses.length > 0) {
      totalExpenses += userData.ExtraExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    }
    
    // Add employee expenses
    if (userData.EmployExpenses && userData.EmployExpenses.length > 0) {
      totalExpenses += userData.EmployExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    }
    
    const bachat = totalCollection - totalExpenses;

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
      `⛽ Diesel: ₹${diesel.amt}${diesel.mode}${diesel.remarks}`,
      `🚌 Adda : ₹${adda.amt}${adda.mode}${adda.remarks}`,
      `🤝 Union: ₹${union.amt}${union.mode}${union.remarks}`,
      extraList ? `${extraList}` : "",
      ``,
      ...(dailySalaryList ? [`👥 *Employee (Daily Salary):*`, dailySalaryList, ``] : []),
      ...(tripList ? [`🚌 *Employee (Trip):*`, tripList, ``] : []),
      `💵 *Total Collection (Inflow):*`,
      `💸 Total Cash Collection: ₹${totalCash.amt}${totalCash.remarks}`,
      `💳 Online Collection: ₹${online.amt}${online.remarks}`,
      ``,
      `✨ *Total Hand Over:*`,
      `💵 Cash Hand Over: ₹${cashHandover.amt}`,
      `📈 Bachat (Profit): ₹${bachat.toLocaleString('en-IN')}`,
      ...(userData.Remarks ? [`📝 *Remarks: ${userData.Remarks}*`] : []),
      ``,
      `✅ Data Submitted successfully!`,
    ].filter(line => line !== "").join("\n");

    await sendDailyQuickReplyMessage(sock, jid, msg, "Daily Data Submitted", [
      { display_text: "New Entry", id: "daily:new_entry" },
      { display_text: "Menu", id: "daily:quick_menu" },
      { display_text: "Exit", id: "daily:quick_exit" }
    ]);
  } catch (err) {
    console.error("❌ sendSubmittedSummary error:", err);
    await safeSendMessage(sock, jid, { text: "❌ Failed to send submitted summary." });
  }
}
