/**
 * report-handler.js - Combined Reports Handler
 */

import dailyDb, { bookingsDb } from "../utils/db.js";
import { format, subDays, startOfWeek, startOfMonth, startOfYear, isWithinInterval, parse, endOfMonth } from "date-fns";

export async function handleCombinedReport(sock, sender, text, state) {
    const lowerText = text.toLowerCase().trim();
    
    if (lowerText === 'report' || lowerText === 'r') {
        return showReportSubmenu(sock, sender, state);
    }
    
    if (lowerText.startsWith('average') || lowerText.startsWith('a ')) {
        return handleAverageReport(sock, sender, text, state);
    }
    
    return false;
}

async function showReportSubmenu(sock, sender, state) {
    const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';
    const menuText = `📈 *Reports* (*${regNumber}*)

📊 Reply *Average* or *A* - for Average Reports
🔙 Reply *Exit* or *E* - to go back to Main Menu

Type your choice:`;
    return sock.sendMessage(sender, { text: menuText });
}

function parseCustomDate(dateStr) {
    try {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
            return parse(dateStr, 'dd/MM/yyyy', new Date());
        }
        const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
        if (match) {
            return parse(`${match[1]} ${match[2]} ${match[3]}`, 'd MMMM yyyy', new Date());
        }
    } catch (e) {}
    return null;
}

async function handleAverageReport(sock, sender, text, state) {
    const busCode = state.selectedBus;
    const lowerText = text.toLowerCase().trim();
    const query = lowerText.replace(/^average\s*/, '').replace(/^a\s+/, '').trim();
    
    const ranges = [];
    const now = new Date();

    if (query === 'today' || query === '') {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        ranges.push({ start, end: new Date(), name: "Today" });
    } else if (query === 'this week') {
        ranges.push({ start: startOfWeek(now, { weekStartsOn: 1 }), end: now, name: "This Week" });
    } else if (query === 'this month') {
        ranges.push({ start: startOfMonth(now), end: now, name: "This Month" });
    } else if (query === 'this year') {
        ranges.push({ start: startOfYear(now), end: now, name: "This Year" });
    } else {
        // Handle comma separated months like "Nov, Dec 2024, Jan"
        const parts = query.split(',').map(p => p.trim());
        for (const part of parts) {
            // Match "Nov 2024" or just "Nov"
            const match = part.match(/^(\w+)(?:\s+(\d{4}))?$/);
            if (match) {
                const monthStr = match[1];
                const yearStr = match[2] || now.getFullYear().toString();
                try {
                    const start = parse(`${monthStr} ${yearStr}`, 'MMM yyyy', new Date());
                    if (!isNaN(start.getTime())) {
                        ranges.push({ 
                            start, 
                            end: endOfMonth(start), 
                            name: format(start, 'MMM yyyy') 
                        });
                    } else {
                        // Try full month name
                        const startFull = parse(`${monthStr} ${yearStr}`, 'MMMM yyyy', new Date());
                        if (!isNaN(startFull.getTime())) {
                            ranges.push({ 
                                start: startFull, 
                                end: endOfMonth(startFull), 
                                name: format(startFull, 'MMM yyyy') 
                            });
                        }
                    }
                } catch (e) {}
            }
        }
    }

    if (ranges.length === 0) {
        return sock.sendMessage(sender, { text: "⚠️ Invalid average command. Example: *Average Nov, Dec 2024*" });
    }

    let dailyTotal = 0, dailyCount = 0;
    let bookingTotal = 0, bookingCount = 0;

    const checkInterval = (date) => {
        return ranges.some(range => isWithinInterval(date, { start: range.start, end: range.end }));
    };

    // Daily Data
    for (const [key, record] of Object.entries(dailyDb.data || {})) {
        if (key.startsWith(busCode + "_")) {
            const dateStr = key.split('_')[1];
            try {
                const recordDate = parse(dateStr, 'dd/MM/yyyy', new Date());
                if (checkInterval(recordDate)) {
                    dailyTotal += (record.TotalCashCollection || 0) + (record.Online || 0);
                    dailyCount++;
                }
            } catch(e) {}
        }
    }

    // Booking Data
    for (const record of Object.values(bookingsDb.data || {})) {
        if (record.BusCode === busCode) {
            const recordDate = parseCustomDate(record.Date?.Start);
            if (recordDate && checkInterval(recordDate)) {
                bookingTotal += record.TotalFare?.Amount || 0;
                bookingCount++;
            }
        }
    }

    const totalCollection = dailyTotal + bookingTotal;
    const totalCount = dailyCount + bookingCount;
    const combinedAvg = totalCount > 0 ? (totalCollection / totalCount).toFixed(0) : 0;
    
    const periodName = ranges.map(r => r.name).join(", ");
    const reportText = `📈 *Average Report: ${periodName}*
🚌 Bus: *${state.selectedBusInfo?.registrationNumber || busCode}*

📊 *Daily Operations:*
• Total: ₹${dailyTotal.toLocaleString('en-IN')} (${dailyCount} entries)

🚌 *Bookings:*
• Total: ₹${bookingTotal.toLocaleString('en-IN')} (${bookingCount} entries)

⭐ *Combined Average:*
• Total: ₹${totalCollection.toLocaleString('en-IN')} (${totalCount} entries)
• *Overall Avg: ₹${parseInt(combinedAvg).toLocaleString('en-IN')}*`;

    return sock.sendMessage(sender, { text: reportText });
}
