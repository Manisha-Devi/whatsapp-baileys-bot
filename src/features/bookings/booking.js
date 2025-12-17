/**
 * Booking Module - Main Entry Point
 * 
 * This module serves as the main handler for the booking feature of the WhatsApp bot.
 * It processes incoming messages related to bus/vehicle bookings and routes them
 * to appropriate handlers for processing.
 * 
 * Implemented Features:
 * - Create new bookings with customer details
 * - Check booking status (pending, confirmed, completed, cancelled)
 * - Update booking status
 * - Display help information for booking commands
 * 
 * Features Under Development:
 * - Fetch existing bookings by ID, date, or phone number (placeholder only)
 * - Booking reports
 * 
 * @module features/bookings/booking
 */

import { handleBookingStatus, handleBookingStatusUpdate } from "./booking_status.js";
import { safeSendMessage } from "./utils/helpers.js";
import { handleClearCommand, handleBookingCommand } from "./handlers/command-handler.js";
import { handleFieldExtraction } from "./handlers/field-handler.js";
import { handleSubmit } from "./handlers/submit-handler.js";
import { sendSummary, getCompletionMessage } from "./utils/messages.js";
import { getMenuState } from "../../utils/menu-state.js";

/**
 * Main handler for incoming WhatsApp messages related to booking functionality.
 * Routes messages to appropriate sub-handlers based on message content.
 * 
 * Message processing flow:
 * 1. Validate message structure
 * 2. Check for help command
 * 3. Handle booking status queries and updates
 * 4. Handle clear command
 * 5. Initialize booking session if needed
 * 6. Extract booking fields from message
 * 7. Handle submission
 * 8. Show data entry summary
 * 
 * @param {Object} sock - WhatsApp socket connection instance
 * @param {Object} msg - Incoming message object from Baileys
 * @param {boolean} skipPrefixStripping - If true, don't strip "booking" prefix (for menu mode)
 * @returns {Promise<void>}
 * 
 * @example
 * // Direct call with prefix stripping (normal mode)
 * await handleIncomingMessageFromBooking(sock, msg, false);
 * 
 * // Menu mode (no prefix stripping needed)
 * await handleIncomingMessageFromBooking(sock, msg, true);
 */
