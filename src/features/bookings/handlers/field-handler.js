/**
 * Booking Field Handler Module
 * 
 * This module handles the extraction of booking field values from user messages.
 * It parses various field patterns and populates the user's booking session data.
 * 
 * Supported fields:
 * - Name: Customer name
 * - Mobile: 10-digit phone number
 * - Pickup: Starting point of the journey
 * - Drop: Destination of the journey
 * - Date: Single date or date range (DD/MM/YYYY or DD/MM/YYYY to DD/MM/YYYY)
 * - Bus: Bus code from buses.json (auto-fills bus details)
 * - Total Fare: Total booking amount
 * - Advance: Advance payment received
 * - Remarks: Additional notes or requirements
 * 
 * @module features/bookings/handlers/field-handler
 */

import { safeSendMessage, safeDbRead } from "../utils/helpers.js";
import { bookingsDb } from "../../../utils/db.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load buses data from buses.json
 */
function loadBusesData() {
  try {
    const busesPath = join(__dirname, "../../..", "data", "buses.json");
    const data = JSON.parse(readFileSync(busesPath, "utf-8"));
    return data.buses || [];
  } catch (err) {
    console.error("❌ Error loading buses.json:", err);
    return [];
  }
}

/**
 * Extracts booking field values from user's message text.
 * Parses the message for recognized field patterns and updates
 * the user's booking session with extracted values.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} normalizedText - Normalized user input text
 * @param {Object} user - User's booking session data object
 * @returns {Promise<{handled: boolean, anyFieldFound: boolean}>} 
 *          - handled: True if message was fully handled (shouldn't continue)
 *          - anyFieldFound: True if any booking field was found in the message
 */
