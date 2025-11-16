import { handleBookingStatus, handleBookingStatusUpdate } from "./booking_status.js";
import { safeSendMessage } from "./utils/helpers.js";
import { handleClearCommand, handleBookingCommand } from "./handlers/command-handler.js";
import { handleFieldExtraction } from "./handlers/field-handler.js";
import { handleSubmit } from "./handlers/submit-handler.js";
import { sendSummary, getCompletionMessage } from "./utils/messages.js";

export async function handleIncomingMessageFromBooking(sock, msg) {
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
    const normalizedText = textRaw.trim();
    const text = normalizedText.toLowerCase();

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

      await safeSendMessage(sock, sender, {
        text: "👋 Welcome to Booking System!\n\nPlease provide booking details:\n• Customer Name [name]\n• Customer Phone [10-digit]\n• Pickup Location [place]\n• Drop Location [destination]\n• Travel Date DD/MM/YYYY\n• Vehicle Type [bus/car/tempo]\n• Number of Passengers [count]\n• Total Fare [amount]\n• Advance Paid [amount]\n• Remarks [optional notes]",
      });
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
