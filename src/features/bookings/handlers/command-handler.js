import { safeSendMessage } from "../utils/helpers.js";

export async function handleClearCommand(sock, sender, text) {
  if (text === "clear" || text === "clear booking") {
    if (global.bookingData && global.bookingData[sender]) {
      delete global.bookingData[sender];
      await safeSendMessage(sock, sender, {
        text: "✅ Booking session cleared. You can start a new booking.",
      });
      return true;
    }
  }
  return false;
}

export async function handleBookingCommand(sock, sender, normalizedText, user) {
  const bookingIdMatch = normalizedText.match(/^booking\s+([A-Z0-9]+)$/i);
  if (bookingIdMatch) {
    const bookingId = bookingIdMatch[1].toUpperCase();
    await safeSendMessage(sock, sender, {
      text: `🔍 Fetching booking ${bookingId}...\n\n⚠️ Feature under development`,
    });
    return true;
  }

  const dateMatch = normalizedText.match(/^booking\s+(\d{2}\/\d{2}\/\d{4})$/);
  if (dateMatch) {
    await safeSendMessage(sock, sender, {
      text: `🔍 Fetching bookings for ${dateMatch[1]}...\n\n⚠️ Feature under development`,
    });
    return true;
  }

  return false;
}
