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
    const totalCashAmt = userData.TotalCashCollection?.amount || userData.TotalCashCollection || "___";
    const onlineAmt = userData.Online?.amount || userData.Online || "___";
    const cashHandoverAmt = userData.CashHandover?.amount || userData.CashHandover || "___";

    const busInfo = userData.busCode ? `🚌 Bus: *${userData.busCode}*\n` : "";

    const msg = [
      `✅ *Daily Data Entry*${userData.editingExisting ? " (Editing Existing Record)" : ""}`,
      busInfo,
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
    ].filter(line => line !== "").join("\n");

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
    const totalCashAmt = userData.TotalCashCollection?.amount || userData.TotalCashCollection || "0";
    const onlineAmt = userData.Online?.amount || userData.Online || "0";
    const cashHandoverAmt = userData.CashHandover?.amount || userData.CashHandover || "0";

    const busInfo = userData.busCode ? `🚌 Bus: *${userData.busCode}*\n` : "";

    const msg = [
      `✅ *Data Submitted*${userData.editingExisting ? " (Updated Existing Record)" : ""}`,
      busInfo,
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
    ].filter(line => line !== "").join("\n");

    await safeSendMessage(sock, jid, { text: msg });
  } catch (err) {
    console.error("❌ sendSubmittedSummary error:", err);
    await safeSendMessage(sock, jid, { text: "❌ Failed to send submitted summary." });
  }
}
