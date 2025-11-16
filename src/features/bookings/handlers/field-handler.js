import { safeSendMessage } from "../utils/helpers.js";

export async function handleFieldExtraction(sock, sender, normalizedText, user) {
  let anyFieldFound = false;

  const customerNameMatch = normalizedText.match(/^customer\s+name\s+(.+)$/i);
  if (customerNameMatch) {
    user.CustomerName = customerNameMatch[1].trim();
    anyFieldFound = true;
  }

  const phoneMatch = normalizedText.match(/^customer\s+phone\s+(\d{10})$/i);
  if (phoneMatch) {
    user.CustomerPhone = phoneMatch[1];
    anyFieldFound = true;
  }

  const pickupMatch = normalizedText.match(/^pickup\s+location\s+(.+)$/i);
  if (pickupMatch) {
    user.PickupLocation = pickupMatch[1].trim();
    anyFieldFound = true;
  }

  const dropMatch = normalizedText.match(/^drop\s+location\s+(.+)$/i);
  if (dropMatch) {
    user.DropLocation = dropMatch[1].trim();
    anyFieldFound = true;
  }

  const travelDateMatch = normalizedText.match(/^travel\s+date\s+(\d{2}\/\d{2}\/\d{4})$/i);
  if (travelDateMatch) {
    user.TravelDate = travelDateMatch[1];
    anyFieldFound = true;
  }

  const vehicleMatch = normalizedText.match(/^vehicle\s+type\s+(.+)$/i);
  if (vehicleMatch) {
    user.VehicleType = vehicleMatch[1].trim();
    anyFieldFound = true;
  }

  const passengersMatch = normalizedText.match(/^number\s+of\s+passengers\s+(\d+)$/i);
  if (passengersMatch) {
    user.NumberOfPassengers = parseInt(passengersMatch[1]);
    anyFieldFound = true;
  }

  const fareMatch = normalizedText.match(/^total\s+fare\s+(\d+)$/i);
  if (fareMatch) {
    user.TotalFare = parseInt(fareMatch[1]);
    anyFieldFound = true;
  }

  const advanceMatch = normalizedText.match(/^advance\s+paid\s+(\d+)$/i);
  if (advanceMatch) {
    user.AdvancePaid = parseInt(advanceMatch[1]);
    if (user.TotalFare) {
      user.BalanceAmount = user.TotalFare - user.AdvancePaid;
    }
    anyFieldFound = true;
  }

  const remarksMatch = normalizedText.match(/^remarks\s+(.+)$/i);
  if (remarksMatch) {
    user.Remarks = remarksMatch[1].trim();
    anyFieldFound = true;
  }

  return { handled: false, anyFieldFound };
}
