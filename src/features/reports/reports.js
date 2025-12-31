/**
 * reports.js - Reports Feature Entry Point
 */
import dailyDb, { bookingsDb } from "../../utils/db.js";
import { format, subDays, startOfWeek, startOfMonth, startOfYear, isWithinInterval, parse, endOfMonth, differenceInDays } from "date-fns";

export async function handleIncomingMessageFromReports(sock, msg) {
  const sender = msg.key.remoteJid;
  const messageContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
  if (!messageContent) return false;

  const text = messageContent.trim().toLowerCase();
  
  if (text === 'help' || text === 'h') {
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
    endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
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
  let dailyCollection = 0;
  let dailyExpenses = 0;
  let dailyCount = 0;
  for (const [key, record] of Object.entries(dailyDb.data || {})) {
    if (key.startsWith(busCode + "_")) {
      const dateStr = key.split('_')[1];
      try {
        const recordDate = parse(dateStr, 'dd/MM/yyyy', new Date());
        if (isWithinInterval(recordDate, { start: startDate, end: endDate })) {
          const cashColl = parseFloat(record.TotalCashCollection?.amount || record.TotalCashCollection) || 0;
          const onlineColl = parseFloat(record.Online?.amount || record.Online) || 0;
          dailyCollection += cashColl + onlineColl;

          const diesel = parseFloat(record.Diesel?.amount || record.Diesel) || 0;
          const adda = parseFloat(record.Adda?.amount || record.Adda) || 0;
          const union = parseFloat(record.Union?.amount || record.Union) || 0;
          const extraTotal = (record.ExtraExpenses || []).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
          const employTotal = (record.EmployExpenses || []).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
          
          dailyExpenses += diesel + adda + union + extraTotal + employTotal;
          dailyCount++;
        }
      } catch (e) {
        console.error("Error processing daily record:", e);
      }
    }
  }
  const dailyNet = dailyCollection - dailyExpenses;

  // Booking Data
  let bookingCollection = 0;
  let bookingExpenses = 0;
  let bookingCount = 0;
  for (const [key, record] of Object.entries(bookingsDb.data || {})) {
    if (key.startsWith(busCode + "_")) {
      const dateStr = key.split('_')[1];
      try {
        const recordDate = parse(dateStr, 'dd/MM/yyyy', new Date());
        if (isWithinInterval(recordDate, { start: startDate, end: endDate })) {
          bookingCollection += parseFloat(record.TotalFare?.Amount || record.TotalFare) || 0;
          
          const bDiesel = parseFloat(record.Diesel?.amount || record.Diesel) || 0;
          const bAdda = parseFloat(record.Adda?.amount || record.Adda) || 0;
          const bUnion = parseFloat(record.Union?.amount || record.Union) || 0;
          const bExtraTotal = (record.ExtraExpenses || []).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
          const bEmployTotal = (record.EmployExpenses || []).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
          
          bookingExpenses += bDiesel + bAdda + bUnion + bExtraTotal + bEmployTotal;
          bookingCount++;
        }
      } catch (e) {
        console.error("Error processing booking record:", e);
      }
    }
  }
  const bookingNet = bookingCollection - bookingExpenses;

  // Overall
  const totalCollection = dailyCollection + bookingCollection;
  const totalExpenses = dailyExpenses + bookingExpenses;
  const totalNet = totalCollection - totalExpenses;
  
  // Calculate days in period for average
  const daysInPeriod = Math.max(1, differenceInDays(endDate, startDate) + 1);
  const avgProfitPerDay = Math.round(totalNet / daysInPeriod);

  const startFmt = format(startDate, 'dd/MM/yyyy');
  const endFmt = format(endDate, 'dd/MM/yyyy');

  const reportHeader = `📊 *Average Profit Report - ${periodName}*\n🚌 Bus: *${state.selectedBusInfo?.registrationNumber || busCode}*\n\n`;

  let dailySection = `📊 *Daily:* ₹${dailyCollection.toLocaleString()} (${dailyCount} entries)\n`;
  if (dailyCount > 0) {
    dailySection += `💰 *Breakdown:*
📅 Period: ${startFmt} to ${endFmt}
📥 Total Collection: ₹${dailyCollection.toLocaleString()}
📤 Total Expenses: ₹${dailyExpenses.toLocaleString()}
💵 Net Profit: ₹${dailyNet.toLocaleString()}\n\n`;
  } else {
    dailySection += `\n`;
  }

  let bookingSection = `🚌 *Bookings:* ₹${bookingCollection.toLocaleString()} (${bookingCount} entries)\n`;
  if (bookingCount > 0) {
    bookingSection += `💰 *Breakdown:*
📅 Period: ${startFmt} to ${endFmt}
📥 Total Collection: ₹${bookingCollection.toLocaleString()}
📤 Total Expenses: ₹${bookingExpenses.toLocaleString()}
💵 Net Profit: ₹${bookingNet.toLocaleString()}\n\n`;
  } else {
    bookingSection += `\n`;
  }

  const overallSection = `✨ *Overall:*
📥 Total Collection: ₹${totalCollection.toLocaleString()}
📤 Total Expenses: ₹${totalExpenses.toLocaleString()}
💵 Net Profit: ₹${totalNet.toLocaleString()}

✨ *Average Profit/Day:* ₹${avgProfitPerDay.toLocaleString()}`;

  const reportText = reportHeader + dailySection + bookingSection + overallSection;

  await sock.sendMessage(sender, { text: reportText });
}
