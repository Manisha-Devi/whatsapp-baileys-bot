import { safeSendMessage } from "./utils/helpers.js";

function toNum(value) {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function formatFullDate(dateInput) {
  try {
    if (!dateInput) return "Unknown Date";

    if (dateInput.includes(",") && dateInput.includes(" ")) return dateInput;

    let dateObj;
    if (dateInput.includes("/")) {
      const [day, month, year] = dateInput.split("/");
      dateObj = new Date(`${year}-${month}-${day}`);
    } else {
      dateObj = new Date(dateInput);
    }

    if (isNaN(dateObj.getTime())) return dateInput;

    return dateObj.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateInput;
  }
}

export async function handleBookingStatus(sock, sender, normalizedText) {
  try {
    const match = normalizedText.match(/^booking\s+status\s+(pending|confirmed|completed|cancelled)$/i);
    if (!match) return false;

    const statusQuery = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();

    await safeSendMessage(sock, sender, {
      text: `📊 Booking Status for *${statusQuery}* - Feature under development`,
    });
    return true;
  } catch (err) {
    console.error("❌ Error in handleBookingStatus:", err);
    await safeSendMessage(sock, sender, {
      text: "⚠️ Error retrieving booking status.",
    });
    return true;
  }
}

export async function handleBookingStatusUpdate(sock, sender, normalizedText) {
  try {
    const match = normalizedText.match(
      /^update\s+booking\s+status\s+(.+?)\s+(confirmed|completed|cancelled)(?:\s+remarks\s+(.+))?$/i
    );
    if (!match) return false;

    const bookingId = match[1].trim();
    const requestedStatusRaw = match[2].trim();
    const remarksRaw = match[3]?.trim() ?? null;

    const newStatus = requestedStatusRaw.charAt(0).toUpperCase() + requestedStatusRaw.slice(1);

    await safeSendMessage(sock, sender, {
      text: `✅ Booking Status Update - Feature under development\nBooking: ${bookingId}\nNew Status: ${newStatus}${remarksRaw ? `\nRemarks: ${remarksRaw}` : ""}`,
    });
    return true;
  } catch (err) {
    console.error("❌ Error in handleBookingStatusUpdate:", err);
    await safeSendMessage(sock, sender, {
      text: "⚠️ Error updating booking status.",
    });
    return true;
  }
}
