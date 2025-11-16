import { safeSendMessage } from "../utils/helpers.js";

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
    
    let summary = `✅ *Booking Submitted - ${bookingId}*\n\n`;
    summary += `👤 Customer: ${user.CustomerName}\n`;
    summary += `📱 Phone: ${user.CustomerPhone}\n`;
    summary += `📍 Route: ${user.PickupLocation} → ${user.DropLocation}\n`;
    summary += `📅 Travel Date: ${user.TravelDate}\n`;
    summary += `🚐 Vehicle: ${user.VehicleType}\n`;
    summary += `👥 Passengers: ${user.NumberOfPassengers}\n`;
    summary += `💰 Total Fare: ₹${user.TotalFare}\n`;
    summary += `💵 Advance: ₹${user.AdvancePaid}\n`;
    summary += `💸 Balance: ₹${user.BalanceAmount || 0}\n`;
    summary += `📊 Status: ${user.Status}\n`;
    if (user.Remarks) summary += `📝 Remarks: ${user.Remarks}\n`;

    await safeSendMessage(sock, sender, { text: summary });

    delete global.bookingData[sender];
    return true;
  }
  return false;
}
