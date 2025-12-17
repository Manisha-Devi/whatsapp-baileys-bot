/**
 * Booking Fetch Handler Module
 * 
 * Handles fetching and loading existing bookings for updates.
 * When a user enters a date with existing booking, asks whether to fetch it.
 * 
 * @module features/bookings/handlers/fetch-handler
 */

import { bookingsDb } from "../../../utils/db.js";
import { safeSendMessage, safeDbRead } from "../utils/helpers.js";
import { sendSummary } from "../utils/messages.js";
import { resolveCommand } from "../../../utils/menu-handler.js";

/**
 * Handles the confirmation response when user wants to fetch an existing booking.
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {string} sender - Sender's phone number/ID
 * @param {string} text - User's response text (yes/no)
 * @param {Object} user - User's booking session data object
 * @returns {Promise<boolean>} True if confirmation was handled, false otherwise
 */
export async function handleFetchConfirmation(sock, sender, text, user) {
  if (!user.confirmingFetch) return false;

  try {
    const resolved = resolveCommand(text);
    
    if (resolved === "yes") {
      const bookingId = user.pendingBookingId;
      
      const ok = await safeDbRead(bookingsDb);
      if (!ok) {
        await safeSendMessage(sock, sender, {
          text: "❌ Unable to read database. Try again later.",
        });
        return true;
      }
      
      const existingBooking = bookingsDb.data[bookingId];
      if (existingBooking) {
        // Load existing booking into user session
        user.CustomerName = existingBooking.CustomerName;
        user.CustomerPhone = existingBooking.CustomerPhone;
        user.PickupLocation = existingBooking.Location?.Pickup;
        user.DropLocation = existingBooking.Location?.Drop;
        user.TravelDateFrom = existingBooking.Date?.Start;
        user.TravelDateTo = existingBooking.Date?.End;
        user.BusCode = existingBooking.BusCode;
        user.Capacity = existingBooking.Capacity;
        user.TotalFare = existingBooking.TotalFare?.Amount;
        user.AdvancePaid = existingBooking.AdvancePaid?.Amount;
        user.BalanceAmount = existingBooking.BalanceAmount?.Amount;
        user.Remarks = existingBooking.Remarks;
        user.Status = existingBooking.Status;
        
        // Set editing state
        user.confirmingFetch = false;
        user.editingExisting = true;
        user.existingBookingId = bookingId;
        user.pendingBookingId = null;
        
        // Format date for display
        const formatDateDisplay = (dateStr) => {
          try {
            const [dd, mm, yyyy] = dateStr.split('/').map(Number);
            const dateObj = new Date(yyyy, mm - 1, dd);
            return dateObj.toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric', 
              month: 'long',
              year: 'numeric'
            });
          } catch {
            return dateStr;
          }
        };
        
        await sendSummary(
          sock,
          sender,
          `📋 *Booking Loaded* (${user.RegistrationNumber || user.BusCode})\n` +
          `📅 Date: ${formatDateDisplay(user.TravelDateFrom)}\n\n` +
          `You can now update any field.\nType *Yes* to save or *No* to cancel.`,
          user
        );
        
        user.waitingForSubmit = true;
      } else {
        user.confirmingFetch = false;
        user.pendingBookingId = null;
        await safeSendMessage(sock, sender, {
          text: "⚠️ Booking not found in database.",
        });
      }
      return true;
      
    } else if (resolved === "no") {
      // User doesn't want to fetch - start fresh entry with same date
      user.confirmingFetch = false;
      user.TravelDateFrom = user.pendingStartDate;
      user.TravelDateTo = user.pendingEndDate;
      user.pendingBookingId = null;
      user.pendingStartDate = null;
      user.pendingEndDate = null;
      
      await safeSendMessage(sock, sender, {
        text: "🆕 Starting a new booking. Continue entering details.",
      });
      return true;
    }
    
    return false;
  } catch (err) {
    console.error("❌ Error in handleFetchConfirmation:", err);
    user.confirmingFetch = false;
    user.pendingBookingId = null;
    await safeSendMessage(sock, sender, {
      text: "❌ Error fetching booking. Please try again.",
    });
    return true;
  }
}
