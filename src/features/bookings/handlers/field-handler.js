/**
 * Booking Field Handler Module
 * 
 * This module handles the extraction of booking field values from user messages.
 * It parses various field patterns and populates the user's booking session data.
 * 
 * Supported fields:
 * - Customer Name: Full name of the customer
 * - Customer Phone: 10-digit phone number
 * - Pickup Location: Starting point of the journey
 * - Drop Location: Destination of the journey
 * - Travel Date: Date of travel in DD/MM/YYYY format
 * - Vehicle Type: Type of vehicle required (e.g., Tempo Traveller, Bus)
 * - Number of Passengers: Total passengers traveling
 * - Total Fare: Total booking amount
 * - Advance Paid: Advance payment received
 * - Remarks: Additional notes or requirements
 * 
 * @module features/bookings/handlers/field-handler
 */

import { safeSendMessage } from "../utils/helpers.js";

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
 * 
 * @example
 * // Input: "Customer Name Rahul Sharma"
 * // Sets user.CustomerName = "Rahul Sharma"
 * 
 * // Input: "Total Fare 8000"
 * // Sets user.TotalFare = 8000
 */
export async function handleFieldExtraction(sock, sender, normalizedText, user) {
  let anyFieldFound = false;

  // Extract Customer Name: "customer name [name]"
  const customerNameMatch = normalizedText.match(/^customer\s+name\s+(.+)$/i);
  if (customerNameMatch) {
    user.CustomerName = customerNameMatch[1].trim();
    anyFieldFound = true;
  }

  // Extract Customer Phone: "customer phone [10-digit number]"
  const phoneMatch = normalizedText.match(/^customer\s+phone\s+(\d{10})$/i);
  if (phoneMatch) {
    user.CustomerPhone = phoneMatch[1];
    anyFieldFound = true;
  }

  // Extract Pickup Location: "pickup location [location]"
  const pickupMatch = normalizedText.match(/^pickup\s+location\s+(.+)$/i);
  if (pickupMatch) {
    user.PickupLocation = pickupMatch[1].trim();
    anyFieldFound = true;
  }

  // Extract Drop Location: "drop location [location]"
  const dropMatch = normalizedText.match(/^drop\s+location\s+(.+)$/i);
  if (dropMatch) {
    user.DropLocation = dropMatch[1].trim();
    anyFieldFound = true;
  }

  // Extract Travel Date: "travel date DD/MM/YYYY"
  const travelDateMatch = normalizedText.match(/^travel\s+date\s+(\d{2}\/\d{2}\/\d{4})$/i);
  if (travelDateMatch) {
    user.TravelDate = travelDateMatch[1];
    anyFieldFound = true;
  }

  // Extract Vehicle Type: "vehicle type [type]"
  const vehicleMatch = normalizedText.match(/^vehicle\s+type\s+(.+)$/i);
  if (vehicleMatch) {
    user.VehicleType = vehicleMatch[1].trim();
    anyFieldFound = true;
  }

  // Extract Number of Passengers: "number of passengers [count]"
  const passengersMatch = normalizedText.match(/^number\s+of\s+passengers\s+(\d+)$/i);
  if (passengersMatch) {
    user.NumberOfPassengers = parseInt(passengersMatch[1]);
    anyFieldFound = true;
  }

  // Extract Total Fare: "total fare [amount]"
  const fareMatch = normalizedText.match(/^total\s+fare\s+(\d+)$/i);
  if (fareMatch) {
    user.TotalFare = parseInt(fareMatch[1]);
    anyFieldFound = true;
  }

  // Extract Advance Paid: "advance paid [amount]"
  // Also calculates balance amount if total fare is available
  const advanceMatch = normalizedText.match(/^advance\s+paid\s+(\d+)$/i);
  if (advanceMatch) {
    user.AdvancePaid = parseInt(advanceMatch[1]);
    // Auto-calculate balance if total fare is set
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

  // Return false for handled since we want processing to continue
  // (to show summary after field extraction)
  return { handled: false, anyFieldFound };
}
