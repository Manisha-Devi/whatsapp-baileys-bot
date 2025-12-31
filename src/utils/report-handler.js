/**
 * report-handler.js - Reports Handler
 */
import dailyDb, { bookingsDb } from "./db.js";
import { parse } from "date-fns";

export async function handleCombinedReport(sock, sender, text, state) {
    const lowerText = text.toLowerCase().trim();
    const busCode = state.selectedBus;

    if (lowerText === 'report' || lowerText === 'r') {
        await showReportMenu(sock, sender, state);
        return true;
    }

    if (lowerText === 'summary') {
        await handleSummaryReport(sock, sender, state);
        return true;
    }

    return false;
}

async function showReportMenu(sock, sender, state) {
    const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';
    const menuText = `📈 *Reports Menu* (*${regNumber}*)

📊 Reply *Summary* - for Lifetime Summary
🔙 Reply *Exit* - to go back

Type your choice:`;
    return sock.sendMessage(sender, { text: menuText });
}

async function handleSummaryReport(sock, sender, state) {
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

    return sock.sendMessage(sender, { text: reportText });
}