export async function handleFieldExtraction(sock, sender, normalizedText, user) {
  let anyFieldFound = false;

  // Extract Name: "name [name]"
  const nameMatch = normalizedText.match(/^name\s+(.+)$/i);
  if (nameMatch) {
    user.CustomerName = nameMatch[1].trim();
    anyFieldFound = true;
  }

  // Extract Mobile: "mobile [10-digit number]"
  const mobileMatch = normalizedText.match(/^mobile\s+(\d{10})$/i);
  if (mobileMatch) {
    user.CustomerPhone = mobileMatch[1];
    anyFieldFound = true;
  }

  // Extract Pickup: "pickup [location]"
  const pickupMatch = normalizedText.match(/^pickup\s+(.+)$/i);
  if (pickupMatch) {
    user.PickupLocation = pickupMatch[1].trim();
    anyFieldFound = true;
  }

  // Extract Drop: "drop [location]"
  const dropMatch = normalizedText.match(/^drop\s+(.+)$/i);
  if (dropMatch) {
    user.DropLocation = dropMatch[1].trim();
    anyFieldFound = true;
  }

  // Extract Date: "date DD/MM/YYYY" or "date DD/MM/YYYY to DD/MM/YYYY"
  const dateRangeMatch = normalizedText.match(/^date\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+to\s+(\d{1,2}\/\d{1,2}\/\d{4})$/i);
  const singleDateMatch = normalizedText.match(/^date\s+(\d{1,2}\/\d{1,2}\/\d{4})$/i);
  
  if (dateRangeMatch || singleDateMatch) {
    const startDate = dateRangeMatch ? dateRangeMatch[1] : singleDateMatch[1];
    const endDate = dateRangeMatch ? dateRangeMatch[2] : singleDateMatch[1];
    
    // Normalize date to DD/MM/YYYY format
    const normalizeDateStr = (dateStr) => {
      const [d, m, y] = dateStr.split('/');
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    };
    const normalizedStartDate = normalizeDateStr(startDate);
    const normalizedEndDate = normalizeDateStr(endDate);
    
    // Helper to parse DD/MM/YYYY to Date object
    const parseDate = (dateStr) => {
      const [d, m, y] = dateStr.split('/').map(Number);
      return new Date(y, m - 1, d);
    };
    
    // Helper to check if a date falls within a range
    const isDateInRange = (checkDate, rangeStart, rangeEnd) => {
      const check = parseDate(checkDate);
      const start = parseDate(rangeStart);
      const end = parseDate(rangeEnd);
      return check >= start && check <= end;
    };
    
    // Helper to check if two date ranges overlap
    const doRangesOverlap = (start1, end1, start2, end2) => {
      const s1 = parseDate(start1), e1 = parseDate(end1);
      const s2 = parseDate(start2), e2 = parseDate(end2);
      return s1 <= e2 && e1 >= s2;
    };
    
    // Generate booking ID to check if booking exists
    const busCode = user.BusCode;
    if (!busCode) {
      // No bus selected yet, just save date for now
      user.TravelDateFrom = normalizedStartDate;
      user.TravelDateTo = normalizedEndDate;
      anyFieldFound = true;
    } else {
      await safeDbRead(bookingsDb);
      
      // Search all bookings for this bus to find date overlap
      let foundBooking = null;
      let foundBookingId = null;
      
      for (const [bookingId, booking] of Object.entries(bookingsDb.data || {})) {
        // Check if booking is for this bus
        if (booking.BusCode !== busCode) continue;
        
        // Parse booking dates (handle both old DD/MM/YYYY and new "Day, DD Month YYYY" formats)
        let bookingStart, bookingEnd;
        
        // Try to extract dates from booking
        if (booking.Date?.Start) {
          // Check if it's in new format "Sunday, 15 March 2026"
          const newFormatMatch = booking.Date.Start.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
          if (newFormatMatch) {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            const day = newFormatMatch[1].padStart(2, '0');
            const month = String(monthNames.indexOf(newFormatMatch[2]) + 1).padStart(2, '0');
            const year = newFormatMatch[3];
            bookingStart = `${day}/${month}/${year}`;
          } else {
            // Old format DD/MM/YYYY
            bookingStart = booking.Date.Start;
          }
        }
        
        if (booking.Date?.End) {
          const newFormatMatch = booking.Date.End.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
          if (newFormatMatch) {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            const day = newFormatMatch[1].padStart(2, '0');
            const month = String(monthNames.indexOf(newFormatMatch[2]) + 1).padStart(2, '0');
            const year = newFormatMatch[3];
            bookingEnd = `${day}/${month}/${year}`;
          } else {
            bookingEnd = booking.Date.End;
          }
        }
        
        if (!bookingStart) continue;
        bookingEnd = bookingEnd || bookingStart;
        
        // Check if entered date(s) overlap with this booking's range
        if (doRangesOverlap(normalizedStartDate, normalizedEndDate, bookingStart, bookingEnd)) {
          foundBooking = booking;
          foundBookingId = bookingId;
          break;
        }
      }
      
      if (foundBooking) {
        // Booking exists - ask for confirmation to fetch
        user.confirmingFetch = true;
        user.pendingBookingId = foundBookingId;
        user.pendingStartDate = normalizedStartDate;
        user.pendingEndDate = normalizedEndDate;
        
        // Format date display
        const formatDisplay = foundBooking.Date?.Start === foundBooking.Date?.End 
          ? foundBooking.Date?.Start 
          : `${foundBooking.Date?.Start} to ${foundBooking.Date?.End}`;
        
        await safeSendMessage(sock, sender, {
          text: `⚠️ Booking for *${busCode}* found!\n\n` +
                `📅 Date: ${formatDisplay}\n` +
                `👤 Customer: ${foundBooking.CustomerName}\n` +
                `📱 Phone: ${foundBooking.CustomerPhone}\n` +
                `📊 Status: ${foundBooking.Status}\n\n` +
                `Do you want to open this booking for updates? (*Yes* or *No*)`
        });
        return { handled: true, anyFieldFound: true };
      } else {
        // No existing booking - proceed with new entry
        user.TravelDateFrom = normalizedStartDate;
        user.TravelDateTo = normalizedEndDate;
        anyFieldFound = true;
      }
    }
  }

  // Extract Bus: "bus [busCode]"
  const busMatch = normalizedText.match(/^bus\s+(.+)$/i);
  if (busMatch) {
    const busCode = busMatch[1].trim().toUpperCase();
    const buses = loadBusesData();
    const bus = buses.find(b => b.busCode.toUpperCase() === busCode);
    
    if (bus) {
      if (bus.status !== "Active") {
        await safeSendMessage(sock, sender, {
          text: `⚠️ Bus ${busCode} is not active. Please select an active bus.`
        });
        return { handled: true, anyFieldFound: false };
      }
      
      user.BusCode = bus.busCode;
      user.RegistrationNumber = bus.registrationNumber;
      user.BusType = bus.type;
      user.Capacity = bus.capacity;
      anyFieldFound = true;
    } else {
      const activeBuses = buses.filter(b => b.status === "Active");
      let busListMsg = `❌ Bus "${busCode}" not found.\n\n📋 *Available Buses:*\n`;
      activeBuses.forEach(b => {
        busListMsg += `• *${b.busCode}* - ${b.registrationNumber} (${b.type})\n`;
      });
      await safeSendMessage(sock, sender, { text: busListMsg });
      return { handled: true, anyFieldFound: false };
    }
  }

  // Extract Fare: "fare [amount]"
  const fareMatch = normalizedText.match(/^fare\s+(\d+)$/i);
  if (fareMatch) {
    const amount = parseInt(fareMatch[1]);
    user.TotalFare = amount;
    if (user.AdvancePaid) {
      const advAmt = typeof user.AdvancePaid === 'object' ? user.AdvancePaid.amount : user.AdvancePaid;
      user.BalanceAmount = amount - advAmt;
    }
    anyFieldFound = true;
  }

  // Extract Advance: "advance [amount] [optional: online]"
  const advanceMatch = normalizedText.match(/^advance\s+(\d+)(?:\s+(online))?$/i);
  if (advanceMatch) {
    const amount = parseInt(advanceMatch[1]);
    const mode = advanceMatch[2]?.toLowerCase() === "online" ? "online" : "cash";
    user.AdvancePaid = { amount, mode };
    if (user.TotalFare) {
      const fareAmt = typeof user.TotalFare === 'object' ? user.TotalFare.amount : user.TotalFare;
      user.BalanceAmount = fareAmt - amount;
    }
    anyFieldFound = true;
  }

  // Extract Balance: "balance [amount]" - For Post-Booking phase
  // Updates balance and recalculates TotalFare = Advance + NewBalance
  if (user.editingExisting) {
    const balanceMatch = normalizedText.match(/^balance\s+(\d+)$/i);
    if (balanceMatch) {
      const newBalance = parseInt(balanceMatch[1]);
      user.BalanceAmount = newBalance;
      // Recalculate TotalFare based on new balance
      if (user.AdvancePaid !== undefined) {
        user.TotalFare = user.AdvancePaid + newBalance;
      }
      anyFieldFound = true;
    }
  }

  // Extract Remarks: "remarks [text]"
  const remarksMatch = normalizedText.match(/^remarks\s+(.+)$/i);
  if (remarksMatch) {
    user.Remarks = remarksMatch[1].trim();
    anyFieldFound = true;
  }

  // Post-Booking expense fields (only when editing existing booking)
  if (user.editingExisting) {
    // Extract Diesel: "diesel [amount] [optional: online]"
    const dieselMatch = normalizedText.match(/^diesel\s+(\d+)(?:\s+(online))?$/i);
    if (dieselMatch) {
      const amount = parseInt(dieselMatch[1]);
      const mode = dieselMatch[2]?.toLowerCase() === "online" ? "online" : "cash";
      user.Diesel = { amount, mode };
      anyFieldFound = true;
    }

  // Extract Adda: "adda [amount] [optional: online]"
  const addaMatch = normalizedText.match(/^adda\s+(\d+)(?:\s+(online))?$/i);
  if (addaMatch) {
    const amount = parseInt(addaMatch[1]);
    const mode = addaMatch[2]?.toLowerCase() === "online" ? "online" : "cash";
    user.Adda = { amount, mode };
    anyFieldFound = true;
  }

  // Extract Union: "union [amount] [optional: online]"
  const unionMatch = normalizedText.match(/^union\s+(\d+)(?:\s+(online))?$/i);
  if (unionMatch) {
    const amount = parseInt(unionMatch[1]);
    const mode = unionMatch[2]?.toLowerCase() === "online" ? "online" : "cash";
    user.Union = { amount, mode };
    anyFieldFound = true;
  }

    // Extract Extra Expense: "expense [name] [amount] [optional: online]"
    const expenseMatch = normalizedText.match(/^expense\s+(\w+)\s+(\d+)(?:\s+(online))?$/i);
    if (expenseMatch) {
      const name = expenseMatch[1].trim();
      const amount = parseInt(expenseMatch[2]);
      const mode = expenseMatch[3]?.toLowerCase() === "online" ? "online" : "cash";
      if (!user.ExtraExpenses) user.ExtraExpenses = [];
      const existingIndex = user.ExtraExpenses.findIndex(e => e.name.toLowerCase() === name.toLowerCase());
      if (existingIndex !== -1) {
        user.ExtraExpenses[existingIndex].amount = amount;
        user.ExtraExpenses[existingIndex].mode = mode;
      } else {
        user.ExtraExpenses.push({ name, amount, mode });
      }
      anyFieldFound = true;
    }

    // Extract Driver expense (dailySalary): "driver [amount] [optional: online]"
    const driverMatch = normalizedText.match(/^driver\s+(\d+)(?:\s+(online))?$/i);
    if (driverMatch) {
      const amount = parseInt(driverMatch[1]);
      const mode = driverMatch[2]?.toLowerCase() === "online" ? "online" : "cash";
      if (!user.EmployExpenses) user.EmployExpenses = [];
      const existingIndex = user.EmployExpenses.findIndex(e => (e.role || e.name)?.toLowerCase() === "driver" && e.type === "dailySalary" && e.mode === mode);
      if (existingIndex !== -1) {
        user.EmployExpenses[existingIndex].amount = amount;
      } else {
        const existingDriver = user.EmployExpenses.find(e => (e.role || e.name)?.toLowerCase() === "driver");
        const driverName = existingDriver?.name || "Driver";
        user.EmployExpenses.push({ name: driverName, role: "Driver", type: "dailySalary", amount, mode });
      }
      // Auto-update status to Completed when salary is entered
      user.Status = "Completed";
      anyFieldFound = true;
    }

    // Extract Conductor expense (dailySalary): "conductor [amount] [optional: online]"
    const conductorMatch = normalizedText.match(/^conductor\s+(\d+)(?:\s+(online))?$/i);
    if (conductorMatch) {
      const amount = parseInt(conductorMatch[1]);
      const mode = conductorMatch[2]?.toLowerCase() === "online" ? "online" : "cash";
      if (!user.EmployExpenses) user.EmployExpenses = [];
      const existingIndex = user.EmployExpenses.findIndex(e => (e.role || e.name)?.toLowerCase() === "conductor" && e.type === "dailySalary" && e.mode === mode);
      if (existingIndex !== -1) {
        user.EmployExpenses[existingIndex].amount = amount;
      } else {
        const existingConductor = user.EmployExpenses.find(e => (e.role || e.name)?.toLowerCase() === "conductor");
        const conductorName = existingConductor?.name || "Conductor";
        user.EmployExpenses.push({ name: conductorName, role: "Conductor", type: "dailySalary", amount, mode });
      }
      // Auto-update status to Completed when salary is entered
      user.Status = "Completed";
      anyFieldFound = true;
    }

    // Extract Trip Driver expense: "trip driver [amount] [optional: online]"
    const tripDriverMatch = normalizedText.match(/^trip\s+driver\s+(\d+)(?:\s+(online))?$/i);
    if (tripDriverMatch) {
      const amount = parseInt(tripDriverMatch[1]);
      const mode = tripDriverMatch[2]?.toLowerCase() === "online" ? "online" : "cash";
      if (!user.EmployExpenses) user.EmployExpenses = [];
      const existingIndex = user.EmployExpenses.findIndex(e => (e.role || e.name)?.toLowerCase() === "driver" && e.type === "trip" && e.mode === mode);
      if (existingIndex !== -1) {
        user.EmployExpenses[existingIndex].amount = amount;
      } else {
        const existingDriver = user.EmployExpenses.find(e => (e.role || e.name)?.toLowerCase() === "driver");
        const driverName = existingDriver?.name || "Driver";
        user.EmployExpenses.push({ name: driverName, role: "Driver", type: "trip", amount, mode });
      }
      user.Status = "Completed";
      anyFieldFound = true;
    }

    // Extract Trip Conductor expense: "trip conductor [amount] [optional: online]"
    const tripConductorMatch = normalizedText.match(/^trip\s+conductor\s+(\d+)(?:\s+(online))?$/i);
    if (tripConductorMatch) {
      const amount = parseInt(tripConductorMatch[1]);
      const mode = tripConductorMatch[2]?.toLowerCase() === "online" ? "online" : "cash";
      if (!user.EmployExpenses) user.EmployExpenses = [];
      const existingIndex = user.EmployExpenses.findIndex(e => (e.role || e.name)?.toLowerCase() === "conductor" && e.type === "trip" && e.mode === mode);
      if (existingIndex !== -1) {
        user.EmployExpenses[existingIndex].amount = amount;
      } else {
        const existingConductor = user.EmployExpenses.find(e => (e.role || e.name)?.toLowerCase() === "conductor");
        const conductorName = existingConductor?.name || "Conductor";
        user.EmployExpenses.push({ name: conductorName, role: "Conductor", type: "trip", amount, mode });
      }
      user.Status = "Completed";
      anyFieldFound = true;
    }

    // Extract Payment: "Received [amount] [optional: mode] [optional: DD/MM/YYYY]"
    const receivedMatch = normalizedText.match(/^received\s+(\d+)(?:\s+(online|cash))?(?:\s+(\d{1,2}\/\d{1,2}\/\d{4}))?$/i);
    if (receivedMatch) {
      const amount = parseInt(receivedMatch[1]);
      const mode = receivedMatch[2]?.toLowerCase() || "cash";
      // Ensure we extract the date correctly from the match groups
      const date = receivedMatch[3] || new Date().toLocaleDateString('en-GB');
      
      if (!user.PaymentHistory) user.PaymentHistory = [];
      user.PaymentHistory.push({ amount, mode, date });
      
      // Calculate total payments including Advance
      const getAmt = (f) => {
        if (!f) return 0;
        if (typeof f === 'object') return Number(f.amount || f.Amount) || 0;
        return Number(f) || 0;
      };
      
      const totalPayments = (user.PaymentHistory || []).reduce((sum, p) => sum + p.amount, 0);
      const fareAmt = getAmt(user.TotalFare);
      const advAmt = getAmt(user.AdvancePaid);
      
      const remainingBalance = fareAmt - advAmt - totalPayments;
      user.BalanceAmount = remainingBalance;
      
      // Auto-update status to Initiated if balance is cleared
      if (remainingBalance <= 0) {
        user.Status = "Initiated";
      }
      
      anyFieldFound = true;
    }
  }

  return { handled: false, anyFieldFound };
}
