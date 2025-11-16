export function capitalize(str = "") {
  if (!str) return "";
  return String(str).charAt(0).toUpperCase() + String(str).slice(1).toLowerCase();
}

export function formatExistingForMessage(existing) {
  if (existing === null || existing === undefined) return "___";
  if (typeof existing === "object") {
    const amt = existing.amount || "___";
    const mode = existing.mode || "cash";
    return `${amt} (${mode})`;
  }
  return String(existing);
}
