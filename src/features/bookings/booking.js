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

import { safeSendMessage } from "./utils/helpers.js";
import { handleClearCommand, handleBookingCommand } from "./handlers/command-handler.js";
import { handleFieldExtraction } from "./handlers/field-handler.js";
import { handleFetchConfirmation } from "./handlers/fetch-handler.js";
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
        // Menu mode help - no prefix needed
        const busLabel = selectedBus ? `🚌 Bus: *${selectedBus}*\n\n` : '';
        await safeSendMessage(sock, sender, {
          text: `🚌 *BOOKING COMMANDS*\n${busLabel}` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `📝 *New Booking:*\n` +
                `Name Rajesh Kumar\n` +
                `Mobile 9876543210\n` +
                `Pickup Doda\n` +
                `Drop Jammu\n` +
                `Date 20/07/2026\n` +
                `Date 20/07/2026 to 22/07/2026\n` +
                `Fare 25000\n` +
                `Advance 10000\n` +
                `Advance 10000 online\n` +
                `Advance 0\n` +
                `Remarks Marriage function\n` +
                `Yes / No\n\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `✏️ *Update (after trip):*\n` +
                `Received 5000\n` +
                `Received 5000 online\n` +
                `Diesel 2600\n` +
                `Adda 200\n` +
                `Union 100\n` +
                `Expense Tyre 500\n` +
                `Driver 500\n` +
                `Conductor 300\n` +
                `Trip Driver 1500\n` +
                `Trip Conductor 800\n\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `🔍 *View Bookings:*\n` +
                `today / yesterday\n` +
                `this week / this month\n` +
                `20/07/2026\n` +
                `jul / jul 2026 / 2026\n\n` +
                `📊 *Filter by Status:*\n` +
                `this month pending\n` +
                `jul 2026 completed\n` +
                `2026 pending\n\n` +
                `💸 *Balance Filter:*\n` +
                `bal / balance\n` +
                `bal may / bal jul 2026\n` +
                `bal 2026 / bal this month\n\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `⚙️ clear — reset session`
        });
      } else {
        // Normal mode help - with "booking" prefix
        await safeSendMessage(sock, sender, {
          text: `🚌 *BOOKING FEATURE COMMANDS*\n\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `📝 *New Booking:*\n` +
                `booking Name Rajesh Kumar\n` +
                `booking Mobile 9876543210\n` +
                `booking Pickup Doda\n` +
                `booking Drop Jammu\n` +
                `booking Date 20/07/2026\n` +
                `booking Date 20/07/2026 to 22/07/2026\n` +
                `booking Fare 25000\n` +
                `booking Advance 10000\n` +
                `booking Advance 10000 online\n` +
                `booking Remarks Marriage function\n` +
                `booking Yes / booking No\n\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `✏️ *Update (after trip):*\n` +
                `booking Received 5000\n` +
                `booking Diesel 2600\n` +
                `booking Adda 200\n` +
                `booking Expense Tyre 500\n` +
                `booking Driver 500\n` +
                `booking Trip Driver 1500\n\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `🔍 *View Bookings:*\n` +
                `booking today / booking yesterday\n` +
                `booking this week / booking this month\n` +
                `booking 20/07/2026\n` +
                `booking jul / booking jul 2026 / booking 2026\n\n` +
                `📊 *Filter by Status:*\n` +
                `booking this month pending\n` +
                `booking jul 2026 completed\n` +
                `booking 2026 pending\n\n` +
                `💸 *Balance Filter:*\n` +
                `booking bal\n` +
                `booking bal may / booking bal jul 2026\n` +
                `booking bal 2026 / booking bal this month\n\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `⚙️ booking clear — reset session`
        });
      }
      return;
    }

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
    
    // Get bus info from selected bus
    const busInfo = menuState.selectedBusInfo;
    
    // Initialize user's booking session with default values if not exists
    if (!global.bookingData[sender]) {
      global.bookingData[sender] = {
        BookingDate: new Date().toISOString().split('T')[0],
        CustomerName: null,
        CustomerPhone: null,
        PickupLocation: null,
        DropLocation: null,
        TravelDateFrom: null,
        TravelDateTo: null,
        BusCode: selectedBus || null,
        RegistrationNumber: busInfo?.registrationNumber || null,
        BusType: busInfo?.type || null,
        Capacity: busInfo?.capacity || null,
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

    // Handle fetch confirmation if user is in confirmingFetch state
    if (user.confirmingFetch) {
      const handledFetch = await handleFetchConfirmation(sock, sender, text, user);
      if (handledFetch) return;
    }

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
