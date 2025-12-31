/**
 * reports.js - Reports Feature Entry Point
 */
import dailyDb, { bookingsDb } from "../../utils/db.js";
import { format, subDays, startOfWeek, startOfMonth, startOfYear, isWithinInterval, parse, endOfMonth } from "date-fns";

export async function handleIncomingMessageFromReports(sock, msg) {
  const sender = msg.key.remoteJid;
  const messageContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
  if (!messageContent) return false;

  const text = messageContent.trim().toLowerCase();
  
  if (text === 'help' || text === 'h') {
    // User requested help to be empty or not open anything
    return true; 
  }

  if (text.startsWith('average')) {
    const { getMenuState } = await import("../../utils/menu-state.js");
    const state = getMenuState(sender);
    await handleAverageReport(sock, sender, text, state);
    return true;
  }

  return false;
}

async function handleAverageReport(sock, sender, text, state) {
  const busCode = state.selectedBus;
  let startDate = new Date(0);
  let endDate = new Date();
  let periodName = "All Time";

  const now = new Date();

  if (text === 'average today') {
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    periodName = "Today";
  } else if (text === 'average this week') {
    startDate = startOfWeek(now, { weekStartsOn: 1 });
    periodName = "This Week";
  } else if (text === 'average this month') {
    startDate = startOfMonth(now);
    periodName = "This Month";
  } else if (text === 'average this year') {
    startDate = startOfYear(now);
    periodName = "This Year";
  } else {
    // Handle "average nov" or "average nov 2024"
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const words = text.split(' ');
    if (words.length >= 2) {
      const monthStr = words[1].substring(0, 3);
      const monthIndex = monthNames.indexOf(monthStr);
      if (monthIndex !== -1) {
        let year = now.getFullYear();
        if (words.length >= 3 && /^\d{4}$/.test(words[2])) {
          year = parseInt(words[2]);
        }
        startDate = new Date(year, monthIndex, 1);
        endDate = endOfMonth(startDate);
        periodName = `${words[1].toUpperCase()} ${year}`;
      }
    }
  }

  // Daily Data
  let dailyTotal = 0;
  let dailyCount = 0;
  for (const [key, record] of Object.entries(dailyDb.data || {})) {
    if (key.startsWith(busCode + "_")) {
      const dateStr = key.split('_')[1];
      try {
        const recordDate = parse(dateStr, 'dd/MM/yyyy', new Date());
        if (isWithinInterval(recordDate, { start: startDate, end: endDate })) {
          dailyTotal += (record.TotalCashCollection || 0) + (record.Online || 0);
          dailyCount++;
        }
      } catch (e) {}
    }
  }

  // Booking Data
  let bookingTotal = 0;
  let bookingCount = 0;
  for (const record of Object.values(bookingsDb.data || {})) {
    if (record.BusCode === busCode && record.Date?.Start) {
      try {
        let recordDate = null;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(record.Date.Start)) {
          recordDate = parse(record.Date.Start, 'dd/MM/yyyy', new Date());
        } else {
          // Sunday, 15 March 2026
          const match = record.Date.Start.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
          if (match) {
            recordDate = parse(`${match[1]} ${match[2]} ${match[3]}`, 'd MMMM yyyy', new Date());
          }
        }
        if (recordDate && isWithinInterval(recordDate, { start: startDate, end: endDate })) {
          bookingTotal += record.TotalFare?.Amount || 0;
          bookingCount++;
        }
      } catch (e) {}
    }
  }

  const totalCollection = dailyTotal + bookingTotal;
  const totalCount = dailyCount + bookingCount;
  const combinedAvg = totalCount > 0 ? (totalCollection / totalCount).toFixed(2) : 0;

  const reportText = `📈 *Average Report: ${periodName}*
🚌 Bus: *${state.selectedBusInfo?.registrationNumber || busCode}*

📊 *Daily:* ₹${dailyTotal} (${dailyCount} entries)
🚌 *Bookings:* ₹${bookingTotal} (${bookingCount} entries)

⭐ *Total:* ₹${totalCollection}
✨ *Overall Avg: ₹${combinedAvg}*`;

  await sock.sendMessage(sender, { text: reportText });
}
