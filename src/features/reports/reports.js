/**
 * reports.js - Reports Feature Entry Point
 */
import dailyDb from "../../utils/db.js";

export async function handleIncomingMessageFromReports(sock, msg) {
  const sender = msg.key.remoteJid;
  const messageContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
  if (!messageContent) return false;

  const text = messageContent.trim().toLowerCase();
  
  if (text === 'help' || text === 'h') {
    const { getMenuState } = await import("../../utils/menu-state.js");
    const state = getMenuState(sender);
    const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';
    const helpText = `📈 *Reports Help* (*${regNumber}*)

*Commands:*
• *Summary* - Lifetime collection report
• *Exit* - Back to Main Menu`;
    await sock.sendMessage(sender, { text: helpText });
    return true;
  }

  if (text === 'summary') {
    const { getMenuState } = await import("../../utils/menu-state.js");
    const state = getMenuState(sender);
    const busCode = state.selectedBus;
    
    let totalCollection = 0;
    let totalEntries = 0;

    for (const [key, record] of Object.entries(dailyDb.data || {})) {
      if (key.startsWith(busCode + "_")) {
        totalCollection += (record.TotalCashCollection || 0) + (record.Online || 0);
        totalEntries++;
      }
    }

    const reportText = `📊 *Lifetime Summary*
🚌 Bus: *${state.selectedBusInfo?.registrationNumber || busCode}*

📈 Total Collection: ₹${totalCollection}
📝 Total Entries: ${totalEntries}
✨ Average/Entry: ₹${totalEntries > 0 ? (totalCollection / totalEntries).toFixed(2) : 0}`;

    await sock.sendMessage(sender, { text: reportText });
    return true;
  }

  return false;
}
