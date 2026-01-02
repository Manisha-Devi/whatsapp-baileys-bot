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
import { getEmployExpensesForBus } from "../../../utils/employees.js";

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
        // Helper to parse date from "Sunday, 15 March 2026" to DD/MM/YYYY
        const parseDateToNormalized = (dateStr) => {
          if (!dateStr) return null;
          // Check if already in DD/MM/YYYY format
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
          // Parse new format "Sunday, 15 March 2026"
          const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
          if (match) {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            const day = match[1].padStart(2, '0');
            const month = String(monthNames.indexOf(match[2]) + 1).padStart(2, '0');
            const year = match[3];
            return `${day}/${month}/${year}`;
          }
          return dateStr;
        };
        
        // Load existing booking into user session
        user.CustomerName = existingBooking.CustomerName;
        user.CustomerPhone = existingBooking.CustomerPhone;
        user.PickupLocation = existingBooking.Location?.Pickup;
        user.DropLocation = existingBooking.Location?.Drop;
        user.TravelDateFrom = parseDateToNormalized(existingBooking.Date?.Start);
        user.TravelDateTo = parseDateToNormalized(existingBooking.Date?.End);
        user.BusCode = existingBooking.BusCode;
        user.Capacity = existingBooking.Capacity;
        user.TotalFare = existingBooking.TotalFare?.Amount || existingBooking.TotalFare || 0;
        user.AdvancePaid = existingBooking.AdvancePaid || { amount: 0, mode: "cash" };
        user.BalanceAmount = existingBooking.BalanceAmount?.Amount || existingBooking.BalanceAmount || 0;
        user.Remarks = existingBooking.Remarks || "";
        user.Status = existingBooking.Status || "Pending";
        user.PaymentHistory = existingBooking.PaymentHistory || [];
        user.submittedAt = existingBooking.submittedAt || existingBooking.submittedat;
        
        // Load expense fields if they exist
        user.Diesel = existingBooking.Diesel || null;
        user.Adda = existingBooking.Adda || null;
        user.Union = existingBooking.Union || null;
        user.ExtraExpenses = existingBooking.ExtraExpenses || [];
        
        // Auto-fetch employee expenses for this bus if not already saved
        if (existingBooking.EmployExpenses && existingBooking.EmployExpenses.length > 0) {
          user.EmployExpenses = (existingBooking.EmployExpenses || []).map(e => ({
            name: e.name,
            role: e.role,
            amount: Number(e.trip || e.salary || e.amount || 0),
            type: e.trip ? "trip" : "dailySalary",
            mode: e.mode || "cash"
          }));
        } else {
          // Get default employee expenses for this bus
          user.EmployExpenses = getEmployExpensesForBus(existingBooking.BusCode) || [];
        }
        
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
