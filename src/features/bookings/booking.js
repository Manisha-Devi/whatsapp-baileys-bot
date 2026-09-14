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
import { handleClearCommand, handleBookingCommand, handleDeleteCommand } from "./handlers/command-handler.js";
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
        const regNum = menuState?.selectedBusInfo?.registrationNumber || selectedBus || '';
        const busLabel = regNum ? ` (*${regNum}*)` : '';
        await safeSendMessage(sock, sender, {
          text: `🚌 *Booking Help*${busLabel}\n\n` +
                `*Commands For Data Entry:*\n` +
                `• Name [Customer Name]\n` +
                `• Mobile [10-digit Phone]\n` +
                `• Pickup [Location]\n` +
                `• Drop [Location]\n` +
                `• Date [DD/MM/YYYY]\n` +
                `• Date [DD/MM/YYYY] to [DD/MM/YYYY]\n` +
                `  For multi-day bookings\n` +
                `• Fare [Amount]\n` +
                `  Total Fare amount\n` +
                `• Advance [Amount]\n` +
                `  Advance payment (0 allowed)\n` +
                `• Advance [Amount] online\n` +
                `  For online payment\n` +
                `• Remarks [Text]\n` +
                `• Yes/Y or No/N to Submit\n\n` +
                `*Commands After Trip:*\n` +
                `• Received [Amount]\n` +
                `• Received [Amount] online\n` +
                `• Received [Amount] online [DD/MM/YYYY]\n` +
                `• Diesel [Amount]\n` +
                `• Adda [Amount]\n` +
                `• Union [Amount]\n` +
                `• Expense [Name] [Amount]\n` +
                `  e.g. Expense Tyre 500\n` +
                `• Driver [Amount]\n` +
                `• Conductor [Amount]\n` +
                `• Trip Driver [Amount]\n` +
                `• Trip Conductor [Amount]\n\n` +
                `*Commands for Reports:*\n` +
                `• Today / Yesterday\n` +
                `• This Week / This Month\n` +
                `• [DD/MM/YYYY]\n` +
                `• [Month] e.g. Jul\n` +
                `• [Month Year] e.g. Jul 2026\n` +
                `• [Year] e.g. 2026\n\n` +
                `*Filter by Status:*\n` +
                `• This Month Pending\n` +
                `• Jul 2026 Completed\n` +
                `• 2026 Pending\n` +
                `  Add Pending/Completed/Deposited\n` +
                `  after any period\n\n` +
                `*Balance Filter:*\n` +
                `• Bal — all bookings with balance\n` +
                `• Bal May\n` +
                `• Bal Jul 2026\n` +
                `• Bal 2026\n` +
                `• Bal This Month\n` +
                `  Shows total balance due\n\n` +
                `*Other:*\n` +
                `• Delete [DD/MM/YYYY] — Delete a booking\n` +
                `• Clear — Clear session\n` +
                `• Exit — Back to Main Menu`
        });
      } else {
        // Normal mode help - with "booking" prefix
        await safeSendMessage(sock, sender, {
          text: `🚌 *Booking Help*\n\n` +
                `*Commands For Data Entry:*\n` +
                `• booking Name [Customer Name]\n` +
                `• booking Mobile [10-digit Phone]\n` +
                `• booking Pickup [Location]\n` +
                `• booking Drop [Location]\n` +
                `• booking Date [DD/MM/YYYY]\n` +
                `• booking Date [DD/MM/YYYY] to [DD/MM/YYYY]\n` +
                `  For multi-day bookings\n` +
                `• booking Fare [Amount]\n` +
                `• booking Advance [Amount]\n` +
                `• booking Advance [Amount] online\n` +
                `• booking Remarks [Text]\n` +
                `• booking Yes/Y or No/N to Submit\n\n` +
                `*Commands After Trip:*\n` +
                `• booking Received [Amount]\n` +
                `• booking Received [Amount] online\n` +
                `• booking Received [Amount] online [DD/MM/YYYY]\n` +
                `• booking Diesel [Amount]\n` +
                `• booking Adda [Amount]\n` +
                `• booking Union [Amount]\n` +
                `• booking Expense [Name] [Amount]\n` +
                `• booking Driver [Amount]\n` +
                `• booking Conductor [Amount]\n` +
                `• booking Trip Driver [Amount]\n` +
                `• booking Trip Conductor [Amount]\n\n` +
                `*Commands for Reports:*\n` +
                `• booking Today / booking Yesterday\n` +
                `• booking This Week / booking This Month\n` +
                `• booking [DD/MM/YYYY]\n` +
                `• booking Jul / booking Jul 2026\n` +
                `• booking 2026\n\n` +
                `*Filter by Status:*\n` +
                `• booking This Month Pending\n` +
                `• booking Jul 2026 Completed\n` +
                `• booking 2026 Pending\n\n` +
                `*Balance Filter:*\n` +
                `• booking Bal\n` +
                `• booking Bal May / booking Bal Jul 2026\n` +
                `• booking Bal 2026 / booking Bal This Month\n\n` +
                `*Other:*\n` +
                `• booking Delete [DD/MM/YYYY] — Delete a booking\n` +
                `• booking Clear — Clear session`
        });
      }
      return;
    }

    // Try to handle clear command to reset booking session
    const handledClear = await handleClearCommand(sock, sender, text);
    if (handledClear) return;

    // Try to handle delete command
    const userSession = global.bookingData?.[sender];
    const handledDelete = await handleDeleteCommand(sock, sender, text, userSession);
    if (handledDelete) return;

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
