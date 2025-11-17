import { safeSendMessage, safeDbRead, safeDbWrite } from "../utils/helpers.js";
import { bookingsDb } from "../../../data/db.js";

export async function handleSubmit(sock, sender, text, user) {
  if (text === "submit" && user.waitingForSubmit) {
    const requiredFields = [
      "CustomerName",
      "CustomerPhone",
      "PickupLocation",
      "DropLocation",
      "TravelDate",
      "VehicleType",
      "NumberOfPassengers",
      "TotalFare",
      "AdvancePaid",
    ];

    const missingFields = requiredFields.filter((field) => !user[field]);

    if (missingFields.length > 0) {
      await safeSendMessage(sock, sender, {
        text: `⚠️ Cannot submit. Missing fields: ${missingFields.join(", ")}`,
      });
      return true;
    }

    // Parse and validate numeric fields
    const totalFare = Number(String(user.TotalFare).replace(/,/g, ''));
    const advancePaid = Number(String(user.AdvancePaid).replace(/,/g, ''));
    const numPassengers = Number(user.NumberOfPassengers);

    if (isNaN(totalFare) || totalFare <= 0) {
      await safeSendMessage(sock, sender, {
        text: `⚠️ Invalid Total Fare. Please enter a valid number.`,
      });
      return true;
    }

    if (isNaN(advancePaid) || advancePaid < 0) {
      await safeSendMessage(sock, sender, {
        text: `⚠️ Invalid Advance Paid. Please enter a valid number.`,
      });
      return true;
    }

    if (isNaN(numPassengers) || numPassengers <= 0) {
      await safeSendMessage(sock, sender, {
        text: `⚠️ Invalid Number of Passengers. Please enter a valid number.`,
      });
      return true;
    }

    const balanceAmount = totalFare - advancePaid;

    if (balanceAmount < 0) {
      await safeSendMessage(sock, sender, {
        text: `⚠️ Advance Paid (₹${advancePaid}) cannot be greater than Total Fare (₹${totalFare}).`,
      });
      return true;
    }

    const bookingId = `BK${Date.now().toString().slice(-6)}`;
    
    // Prepare booking record for database
    const bookingRecord = {
      BookingId: bookingId,
      BookingDate: user.BookingDate,
      CustomerName: user.CustomerName,
      CustomerPhone: user.CustomerPhone,
      PickupLocation: user.PickupLocation,
      DropLocation: user.DropLocation,
      TravelDate: user.TravelDate,
      VehicleType: user.VehicleType,
      NumberOfPassengers: numPassengers,
      TotalFare: totalFare,
      AdvancePaid: advancePaid,
      BalanceAmount: balanceAmount,
      Status: user.Status || "Pending",
      Remarks: user.Remarks || "",
      submittedAt: new Date().toISOString(),
      submittedBy: sender,
    };

    // Save to database
    await safeDbRead(bookingsDb);
    bookingsDb.data[bookingId] = bookingRecord;
    const saved = await safeDbWrite(bookingsDb);

    if (!saved) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ Error saving booking to database. Please try again.",
      });
      return true;
    }
    
    let summary = `✅ *Booking Submitted - ${bookingId}*\n\n`;
    summary += `👤 Customer: ${bookingRecord.CustomerName}\n`;
    summary += `📱 Phone: ${bookingRecord.CustomerPhone}\n`;
    summary += `📍 Route: ${bookingRecord.PickupLocation} → ${bookingRecord.DropLocation}\n`;
    summary += `📅 Travel Date: ${bookingRecord.TravelDate}\n`;
    summary += `🚐 Vehicle: ${bookingRecord.VehicleType}\n`;
    summary += `👥 Passengers: ${bookingRecord.NumberOfPassengers}\n`;
    summary += `💰 Total Fare: ₹${bookingRecord.TotalFare}\n`;
    summary += `💵 Advance: ₹${bookingRecord.AdvancePaid}\n`;
    summary += `💸 Balance: ₹${bookingRecord.BalanceAmount}\n`;
    summary += `📊 Status: ${bookingRecord.Status}\n`;
    if (bookingRecord.Remarks) summary += `📝 Remarks: ${bookingRecord.Remarks}\n`;

    await safeSendMessage(sock, sender, { text: summary });

    delete global.bookingData[sender];
    return true;
  }
  return false;
}
