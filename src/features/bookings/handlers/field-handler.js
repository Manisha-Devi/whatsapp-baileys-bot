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
    
    // Generate booking ID to check if booking exists
    const busCode = user.BusCode;
    if (!busCode) {
      // No bus selected yet, just save date for now
      user.TravelDateFrom = normalizedStartDate;
      user.TravelDateTo = normalizeDateStr(endDate);
      anyFieldFound = true;
    } else {
      // Check if booking exists for this bus and date
      const bookingId = `${busCode}_${normalizedStartDate}`;
      
      await safeDbRead(bookingsDb);
      
      if (bookingsDb.data[bookingId]) {
        // Booking exists - ask for confirmation to fetch
        user.confirmingFetch = true;
        user.pendingBookingId = bookingId;
        user.pendingStartDate = normalizedStartDate;
        user.pendingEndDate = normalizeDateStr(endDate);
        
        const existingBooking = bookingsDb.data[bookingId];
        await safeSendMessage(sock, sender, {
          text: `⚠️ Booking for *${busCode}* on *${normalizedStartDate}* already exists.\n\n` +
                `👤 Customer: ${existingBooking.CustomerName}\n` +
                `📱 Phone: ${existingBooking.CustomerPhone}\n` +
                `📊 Status: ${existingBooking.Status}\n\n` +
                `Do you want to open this booking for updates? (*Yes* or *No*)`
        });
        return { handled: true, anyFieldFound: true };
      } else {
        // No existing booking - proceed with new entry
        user.TravelDateFrom = normalizedStartDate;
        user.TravelDateTo = normalizeDateStr(endDate);
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

  // Extract Fare: "fare [amount]" (displays as Total Fare in summary)
  const fareMatch = normalizedText.match(/^fare\s+(\d+)$/i);
  if (fareMatch) {
    user.TotalFare = parseInt(fareMatch[1]);
    if (user.AdvancePaid) {
      user.BalanceAmount = user.TotalFare - user.AdvancePaid;
    }
    anyFieldFound = true;
  }

  // Extract Advance: "advance [amount]"
  const advanceMatch = normalizedText.match(/^advance\s+(\d+)$/i);
  if (advanceMatch) {
    user.AdvancePaid = parseInt(advanceMatch[1]);
    if (user.TotalFare) {
      user.BalanceAmount = user.TotalFare - user.AdvancePaid;
    }
    anyFieldFound = true;
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

    // Extract Driver expense: "driver [amount] [optional: online]"
    const driverMatch = normalizedText.match(/^driver\s+(\d+)(?:\s+(online))?$/i);
    if (driverMatch) {
      const amount = parseInt(driverMatch[1]);
      const mode = driverMatch[2]?.toLowerCase() === "online" ? "online" : "cash";
      if (!user.EmployExpenses) user.EmployExpenses = [];
      const existingIndex = user.EmployExpenses.findIndex(e => (e.role || e.name)?.toLowerCase() === "driver" && e.mode === mode);
      if (existingIndex !== -1) {
        user.EmployExpenses[existingIndex].amount = amount;
      } else {
        user.EmployExpenses.push({ name: "Driver", role: "Driver", amount, mode });
      }
      anyFieldFound = true;
    }

    // Extract Conductor expense: "conductor [amount] [optional: online]"
    const conductorMatch = normalizedText.match(/^conductor\s+(\d+)(?:\s+(online))?$/i);
    if (conductorMatch) {
      const amount = parseInt(conductorMatch[1]);
      const mode = conductorMatch[2]?.toLowerCase() === "online" ? "online" : "cash";
      if (!user.EmployExpenses) user.EmployExpenses = [];
      const existingIndex = user.EmployExpenses.findIndex(e => (e.role || e.name)?.toLowerCase() === "conductor" && e.mode === mode);
      if (existingIndex !== -1) {
        user.EmployExpenses[existingIndex].amount = amount;
      } else {
        user.EmployExpenses.push({ name: "Conductor", role: "Conductor", amount, mode });
      }
      anyFieldFound = true;
    }
  }

  return { handled: false, anyFieldFound };
}
