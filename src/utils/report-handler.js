/**
 * report-handler.js - Combined Reports Handler
 */

import dailyDb, { bookingsDb } from "../utils/db.js";
import { format, subDays, startOfWeek, startOfMonth, startOfYear, isWithinInterval, parse } from "date-fns";

export async function handleCombinedReport(sock, sender, text, state) {
    const lowerText = text.toLowerCase().trim();
    
    if (lowerText === 'report' || lowerText === 'r') {
        return showReportSubmenu(sock, sender, state);
    }
    
    if (lowerText === 'help' || lowerText === 'h') {
        return showReportHelp(sock, sender, state);
    }
    
    if (lowerText.startsWith('average')) {
        return handleAverageReport(sock, sender, text, state);
    }
    
    return false;
}

async function showReportHelp(sock, sender, state) {
    const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';
    const helpText = `📈 *Reports Help* (*${regNumber}*)

*Average Report Commands:*

• *Average Today* - Aaj ka average
• *Average This Week* - Is hafte ka average
• *Average This Month* - Is mahine ka average
• *Average This Year* - Is saal ka average
• *Average Nov 2025* - Specific month ka average

Type your command now!`;
    return sock.sendMessage(sender, { text: helpText });
}

async function showReportSubmenu(sock, sender, state) {
    const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';
    const menuText = `📈 *Reports* (*${regNumber}*)

Enter Command or Select Option:

❓ Reply *Help* or *H* - for Help with Commands
🔙 Reply *Exit* or *E* - to go back to Main Menu

Type your choice:`;
    return sock.sendMessage(sender, { text: menuText });
}

function parseCustomDate(dateStr) {
    try {
        // DD/MM/YYYY
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
            return parse(dateStr, 'dd/MM/yyyy', new Date());
        }
        // Sunday, 15 March 2026
        const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
        if (match) {
            const date = parse(`${match[1]} ${match[2]} ${match[3]}`, 'd MMMM yyyy', new Date());
            return date;
        }
    } catch (e) {}
    return null;
}

async function handleAverageReport(sock, sender, text, state) {
    const busCode = state.selectedBus;
    const lowerText = text.toLowerCase().trim();
    
    let startDate = new Date(0);
    let endDate = new Date();
    let periodName = "All Time";

    if (lowerText === 'average today' || lowerText === 'a today') {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        periodName = "Today";
    } else if (lowerText === 'average this week') {
        startDate = startOfWeek(new Date(), { weekStartsOn: 1 });
        periodName = "This Week";
    } else if (lowerText === 'average this month') {
        startDate = startOfMonth(new Date());
        periodName = "This Month";
    } else if (lowerText === 'average this year') {
        startDate = startOfYear(new Date());
        periodName = "This Year";
    } else {
        // Handle "Average Nov 2025" or similar
        const monthMatch = lowerText.match(/average\s+(\w+)\s+(\d{4})/);
        if (monthMatch) {
            const monthStr = monthMatch[1];
            const yearStr = monthMatch[2];
            try {
                startDate = parse(`${monthStr} ${yearStr}`, 'MMMM yyyy', new Date());
                endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59);
                periodName = `${monthStr} ${yearStr}`;
            } catch (e) {}
        }
    }

    // Daily Data
    let dailyTotal = 0;
    let dailyCount = 0;
    for (const [key, record] of Object.entries(dailyDb.data || {})) {
        if (key.startsWith(busCode + "_")) {
            const dateStr = key.split('_')[1];
            const recordDate = parse(dateStr, 'dd/MM/yyyy', new Date());
            if (isWithinInterval(recordDate, { start: startDate, end: endDate })) {
                dailyTotal += (record.TotalCashCollection || 0) + (record.Online || 0);
                dailyCount++;
            }
        }
    }

    // Booking Data
    let bookingTotal = 0;
    let bookingCount = 0;
    for (const record of Object.values(bookingsDb.data || {})) {
        if (record.BusCode === busCode) {
            const recordDate = parseCustomDate(record.Date?.Start);
            if (recordDate && isWithinInterval(recordDate, { start: startDate, end: endDate })) {
                bookingTotal += record.TotalFare?.Amount || 0;
                bookingCount++;
            }
        }
    }

    const totalCollection = dailyTotal + bookingTotal;
    const totalCount = dailyCount + bookingCount;
    const combinedAvg = totalCount > 0 ? (totalCollection / totalCount).toFixed(2) : 0;
    const dailyAvg = dailyCount > 0 ? (dailyTotal / dailyCount).toFixed(2) : 0;
    const bookingAvg = bookingCount > 0 ? (bookingTotal / bookingCount).toFixed(2) : 0;

    const reportText = `📈 *Average Report: ${periodName}*
🚌 Bus: *${state.selectedBusInfo?.registrationNumber || busCode}*

📊 *Daily Operations:*
• Total: ₹${dailyTotal} (${dailyCount} entries)
• Avg: ₹${dailyAvg}

🚌 *Bookings:*
• Total: ₹${bookingTotal} (${bookingCount} entries)
• Avg: ₹${bookingAvg}

⭐ *Combined Average:*
• Total: ₹${totalCollection} (${totalCount} entries)
• *Overall Avg: ₹${combinedAvg}*`;

    return sock.sendMessage(sender, { text: reportText });
}
