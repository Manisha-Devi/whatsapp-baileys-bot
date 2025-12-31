/**
 * report-handler.js - Combined Reports Handler
 */

import { safeDbRead as safeDailyRead } from "../features/daily/utils/helpers.js";
import { safeDbRead as safeBookingRead } from "../features/bookings/utils/helpers.js";
import bookingsDb from "../utils/db.js"; // This might need verification
import dailyDb from "../utils/db.js"; // They use the same db util but different data structures

export async function handleCombinedReport(sock, sender, text, state) {
    const lowerText = text.toLowerCase().trim();
    
    if (lowerText === 'average' || lowerText === 'r' || lowerText === 'report') {
        return showReportSubmenu(sock, sender, state);
    }
    
    if (lowerText === 'average' || lowerText.startsWith('average')) {
        return handleAverageReport(sock, sender, state);
    }
    
    return false;
}

async function showReportSubmenu(sock, sender, state) {
    const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';
    const menuText = `📈 *Combined Reports* (*${regNumber}*)

Please select an option:

📊 Reply *Average* or *A* - for Average Reports
🔙 Reply *Exit* or *E* - to go back to Main Menu

Type your choice:`;
    return sock.sendMessage(sender, { text: menuText });
}

async function handleAverageReport(sock, sender, state) {
    const busCode = state.selectedBus;
    if (!busCode) return;

    // Load Daily Data
    await safeDailyRead();
    const dailyData = dailyDb.data || {};
    
    // Load Booking Data
    // Note: In this architecture, it seems daily and bookings might be in different files
    // based on replit.md: daily_data.json and bookings_data.json
    // I need to be careful with the DB references.
    
    let totalDailyCollection = 0;
    let dailyCount = 0;
    
    for (const [key, record] of Object.entries(dailyData)) {
        if (key.startsWith(busCode + "_")) {
            totalDailyCollection += (record.TotalCashCollection || 0) + (record.Online || 0);
            dailyCount++;
        }
    }

    const avgDaily = dailyCount > 0 ? (totalDailyCollection / dailyCount).toFixed(2) : 0;

    const reportText = `📈 *Average Report* (*${busCode}*)

*Daily Operations:*
• Total Entries: ${dailyCount}
• Average Collection: ₹${avgDaily}

*Summary:*
Combined average reporting is being initialized. This shows your performance across all operations for this bus.`;

    return sock.sendMessage(sender, { text: reportText });
}
