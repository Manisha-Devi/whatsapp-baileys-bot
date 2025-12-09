import { safeSendMessage } from "../utils/helpers.js";
import { capitalize } from "../utils/formatters.js";
import { recalculateCashHandover, getCompletionMessage } from "../utils/calculations.js";
import { sendSummary } from "../utils/messages.js";

export async function handleEmployeeExpenseCommand(sock, sender, normalizedText, user) {
  const driverPattern = /^driver\s+(\d+)(?:\s+(online))?$/i;
  const conductorPattern = /^conductor\s+(\d+)(?:\s+(online))?$/i;
  
  let match = normalizedText.match(driverPattern);
  let role = "Driver";
  
  if (!match) {
    match = normalizedText.match(conductorPattern);
    role = "Conductor";
  }
  
  if (!match) return false;

  try {
    const amount = parseFloat(match[1]);
    const mode = match[2]?.toLowerCase() === "online" ? "online" : "cash";

    if (!user.EmployExpenses) user.EmployExpenses = [];

    const existingIndex = user.EmployExpenses.findIndex(
      (e) => e.name.toLowerCase() === role.toLowerCase()
    );

    const oldValue = existingIndex !== -1 ? user.EmployExpenses[existingIndex] : null;

    if (oldValue && (oldValue.amount !== amount || oldValue.mode !== mode)) {
      user.waitingForUpdate = {
        field: role,
        value: { amount, mode },
        type: "employee",
      };
      await safeSendMessage(sock, sender, {
        text: `⚠️ *${role}* already has value *₹${oldValue.amount} (${oldValue.mode})*.\nDo you want to update it to *₹${amount} (${mode})*? (yes/no)`,
      });
      return true;
    }

    if (existingIndex !== -1) {
      user.EmployExpenses[existingIndex] = {
        name: role,
        amount: amount,
        mode,
      };
    } else {
      user.EmployExpenses.push({
        name: role,
        amount: amount,
        mode,
      });
    }

    recalculateCashHandover(user);
    const completenessMsg = getCompletionMessage(user);
    
    const actionMsg = `✅ *${role}* added: ₹${amount}${mode === "online" ? " (online)" : " (cash)"}!`;
    
    await sendSummary(sock, sender, `${actionMsg}\n${completenessMsg}`, user);
    return true;
  } catch (err) {
    console.error("❌ Error handling employee expense command:", err);
    await safeSendMessage(sock, sender, {
      text: `❌ Error setting ${role}. Please try again with format: ${role.toLowerCase()} [amount]`,
    });
    return true;
  }
}

export async function handleExpenseCommand(sock, sender, normalizedText, user) {
  const expensePattern = /(?:expense|ex)\s+([a-zA-Z]+)\s+(\d+)(?:\s+(online))?/i;
  const match = normalizedText.match(expensePattern);
  
  if (!match) return false;

  try {
    const [_, expenseName, amount, onlineFlag] = match;
    const mode = onlineFlag?.toLowerCase() === "online" ? "online" : "cash";

    if (!user.ExtraExpenses) user.ExtraExpenses = [];

    const existingIndex = user.ExtraExpenses.findIndex(
      (e) => e.name.toLowerCase() === expenseName.toLowerCase()
    );

    if (existingIndex !== -1) {
      user.ExtraExpenses[existingIndex] = {
        name: expenseName,
        amount: parseFloat(amount),
        mode,
      };
    } else {
      user.ExtraExpenses.push({
        name: expenseName,
        amount: parseFloat(amount),
        mode,
      });
    }

    recalculateCashHandover(user);
    const completenessMsg = getCompletionMessage(user);
    await sendSummary(
      sock,
      sender,
      `✅ Expense *${capitalize(expenseName)}* added!\n${completenessMsg}`,
      user
    );
    return true;
  } catch (err) {
    console.error("❌ Error handling expense command:", err);
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
