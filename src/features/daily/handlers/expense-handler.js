import { safeSendMessage } from "../utils/helpers.js";
import { capitalize } from "../utils/formatters.js";
import { recalculateCashHandover, getCompletionMessage } from "../utils/calculations.js";
import { sendSummary } from "../utils/messages.js";

export async function handleExpenseCommand(sock, sender, normalizedText, user) {
  const expensePattern = /(?:expense|ex)\s+([a-zA-Z]+)\s+(\d+)(?:\s+(online))?/gi;
  let anyExpenseAdded = false;
  
  try {
    let match;
    while ((match = expensePattern.exec(normalizedText)) !== null) {
      const [_, expenseName, amount, onlineFlag] = match;
      const mode = onlineFlag?.toLowerCase() === "online" ? "online" : "cash";

      if (!user.ExtraExpenses) user.ExtraExpenses = [];

      const existingIndex = user.ExtraExpenses.findIndex(
        (e) => e.name.toLowerCase() === expenseName.toLowerCase()
      );

      if (existingIndex !== -1) {
        user.ExtraExpenses[existingIndex] = {
          name: expenseName,
          amount: amount,
          mode,
        };
      } else {
        user.ExtraExpenses.push({
          name: expenseName,
          amount: amount,
          mode,
        });
      }
      
      anyExpenseAdded = true;
    }
    
    if (anyExpenseAdded) {
      recalculateCashHandover(user);
      // Don't send summary here, let field extraction send it
    }
    
    return anyExpenseAdded;
  } catch (err) {
    console.error("❌ Error handling expense command:", err);
    if (anyExpenseAdded) {
      // If we added some expenses before error, still return true
      return true;
    }
    await safeSendMessage(sock, sender, {
      text: "❌ Error adding expense. Please try again.",
    });
    return true;
  }
}

export async function handleExpenseDelete(sock, sender, normalizedText, user) {
  const deleteMatch = normalizedText.match(/expense\s+delete\s+([a-zA-Z]+)/i);
  if (!deleteMatch) return false;

  try {
    const deleteName = deleteMatch[1].trim();
    const index = user.ExtraExpenses.findIndex(
      (e) => e.name.toLowerCase() === deleteName.toLowerCase()
    );
    
    if (index !== -1) {
      user.ExtraExpenses.splice(index, 1);
      recalculateCashHandover(user);
      const completenessMsg = getCompletionMessage(user);
      await sendSummary(
        sock,
        sender,
        `🗑️ Expense *${capitalize(deleteName)}* deleted successfully!\n${completenessMsg}`,
        user
      );
    } else {
      await safeSendMessage(sock, sender, {
        text: `⚠️ Expense *${capitalize(deleteName)}* not found in your list.`,
      });
    }
    return true;
  } catch (err) {
    console.error("❌ Error handling expense delete:", err);
    return true;
  }
}
