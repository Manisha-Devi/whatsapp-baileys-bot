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
    await sock.sendMessage(sender, {
      text: `📈 *Report Commands*

*Average Reports:*
• Average Today
• Average This Week
• Average This Month
• Average This Year
• Average July
• Average July 2025
• Average 1 Sept to 15 Sept
• Average 1 Sept 2025 to 15 Sept
• Average 1 Sept 2025 to 15 Sept 2025
• Average 01/09/2025 to 15/09/2025

Year rule:
• No year = current year
• One year provided = applies to both dates
• Two years provided = uses each date's year`
    });
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

function getMonthIndex(monthToken) {
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const normalized = monthToken.toLowerCase();
  return monthNames.findIndex((month) => month.startsWith(normalized.slice(0, 3)));
}

function createReportDate(day, monthIndex, year, endOfDay = false) {
  const date = new Date(year, monthIndex, Number(day));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
}

function parseAverageDateRange(text, now = new Date()) {
  const numericMatch = text.match(
    /^average\s+(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s+to\s+(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/i
  );

  if (numericMatch) {
    const [, startDay, startMonth, startYear, endDay, endMonth, endYear] = numericMatch;
    const startDate = createReportDate(startDay, Number(startMonth) - 1, Number(startYear));
    const endDate = createReportDate(endDay, Number(endMonth) - 1, Number(endYear), true);
    if (!startDate || !endDate) return { error: "Please enter valid dates in DD/MM/YYYY format." };
    if (startDate > endDate) return { error: "Start date cannot be after the end date." };
    return { startDate, endDate };
  }

  const namedMatch = text.match(
    /^average\s+(\d{1,2})\s+([a-z]{3,9})(?:\s+(\d{4}))?\s+to\s+(\d{1,2})\s+([a-z]{3,9})(?:\s+(\d{4}))?$/i
  );
  if (!namedMatch) return null;

  const [, startDay, startMonthToken, startYearToken, endDay, endMonthToken, endYearToken] = namedMatch;
  const startMonth = getMonthIndex(startMonthToken);
  const endMonth = getMonthIndex(endMonthToken);
  if (startMonth === -1 || endMonth === -1) {
    return { error: "Please enter a valid month name, for example: *Average 1 Sept to 15 Sept*." };
  }

  const fallbackYear = now.getFullYear();
  const sharedYear = startYearToken || endYearToken || fallbackYear;
  const startYear = Number(startYearToken || sharedYear);
  const endYear = Number(endYearToken || sharedYear);
  const startDate = createReportDate(startDay, startMonth, startYear);
  const endDate = createReportDate(endDay, endMonth, endYear, true);

  if (!startDate || !endDate) {
    return { error: "Please enter valid calendar dates in the range." };
  }
  if (startDate > endDate) {
    return { error: "Start date cannot be after the end date." };
  }

  return { startDate, endDate };
}

async function handleAverageReport(sock, sender, text, state) {
  const busCode = state.selectedBus;
  let startDate = new Date(0);
  let endDate = new Date();
  let periodName = "All Time";

  const now = new Date();
  const dateRange = parseAverageDateRange(text, now);

  if (dateRange?.error) {
    await sock.sendMessage(sender, { text: `⚠️ ${dateRange.error}` });
    return;
  }

  if (dateRange) {
    startDate = dateRange.startDate;
    endDate = dateRange.endDate;
    periodName = `${format(startDate, 'd MMMM yyyy')} to ${format(endDate, 'd MMMM yyyy')}`;
  } else if (text === 'average today') {
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

  // Force DB read to get latest data from JSON files
  await dailyDb.read();
  await bookingsDb.read();

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
          
          // Employees in Daily: Include 'trip' type expenses in average calculation
          const employTotal = (record.EmployExpenses || []).reduce((sum, e) => {
            // trip type is included (operational), salary is NOT
            if (e.type === 'trip') return sum + (parseFloat(e.amount) || 0);
            return sum;
          }, 0);
          
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
  let bookingWorkingDays = 0;
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
          
          // Employees in Bookings: Only include 'trip' type expenses in profit average calculation
          const bEmployTotal = (record.EmployExpenses || []).reduce((sum, e) => {
            if (e.type === 'trip') return sum + (parseFloat(e.amount) || 0);
            return sum;
          }, 0);
          
          bookingExpenses += bDiesel + bAdda + bUnion + bExtraTotal + bEmployTotal;
          bookingCount++;
          // Add actual number of days from booking record
          bookingWorkingDays += parseInt(record.Date?.NoOfDays || 1);
        }
      } catch (e) {
        console.error("Error processing booking record:", e);
      }
    }
  }
  const bookingNet = bookingCollection - bookingExpenses;
  const bookingAvg = bookingWorkingDays > 0 ? Math.round(bookingNet / bookingWorkingDays) : 0;

  // Overall
  const totalCollection = dailyCollection + bookingCollection;
  const totalExpenses = dailyExpenses + bookingExpenses;
  const totalNet = totalCollection - totalExpenses;
  
  // Calculate actual working days for overall average
  const totalWorkingDays = dailyCount + bookingWorkingDays;
  const avgProfitPerDay = totalWorkingDays > 0 ? Math.round(totalNet / totalWorkingDays) : 0;

  const startFmt = format(startDate, 'dd/MM/yyyy');
  const endFmt = format(endDate, 'dd/MM/yyyy');

  const reportHeader = `📊 *Average Profit Report - ${periodName}*\n🚌 Bus: *${state.selectedBusInfo?.registrationNumber || busCode}*\n\n`;

  let dailySection = `📊 *Daily:* ₹${dailyCollection.toLocaleString()} (${dailyCount} entries)\n`;
  if (dailyCount > 0) {
    const dailyAvg = Math.round(dailyNet / dailyCount);
    dailySection += `💰 *Breakdown:*
📅 Period: ${startFmt} to ${endFmt}
📥 Total Collection: ₹${dailyCollection.toLocaleString()}
📤 Total Expenses: ₹${dailyExpenses.toLocaleString()}
💵 Net Profit: ₹${dailyNet.toLocaleString()}
📈 Avg/Day (Daily): ₹${dailyAvg.toLocaleString()}\n\n`;
  } else {
    dailySection += `\n`;
  }

  let bookingSection = `🚌 *Bookings:* ₹${bookingCollection.toLocaleString()} (${bookingCount} entries)\n`;
  if (bookingCount > 0) {
    bookingSection += `💰 *Breakdown:*
📅 Period: ${startFmt} to ${endFmt}
📥 Total Collection: ₹${bookingCollection.toLocaleString()}
📤 Total Expenses: ₹${bookingExpenses.toLocaleString()}
💵 Net Profit: ₹${bookingNet.toLocaleString()}
📈 Avg/Day (Booking): ₹${bookingAvg.toLocaleString()}\n\n`;
  } else {
    bookingSection += `\n`;
  }

  const overallSection = `✨ *Overall:*
📥 Total Collection: ₹${totalCollection.toLocaleString()}
📤 Total Expenses: ₹${totalExpenses.toLocaleString()}
💵 Net Profit: ₹${totalNet.toLocaleString()}
📅 Total Working Days: ${totalWorkingDays}

✨ *Overall Average Profit/Day:* ₹${avgProfitPerDay.toLocaleString()}`;

  const reportText = reportHeader + dailySection + bookingSection + overallSection;

  await sock.sendMessage(sender, { text: reportText });
}