export async function handleIncomingMessageFromBooking(sock, msg, skipPrefixStripping = false) {
  try {
    // Validate message structure
    if (!msg || !msg.key) {
      console.warn("⚠️ Received malformed or empty msg:", msg);
      return;
    }

    const sender = msg.key.remoteJid;
    
    // Ignore group messages - booking is for individual users only
    if (sender && sender.endsWith("@g.us")) {
      console.log("🚫 Ignored group message from:", sender);
      return;
    }

    // Extract message text content
    const messageContent =
      msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!messageContent) return;
    
    // Ignore messages sent by the bot itself
    if (msg.key.fromMe) return;

    const textRaw = String(messageContent);
    let normalizedText = textRaw.trim();
    let text = normalizedText.toLowerCase();
    
    // Strip "booking" prefix unless in menu mode where prefix is already stripped
    if (!skipPrefixStripping) {
      const bookingPrefixMatch = normalizedText.match(/^booking[\s\-:]*/i);
      if (bookingPrefixMatch) {
        const prefixLength = bookingPrefixMatch[0].length;
        normalizedText = normalizedText.substring(prefixLength).trim();
        text = text.substring(prefixLength).trim();
      }
    }
    
    // Get the currently selected bus from menu state
    const menuState = getMenuState(sender);
    const selectedBus = menuState.selectedBus;

    // Handle help command - show available booking commands
    if (text === 'help' || text === '') {
      if (skipPrefixStripping) {
        // Menu mode help - shorter format, no prefix needed (similar to Daily)
        const busInfo = selectedBus ? `🚌 Bus: *${selectedBus}*\n\n` : '';
        await safeSendMessage(sock, sender, {
          text: `🚌 *BOOKING COMMANDS (Menu Mode)*\n${busInfo}` +
                `📝 *Booking Entry:*\n` +
                `Name Rajesh Kumar\n` +
                `Mobile 9876543210\n` +
                `Pickup Doda\n` +
                `Drop Jammu\n` +
                `Date 20/12/2025\n` +
                `Date 20/12/2025 to 22/12/2025\n` +
                `Bus BUS101\n` +
                `Fare 25000\n` +
                `Advance 10000\n` +
                `Remarks Marriage booking\n` +
                `Yes/Y or No/N\n\n` +
                `📋 *Status Commands:*\n` +
                `• status pending\n` +
                `• status confirmed\n` +
                `• update status BUS101_20/12/2025 confirmed\n\n` +
                `🔍 *Fetch Bookings:*\n` +
                `• today\n` +
                `• yesterday\n` +
                `• [DD/MM/YYYY]\n\n` +
                `⚙️ *Other:*\n` +
                `• clear - clear session\n` +
                `• exit - back to menu\n\n` +
                `No "booking" prefix needed in menu mode!`
        });
      } else {
        // Normal mode help - full format with "booking" prefix examples
        await safeSendMessage(sock, sender, {
          text: `🚌 *BOOKING FEATURE COMMANDS*\n\n` +
                `1️⃣ *Create New Booking*\n` +
                `booking Name Rajesh Kumar\n` +
                `booking Mobile 9876543210\n` +
                `booking Pickup Doda\n` +
                `booking Drop Jammu\n` +
                `booking Date 20/12/2025\n` +
                `booking Date 20/12/2025 to 22/12/2025\n` +
                `booking Bus BUS101\n` +
                `booking Fare 25000\n` +
                `booking Advance 10000\n` +
                `booking Remarks Marriage booking\n` +
                `booking Yes/Y or No/N\n\n` +
                `2️⃣ *Fetch Bookings*\n` +
                `• booking today\n` +
                `• booking yesterday\n` +
                `• booking [DD/MM/YYYY]\n\n` +
                `3️⃣ *Check Status*\n` +
                `• booking status pending\n` +
                `• booking status confirmed\n` +
                `• booking status completed\n\n` +
                `4️⃣ *Update Status*\n` +
                `• booking update status BUS101_20/12/2025 confirmed\n\n` +
                `5️⃣ *Other Commands*\n` +
                `• booking clear - clear session\n\n` +
                `For detailed guide, see documentation.`
        });
      }
      return;
    }

    // Try to handle booking status query (e.g., "status pending")
    const handledBookingStatus = await handleBookingStatus(sock, sender, normalizedText);
    if (handledBookingStatus) return;

    // Try to handle booking status update (e.g., "update status BK001 confirmed")
    const handledStatusUpdate = await handleBookingStatusUpdate(sock, sender, normalizedText);
    if (handledStatusUpdate) return;

    // Try to handle clear command to reset booking session
    const handledClear = await handleClearCommand(sock, sender, text);
    if (handledClear) return;

    // Check if user is in booking reports mode (feature under development)
    if (menuState.mode === 'booking' && menuState.submode === 'reports') {
      await safeSendMessage(sock, sender, {
        text: "📊 *Booking Reports*\n\n⚠️ This feature is currently under development.\n\nPlease use the following options for now:\n• Reply *Exit* to go back to Booking Menu\n• Reply *Entry* to go to Main Menu"
      });
      return;
    }

    // Initialize global booking data storage if not exists
    if (!global.bookingData) global.bookingData = {};
    
    // Initialize user's booking session with default values if not exists
    if (!global.bookingData[sender]) {
      global.bookingData[sender] = {
        BookingDate: new Date().toISOString().split('T')[0],
        CustomerName: null,
        CustomerPhone: null,
        PickupLocation: null,
        DropLocation: null,
        TravelDate: null,
        VehicleType: null,
        NumberOfPassengers: null,
        TotalFare: null,
        AdvancePaid: null,
        BalanceAmount: null,
        Status: "Pending",
        Remarks: null,
        waitingForSubmit: false,
      };

      // Show welcome message only in normal mode (not menu mode)
      if (!skipPrefixStripping) {
        await safeSendMessage(sock, sender, {
          text: "👋 Welcome to Booking System!\n\n📝 Start your message with *booking*\n\nExample:\nbooking Name Rajesh Kumar\nbooking Mobile 9876543210\nbooking Pickup Doda\nbooking Drop Jammu\nbooking Date 20/12/2025\nbooking Bus BUS101\nbooking Fare 25000\nbooking Advance 10000\n\nType *booking help* for all commands.",
        });
      }
    }

    const user = global.bookingData[sender];

    // Try to handle booking lookup commands (by ID or date)
    const handledBookingCmd = await handleBookingCommand(sock, sender, normalizedText, user);
    if (handledBookingCmd) return;

    // Extract booking fields from the message
    const fieldResult = await handleFieldExtraction(sock, sender, normalizedText, user);
    if (fieldResult.handled) return;

    // Try to handle submit command
    const handledSubmit = await handleSubmit(sock, sender, text, user);
    if (handledSubmit) return;

    // If no fields were found in the message, don't show summary
    if (!fieldResult.anyFieldFound) return;

    // Show current booking summary with completion status
    const completenessMsg = getCompletionMessage(user);
    await sendSummary(sock, sender, completenessMsg, user);

  } catch (err) {
    console.error("❌ Error in handleIncomingMessageFromBooking:", err);
  }
}
