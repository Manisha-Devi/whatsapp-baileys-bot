import { safeSendMessage } from "./helpers.js";
import { capitalize } from "./formatters.js";

export async function sendSummary(sock, jid, title, userData = {}) {
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
    
    // Handle both old format (string) and new format (object)
    const totalCashAmt = typeof userData.TotalCashCollection === 'object' 
      ? userData.TotalCashCollection?.amount || "___"
      : userData.TotalCashCollection || "___";
    const onlineAmt = typeof userData.Online === 'object'
      ? userData.Online?.amount || "___"
      : userData.Online || "___";
    const cashHandoverAmt = typeof userData.CashHandover === 'object'
      ? userData.CashHandover?.amount || "___"
      : userData.CashHandover || "___";

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
      `💸 Total Cash Collection: ₹${totalCashAmt}`,
      `💳 Online Collection: ₹${onlineAmt}`,
      ``,
      `✨ *Total Hand Over:*`,
      `💵 Cash Hand Over: ₹${cashHandoverAmt}`,
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

export async function sendSubmittedSummary(sock, jid, userData = {}) {
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
    
    // Handle both old format (string) and new format (object)
    const totalCashAmt = typeof userData.TotalCashCollection === 'object' 
      ? userData.TotalCashCollection?.amount || "0"
      : userData.TotalCashCollection || "0";
    const onlineAmt = typeof userData.Online === 'object'
      ? userData.Online?.amount || "0"
      : userData.Online || "0";
    const cashHandoverAmt = typeof userData.CashHandover === 'object'
      ? userData.CashHandover?.amount || "0"
      : userData.CashHandover || "0";

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
      `💸 Total Cash Collection: ₹${totalCashAmt}`,
      `💳 Online Collection: ₹${onlineAmt}`,
      ``,
      `✨ *Total Hand Over:*`,
      `💵 Cash Hand Over: ₹${cashHandoverAmt}`,
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
