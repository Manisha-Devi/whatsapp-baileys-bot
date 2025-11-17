import { handleBookingStatus, handleBookingStatusUpdate } from "./booking_status.js";
import { safeSendMessage } from "./utils/helpers.js";
import { handleClearCommand, handleBookingCommand } from "./handlers/command-handler.js";
import { handleFieldExtraction } from "./handlers/field-handler.js";
import { handleSubmit } from "./handlers/submit-handler.js";
import { sendSummary, getCompletionMessage } from "./utils/messages.js";

export async function handleIncomingMessageFromBooking(sock, msg, skipPrefixStripping = false) {
  try {
    if (!msg || !msg.key) {
      console.warn("⚠️ Received malformed or empty msg:", msg);
      return;
    }

    const sender = msg.key.remoteJid;
    
    if (sender && sender.endsWith("@g.us")) {
      console.log("🚫 Ignored group message from:", sender);
      return;
    }

    const messageContent =
      msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!messageContent) return;
    if (msg.key.fromMe) return;

    const textRaw = String(messageContent);
    let normalizedText = textRaw.trim();
    let text = normalizedText.toLowerCase();
    
    // Strip "booking" prefix only if not in menu mode
    if (!skipPrefixStripping) {
      const bookingPrefixMatch = normalizedText.match(/^booking[\s\-:]*/i);
      if (bookingPrefixMatch) {
        const prefixLength = bookingPrefixMatch[0].length;
        normalizedText = normalizedText.substring(prefixLength).trim();
        text = text.substring(prefixLength).trim();
      }
    }
    
    // Handle help command
    if (text === 'help' || text === '') {
      if (skipPrefixStripping) {
        await safeSendMessage(sock, sender, {
          text: `🚌 *BOOKING COMMANDS (Menu Mode)*\n\n` +
                `📝 *Booking Entry:*\n` +
                `Customer Name Rahul Sharma\n` +
                `Customer Phone 9876543210\n` +
                `Pickup Location Delhi\n` +
                `Drop Location Agra\n` +
                `Travel Date 20/11/2025\n` +
                `Vehicle Type Tempo Traveller\n` +
                `Number of Passengers 12\n` +
                `Total Fare 8000\n` +
                `Advance Paid 3000\n` +
                `Submit\n\n` +
                `📋 *Status Commands:*\n` +
                `• status pending\n` +
                `• status confirmed\n` +
                `• update status BK001 confirmed\n\n` +
                `🔍 *Fetch Bookings:*\n` +
                `• BK001\n` +
                `• 20/11/2025\n` +
                `• 9876543210\n\n` +
                `⚙️ *Other:*\n` +
                `• clear - clear session\n` +
                `• exit - back to menu\n\n` +
                `No "booking" prefix needed in menu mode!`
        });
      } else {
        await safeSendMessage(sock, sender, {
          text: `🚌 *BOOKING FEATURE COMMANDS*\n\n` +
                `1️⃣ *Create New Booking*\n` +
                `booking\n` +
                `Customer Name Rahul Sharma\n` +
                `Customer Phone 9876543210\n` +
                `Pickup Location Delhi\n` +
                `Drop Location Agra\n` +
                `Travel Date 20/11/2025\n` +
                `Vehicle Type Tempo Traveller\n` +
                `Number of Passengers 12\n` +
                `Total Fare 8000\n` +
                `Advance Paid 3000\n` +
                `Remarks AC required\n` +
                `Submit\n\n` +
                `2️⃣ *Fetch Bookings*\n` +
                `• booking BK001 - by booking ID\n` +
                `• booking 20/11/2025 - by date\n` +
                `• booking 9876543210 - by phone\n\n` +
                `3️⃣ *Check Status*\n` +
                `• booking status pending\n` +
                `• booking status confirmed\n` +
                `• booking status completed\n\n` +
                `4️⃣ *Update Status*\n` +
                `• booking update status BK001 confirmed\n` +
                `• booking update status BK002 completed\n\n` +
                `5️⃣ *Other Commands*\n` +
                `• booking clear - clear session\n\n` +
                `For detailed guide, see documentation.`
        });
      }
      return;
    }

    const handledBookingStatus = await handleBookingStatus(sock, sender, normalizedText);
    if (handledBookingStatus) return;

    const handledStatusUpdate = await handleBookingStatusUpdate(sock, sender, normalizedText);
    if (handledStatusUpdate) return;

    const handledClear = await handleClearCommand(sock, sender, text);
    if (handledClear) return;

    if (!global.bookingData) global.bookingData = {};
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

      if (!skipPrefixStripping) {
        await safeSendMessage(sock, sender, {
          text: "👋 Welcome to Booking System!\n\n📝 Start your message with *booking*\n\nExample:\nbooking\nCustomer Name Rahul\nCustomer Phone 9876543210\nPickup Location Delhi\n...\n\nType *booking help* for all commands.",
        });
      }
    }

    const user = global.bookingData[sender];

    const handledBookingCmd = await handleBookingCommand(sock, sender, normalizedText, user);
    if (handledBookingCmd) return;

    const fieldResult = await handleFieldExtraction(sock, sender, normalizedText, user);
    if (fieldResult.handled) return;

    const handledSubmit = await handleSubmit(sock, sender, text, user);
    if (handledSubmit) return;

    if (!fieldResult.anyFieldFound) return;

    const completenessMsg = getCompletionMessage(user);
    await sendSummary(sock, sender, completenessMsg, user);

  } catch (err) {
    console.error("❌ Error in handleIncomingMessageFromBooking:", err);
  }
}
