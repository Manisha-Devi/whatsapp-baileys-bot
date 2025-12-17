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

import { safeSendMessage } from "../utils/helpers.js";
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
  
  if (dateRangeMatch) {
    user.TravelDateFrom = dateRangeMatch[1];
    user.TravelDateTo = dateRangeMatch[2];
    anyFieldFound = true;
  } else if (singleDateMatch) {
    user.TravelDateFrom = singleDateMatch[1];
    user.TravelDateTo = singleDateMatch[1];
    anyFieldFound = true;
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

  return { handled: false, anyFieldFound };
}
