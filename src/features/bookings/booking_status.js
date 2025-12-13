import { safeSendMessage, safeDbRead, safeDbWrite } from "./utils/helpers.js";
import { bookingsDb, bookingsStatusDb } from "../../utils/db.js";

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
    const match = normalizedText.match(/^status\s+(pending|confirmed|completed|cancelled)$/i);
    if (!match) return false;

    const statusQuery = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();

    await safeDbRead(bookingsDb);
    const allBookings = bookingsDb.data || {};

    // Filter bookings by status
    const matchingBookings = Object.values(allBookings).filter(
      (booking) => booking.Status?.toLowerCase() === statusQuery.toLowerCase()
    );

    if (matchingBookings.length === 0) {
      await safeSendMessage(sock, sender, {
        text: `📊 *Bookings with Status: ${statusQuery}*\n\nNo bookings found with this status.`,
      });
      return true;
    }

    let response = `📊 *Bookings with Status: ${statusQuery}*\n\n`;
    let totalBalance = 0;

    matchingBookings.forEach((booking, index) => {
      response += `${index + 1}. *${booking.BookingId}*\n`;
      response += `📅 ${booking.TravelDate}\n`;
      response += `👤 ${booking.CustomerName} (${booking.CustomerPhone})\n`;
      response += `📍 ${booking.PickupLocation} → ${booking.DropLocation}\n`;
      response += `🚐 ${booking.VehicleType} (${booking.NumberOfPassengers} passengers)\n`;
      response += `💰 Total: ₹${booking.TotalFare} | Paid: ₹${booking.AdvancePaid} | Balance: ₹${booking.BalanceAmount}\n`;
      if (booking.Remarks) response += `📝 ${booking.Remarks}\n`;
      response += `\n`;
      totalBalance += toNum(booking.BalanceAmount);
    });

    response += `📊 *Total ${statusQuery} Bookings:* ${matchingBookings.length}\n`;
    response += `💵 *Total Balance Amount:* ₹${totalBalance}`;

    await safeSendMessage(sock, sender, { text: response });
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
      /^update\s+status\s+(.+?)\s+(pending|confirmed|completed|cancelled)(?:\s+remarks\s+(.+))?$/i
    );
    if (!match) return false;

    const bookingId = match[1].trim().toUpperCase();
    const requestedStatusRaw = match[2].trim();
    const remarksRaw = match[3]?.trim() ?? null;

    const newStatus = requestedStatusRaw.charAt(0).toUpperCase() + requestedStatusRaw.slice(1);

    // Read database
    await safeDbRead(bookingsDb);
    
    // Check if booking exists
    if (!bookingsDb.data[bookingId]) {
      await safeSendMessage(sock, sender, {
        text: `❌ Booking ${bookingId} not found in database.`,
      });
      return true;
    }

    // Get old status
    const oldStatus = bookingsDb.data[bookingId].Status;

    // Update booking status in main database
    bookingsDb.data[bookingId].Status = newStatus;
    if (remarksRaw) {
      bookingsDb.data[bookingId].StatusRemarks = remarksRaw;
    }
    bookingsDb.data[bookingId].lastUpdated = new Date().toISOString();

    const saved = await safeDbWrite(bookingsDb);

    if (!saved) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ Error updating booking status in database.",
      });
      return true;
    }

    // Log status change in status database
    await safeDbRead(bookingsStatusDb);
    bookingsStatusDb.data.push({
      bookingId: bookingId,
      oldStatus: oldStatus,
      newStatus: newStatus,
      remarks: remarksRaw || "",
      updatedBy: sender,
      updatedAt: new Date().toISOString(),
    });
    await safeDbWrite(bookingsStatusDb);

    let response = `✅ *Booking Status Updated*\n\n`;
    response += `🎫 Booking ID: ${bookingId}\n`;
    response += `📊 Status: ${oldStatus} → ${newStatus}\n`;
    if (remarksRaw) response += `📝 Remarks: ${remarksRaw}\n`;

    await safeSendMessage(sock, sender, { text: response });
    return true;
  } catch (err) {
    console.error("❌ Error in handleBookingStatusUpdate:", err);
    await safeSendMessage(sock, sender, {
      text: "⚠️ Error updating booking status.",
    });
    return true;
  }
}
