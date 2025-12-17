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

/**
 * Sends a formatted summary of the user's current booking entry progress.
 * Displays all entered fields with appropriate icons and formatting.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} completenessMsg - Status message about missing/complete fields
 * @param {Object} user - User's booking session data
 * @returns {Promise<void>}
 */
export async function sendSummary(sock, sender, completenessMsg, user) {
  let msg = "📋 *Booking Details*\n\n";

  if (user.CustomerName) msg += `👤 Customer: ${user.CustomerName}\n`;
  if (user.CustomerPhone) msg += `📱 Phone: ${user.CustomerPhone}\n`;
  
  if (user.PickupLocation && user.DropLocation) {
    msg += `📍 Pickup: ${user.PickupLocation} → Drop: ${user.DropLocation}\n`;
  } else {
    if (user.PickupLocation) msg += `📍 Pickup: ${user.PickupLocation}\n`;
    if (user.DropLocation) msg += `📍 Drop: ${user.DropLocation}\n`;
  }
  
  if (user.TravelDateFrom) {
    if (user.TravelDateFrom === user.TravelDateTo) {
      msg += `📅 Date: ${user.TravelDateFrom}\n`;
    } else {
      msg += `📅 Date: ${user.TravelDateFrom} to ${user.TravelDateTo}\n`;
    }
  }
  
  if (user.BusCode) {
    msg += `🚌 Bus: ${user.BusCode} (${user.RegistrationNumber})\n`;
    msg += `🚐 Type: ${user.BusType} | Capacity: ${user.Capacity}\n`;
  }
  
  if (user.TotalFare !== undefined && user.TotalFare !== null) {
    msg += `💰 Total Fare: ₹${user.TotalFare.toLocaleString('en-IN')}\n`;
  }
  if (user.AdvancePaid !== undefined && user.AdvancePaid !== null) {
    msg += `💵 Advance: ₹${user.AdvancePaid.toLocaleString('en-IN')}\n`;
  }
  if (user.BalanceAmount !== undefined && user.BalanceAmount !== null) {
    msg += `💸 Balance: ₹${user.BalanceAmount.toLocaleString('en-IN')}\n`;
  }
  
  if (user.Remarks) msg += `📝 Remarks: ${user.Remarks}\n`;

  msg += `\n${completenessMsg}`;

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
  const requiredFieldsMap = {
    "CustomerName": "Name",
    "CustomerPhone": "Mobile",
    "PickupLocation": "Pickup",
    "DropLocation": "Drop",
    "TravelDateFrom": "Date",
    "BusCode": "Bus",
    "TotalFare": "Total Fare",
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
