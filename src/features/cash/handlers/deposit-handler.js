import { format } from "date-fns";
import db, { bookingsDb, cashDb } from "../../../utils/db.js";
import { getMenuState } from "../../../utils/menu-state.js";
import { 
  safeSendMessage, 
  generateDepositId, 
  updateEntryStatus, 
  saveDeposit,
  formatCurrency 
} from "../utils/helpers.js";
import { sendDepositConfirmation, sendInvalidDepositAmount } from "../utils/messages.js";

export async function handleDeposit(sock, sender, text, cashState) {
  try {
    const depositMatch = text.match(/^deposit\s+(\d+)(?:\s+(.+))?$/i);
    if (!depositMatch) {
      await safeSendMessage(sock, sender, { 
        text: "❌ Invalid format. Use: Deposit <amount> or Deposit <amount> <remarks>" 
      });
      return false;
    }
    
    const depositAmount = Number(depositMatch[1]);
    const remarks = depositMatch[2]?.trim() || "";
    
    const { dailyEntries, bookingEntries, previousBalance, totalAvailable, busCode } = cashState;
    
    if (depositAmount <= 0) {
      await safeSendMessage(sock, sender, { text: "❌ Deposit amount must be greater than 0." });
      return false;
    }
    
    if (depositAmount > totalAvailable) {
      await sendInvalidDepositAmount(sock, sender, totalAvailable);
      return false;
    }
    
    const today = format(new Date(), "dd/MM/yyyy");
    const depositId = generateDepositId(busCode, today);
    
    let remainingToDeposit = depositAmount;
    const usedDailyEntries = [];
    const usedBookingEntries = [];
    let fromDaily = 0;
    let fromBookings = 0;
    let fromBalance = 0;
    
    for (const entry of dailyEntries) {
      if (remainingToDeposit <= 0) break;
      
      if (entry.amount <= remainingToDeposit) {
        usedDailyEntries.push(entry.id);
        fromDaily += entry.amount;
        remainingToDeposit -= entry.amount;
        await updateEntryStatus(entry.id, false);
      } else {
        break;
      }
    }
    
    for (const entry of bookingEntries) {
      if (remainingToDeposit <= 0) break;
      
      if (entry.amount <= remainingToDeposit) {
        usedBookingEntries.push(entry.id);
        fromBookings += entry.amount;
        remainingToDeposit -= entry.amount;
        await updateEntryStatus(entry.id, true);
      } else {
        break;
      }
    }
    
    if (remainingToDeposit > 0 && remainingToDeposit <= previousBalance) {
      fromBalance = remainingToDeposit;
      remainingToDeposit = 0;
    }
    
    if (remainingToDeposit > 0) {
      const actuallyConsumed = fromDaily + fromBookings + fromBalance;
      await safeSendMessage(sock, sender, {
        text: `❌ Cannot deposit ₹${formatCurrency(depositAmount)}.\n\n` +
              `Only ₹${formatCurrency(actuallyConsumed)} can be consumed from complete entries.\n\n` +
              `💡 *Tip:* Deposit amounts must match the sum of complete entries.\n` +
              `Available entries (FIFO order) shown in summary above.`
      });
      return false;
    }
    
    const newBalance = totalAvailable - depositAmount;
    
    const depositData = {
      depositId,
      sender,
      busCode,
      amount: depositAmount,
      dailyEntries: usedDailyEntries,
      bookingEntries: usedBookingEntries,
      breakdown: {
        fromDaily,
        fromBookings,
        fromBalance
      },
      balance: {
        Amount: newBalance
      },
      remarks,
      depositedAt: new Date().toISOString()
    };
    
    await saveDeposit(depositData);
    
    await sendDepositConfirmation(sock, sender, depositData);
    
    return true;
  } catch (err) {
    console.error("❌ handleDeposit error:", err);
    await safeSendMessage(sock, sender, { text: "❌ Failed to process deposit. Please try again." });
    return false;
  }
}
