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
      NumberOfPassengers: user.NumberOfPassengers,
      TotalFare: user.TotalFare,
      AdvancePaid: user.AdvancePaid,
      BalanceAmount: user.BalanceAmount || (user.TotalFare - user.AdvancePaid),
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
    summary += `👤 Customer: ${user.CustomerName}\n`;
    summary += `📱 Phone: ${user.CustomerPhone}\n`;
    summary += `📍 Route: ${user.PickupLocation} → ${user.DropLocation}\n`;
    summary += `📅 Travel Date: ${user.TravelDate}\n`;
    summary += `🚐 Vehicle: ${user.VehicleType}\n`;
    summary += `👥 Passengers: ${user.NumberOfPassengers}\n`;
    summary += `💰 Total Fare: ₹${user.TotalFare}\n`;
    summary += `💵 Advance: ₹${user.AdvancePaid}\n`;
    summary += `💸 Balance: ₹${bookingRecord.BalanceAmount}\n`;
    summary += `📊 Status: ${bookingRecord.Status}\n`;
    if (user.Remarks) summary += `📝 Remarks: ${user.Remarks}\n`;

    await safeSendMessage(sock, sender, { text: summary });

    delete global.bookingData[sender];
    return true;
  }
  return false;
}
