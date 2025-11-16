import { safeSendMessage } from "./helpers.js";

export async function sendSummary(sock, sender, completenessMsg, user) {
  let msg = "📋 *Current Booking Details*\n\n";

  if (user.CustomerName) msg += `👤 Customer Name: ${user.CustomerName}\n`;
  if (user.CustomerPhone) msg += `📱 Phone: ${user.CustomerPhone}\n`;
  if (user.PickupLocation) msg += `📍 Pickup: ${user.PickupLocation}\n`;
  if (user.DropLocation) msg += `📍 Drop: ${user.DropLocation}\n`;
  if (user.TravelDate) msg += `📅 Travel Date: ${user.TravelDate}\n`;
  if (user.VehicleType) msg += `🚐 Vehicle: ${user.VehicleType}\n`;
  if (user.NumberOfPassengers) msg += `👥 Passengers: ${user.NumberOfPassengers}\n`;
  if (user.TotalFare) msg += `💰 Total Fare: ₹${user.TotalFare}\n`;
  if (user.AdvancePaid) msg += `💵 Advance Paid: ₹${user.AdvancePaid}\n`;
  if (user.BalanceAmount !== null && user.BalanceAmount !== undefined) {
    msg += `💸 Balance: ₹${user.BalanceAmount}\n`;
  }
  if (user.Status) msg += `📊 Status: ${user.Status}\n`;
  if (user.Remarks) msg += `📝 Remarks: ${user.Remarks}\n`;

  msg += `\n${completenessMsg}`;

  await safeSendMessage(sock, sender, { text: msg });
}

export function getCompletionMessage(user) {
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

  if (missingFields.length === 0) {
    user.waitingForSubmit = true;
    return "✅ All required fields complete! Type *submit* to confirm.";
  } else {
    user.waitingForSubmit = false;
    return `⚠️ Missing: ${missingFields.join(", ")}`;
  }
}
