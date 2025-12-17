import { format, parse, isValid } from "date-fns";
import { getMenuState, getSelectedBus } from "../../utils/menu-state.js";
import { 
  safeSendMessage, 
  getInitiatedDailyEntries, 
  getInitiatedBookingEntries, 
  getPreviousBalance,
  filterEntriesByDate
} from "./utils/helpers.js";
import { sendCashSummary, sendNoCashAvailable, showCashHelp } from "./utils/messages.js";
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
    
    if (text === "help" || text === "h") {
      await showCashHelp(sock, sender);
      return true;
    }
    
    const dateMatch = normalizedText.match(/^date\s+(.+)$/i);
    if (dateMatch) {
      const dateInput = dateMatch[1].trim().toLowerCase();
      let targetDate;
      
      if (dateInput === "today") {
        targetDate = new Date();
      } else {
        const parsed = parse(dateInput, "dd/MM/yyyy", new Date());
        if (isValid(parsed)) {
          targetDate = parsed;
        } else {
          await safeSendMessage(sock, sender, {
            text: "❌ Invalid date format. Use: Date today or Date DD/MM/YYYY"
          });
          return true;
        }
      }
      
      const dailyEntries = await getInitiatedDailyEntries(busCode);
      const bookingEntries = await getInitiatedBookingEntries(busCode);
      const previousBalance = await getPreviousBalance(busCode);
      
      const filteredDaily = filterEntriesByDate(dailyEntries, targetDate);
      const filteredBookings = filterEntriesByDate(bookingEntries, targetDate);
      
      const dailyTotal = filteredDaily.reduce((sum, e) => sum + e.amount, 0);
      const bookingTotal = filteredBookings.reduce((sum, e) => sum + e.amount, 0);
      const totalAvailable = dailyTotal + bookingTotal + previousBalance;
      
      cashUserData[sender] = {
        busCode,
        dailyEntries: filteredDaily,
        bookingEntries: filteredBookings,
        previousBalance,
        totalAvailable,
        filterDate: format(targetDate, "dd/MM/yyyy")
      };
      
      if (totalAvailable === 0) {
        await sendNoCashAvailable(sock, sender, format(targetDate, "dd/MM/yyyy"));
        delete cashUserData[sender];
        return true;
      }
      
      await sendCashSummary(sock, sender, cashUserData[sender]);
      return true;
    }
    
    if (text.startsWith("deposit")) {
      if (!cashUserData[sender]) {
        await safeSendMessage(sock, sender, {
          text: "⚠️ Please first select a date.\n\nExample: *Date today* or *Date 15/12/2025*"
        });
        return true;
      }
      
      const success = await handleDeposit(sock, sender, normalizedText, cashUserData[sender]);
      if (success) {
        delete cashUserData[sender];
      }
      return true;
    }
    
    await showCashHelp(sock, sender);
    return true;
    
  } catch (err) {
    console.error("❌ handleIncomingMessageFromCash error:", err);
    return false;
  }
}

export function clearCashSession(sender) {
  delete cashUserData[sender];
}
