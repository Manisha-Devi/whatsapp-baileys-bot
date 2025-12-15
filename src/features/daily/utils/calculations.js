/**
 * Calculations Module
 * 
 * This module provides calculation utilities for daily bus report data.
 * It handles the automatic computation of cash handover amounts and
 * determines the data entry completion status.
 * 
 * Key calculations:
 * - Cash Handover = Total Cash Collection - (All Cash Expenses)
 * - Only cash payments are subtracted; online payments are excluded
 * 
 * @module features/daily/utils/calculations
 */

/**
 * Recalculates the cash handover amount based on user's entered data.
 * 
 * Cash Handover represents the net cash amount to be handed over after
 * subtracting all cash expenses from the total cash collection.
 * Online payments are not included in this calculation as they don't
 * affect physical cash flow.
 * 
 * Formula:
 * CashHandover = TotalCashCollection - (Diesel + Adda + Union + ExtraExpenses + EmployExpenses)
 * (Only counting amounts with mode = "cash")
 * 
 * @param {Object} user - User's session data object containing expense and collection data
 * @param {Object} user.Diesel - Diesel expense {amount, mode}
 * @param {Object} user.Adda - Adda expense {amount, mode}
 * @param {Object} user.Union - Union expense {amount, mode}
 * @param {Object} user.TotalCashCollection - Total cash collected {amount}
 * @param {Array} user.ExtraExpenses - Array of extra expenses [{name, amount, mode}]
 * @param {Array} user.EmployExpenses - Array of employee expenses [{name, amount, mode}]
 * @returns {string} The calculated cash handover amount as a string
 * 
 * @example
 * const user = {
 *   Diesel: { amount: "500", mode: "cash" },
 *   Adda: { amount: "100", mode: "cash" },
 *   Union: { amount: "50", mode: "online" }, // Not counted (online)
 *   TotalCashCollection: { amount: "5000" },
 *   ExtraExpenses: [],
 *   EmployExpenses: [{ name: "Driver", amount: 400, mode: "cash" }]
 * };
 * recalculateCashHandover(user); // CashHandover = 5000 - (500 + 100 + 0 + 0 + 400) = 4000
 */
export function recalculateCashHandover(user) {
  try {
    // Extract cash expenses only (ignore online payments)
    const diesel = user.Diesel?.mode === "cash" ? parseFloat(user.Diesel?.amount || 0) : 0;
    const adda = user.Adda?.mode === "cash" ? parseFloat(user.Adda?.amount || 0) : 0;
    const union = user.Union?.mode === "cash" ? parseFloat(user.Union?.amount || 0) : 0;

    // Get total cash collection (the inflow amount)
    const totalCollection = parseFloat(user.TotalCashCollection?.amount || user.TotalCashCollection) || 0;

    // Sum up extra expenses that were paid in cash
    const extraTotal = (user.ExtraExpenses || []).reduce(
      (sum, e) => sum + (e.mode === "cash" ? parseFloat(e.amount) || 0 : 0),
      0
    );

    // Sum up employee expenses that were paid in cash
    const employTotal = (user.EmployExpenses || []).reduce(
      (sum, e) => sum + (e.mode === "cash" ? parseFloat(e.amount) || 0 : 0),
      0
    );

    // Calculate net cash handover (collection minus all cash expenses)
    const autoHandover = totalCollection - (diesel + adda + union + extraTotal + employTotal);
    
    // Store the result, handling edge cases like NaN or Infinity
    user.CashHandover = { amount: isFinite(autoHandover) ? autoHandover.toFixed(0) : "0" };
    return user.CashHandover.amount;
  } catch (err) {
    console.error("❌ Error recalculating CashHandover:", err);
    // Preserve existing value or set to 0 on error
    user.CashHandover = user.CashHandover || { amount: "0" };
    return user.CashHandover.amount || "0";
  }
}

/**
 * Determines the data entry completion status and generates an appropriate message.
 * 
 * Checks if all required fields have been filled:
 * - Dated (date of the report)
 * - Diesel, Adda, Union (expense fields)
 * - TotalCashCollection, Online (collection fields)
 * 
 * If all fields are complete, prompts user to submit.
 * If fields are missing, lists them so user knows what's left.
 * 
 * @param {Object} user - User's session data object
 * @returns {string} Status message indicating completion state or missing fields
 * 
 * @example
 * // All fields complete
 * getCompletionMessage(completeUser);
 * // Returns: "⚠️ All Data Entered.\nDo you want to Submit now? (yes/no)"
 * 
 * // Missing fields
 * getCompletionMessage(incompleteUser);
 * // Returns: "🟡 Data Entering! Please provide remaining data.\nMissing fields: Diesel, Online"
 */
export function getCompletionMessage(user) {
  try {
    // Define the list of required fields for a complete entry
    const allFields = ["Dated", "Diesel", "Adda", "Union", "TotalCashCollection", "Online"];
    
    // Find fields that are missing or empty
    const missing = allFields.filter((f) => {
      const v = user[f];
      
      // Check for null, undefined, or empty string
      if (v === null || v === undefined || v === "") return true;
      
      // For object values (like {amount, mode}), check if amount is set
      if (typeof v === "object") {
        return !v.amount || String(v.amount).trim() === "";
      }
      
      // For string values, check if trimmed value is empty
      if (typeof v === "string") return v.trim() === "";
      
      return false;
    });

    // All fields are complete - prompt for submission
    if (missing.length === 0) {
      if (!user.waitingForSubmit) user.waitingForSubmit = true;
      return "⚠️ All Data Entered.\nDo you want to Submit now? (yes/no)";
    } else {
      // Some fields are missing - show which ones
      if (user.waitingForSubmit) user.waitingForSubmit = false;
      return `🟡 Data Entering! Please provide remaining data.\nMissing fields: ${missing.join(", ")}`;
    }
  } catch (err) {
    console.error("❌ Error computing completion message:", err);
    return "⚠️ Unable to determine completion state. Please continue entering data.";
  }
}
