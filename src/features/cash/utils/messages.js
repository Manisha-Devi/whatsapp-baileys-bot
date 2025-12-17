import { safeSendMessage, formatCurrency } from "./helpers.js";
import { getMenuState } from "../../../utils/menu-state.js";

export async function sendCashSummary(sock, jid, summaryData) {
  try {
    const { dailyEntries, bookingEntries, previousBalance, totalAvailable, busCode } = summaryData;
    
    const menuState = getMenuState(jid);
    const regNumber = menuState?.selectedBusInfo?.registrationNumber || busCode;
    
    let msg = `💰 *Cash Available Summary* (*${regNumber}*)\n\n`;
    
    if (dailyEntries.length > 0) {
      msg += `📊 *From Daily Entries (Status: Initiated):*\n`;
      let dailySubtotal = 0;
      for (const entry of dailyEntries) {
        msg += `   - ${entry.id}: ₹${formatCurrency(entry.amount)}\n`;
        dailySubtotal += entry.amount;
      }
      msg += `   *Subtotal: ₹${formatCurrency(dailySubtotal)}*\n\n`;
    } else {
      msg += `📊 *From Daily Entries:* None\n\n`;
    }
    
    if (bookingEntries.length > 0) {
      msg += `🚌 *From Bookings (Status: Initiated):*\n`;
      let bookingSubtotal = 0;
      for (const entry of bookingEntries) {
        msg += `   - ${entry.id}: ₹${formatCurrency(entry.amount)}\n`;
        bookingSubtotal += entry.amount;
      }
      msg += `   *Subtotal: ₹${formatCurrency(bookingSubtotal)}*\n\n`;
    } else {
      msg += `🚌 *From Bookings:* None\n\n`;
    }
    
    msg += `💵 *Previous Balance:* ₹${formatCurrency(previousBalance)}\n\n`;
    msg += `✨ *Total Cash Available: ₹${formatCurrency(totalAvailable)}*\n\n`;
    msg += `Reply *"Deposit <amount>"* (e.g., Deposit 15000)\n`;
    msg += `Optional: *"Deposit 15000 SBI Bank"* (with remarks)\n`;
    msg += `Reply *"Back"* to return to menu`;
    
    await safeSendMessage(sock, jid, { text: msg });
  } catch (err) {
    console.error("❌ sendCashSummary error:", err);
    await safeSendMessage(sock, jid, { text: "❌ Failed to show cash summary." });
  }
}

export async function sendDepositConfirmation(sock, jid, depositData) {
  try {
    const { depositId, amount, dailyEntries, bookingEntries, breakdown, balance, remarks } = depositData;
    
    let msg = `✅ *Deposit Successful*\n\n`;
    msg += `🆔 Deposit ID: ${depositId}\n`;
    msg += `💵 Amount Deposited: ₹${formatCurrency(amount)}\n\n`;
    
    msg += `📊 *Breakdown:*\n`;
    msg += `   From Daily: ₹${formatCurrency(breakdown.fromDaily)}\n`;
    msg += `   From Bookings: ₹${formatCurrency(breakdown.fromBookings)}\n`;
    msg += `   From Balance: ₹${formatCurrency(breakdown.fromBalance)}\n\n`;
    
    if (dailyEntries.length > 0) {
      msg += `📋 *Daily Entries Updated (→ Deposited):*\n`;
      for (const id of dailyEntries) {
        msg += `   - ${id}\n`;
      }
      msg += `\n`;
    }
    
    if (bookingEntries.length > 0) {
      msg += `📋 *Booking Entries Updated (→ Deposited):*\n`;
      for (const id of bookingEntries) {
        msg += `   - ${id}\n`;
      }
      msg += `\n`;
    }
    
    msg += `💰 *Remaining Balance:* ₹${formatCurrency(balance.Amount)}\n`;
    
    if (remarks) {
      msg += `📝 *Remarks:* ${remarks}\n`;
    }
    
    msg += `\n✅ All entries status updated to Deposited!`;
    
    await safeSendMessage(sock, jid, { text: msg });
  } catch (err) {
    console.error("❌ sendDepositConfirmation error:", err);
    await safeSendMessage(sock, jid, { text: "❌ Failed to send deposit confirmation." });
  }
}

export async function sendNoCashAvailable(sock, jid) {
  const msg = `💰 *Cash Management*\n\n⚠️ No cash available for deposit.\n\nAll entries are either already deposited or have no cash handover.\n\nReply *"Back"* to return to menu`;
  await safeSendMessage(sock, jid, { text: msg });
}

export async function sendInvalidDepositAmount(sock, jid, maxAmount) {
  const msg = `❌ Invalid deposit amount.\n\nMaximum available: ₹${formatCurrency(maxAmount)}\n\nPlease enter a valid amount.`;
  await safeSendMessage(sock, jid, { text: msg });
}
