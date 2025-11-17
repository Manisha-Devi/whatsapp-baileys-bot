export function recalculateCashHandover(user) {
  try {
    const diesel = user.Diesel?.mode === "cash" ? parseFloat(user.Diesel?.amount || 0) : 0;
    const adda = user.Adda?.mode === "cash" ? parseFloat(user.Adda?.amount || 0) : 0;
    const union = user.Union?.mode === "cash" ? parseFloat(user.Union?.amount || 0) : 0;

    // Handle both old format (string) and new format (object)
    const totalCollection = typeof user.TotalCashCollection === 'object' 
      ? parseFloat(user.TotalCashCollection?.amount || 0)
      : parseFloat(user.TotalCashCollection || 0);

    const extraTotal = (user.ExtraExpenses || []).reduce(
      (sum, e) => sum + (e.mode === "cash" ? parseFloat(e.amount) || 0 : 0),
      0
    );

    const autoHandover = totalCollection - (diesel + adda + union + extraTotal);
    const handoverAmount = isFinite(autoHandover) ? autoHandover.toFixed(0) : "0";
    
    // Store as object
    user.CashHandover = { amount: handoverAmount };
    return handoverAmount;
  } catch (err) {
    console.error("❌ Error recalculating CashHandover:", err);
    user.CashHandover = { amount: "0" };
    return "0";
  }
}

export function getCompletionMessage(user) {
  try {
    const allFields = ["Dated", "Diesel", "Adda", "Union", "TotalCashCollection", "Online"];
    const missing = allFields.filter((f) => {
      const v = user[f];
      if (v === null || v === undefined || v === "") return true;
      if (typeof v === "object") {
        return !v.amount || String(v.amount).trim() === "";
      }
      // Handle old string format
      if (typeof v === "string") {
        return String(v).trim() === "";
      }
      return false;
    });

    if (missing.length === 0) {
      if (!user.waitingForSubmit) user.waitingForSubmit = true;
      return "⚠️ All Data Entered.\nDo you want to Submit now? (*Yes* or *Y* / *No* or *N*)";
    } else {
      if (user.waitingForSubmit) user.waitingForSubmit = false;
      return `🟡 Data Entering! Please provide remaining data.\nMissing fields: ${missing.join(", ")}`;
    }
  } catch (err) {
    console.error("❌ Error computing completion message:", err);
    return "⚠️ Unable to determine completion state. Please continue entering data.";
  }
}
