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
 * @param {string} user.CustomerName - Customer's full name
 * @param {string} user.CustomerPhone - Customer's phone number
 * @param {string} user.PickupLocation - Journey starting point
 * @param {string} user.DropLocation - Journey destination
 * @param {string} user.TravelDate - Date of travel
 * @param {string} user.VehicleType - Type of vehicle booked
 * @param {number} user.NumberOfPassengers - Passenger count
 * @param {number} user.TotalFare - Total booking amount
 * @param {number} user.AdvancePaid - Advance payment received
 * @param {number} user.BalanceAmount - Remaining balance
 * @param {string} user.Status - Booking status
 * @param {string} user.Remarks - Additional notes
 * @returns {Promise<void>}
 * 
 * @example
 * await sendSummary(sock, sender, "Missing: Travel Date", user);
 */
export async function sendSummary(sock, sender, completenessMsg, user) {
  let msg = "📋 *Current Booking Details*\n\n";

  // Add each field if it has a value
  if (user.CustomerName) msg += `👤 Customer Name: ${user.CustomerName}\n`;
  if (user.CustomerPhone) msg += `📱 Phone: ${user.CustomerPhone}\n`;
  if (user.PickupLocation) msg += `📍 Pickup: ${user.PickupLocation}\n`;
  if (user.DropLocation) msg += `📍 Drop: ${user.DropLocation}\n`;
  if (user.TravelDate) msg += `📅 Travel Date: ${user.TravelDate}\n`;
  if (user.VehicleType) msg += `🚐 Vehicle: ${user.VehicleType}\n`;
  if (user.NumberOfPassengers) msg += `👥 Passengers: ${user.NumberOfPassengers}\n`;
  if (user.TotalFare) msg += `💰 Total Fare: ₹${user.TotalFare}\n`;
  if (user.AdvancePaid) msg += `💵 Advance Paid: ₹${user.AdvancePaid}\n`;
  
  // Show balance if calculated
  if (user.BalanceAmount !== null && user.BalanceAmount !== undefined) {
    msg += `💸 Balance: ₹${user.BalanceAmount}\n`;
  }
  
  if (user.Status) msg += `📊 Status: ${user.Status}\n`;
  if (user.Remarks) msg += `📝 Remarks: ${user.Remarks}\n`;

  // Add completion status message
  msg += `\n${completenessMsg}`;

  await safeSendMessage(sock, sender, { text: msg });
}

/**
 * Determines the booking data entry completion status.
 * Checks if all required fields have been filled and returns
 * an appropriate status message.
 * 
 * Required fields:
 * - CustomerName
 * - CustomerPhone
 * - PickupLocation
 * - DropLocation
 * - TravelDate
 * - VehicleType
 * - NumberOfPassengers
 * - TotalFare
 * - AdvancePaid
 * 
 * @param {Object} user - User's booking session data object
 * @returns {string} Status message indicating completion state or missing fields
 * 
 * @example
 * // All fields complete
 * getCompletionMessage(completeUser);
 * // Returns: "✅ All required fields complete! Type *submit* to confirm."
 * 
 * // Missing fields
 * getCompletionMessage(incompleteUser);
 * // Returns: "⚠️ Missing: CustomerPhone, TravelDate"
 */
export function getCompletionMessage(user) {
  // Define the list of required fields for a complete booking
  const requiredFields = [
    "CustomerName",
    "CustomerPhone",
    "PickupLocation",
    "DropLocation",
    "TravelDate",
    "VehicleType",
    "NumberOfPassengers",
    "TotalFare",
    "AdvancePaid",
  ];

  // Find fields that are missing
  const missingFields = requiredFields.filter((field) => !user[field]);

  // All fields are complete - enable submission
  if (missingFields.length === 0) {
    user.waitingForSubmit = true;
    return "✅ All required fields complete! Type *submit* to confirm.";
  } else {
    // Some fields are missing - show which ones
    user.waitingForSubmit = false;
    return `⚠️ Missing: ${missingFields.join(", ")}`;
  }
}
