import { getMenuState, getSelectedBus } from "../../utils/menu-state.js";
import { 
  safeSendMessage, 
  getInitiatedDailyEntries, 
  getInitiatedBookingEntries, 
  getPreviousBalance 
} from "./utils/helpers.js";
import { sendCashSummary, sendNoCashAvailable } from "./utils/messages.js";
import { handleDeposit } from "./handlers/deposit-handler.js";

const cashUserData = {};

export async function handleIncomingMessageFromCash(sock, msg) {
  try {
    if (!msg || !msg.key) {
      console.warn("⚠️ Received malformed or empty msg:", msg);
      return;
    }

    const sender = msg.key.remoteJid;
    
    if (sender && sender.endsWith("@g.us")) {
      console.log("🚫 Ignored group message from:", sender);
      return;
    }

    const messageContent =
      msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!messageContent) return;
    
    if (msg.key.fromMe) return;

    const textRaw = String(messageContent);
    const normalizedText = textRaw.trim();
    const text = normalizedText.toLowerCase();
    
    const selectedBus = getSelectedBus(sender);
    if (!selectedBus) {
      await safeSendMessage(sock, sender, {
        text: "⚠️ Please select a bus first. Type *Entry* to start."
      });
      return;
    }
    
    const busCode = selectedBus;
    
    if (text === "back" || text === "exit" || text === "e") {
      delete cashUserData[sender];
      return false;
    }
    
    if (!cashUserData[sender]) {
      const dailyEntries = await getInitiatedDailyEntries(busCode);
      const bookingEntries = await getInitiatedBookingEntries(busCode);
      const previousBalance = await getPreviousBalance(busCode);
      
      const dailyTotal = dailyEntries.reduce((sum, e) => sum + e.amount, 0);
      const bookingTotal = bookingEntries.reduce((sum, e) => sum + e.amount, 0);
      const totalAvailable = dailyTotal + bookingTotal + previousBalance;
      
      cashUserData[sender] = {
        busCode,
        dailyEntries,
        bookingEntries,
        previousBalance,
        totalAvailable
      };
      
      if (totalAvailable === 0) {
        await sendNoCashAvailable(sock, sender);
        delete cashUserData[sender];
        return true;
      }
      
      await sendCashSummary(sock, sender, cashUserData[sender]);
      return true;
    }
    
    if (text.startsWith("deposit")) {
      const success = await handleDeposit(sock, sender, normalizedText, cashUserData[sender]);
      if (success) {
        delete cashUserData[sender];
      }
      return true;
    }
    
    await safeSendMessage(sock, sender, {
      text: `❌ Invalid command.\n\nReply *"Deposit <amount>"* to deposit cash\nReply *"Back"* to return to menu`
    });
    return true;
    
  } catch (err) {
    console.error("❌ handleIncomingMessageFromCash error:", err);
    return false;
  }
}

export function clearCashSession(sender) {
  delete cashUserData[sender];
}
