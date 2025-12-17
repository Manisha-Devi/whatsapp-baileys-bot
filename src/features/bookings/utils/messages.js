/**
 * Booking Messages Module
 * 
 * This module provides message formatting and sending utilities for bookings.
 * It generates formatted WhatsApp messages for displaying booking summaries
 * and determines data entry completion status.
 * 
 * @module features/bookings/utils/messages
 */

import { safeSendMessage } from "./helpers.js";
import { getMenuState } from "../../../utils/menu-state.js";

/**
 * Sends a formatted summary of the user's current booking entry progress.
 * Displays all entered fields with appropriate icons and formatting.
 * Shows ₹___ for empty fields (similar to Daily summary).
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} completenessMsg - Status message about missing/complete fields
 * @param {Object} user - User's booking session data
 * @returns {Promise<void>}
 */
export async function sendSummary(sock, sender, completenessMsg, user) {
  // Get bus info from menu state for header
  const menuState = getMenuState(sender);
  const regNumber = menuState?.selectedBusInfo?.registrationNumber || user.RegistrationNumber || '';
  const titleBus = regNumber ? ` (${regNumber})` : '';
  
  // Format date range
  let dateDisplay = "___";
  if (user.TravelDateFrom) {
    if (user.TravelDateFrom === user.TravelDateTo || !user.TravelDateTo) {
      dateDisplay = user.TravelDateFrom;
    } else {
      dateDisplay = `${user.TravelDateFrom} to ${user.TravelDateTo}`;
    }
  }
  
  // Format amounts with ₹___ for missing values
  const formatAmount = (val) => {
    if (val === undefined || val === null || val === "") return "___";
    return val.toLocaleString('en-IN');
  };

  const msg = [
    `📋 *Booking Entry${titleBus}*`,
    ``,
    `👤 *Customer Details:*`,
    `👤 Name: ${user.CustomerName || "___"}`,
    `📱 Mobile: ${user.CustomerPhone || "___"}`,
    ``,
    `📍 *Route Details:*`,
    `🚏 Pickup: ${user.PickupLocation || "___"}`,
    `🏁 Drop: ${user.DropLocation || "___"}`,
    `📅 Date: ${dateDisplay}`,
    ``,
    `💰 *Payment Details:*`,
    `💵 Total Fare: ₹${formatAmount(user.TotalFare)}`,
    `💳 Advance: ₹${formatAmount(user.AdvancePaid)}`,
    `💸 Balance: ₹${formatAmount(user.BalanceAmount)}`,
    ...(user.Remarks ? [``, `📝 *Remarks:* ${user.Remarks}`] : []),
    ``,
    completenessMsg
  ].join("\n");

  await safeSendMessage(sock, sender, { text: msg });
}

/**
 * Determines the booking data entry completion status.
 * Checks if all required fields have been filled and returns
 * an appropriate status message.
 * 
 * Required fields:
 * - CustomerName (Name)
 * - CustomerPhone (Mobile)
 * - PickupLocation (Pickup)
 * - DropLocation (Drop)
 * - TravelDateFrom (Date)
 * - BusCode (Bus)
 * - TotalFare
 * - AdvancePaid (Advance)
 * 
 * @param {Object} user - User's booking session data object
 * @returns {string} Status message indicating completion state or missing fields
 */
export function getCompletionMessage(user) {
  // BusCode is auto-set from selected bus, so not in required fields
  const requiredFieldsMap = {
    "CustomerName": "Name",
    "CustomerPhone": "Mobile",
    "PickupLocation": "Pickup",
    "DropLocation": "Drop",
    "TravelDateFrom": "Date",
    "TotalFare": "Fare",
    "AdvancePaid": "Advance",
  };

  const missingFields = Object.entries(requiredFieldsMap)
    .filter(([key]) => user[key] === undefined || user[key] === null || user[key] === "")
    .map(([, label]) => label);

  if (missingFields.length === 0) {
    user.waitingForSubmit = true;
    return "✅ All fields complete!\nDo you want to Submit? (Yes/Y or No/N)";
  } else {
    user.waitingForSubmit = false;
    return `⚠️ Missing: ${missingFields.join(", ")}`;
  }
}
